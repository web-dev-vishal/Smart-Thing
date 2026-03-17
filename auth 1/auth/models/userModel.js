import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    username: { type: String},
    email: { type: String, required: true, unique: true },
    password: { type: String},
    googleId: { type: String},
    avatar: { type: String},
    isVerified: { type: Boolean, default: false },
    isLoggedIn: { type: Boolean, default: false },
    token: { type: String, default: null },
    otp: { type: String, default: null },
    otpExpiry: { type: Date, default: null }
}, { timestamps: true })

export const User = mongoose.model("User", userSchema)