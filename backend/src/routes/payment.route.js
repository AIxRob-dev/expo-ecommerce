import { Router } from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { createRazorpayOrder, verifyPayment } from "../controllers/payment.controller.js";

const router = Router();

// Step 1 — Create Razorpay order, returns orderId + keyId to mobile
router.post("/create-order", protectRoute, createRazorpayOrder);

// Step 2 — Mobile sends back 3 tokens after payment; we verify & create DB order
router.post("/verify", protectRoute, verifyPayment);

export default router;