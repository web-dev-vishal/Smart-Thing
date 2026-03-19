import mongoose from "mongoose";

const AUDIT_ACTIONS = [
    "PAYOUT_INITIATED",
    "PAYOUT_PROCESSING",
    "PAYOUT_COMPLETED",
    "PAYOUT_FAILED",
    "LOCK_ACQUIRED",
    "LOCK_RELEASED",
    "BALANCE_DEDUCTED",
    "BALANCE_RESTORED",
    "MESSAGE_PUBLISHED",
    "MESSAGE_CONSUMED",
    "MESSAGE_ACKED",
    "MESSAGE_NACKED",
    "FRAUD_SCORE_CALCULATED",
    "HIGH_FRAUD_RISK_DETECTED",
    "IP_MISMATCH_DETECTED",
    "ANOMALY_DETECTED",
];

const auditLogSchema = new mongoose.Schema(
    {
        transactionId: { type: String, required: true, index: true },
        userId:        { type: String, required: true, index: true },
        action:        { type: String, required: true, enum: AUDIT_ACTIONS },
        details:       { type: mongoose.Schema.Types.Mixed },
        timestamp:     { type: Date, default: Date.now, index: true },
    },
    { versionKey: false }
);

auditLogSchema.index({ transactionId: 1, timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });

auditLogSchema.statics.logAction = async function (transactionId, userId, action, details = {}) {
    try {
        await this.create({ transactionId, userId, action, details, timestamp: new Date() });
    } catch (error) {
        // Audit logging must never break the main flow
        console.error("Audit log write failed:", error.message);
    }
};

export default mongoose.model("AuditLog", auditLogSchema);
