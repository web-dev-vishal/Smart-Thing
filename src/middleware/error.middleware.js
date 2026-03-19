import logger from "../utils/logger.js";

let groqClient = null;

export const setGroqClient = (client) => {
    groqClient = client;
};

export const notFoundHandler = (req, res) => {
    res.status(404).json({
        success: false,
        error:   "Route not found",
        code:    "NOT_FOUND",
        path:    req.originalUrl,
    });
};

export const errorHandler = async (err, req, res, next) => {
    logger.error("Unhandled error", {
        message: err.message,
        code:    err.code,
        url:     req.originalUrl,
        method:  req.method,
        ip:      req.ip,
        userId:  req.body?.userId,
        // Only include stack traces in development — never expose them in production
        stack:   process.env.NODE_ENV === "development" ? err.stack : undefined,
    });

    // Normalize known error shapes
    let statusCode = err.statusCode || 500;
    let code       = err.code || "INTERNAL_ERROR";
    let message    = err.message || "Internal server error";

    if (err.name === "ValidationError") {
        statusCode = 400;
        code       = "VALIDATION_ERROR";
        message    = Object.values(err.errors).map((e) => e.message).join(", ");
    } else if (err.code === 11000) {
        const field = Object.keys(err.keyValue || {})[0] || "field";
        statusCode  = 400;
        code        = "DUPLICATE_ERROR";
        message     = `Duplicate value for ${field}`;
    } else if (err.name === "CastError") {
        statusCode = 400;
        code       = "CAST_ERROR";
        message    = "Invalid data format";
    } else if (err.name === "JsonWebTokenError") {
        statusCode = 401;
        code       = "INVALID_TOKEN";
        message    = "Invalid token";
    } else if (err.name === "TokenExpiredError") {
        statusCode = 401;
        code       = "TOKEN_EXPIRED";
        message    = "Token expired";
    }

    // Optional AI-generated error explanation — only for payout errors where userId is known
    let explanation = null;
    if (groqClient && req.body?.userId) {
        try {
            explanation = await groqClient.generateErrorExplanation(code, {
                userId:   req.body.userId,
                amount:   req.body.amount || 0,
                currency: req.body.currency || "USD",
            });
        } catch {
            // Non-critical — don't let this fail the response
        }
    }

    const body = {
        success: false,
        error:   message,
        code,
        ...(explanation && { explanation }),
        ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    };

    res.status(statusCode).json(body);
};
