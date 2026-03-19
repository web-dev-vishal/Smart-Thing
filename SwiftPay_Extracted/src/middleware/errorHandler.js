import logger from '../utils/logger.js';

class APIError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

let groqClientInstance = null;

const setGroqClient = (groqClient) => {
  groqClientInstance = groqClient;
};

const errorHandler = async (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userId: req.body?.userId,
  });

  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map((e) => e.message).join(', ');
    error = new APIError(message, 400, 'VALIDATION_ERROR');
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    error = new APIError(`Duplicate ${field} value`, 400, 'DUPLICATE_ERROR');
  }

  if (err.name === 'CastError') {
    error = new APIError('Invalid data format', 400, 'CAST_ERROR');
  }

  if (err.name === 'JsonWebTokenError') {
    error = new APIError('Invalid token', 401, 'INVALID_TOKEN');
  }

  if (err.name === 'TokenExpiredError') {
    error = new APIError('Token expired', 401, 'TOKEN_EXPIRED');
  }

  if (err.message && err.message.includes('Redis')) {
    error = new APIError('Cache service unavailable', 503, 'CACHE_ERROR');
  }

  if (err.message && err.message.includes('RabbitMQ')) {
    error = new APIError('Message queue unavailable', 503, 'QUEUE_ERROR');
  }

  if (err.message && err.message.includes('MongoDB')) {
    error = new APIError('Database unavailable', 503, 'DATABASE_ERROR');
  }

  const statusCode = error.statusCode || 500;
  const code = error.code || 'INTERNAL_ERROR';

  // Generate AI explanation for error
  let aiExplanation = null;
  if (groqClientInstance && req.body) {
    try {
      aiExplanation = await groqClientInstance.generateErrorExplanation(code, {
        userId: req.body.userId || 'unknown',
        amount: req.body.amount || 0,
        currency: req.body.currency || 'USD',
      });
    } catch (aiError) {
      logger.debug('Failed to generate AI explanation', { error: aiError.message });
    }
  }

  const response = {
    success: false,
    error: error.message || 'Internal server error',
    code,
    ...(aiExplanation && { explanation: aiExplanation }),
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
    }),
  };

  res.status(statusCode).json(response);
};

const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    code: 'NOT_FOUND',
    path: req.originalUrl,
  });
};

export { APIError, errorHandler, notFoundHandler, setGroqClient };