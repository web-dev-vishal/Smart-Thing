import logger from "../utils/logger.js";

class MessagePublisher {
    constructor(channel) {
        this.channel = channel;
    }

    publishPayoutMessage(payload) {
        const message = {
            transactionId: payload.transactionId,
            userId:        payload.userId,
            amount:        payload.amount,
            currency:      payload.currency,
            lockValue:     payload.lockValue,
            metadata:      payload.metadata,
            timestamp:     new Date().toISOString(),
        };

        const sent = this.channel.sendToQueue(
            "payout_queue",
            Buffer.from(JSON.stringify(message)),
            {
                persistent:   true,
                contentType:  "application/json",
                messageId:    payload.transactionId,
                timestamp:    Date.now(),
                headers: {
                    "x-retry-count": 0,
                    "x-source":      "api-gateway",
                },
            }
        );

        if (sent) {
            logger.info("Message published to payout_queue", {
                transactionId: payload.transactionId,
                userId:        payload.userId,
            });
        } else {
            logger.error("Failed to publish message — queue buffer full");
        }

        return sent;
    }
}

export default MessagePublisher;
