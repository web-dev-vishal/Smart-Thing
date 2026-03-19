import mongoose from "mongoose";

const SUPPORTED_CURRENCIES = [
    "USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY", "CHF",
    "CNY", "MXN", "BRL", "ZAR", "SGD", "HKD", "NZD", "SEK",
    "NOK", "DKK", "PLN", "THB", "KRW", "RUB", "TRY", "IDR",
    "MYR", "PHP", "VND", "AED", "SAR", "EGP",
];

const transactionSchema = new mongoose.Schema(
    {
        transactionId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        userId: {
            type: String,
            required: true,
            index: true,
        },
        amount: {
            type: Number,
            required: true,
            min: 0.01,
        },
        currency: {
            type: String,
            required: true,
            default: "USD",
            enum: SUPPORTED_CURRENCIES,
        },
        status: {
            type: String,
            required: true,
            enum: ["initiated", "processing", "completed", "failed", "rolled_back"],
            default: "initiated",
            index: true,
        },
        type: {
            type: String,
            required: true,
            enum: ["payout", "refund", "adjustment"],
            default: "payout",
        },
        balanceBefore: { type: Number, required: true },
        balanceAfter:  { type: Number, required: true },
        metadata: {
            ipAddress:    String,
            userAgent:    String,
            source:       String,
            description:  String,
            ipCountry:    String,
            ipCity:       String,
            exchangeRate: Number,
            amountInUSD:  Number,
        },
        processingDetails: {
            initiatedAt:          Date,
            processingStartedAt:  Date,
            completedAt:          Date,
            failedAt:             Date,
            processingDurationMs: Number,
            fraudScore:           Number,
            fraudReasoning:       String,
            ipSuspicious:         Boolean,
        },
        errorDetails: {
            code:         String,
            message:      String,
            retryAttempt: Number,
        },
        lockInfo: {
            lockAcquired:   Boolean,
            lockReleasedAt: Date,
        },
    },
    { timestamps: true, versionKey: false }
);

transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });

transactionSchema.statics.findByTransactionId = function (transactionId) {
    return this.findOne({ transactionId });
};

transactionSchema.methods.markAsProcessing = function () {
    this.status = "processing";
    this.processingDetails.processingStartedAt = new Date();
    return this.save();
};

transactionSchema.methods.markAsCompleted = function () {
    this.status = "completed";
    this.processingDetails.completedAt = new Date();
    if (this.processingDetails.processingStartedAt) {
        this.processingDetails.processingDurationMs =
            Date.now() - this.processingDetails.processingStartedAt.getTime();
    }
    return this.save();
};

transactionSchema.methods.markAsFailed = function (error) {
    this.status = "failed";
    this.processingDetails.failedAt = new Date();
    if (error) {
        this.errorDetails = {
            code:    error.code || "UNKNOWN_ERROR",
            message: error.message,
        };
    }
    return this.save();
};

export default mongoose.model("Transaction", transactionSchema);
