import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import logger from '../utils/logger.js';

const createRateLimiter = (redisClient) => {
    const limiter = rateLimit({
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
        max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
        standardHeaders: true,
        legacyHeaders: false,
        store: new RedisStore({
            sendCommand: (...args) => redisClient.call(...args),
            prefix: 'rl:',
        }),
        message: {
            success: false,
            error: 'Too many requests, please try again later',
            code: 'RATE_LIMIT_EXCEEDED',
        },
        handler: (req, res) => {
            logger.warn('Rate limit exceeded', {
                ip: req.ip,
                path: req.path,
                userId: req.body?.userId,
            });

            res.status(429).json({
                success: false,
                error: 'Too many requests, please try again later',
                code: 'RATE_LIMIT_EXCEEDED',
                retryAfter: Math.ceil(req.rateLimit.resetTime.getTime() - Date.now()) / 1000,
            });
        },
        skip: (req) => {
            return req.path === '/health' || req.path === '/metrics';
        },
    });

    return limiter;
};

const createUserRateLimiter = (redisClient) => {
    return rateLimit({
        windowMs: 60000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        store: new RedisStore({
            sendCommand: (...args) => redisClient.call(...args),
            prefix: 'rl:user:',
        }),
        keyGenerator: (req) => {
            return req.body?.userId || req.ip;
        },
        message: {
            success: false,
            error: 'Too many payout requests for this user',
            code: 'USER_RATE_LIMIT_EXCEEDED',
        },
        handler: (req, res) => {
            logger.warn('User rate limit exceeded', {
                userId: req.body?.userId,
                ip: req.ip,
            });

            res.status(429).json({
                success: false,
                error: 'Too many payout requests, please try again later',
                code: 'USER_RATE_LIMIT_EXCEEDED',
            });
        },
    });
};

export { createRateLimiter, createUserRateLimiter };