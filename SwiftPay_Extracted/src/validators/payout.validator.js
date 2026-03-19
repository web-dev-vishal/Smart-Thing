import Joi from 'joi';

const payoutRequestSchema = Joi.object({
  userId: Joi.string()
    .required()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .min(3)
    .max(50)
    .messages({
      'string.empty': 'User ID is required',
      'string.pattern.base': 'User ID must contain only alphanumeric characters, hyphens, and underscores',
      'string.min': 'User ID must be at least 3 characters long',
      'string.max': 'User ID must not exceed 50 characters',
    }),

  amount: Joi.number()
    .required()
    .positive()
    .precision(2)
    .min(0.01)
    .max(1000000)
    .messages({
      'number.base': 'Amount must be a number',
      'number.positive': 'Amount must be positive',
      'number.min': 'Amount must be at least 0.01',
      'number.max': 'Amount must not exceed 1,000,000',
    }),

  currency: Joi.string()
    .valid('USD', 'EUR', 'GBP', 'INR')
    .default('USD')
    .messages({
      'any.only': 'Currency must be one of USD, EUR, GBP, or INR',
    }),

  description: Joi.string()
    .max(500)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Description must not exceed 500 characters',
    }),

  metadata: Joi.object()
    .optional()
    .max(10)
    .messages({
      'object.max': 'Metadata can contain at most 10 fields',
    }),
});

export { payoutRequestSchema };