import { getAuth } from "@clerk/express";  // ← change this import
import { User } from "../models/user.model.js";
import { ENV } from "../config/env.js";

export const protectRoute = [
  // ✅ Manual check — returns 401 instead of redirecting
  (req, res, next) => {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized - not logged in" });
    next();
  },

  async (req, res, next) => {
    try {
      const clerkId = getAuth(req).userId;

      const user = await User.findOne({ clerkId });
      if (!user) return res.status(404).json({ message: "User not found" });

      req.user = user;
      next();
    } catch (error) {
      console.error("Error in protectRoute middleware", error);
      res.status(500).json({ message: "Internal server error" });
    }
  },
];

export const adminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized - user not found" });
  }
  if (req.user.email !== ENV.ADMIN_EMAIL) {
    return res.status(403).json({ message: "Forbidden - admin access only" });
  }
  next();
};