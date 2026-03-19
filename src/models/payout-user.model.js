/**
 * PayoutUser — stores payout-specific user data (balance, status, country).
 * Separate from the auth User model to keep concerns clean.
 */
import mongoose from "mongoose";

const SUPPORTED_CURRENCIES = [
    "USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY", "CHF",
    "CNY", "MXN", "BRL", "ZAR", "SGD", "HKD", "NZD", "SEK",
    "NOK", "DKK", "PLN", "THB", "KRW", "RUB", "TRY", "IDR",
    "MYR", "PHP", "VND", "AED", "SAR", "EGP",
];

const payoutUserSchema = new mongoose.Schema(
    {
        // Links to the auth User._id (stored as string for flexibility)
        userId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        balance: {
            type: Number,
            required: true,
            default: 0,
            min: 0,
        },
        currency: {
            type: String,
            required: true,
            default: "USD",
            enum: SUPPORTED_CURRENCIES,
        },
        country: {
            type: String,
            default: "US",
            trim: true,
        },
        status: {
            type: String,
            required: true,
            enum: ["active", "suspended", "closed"],
            default: "active",
            index: true,
        },
        metadata: {
            lastPayoutAt:       Date,
            totalPayouts:       { type: Number, default: 0 },
            totalPayoutAmount:  { type: Number, default: 0 },
        },
    },
    { timestamps: true, versionKey: false }
);

payoutUserSchema.statics.findByUserId = function (userId) {
    return this.findOne({ userId });
};

payoutUserSchema.methods.hasSufficientBalance = function (amount) {
    return this.balance >= amount;
};

export default mongoose.model("PayoutUser", payoutUserSchema);
