// Auth service — all business logic for registration, login, and session management.
// Uses PASETO v4.public (Ed25519) instead of JWT.
//
// Why PASETO?
//   - No algorithm confusion attacks (no "alg" header to tamper with)
//   - Version and purpose are encoded in the token format itself
//   - The library enforces expiry — we can't accidentally skip the check
//   - Asymmetric signing: private key signs, public key verifies
//     (in future you could give the public key to microservices without sharing the secret)

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

// Thin Redis wrapper — avoids writing getRedis().get() everywhere
const redis = {
    get: (...a) => getRedis().get(...a),
    set: (...a) => getRedis().set(...a),
    del: (...a) => getRedis().del(...a),
};

// Attach a statusCode to errors so the controller knows which HTTP status to send
const createError = (statusCode, message) => {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
};

// ── Register ──────────────────────────────────────────────────────────────────
export const registerService = async ({ username, email, password }) => {
    const existingUser = await User.findOne({ email });
    if (existingUser) throw createError(400, "User already exists");

    // User.create triggers the pre-save hook which hashes the password with bcrypt
    const newUser = await User.create({ username, email, password });

    // Issue a short-lived PASETO verify token for email confirmation
    const verificationToken = await issueVerifyToken(newUser._id);

    // Store in Redis — we validate against this on the verify-email endpoint
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
Token throws structured errors on invalid/expired tokens
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

    // Compare against what we stored in Redis — prevents token reuse
  dis.get(keys.verifyToken(userId));
    if (!storedToken || storedToken !== token) {
        throw createError(400, "Verification token is invalid or already used.");
    }

    const user = await User.findById(userId);
    if (!user)            throw createError(404, "User not found.");
    if (user.isVerified)  throw createError(400, "Email is already verified.");

    user.isVerified = true;
    await user.save();

    // Single-use — delete immediately after successful verification
    a.verifyToken(userId));
};

// ── Login ─────────────────────────────────────────────────────────────────────
export const loginService = async ({ email, password }) => {
    const user = await User.findOne({ email });
    if (!user) {
        // Same message for wrong email and wrong password — prevents user enumeration
        throw createError(401, "Invalid email or password");
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) throw createError(401, "Invrd");

    if (!user.isVerified) {
        throw createError(403, "Please verify your email before logging in");
    }

    // Issue PASETO v4.public access + refresh token pair
    const { accessToken, refreshToken } = await issueTokenPair(user._id);

    // Store refresh token in Redis — this is the server-side session record
    // Deleting this key on logout immediately invalidates the session
    await redis.set(
        keys.refreshToken(user._id.toString()),
        refreshToken,
        "EX",
        TTL.REFRESH
    );

    // Cache the user profile so the auth middleware skips MongoDB on every request
    const userPayload = {
        _id:        user._id,
        username:   user.username,
        email:      user.email,
        role:       user.role,
        isVerified: user.isVerified,
    };

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
    // Deleting the refresh token key is the logout — the token becomes unusable
    await redis.del(keys.refreshToken(id));
    await redis.del(keys.userCache(id));
};

// ── Refresh Token ─────────────────────────────────────────────────────────────
export const refreshTokenService = async (token) => {
    // Verify the PASETO refresh tnvalid/expired
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
oken || storedToken !== token) {
        throw createError(401, "Refresh token is invalid or session has expired. Please log in again.");
    }

    // Issue a fresh access token — refresh token stays the same (sliding window via Redis TTL)
    const accessToken = await issueAccessToken(userId);
    return { accessToken };
};

// ── Get Cached User (used by auth middleware) ─────────────────────────────────
export const getCachedUser = async (userId) => {
    const id = userId.toString();

  — Redis cache hit
    const cached = await redis.get(keys.userCache(id));
    if (cached) return JSON.parse(cached);

    // Slow path — MongoDB lookup, then re-cache
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

    // Single-use — delete immediately
    await redis.del(keys.otp(email));

    // Set a short-lived flag so changePasswordService knows OTP was verified
    await redis.set(`otp_verified:${email}`, "true", "EX", TTL.OTP);
};

// ── Change Password ───────────────────────────────────────────────────────────
export const changePas newPassword }) => {
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

    // Clean up OTP flag and force re-login
    await redis.del(`otp_verified:${email}`);
    await redis.del(keys.userCache(user._id.toString()));
    await redis.del(keys.refreshToken(user._id.toString()));
};

// ── Resend Verification Email ─────────────────────────────────────────────────
export const resendVerificationService = async (email) => {
    const user = await User.findOne({ email });
    if (!user)           throw createError(404, "User not found");
    irow createError(400, "This account is already verified");

    const verificationToken = await issueVerifyToken(user._id);

    // Overwrite any existing token — only the latest one is valid
    await redis.set(
        keys.verifyToken(user._id.toString()),
        verificationToken,
        "EX",
        TTL.VERIFY
    );

    await verifyMail(verificationToken, email);
};

// ── Update Profile ────────────────────────────────────────────────────────────
export const updateProfileService = async (useusername, email }) => {
    const updates = {};

    if (username) updates.username = username.trim();

    if (email) {
        const existing = await User.findOne({ email, _id: { $ne: userId } });
        if (existing) throw createError(409, "Email is already in use by another account");
        updates.email      = email.toLowerCase().trim();
        updates.isVerified = false; // require re-verification on email change
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
//   - Version and purpose are encoded in the token format itself
//   - The library enforces expiry — we can't accidentally skip the check
//   - Asymmetric signing: private key signs, public key verifies

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

const redis = {
    get: (...a) => getRedis().get(...a),
    set: (...a) => getRedis().set(...a),
    del: (...a) => getRedis().del(...a),
};

const createError = (statusCode, message) => {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
};

// ── Register ──────────────────────────────────────────────────────────────────
export const registerService = async ({ username, email, password }) => {
    const existingUser = await User.findOne({ email });
    if (existingUser) throw createError(400, "User already exists");

    const newUser = await User.create({ username, email, password });

    const verificationToken = await issueVerifyToken(newUser._id);

    await redis.set(
        keys.verifyToken(newUser._id.toString()),
        verificationToken,
        "EX",
        TTL.VERIFY
    );

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

    const storedToken = await redis.get(keys.verifyToken(userId));
    if (!storedToken || storedToken !== token) {
        throw createError(400, "Verification token is invalid or already used.");
    }

    const user = await User.findById(userId);
    if (!user)           throw createError(404, "User not found.");
    if (user.isVerified) throw createError(400, "Email is already verified.");

    user.isVerified = true;
    await user.save();

    await redis.del(keys.verifyToken(userId));
};

// ── Login ─────────────────────────────────────────────────────────────────────
export const loginService = async ({ email, password }) => {
    const user = await User.findOne({ email });
    if (!user) throw createError(401, "Invalid email or password");

    const isMatch = await user.comparePassword(password);
    if (!isMatch) throw createError(401, "Invalid email or password");

    if (!user.isVerified) {
        throw createError(403, "Please verify your email before logging in");
    }

    const { accessToken, refreshToken } = await issueTokenPair(user._id);

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
