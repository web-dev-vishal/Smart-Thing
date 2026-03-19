import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        'PAYOUT_INITIATED',
        'PAYOUT_PROCESSING',
        'PAYOUT_COMPLETED',
        'PAYOUT_FAILED',
        'LOCK_ACQUIRED',
        'LOCK_RELEASED',
        'BALANCE_DEDUCTED',
        'BALANCE_RESTORED',
        'MESSAGE_PUBLISHED',
        'MESSAGE_CONSUMED',
        'MESSAGE_ACKED',
        'MESSAGE_NACKED',
        'FRAUD_SCORE_CALCULATED',
        'HIGH_FRAUD_RISK_DETECTED',
        'IP_MISMATCH_DETECTED',
        'ANOMALY_DETECTED',
      ],
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    versionKey: false,
  }
);

// Indexes for query optimization
auditLogSchema.index({ transactionId: 1, timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });

// Static method to log action
auditLogSchema.statics.logAction = async function (transactionId, userId, action, details = {}) {
  try {
    await this.create({
      transactionId,
      userId,
      action,
      details,
      timestamp: new Date(),
    });
  } catch (error) {
    // Log but don't throw - audit logging shouldn't break the flow
    console.error('Failed to create audit log:', error);
  }
};

export default mongoose.model('AuditLog', auditLogSchema);