// Load environment variables first — everything else depends on them
import "dotenv/config";
import Application from "./src/app.js";
import logger from "./src/utils/logger.js";

const PORT = process.env.PORT || 5000;

// Keep a reference so the shutdown handler can call app.shutdown()
let app = null;

async function start() {
    try {
        app = new Application();
        await app.initialize();

        app.getServer().listen(PORT, () => {
            logger.info(`Server listening on port ${PORT}`, {
                env:        process.env.NODE_ENV || "development",
                aiFeatures: process.env.ENABLE_AI_FEATURES === "true",
            });
        });
    } catch (error) {
        logger.error("Failed to start server:", error.message);
        process.exit(1);
    }
}

async function shutdown(signal) {
    logger.info(`${signal} received — shutting down gracefully`);
    try {
        if (app) await app.shutdown();
        process.exit(0);
    } catch (error) {
        logger.error("Error during shutdown:", error.message);
        process.exit(1);
    }
}

// Handle Docker stop / Ctrl+C
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// These two should never fire in production — if they do, something is seriously wrong
process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception:", error);
    shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection:", reason);
    shutdown("unhandledRejection");
});

start();
