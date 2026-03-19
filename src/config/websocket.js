import { Server } from "socket.io";
import logger from "../utils/logger.js";

class WebSocketServer {
    constructor() {
        this.io = null;
        // Maps userId → Set of socketIds so one user can have multiple tabs open
        this.clients = new Map();
    }

    initialize(httpServer) {
        this.io = new Server(httpServer, {
            cors: {
                origin:      process.env.CORS_ORIGIN || "*",
                methods:     ["GET", "POST"],
                credentials: true,
            },
            pingTimeout:  60000, // How long to wait for a pong before disconnecting
            pingInterval: 25000, // How often to send a ping
            transports:   ["websocket", "polling"], // Polling as fallback for restrictive networks
        });

        this._setupHandlers();
        logger.info("WebSocket server initialized");
        return this.io;
    }

    _setupHandlers() {
        this.io.on("connection", (socket) => {
            logger.info("WebSocket client connected", {
                socketId:  socket.id,
                transport: socket.conn.transport.name,
            });

            // Client must authenticate before receiving any events
            socket.on("authenticate", (data) => this._handleAuth(socket, data));
            socket.on("subscribe",    (data) => this._handleSubscribe(socket, data));
            socket.on("disconnect",   (reason) => this._handleDisconnect(socket, reason));
            socket.on("error",        (err) => {
                logger.error("Socket error", { socketId: socket.id, error: err.message });
            });
        });
    }

    _handleAuth(socket, data) {
        try {
            const { userId } = data;
            if (!userId) throw new Error("userId is required");

            // Tag the socket with the userId so we can look it up on disconnect
            socket.userId = userId;

            // Join a room named after the user — makes targeted emits easy
            socket.join(`user:${userId}`);

            // Track all sockets for this user (multiple tabs/devices)
            if (!this.clients.has(userId)) {
                this.clients.set(userId, new Set());
            }
            this.clients.get(userId).add(socket.id);

            socket.emit("authenticated", { success: true, userId, socketId: socket.id });
            logger.info("WebSocket client authenticated", { socketId: socket.id, userId });
        } catch (error) {
            logger.error("WebSocket auth error:", error.message);
            socket.emit("authentication_error", { success: false, error: error.message });
        }
    }

    _handleSubscribe(socket, data) {
        try {
            const { channels } = data;
            if (!Array.isArray(channels)) return;

            // Let the client subscribe to additional rooms (e.g. admin broadcast channels)
            channels.forEach((ch) => socket.join(ch));
            socket.emit("subscribed", { success: true, channels });
        } catch (error) {
            logger.error("WebSocket subscribe error:", error.message);
            socket.emit("subscription_error", { success: false, error: error.message });
        }
    }

    _handleDisconnect(socket, reason) {
        logger.info("WebSocket client disconnected", {
            socketId: socket.id,
            userId:   socket.userId,
            reason,
        });

        // Clean up the client map — if this was the user's last socket, remove the entry
        if (socket.userId && this.clients.has(socket.userId)) {
            const sockets = this.clients.get(socket.userId);
            sockets.delete(socket.id);
            if (sockets.size === 0) this.clients.delete(socket.userId);
        }
    }

    // Emit an event to all sockets belonging to a specific user
    emitToUser(userId, event, data) {
        if (!this.io) return;
        try {
            this.io.to(`user:${userId}`).emit(event, {
                ...data,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            logger.error("WebSocket emit error:", { userId, event, error: error.message });
        }
    }

    // Convenience methods for payout lifecycle events
    emitPayoutInitiated(userId, data) {
        this.emitToUser(userId, "PAYOUT_INITIATED", { status: "initiated", ...data });
    }

    emitPayoutProcessing(userId, data) {
        this.emitToUser(userId, "PAYOUT_PROCESSING", { status: "processing", ...data });
    }

    emitPayoutCompleted(userId, data) {
        this.emitToUser(userId, "PAYOUT_COMPLETED", { status: "completed", ...data });
    }

    emitPayoutFailed(userId, data) {
        this.emitToUser(userId, "PAYOUT_FAILED", { status: "failed", ...data });
    }

    isUserConnected(userId) {
        return this.clients.has(userId) && this.clients.get(userId).size > 0;
    }

    getConnectedClientsCount() {
        return this.io?.engine?.clientsCount ?? 0;
    }

    async close() {
        return new Promise((resolve) => {
            if (this.io) {
                this.io.close(() => {
                    logger.info("WebSocket server closed");
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

export default new WebSocketServer();
