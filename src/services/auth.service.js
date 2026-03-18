import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import Session from "../models/session.model.js";
import { verifyMail } from "../email/verifyMail.js";
import { sendOtpMail } from "../email/sendOtpMail.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Creates a structured error with an HTTP status code attached.
 */
const createError = (statusCode, message) => {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
};

/**
 * Generates access + refresh JWT tokens for a given userId.
 */
export const generateTokens = (userId) => {
    const accessToken = jwt.sign({ id: userId }, process.env.ACCESS_SECRET, {
        expiresIn: "10d",
    });
    const refreshToken = jwt.sign({ id: userId }, process.env.REFRESH_SECRET, {
        expiresIn: "30d",
    });
    return { accessToken, refreshToken };
};

// ─── Register ────────────────────────────────────────────────────────────────

export const registerService = async ({ username, email, password }) => {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        throw createError(400, "User already exists");
    }

    // User.create triggers the pre-save hook which hashes the password
    const newUser = await User.create({ username, email, password });

    // Generate a short-lived verification token (separate secret)
    const verificationToken = jwt.sign(
        { id: newUser._id },
        process.env.VERIFY_SECRET,
        { expiresIn: "10m" }
    );

    // Use findByIdAndUpdate to avoid re-triggering the password pre-save hook
    await User.findByIdAndUpdate(newUser._id, { token: verificationToken });

    // Non-blocking — don't fail registration if mail fails
    verifyMail(verificationToken, email).catch((err) =>
        console.error("Failed to send verification email:", err.message)
    );

    return {
        _id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        isVerified: newUser.isVerified,
    };
};

// ─── Email Verification ──────────────────────────────────────────────────────

export const verifyEmailService = async (token) => {
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.VERIFY_SECRET);
    } catch (err) {
        if (err.name === "TokenExpiredError") {
            throw createError(400, "Verification token has expired. Please register again.");
        }
        throw createError(400, "Token verification failed");
    }

    const user = await User.findById(decoded.id);
    if (!user) {
        throw createError(404, "User not found");
    }

    if (user.isVerified) {
        throw createError(400, "Email is already verified");
    }

    user.token = null;
    user.isVerified = true;
    await user.save();
};

// ─── Login ───────────────────────────────────────────────────────────────────

export const loginService = async ({ email, password }) => {
    const user = await User.findOne({ email });
    if (!user) {
        throw createError(401, "Invalid email or password");
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
        throw createError(401, "Invalid email or password");
    }

    if (!user.isVerified) {
        throw createError(403, "Please verify your email before logging in");
    }

    // Replace any existing session
    await Session.deleteMany({ userId: user._id });
    await Session.create({ userId: user._id });

    const { accessToken, refreshToken } = generateTokens(user._id);

    user.isLoggedIn = true;
    await user.save();

    return {
        accessToken,
        refreshToken,
        user: {
            _id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
            isVerified: user.isVerified,
        },
    };
};

// ─── Logout ──────────────────────────────────────────────────────────────────

export const logoutService = async (userId) => {
    await Session.deleteMany({ userId });
    await User.findByIdAndUpdate(userId, { isLoggedIn: false });
};

// ─── Refresh Token ───────────────────────────────────────────────────────────

export const refreshTokenService = async (token) => {
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.REFRESH_SECRET);
    } catch (err) {
        if (err.name === "TokenExpiredError") {
            throw createError(401, "Refresh token has expired. Please log in again.");
        }
        throw createError(401, "Invalid refresh token");
    }

    const session = await Session.findOne({ userId: decoded.id });
    if (!session) {
        throw createError(401, "Session not found. Please log in again.");
    }

    const accessToken = jwt.sign(
        { id: decoded.id },
        process.env.ACCESS_SECRET,
        { expiresIn: "10d" }
    );

    return { accessToken };
};

// ─── Forgot Password ─────────────────────────────────────────────────────────

export const forgotPasswordService = async (email) => {
    const user = await User.findOne({ email });
    if (!user) {
        throw createError(404, "User not found");
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    try {
        await sendOtpMail(email, otp);
    } catch (mailErr) {
        // Roll back OTP if email fails so user can retry cleanly
        user.otp = null;
        user.otpExpiry = null;
        await user.save();
        throw createError(500, "Failed to send OTP email. Please try again.");
    }
};

// ─── Verify OTP ──────────────────────────────────────────────────────────────

export const verifyOTPService = async (email, otp) => {
    const user = await User.findOne({ email });
    if (!user) {
        throw createError(404, "User not found");
    }

    if (!user.otp || !user.otpExpiry) {
        throw createError(400, "OTP not generated or already used");
    }

    if (user.otpExpiry < new Date()) {
        throw createError(400, "OTP has expired. Please request a new one.");
    }

    if (otp !== user.otp) {
        throw createError(400, "Invalid OTP");
    }

    user.otp = null;
    user.otpExpiry = null;
    await user.save();
};

// ─── Change Password ─────────────────────────────────────────────────────────

export const changePasswordService = async (email, { newPassword, confirmPassword }) => {
    if (newPassword !== confirmPassword) {
        throw createError(400, "Passwords do not match");
    }

    if (newPassword.length < 6) {
        throw createError(400, "Password must be at least 6 characters");
    }

    const user = await User.findOne({ email });
    if (!user) {
        throw createError(404, "User not found");
    }

    // Assign plain password — pre-save hook will hash it
    user.password = newPassword;
    await user.save();
};
