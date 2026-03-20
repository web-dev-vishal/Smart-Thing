// Auth routes — all endpoints for user registration, login, and account management.
// Public routes are open to anyone.
// Protected routes require a valid JWT access token (isAuthenticated middleware).

import express from "express";
import {
    registerUser,
    verifyEmail,
    loginUser,
    logoutUser,
    refreshAccessToken,
    getProfile,
    updateProfile,
    forgotPassword,
    verifyOTP,
    changePassword,
    resendVerification,
} from "../controllers/auth.controller.js";
import { isAuthenticated } from "../middleware/auth.middleware.js";
import {
    validate,
    registerSchema,
    loginSchema,
    forgotPasswordSchema,
    verifyOtpSchema,
    changePasswordSchema,
} from "../validators/user.validate.js";
import {
    registerLimiter,
    loginLimiter,
    forgotPasswordLimiter,
    verifyOtpLimiter,
    changePasswordLimiter,
    refreshTokenLimiter,
} from "../middleware/rate-limit.middleware.js";

const router = express.Router();

// ── Public routes (no auth required) ─────────────────────────────────────────

// Rate limiter → input validation → controller
router.post("/register",               registerLimiter,       validate(registerSchema),       registerUser);
router.get("/verify-email",                                                                    verifyEmail);
router.post("/resend-verification",    forgotPasswordLimiter,                                  resendVerification);
router.post("/login",                  loginLimiter,          validate(loginSchema),           loginUser);
router.post("/forgot-password",        forgotPasswordLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post("/verify-otp/:email",      verifyOtpLimiter,      validate(verifyOtpSchema),      verifyOTP);
router.post("/change-password/:email", changePasswordLimiter, validate(changePasswordSchema), changePassword);
router.post("/refresh-token",          refreshTokenLimiter,                                    refreshAccessToken);

// ── Protected routes (valid JWT required) ────────────────────────────────────

router.post("/logout",  isAuthenticated, logoutUser);
router.get("/profile",  isAuthenticated, getProfile);
router.put("/profile",  isAuthenticated, updateProfile);

export default router;
