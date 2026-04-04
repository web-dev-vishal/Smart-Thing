// Auth service — all business logic for registration, login, and session management.
// Uses PASETO v4.public (Ed25519) instead of JWT.
// Private key signs tokens; public key verifies them.
// Refresh tokens are stored server-side in Redis — deleting the key = instant logout.

import User from "../models/user.model.js";
import { verifyMail } from "../email/verifyMail.js";
import { sendOtpMail } from "../email/sendOtpMail.js";
import { getRedis, keys, TTL } from "../lib/redis.js";
import logger from "../utils/logger.js";
import {
    issueTokenPair,
    issueAccessToken,
    issueVerifyToken,
    verifyRefreshToken,
    verifyVerifyToken,
} from "./token.service.js";

// Thin Redis wrapper so we don't write getRedis().get() everywhere
const redis = {
    get: (...a) => getRedis().get(...a),
    set: (...a) => getRedis().set(...a),
    del: (...a) => getRedis().del(...a),
};

// Attach a statusCode so the controller knows which HTTP status to send
const createError = (statusCode, message) => {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
};

// ── Register ──────────────────────────────────────────────────────────────────
export const registerService = async ({ username, email, password }) => {
    const existingUser = await User.findOne({ email });
    if (existingUser) throw createError(400, "User already exists");

    // pre-save hook in user.model.js hashes the password automatically
    const newUser = await User.create({ username, email, password });

    const verificationToken = await issueVerifyToken(newUser._id);

    await redis.set(
        keys.verifyToken(newUser._id.toString()),
        verificationToken,
        "EX",
        TTL.VERIFY
    );

    // Fire-and-forget — don't block registration if email is slow
    verifyMail(verificationToken, email).catch((err) =>
        logger.error("Failed to send verification email:", err.message)
    );

    return {
        _id:        newUser._id,
        username:   newUser.username,
        email:      newUser.email,
        isVerified: newUser.isVerified,
    };
};

// ── Email Verification ────────────────────────────────────────────────────────
export const verifyEmailService = async (token) => {
    let payload;
    try {
        payload = await verifyVerifyToken(token);
    } catch (err) {
        if (err.code === "TOKEN_EXPIRED") {
            throw createError(400, "Verification token has expired. Please request a new one.");
        }
        throw createError(400, "Verification token is invalid.");
    }

    const userId = payload.sub;

    // Compare against Redis — prevents reuse of an already-used token
    const storedToken = await redis.get(keys.verifyToken(userId));
    if (!storedToken || storedToken !== token) {
        throw createError(400, "Verification token is invalid or already used.");
    }

    const user = await User.findById(userId);
    if (!user)           throw createError(404, "User not found.");
    if (user.isVerified) throw createError(400, "Email is already verified.");

    user.isVerified = true;
    await user.save();

    // Single-use — delete so it can't be replayed
    await redis.del(keys.verifyToken(userId));
};

// ── Login ─────────────────────────────────────────────────────────────────────
export const loginService = async ({ email, password }) => {
    const user = await User.findOne({ email });
    if (!user) {
        // Same message for wrong email and wrong password — prevents user enumeration
        throw createError(401, "Invalid email or password");
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) throw createError(401, "Invalid email or password");

    if (!user.isVerified) {
        throw createError(403, "Please verify your email before logging in");
    }

    const { accessToken, refreshToken } = await issueTokenPair(user._id);

    // Store refresh token server-side — deleting this key = instant session invalidation
    await redis.set(
        keys.refreshToken(user._id.toString()),
        refreshToken,
        "EX",
        TTL.REFRESH
    );

    const userPayload = {
        _id:        user._id,
        username:   user.username,
        email:      user.email,
        role:       user.role,
        isVerified: user.isVerified,
    };

    // Cache the profile so auth middleware skips MongoDB on every request
    await redis.set(
        keys.userCache(user._id.toString()),
        JSON.stringify(userPayload),
        "EX",
        TTL.USER_CACHE
    );

    return { accessToken, refreshToken, user: userPayload };
};

// ── Logout ────────────────────────────────────────────────────────────────────
export const logoutService = async (userId) => {
    const id = userId.toString();
    await redis.del(keys.refreshToken(id));
    await redis.del(keys.userCache(id));
};

// ── Refresh Token ─────────────────────────────────────────────────────────────
export const refreshTokenService = async (token) => {
    let payload;
    try {
        payload = await verifyRefreshToken(token);
    } catch (err) {
        if (err.code === "TOKEN_EXPIRED") {
            throw createError(401, "Refresh token has expired. Please log in again.");
        }
        throw createError(401, "Invalid refresh token.");
    }

    const userId = payload.sub;

    // Validate against Redis — catches tokens from already-logged-out sessions
    const storedToken = await redis.get(keys.refreshToken(userId));
    if (!storedToken || storedToken !== token) {
        throw createError(401, "Refresh token is invalid or session has expired. Please log in again.");
    }

    const accessToken = await issueAccessToken(userId);
    return { accessToken };
};

// ── Get Cached User (used by auth middleware) ─────────────────────────────────
export const getCachedUser = async (userId) => {
    const id = userId.toString();

    const cached = await redis.get(keys.userCache(id));
    if (cached) return JSON.parse(cached);

    const user = await User.findById(id).select("-password");
    if (!user) return null;

    const userPayload = {
        _id:        user._id,
        username:   user.username,
        email:      user.email,
        role:       user.role,
        isVerified: user.isVerified,
    };

    await redis.set(
        keys.userCache(id),
        JSON.stringify(userPayload),
        "EX",
        TTL.USER_CACHE
    );

    return userPayload;
};

// ── Forgot Password ───────────────────────────────────────────────────────────
export const forgotPasswordService = async (email) => {
    const user = await User.findOne({ email });
    if (!user) throw createError(404, "User not found");

    // 6-digit OTP — 100000 to 999999
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await redis.set(keys.otp(email), otp, "EX", TTL.OTP);

    try {
        await sendOtpMail(email, otp);
    } catch (mailErr) {
        await redis.del(keys.otp(email));
        throw createError(500, "Failed to send OTP email. Please try again.");
    }
};

// ── Verify OTP ────────────────────────────────────────────────────────────────
export const verifyOTPService = async (email, otp) => {
    const user = await User.findOne({ email });
    if (!user) throw createError(404, "User not found");

    const storedOtp = await redis.get(keys.otp(email));
    if (!storedOtp)        throw createError(400, "OTP not generated or already used");
    if (otp !== storedOtp) throw createError(400, "Invalid OTP");

    await redis.del(keys.otp(email));

    // Short-lived flag so changePasswordService knows OTP was verified
    await redis.set(`otp_verified:${email}`, "true", "EX", TTL.OTP);
};

// ── Change Password ───────────────────────────────────────────────────────────
export const changePasswordService = async (email, { newPassword }) => {
    const otpVerified = await redis.get(`otp_verified:${email}`);
    if (!otpVerified) {
        throw createError(403, "OTP verification required before changing password");
    }

    if (newPassword.length < 6) {
        throw createError(400, "Password must be at least 6 characters");
    }

    const user = await User.findOne({ email });
    if (!user) throw createError(404, "User not found");

    // Assign plain text — pre-save hook hashes it
    user.password = newPassword;
    await user.save();

    await redis.del(`otp_verified:${email}`);
    await redis.del(keys.userCache(user._id.toString()));
    await redis.del(keys.refreshToken(user._id.toString()));
};

// ── Resend Verification Email ─────────────────────────────────────────────────
export const resendVerificationService = async (email) => {
    const user = await User.findOne({ email });
    if (!user)           throw createError(404, "User not found");
    if (user.isVerified) throw createError(400, "This account is already verified");

    const verificationToken = await issueVerifyToken(user._id);

    await redis.set(
        keys.verifyToken(user._id.toString()),
        verificationToken,
        "EX",
        TTL.VERIFY
    );

    await verifyMail(verificationToken, email);
};

// ── Update Profile ────────────────────────────────────────────────────────────
export const updateProfileService = async (userId, { username, email }) => {
    const updates = {};

    if (username) updates.username = username.trim();

    if (email) {
        const existing = await User.findOne({ email, _id: { $ne: userId } });
        if (existing) throw createError(409, "Email is already in use by another account");
        updates.email      = email.toLowerCase().trim();
        updates.isVerified = false;
    }

    const user = await User.findByIdAndUpdate(
        userId,
        { $set: updates },
        { new: true, runValidators: true }
    ).select("-password -__v");

    if (!user) throw createError(404, "User not found");

    await redis.del(keys.userCache(userId));
    return user;
};
