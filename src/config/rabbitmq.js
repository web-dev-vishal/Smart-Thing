import amqp from "amqplib";
import logger from "../utils/logger.js";

class RabbitMQConnection {
    constructor() {
        this.connection = null;
        this.channel = null;
        this.isConnected = false;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
    }

    async connect() {
        try {
            // heartbeat: 60 keeps the TCP connection alive and detects dead connections faster
            this.connection = await amqp.connect(process.env.RABBITMQ_URL, {
                heartbeat: 60,
            });

            this.isConnected = true;
            this.reconnectAttempts = 0;

            // One shared channel for the whole app — fine for our throughput
            this.channel = await this.connection.createChannel();

            // prefetch limits how many unacknowledged messages the worker holds at once
            await this.channel.prefetch(parseInt(process.env.WORKER_CONCURRENCY) || 5);

            await this._setupQueues();

            // If the connection drops unexpectedly, schedule a reconnect
            this.connection.on("error", (err) => {
                logger.error("RabbitMQ connection error:", err.message);
                this.isConnected = false;
            });

            this.connection.on("close", () => {
                logger.warn("RabbitMQ connection closed");
                this.isConnected = false;
                this._scheduleReconnect();
            });

            this.channel.on("error", (err) => {
                logger.error("RabbitMQ channel error:", err.message);
            });

            logger.info("RabbitMQ connected and channel ready");
        } catch (error) {
            logger.error("RabbitMQ connection failed:", error.message);
            this.isConnected = false;
            this._scheduleReconnect();
            throw error;
        }
    }

    async _setupQueues() {
        // Dead-letter exchange — failed messages land here after max retries
        await this.channel.assertExchange("dlx_payout", "direct", { durable: true });
        await this.channel.assertQueue("payout_dlq", { durable: true });
        await this.channel.bindQueue("payout_dlq", "dlx_payout", "payout");

        // Main queue — durable so messages survive a RabbitMQ restart
        // x-dead-letter-exchange routes failed messages to the DLX above
        // x-message-ttl: 24h — messages older than that are considered stale
        await this.channel.assertQueue("payout_queue", {
            durable: true,
            arguments: {
                "x-dead-letter-exchange":    "dlx_payout",
                "x-dead-letter-routing-key": "payout",
                "x-message-ttl":             86400000,
            },
        });

        logger.info("RabbitMQ queues configured");
    }

    _scheduleReconnect() {
        // Don't stack multiple reconnect timers
        if (this.reconnectTimer || this.reconnectAttempts >= this.maxReconnectAttempts) {
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                logger.error("RabbitMQ max reconnect attempts reached — giving up");
            }
            return;
        }

        this.reconnectAttempts++;

        // Back off progressively: 5s, 10s, 15s, ... up to ~50s
        const delay = 5000 * this.reconnectAttempts;
        logger.info(`RabbitMQ reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);

        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            try {
                await this.connect();
            } catch {
                // connect() already called _scheduleReconnect() on failure
            }
        }, delay);
    }

    async disconnect() {
        // Cancel any pending reconnect before closing
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.channel) {
            await this.channel.close();
            this.channel = null;
        }

        if (this.connection) {
            await this.connection.close();
            this.connection = null;
        }

        this.isConnected = false;
        logger.info("RabbitMQ disconnected gracefully");
    }

    getChannel() {
        if (!this.isConnected || !this.channel) {
            throw new Error("RabbitMQ channel not available");
        }
        return this.channel;
    }

    isHealthy() {
        return this.isConnected && this.channel !== null;
    }
}

export default new RabbitMQConnection();
