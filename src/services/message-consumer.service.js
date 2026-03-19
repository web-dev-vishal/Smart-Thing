import logger from "../utils/logger.js";

class MessageConsumer {
    constructor(channel, handler) {
        this.channel = channel;
        this.handler = handler;
        this.consumerTag = null;
    }

    async startConsuming(queueName = "payout_queue") {
        const { consumerTag } = await this.channel.consume(
            queueName,
            async (msg) => {
                if (msg === null) {
                    logger.warn("Consumer cancelled by server");
                    return;
                }
                await this._handleMessage(msg);
            },
            { noAck: false }
        );

        this.consumerTag = consumerTag;
        logger.info(`Consuming from ${queueName}`, { consumerTag });
    }

    async _handleMessage(msg) {
        const startTime = Date.now();
        let payload;

        try {
            payload = JSON.parse(msg.content.toString());

            logger.info("Processing message", {
                transactionId: payload.transactionId,
                retryCount:    msg.properties.headers?.["x-retry-count"] ?? 0,
            });

            await this.handler(payload, msg);
            this.channel.ack(msg);

            logger.info("Message processed", {
                transactionId:    payload.transactionId,
                processingTimeMs: Date.now() - startTime,
            });
        } catch (error) {
            logger.error("Message processing failed", {
                transactionId:    payload?.transactionId,
                error:            error.message,
                processingTimeMs: Date.now() - startTime,
            });

            await this._handleFailure(msg, error, payload);
        }
    }

    async _handleFailure(msg, error, payload) {
        const retryCount = (msg.properties.headers?.["x-retry-count"] ?? 0) + 1;
        const maxRetries = parseInt(process.env.MAX_RETRY_ATTEMPTS) || 3;

        if (retryCount <= maxRetries) {
            logger.warn(`Requeuing message (attempt ${retryCount}/${maxRetries})`, {
                transactionId: payload?.transactionId,
            });

            // Nack without requeue — we'll re-publish manually after a delay
            // so we get a proper retry delay instead of an instant tight loop
            this.channel.nack(msg, false, false);

            const delay = parseInt(process.env.RETRY_DELAY_MS) || 5000;
            setTimeout(() => {
                this.channel.sendToQueue("payout_queue", msg.content, {
                    ...msg.properties,
                    headers: {
                        ...msg.properties.headers,
                        "x-retry-count": retryCount,
                    },
                });
            }, delay);
        } else {
            logger.error("Max retries reached — routing to DLQ", {
                transactionId: payload?.transactionId,
            });
            this.channel.nack(msg, false, false);
        }
    }

    async stopConsuming() {
        if (this.consumerTag) {
            await this.channel.cancel(this.consumerTag);
            logger.info("Consumer stopped", { consumerTag: this.consumerTag });
            this.consumerTag = null;
        }
    }
}

export default MessageConsumer;
