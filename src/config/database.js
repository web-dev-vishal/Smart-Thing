import mongoose from "mongoose";
import logger from "../utils/logger.js";

class DatabaseConnection {
    constructor() {
        this.isConnected = false;
    }

    async connect() {
        const options = {
            maxPoolSize:              10,  // Max concurrent connections in the pool
            minPoolSize:              2,   // Keep at least 2 connections warm
            socketTimeoutMS:          45000,
            serverSelectionTimeoutMS: 5000, // Fail fast if MongoDB isn't reachable
            family:                   4,   // Force IPv4 — avoids IPv6 resolution issues
        };

        try {
            await mongoose.connect(process.env.MONGO_URI, options);
            this.isConnected = true;
            logger.info("MongoDB connected", {
                host: mongoose.connection.host,
                db:   mongoose.connection.name,
            });
        } catch (error) {
            logger.error("MongoDB connection failed:", error.message);
            throw error;
        }

        // These events fire after the initial connection, so we register them here
        mongoose.connection.on("error", (err) => {
            logger.error("MongoDB error:", err.message);
            this.isConnected = false;
        });

        mongoose.connection.on("disconnected", () => {
            logger.warn("MongoDB disconnected");
            this.isConnected = false;
        });

        // Mongoose handles reconnection automatically — just update our flag
        mongoose.connection.on("reconnected", () => {
            logger.info("MongoDB reconnected");
            this.isConnected = true;
        });
    }

    async disconnect() {
        await mongoose.disconnect();
        this.isConnected = false;
        logger.info("MongoDB disconnected gracefully");
    }

    // readyState === 1 means "connected" in Mongoose
    isHealthy() {
        return this.isConnected && mongoose.connection.readyState === 1;
    }
}

export default new DatabaseConnection();
