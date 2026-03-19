import mongoose from 'mongoose';

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
      default: 'USD',
      // Expanded to match all currencies supported by CurrencyValidator
      enum: [
        'USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY', 'CHF',
        'CNY', 'MXN', 'BRL', 'ZAR', 'SGD', 'HKD', 'NZD', 'SEK',
        'NOK', 'DKK', 'PLN', 'THB', 'KRW', 'RUB', 'TRY', 'IDR',
        'MYR', 'PHP', 'VND', 'AED', 'SAR', 'EGP',
      ],
    },
    status: {
      type: String,
      required: true,
      enum: ['initiated', 'processing', 'completed', 'failed', 'rolled_back'],
      default: 'initiated',
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['payout', 'refund', 'adjustment'],
      default: 'payout',
    },
    balanceBefore: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    metadata: {
      ipAddress: String,
      userAgent: String,
      source: String,
      description: String,
    },
    processingDetails: {
      initiatedAt: Date,
      processingStartedAt: Date,
      completedAt: Date,
      failedAt: Date,
      processingDurationMs: Number,
    },
    errorDetails: {
      code: String,
      message: String,
      stack: String,
      retryAttempt: Number,
    },
    lockInfo: {
      lockAcquired: Boolean,
      lockReleasedAt: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes for query optimization
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index({ createdAt: -1 });

// Virtual for processing duration
transactionSchema.virtual('processingDuration').get(function () {
  if (this.processingDetails?.processingDurationMs) {
    return `${this.processingDetails.processingDurationMs}ms`;
  }
  return null;
});

// Static method to find by transaction ID
transactionSchema.statics.findByTransactionId = function (transactionId) {
  return this.findOne({ transactionId });
};

// Static method to find user transactions
transactionSchema.statics.findUserTransactions = function (userId, limit = 50) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

// Method to mark as processing
transactionSchema.methods.markAsProcessing = function () {
  this.status = 'processing';
  this.processingDetails.processingStartedAt = new Date();
  return this.save();
};

// Method to mark as completed
transactionSchema.methods.markAsCompleted = function () {
  this.status = 'completed';
  this.processingDetails.completedAt = new Date();

  if (this.processingDetails.processingStartedAt) {
    this.processingDetails.processingDurationMs =
      Date.now() - this.processingDetails.processingStartedAt.getTime();
  }

  return this.save();
};

// Method to mark as failed
transactionSchema.methods.markAsFailed = function (error) {
  this.status = 'failed';
  this.processingDetails.failedAt = new Date();

  if (error) {
    this.errorDetails = {
      code: error.code || 'UNKNOWN_ERROR',
      message: error.message,
      stack: error.stack,
      retryAttempt: this.errorDetails?.retryAttempt || 0,
    };
  }

  return this.save();
};

export default mongoose.model('Transaction', transactionSchema);