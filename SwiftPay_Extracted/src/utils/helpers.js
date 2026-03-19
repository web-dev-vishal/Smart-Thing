import crypto from 'crypto';

/**
 * Generate a unique transaction ID
 * @returns {string}
 */
export const generateTransactionId = () => {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomBytes(8).toString('hex');
  return `TXN_${timestamp}_${randomPart}`.toUpperCase();
};

/**
 * Sleep/delay utility
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise<any>}
 */
export const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError;
};

/**
 * Format currency amount
 * @param {number} amount
 * @param {string} currency
 * @returns {string}
 */
export const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
};

/**
 * Sanitize object for logging (remove sensitive data)
 * @param {Object} obj
 * @returns {Object}
 */
export const sanitizeForLogging = (obj) => {
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey'];
  const sanitized = { ...obj };

  Object.keys(sanitized).forEach((key) => {
    if (sensitiveFields.some((field) => key.toLowerCase().includes(field))) {
      sanitized[key] = '[REDACTED]';
    }
  });

  return sanitized;
};

/**
 * Calculate processing duration
 * @param {Date} startTime
 * @returns {number} Duration in milliseconds
 */
export const calculateDuration = (startTime) => {
  return Date.now() - startTime.getTime();
};

/**
 * Validate currency code
 * @param {string} currency
 * @returns {boolean}
 */
export const isValidCurrency = (currency) => {
  const validCurrencies = ['USD', 'EUR', 'GBP', 'INR'];
  return validCurrencies.includes(currency);
};

/**
 * Round amount to 2 decimal places
 * @param {number} amount
 * @returns {number}
 */
export const roundAmount = (amount) => {
  return Math.round(amount * 100) / 100;
};

/**
 * Check if value is a valid positive number
 * @param {any} value
 * @returns {boolean}
 */
export const isPositiveNumber = (value) => {
  return typeof value === 'number' && value > 0 && !isNaN(value);
};

/**
 * Generate a random string
 * @param {number} length
 * @returns {string}
 */
export const generateRandomString = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Hash a string using SHA256
 * @param {string} data
 * @returns {string}
 */
export const hashString = (data) => {
  return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Validate email format
 * @param {string} email
 * @returns {boolean}
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Parse JSON safely
 * @param {string} jsonString
 * @param {any} defaultValue
 * @returns {any}
 */
export const safeJSONParse = (jsonString, defaultValue = null) => {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    return defaultValue;
  }
};

/**
 * Chunk array into smaller arrays
 * @param {Array} array
 * @param {number} size
 * @returns {Array}
 */
export const chunkArray = (array, size) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

/**
 * Deep clone an object
 * @param {Object} obj
 * @returns {Object}
 */
export const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Get client IP from request
 * @param {Object} req - Express request object
 * @returns {string}
 */
export const getClientIP = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    '127.0.0.1'
  );
};

/**
 * Format bytes to human readable
 * @param {number} bytes
 * @returns {string}
 */
export const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Debounce function
 * @param {Function} func
 * @param {number} wait
 * @returns {Function}
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Throttle function
 * @param {Function} func
 * @param {number} limit
 * @returns {Function}
 */
export const throttle = (func, limit) => {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};