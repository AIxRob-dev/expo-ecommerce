import Razorpay from "razorpay";
import crypto from "crypto";
import { ENV } from "../config/env.js";
import { Product } from "../models/product.model.js";
import { Order } from "../models/order.model.js";

const razorpay = new Razorpay({
  key_id: ENV.RAZORPAY_KEY_ID,
  key_secret: ENV.RAZORPAY_KEY_SECRET,
});

// Helper — server-side cart validation (used in both routes)
async function validateAndPriceCart(cartItems) {
  let subtotal = 0;
  const validatedItems = [];

  for (const item of cartItems) {
    const product = await Product.findById(item.product._id);
    if (!product) throw { status: 404, message: `Product ${item.product.name} not found` };
    if (product.stock < item.quantity)
      throw { status: 400, message: `Insufficient stock for ${product.name}` };

    subtotal += product.price * item.quantity;
    validatedItems.push({
      product: product._id.toString(),
      name: product.name,
      price: product.price,
      quantity: item.quantity,
      image: product.images[0],
    });
  }

  const shipping = 10.0;
  const tax = subtotal * 0.08;
  const total = subtotal + shipping + tax;

  return { validatedItems, subtotal, shipping, tax, total };
}

// POST /api/payment/create-order
export async function createRazorpayOrder(req, res) {
  try {
    const { cartItems, shippingAddress } = req.body;
    const user = req.user;

    if (!cartItems || cartItems.length === 0)
      return res.status(400).json({ error: "Cart is empty" });

    const { validatedItems, total } = await validateAndPriceCart(cartItems);

    if (total <= 0) return res.status(400).json({ error: "Invalid order total" });

    // Razorpay requires amount in smallest currency unit (paise for INR)
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(total * 100), // paise
      currency: "INR",
      receipt: `receipt_${user._id}_${Date.now()}`,
      notes: {
        userId: user._id.toString(),
        clerkId: user.clerkId,
        // Store validated items & address for verification step
        orderItems: JSON.stringify(validatedItems),
        shippingAddress: JSON.stringify(shippingAddress),
        totalPrice: total.toFixed(2),
      },
    });

    res.status(200).json({
      orderId: razorpayOrder.id,       // e.g. "order_XXXXXXXXX"
      amount: razorpayOrder.amount,    // in paise
      currency: razorpayOrder.currency,
      keyId: ENV.RAZORPAY_KEY_ID,      // safe to send to client
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error("Error creating Razorpay order:", error);
    res.status(500).json({ error: "Failed to create payment order" });
  }
}

// POST /api/payment/verify
export async function verifyPayment(req, res) {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      cartItems,        // sent again from mobile for re-validation
      shippingAddress,
    } = req.body;
    const user = req.user;

    // 1. Verify Razorpay HMAC signature — this is the security gate
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", ENV.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Payment verification failed — invalid signature" });
    }

    // 2. Prevent duplicate orders
    const existingOrder = await Order.findOne({ "paymentResult.id": razorpay_payment_id });
    if (existingOrder) {
      return res.status(200).json({ success: true, orderId: existingOrder._id });
    }

    // 3. Re-validate cart server-side (never trust the client for price)
    const { validatedItems, total } = await validateAndPriceCart(cartItems);

    // 4. Create order in DB
    const order = await Order.create({
      user: user._id,
      clerkId: user.clerkId,
      orderItems: validatedItems,
      shippingAddress,
      paymentResult: {
        id: razorpay_payment_id,
        status: "succeeded",
        razorpayOrderId: razorpay_order_id,
      },
      totalPrice: parseFloat(total.toFixed(2)),
    });

    // 5. Decrement stock
    for (const item of validatedItems) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: -item.quantity },
      });
    }

    console.log("Order created successfully:", order._id);
    res.status(200).json({ success: true, orderId: order._id });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error("Error verifying payment:", error);
    res.status(500).json({ error: "Failed to verify payment" });
  }
}