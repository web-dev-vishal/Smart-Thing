import { jest } from '@jest/globals';
import MessageConsumer from '../../../src/services/MessageConsumer.js';

describe('MessageConsumer', () => {
    let consumer;
    let mockChannel;
    let mockHandler;

    // Helper: create a fake RabbitMQ message
    const createMsg = (payload, retryCount = 0) => ({
        content: Buffer.from(JSON.stringify(payload)),
        properties: {
            headers: { 'x-retry-count': retryCount },
        },
    });

    beforeEach(() => {
        process.env.MAX_RETRY_ATTEMPTS = '3';
        process.env.RETRY_DELAY_MS = '0'; // instant for tests

        mockChannel = {
            consume: jest.fn().mockResolvedValue({ consumerTag: 'consumer-tag-001' }),
            ack: jest.fn(),
            nack: jest.fn(),
            cancel: jest.fn().mockResolvedValue(true),
            sendToQueue: jest.fn(),
        };
        mockHandler = jest.fn().mockResolvedValue(undefined);
        consumer = new MessageConsumer(mockChannel, mockHandler);
    });

    afterEach(() => {
        delete process.env.MAX_RETRY_ATTEMPTS;
        delete process.env.RETRY_DELAY_MS;
    });

    // ── startConsuming() ───────────────────────────────────────────────────────
    describe('startConsuming()', () => {
        it('should register a consumer on the correct queue', async () => {
            await consumer.startConsuming('payout_queue');
            expect(mockChannel.consume).toHaveBeenCalledWith(
                'payout_queue',
                expect.any(Function),
                { noAck: false }
            );
        });

        it('should store the returned consumerTag', async () => {
            await consumer.startConsuming('payout_queue');
            expect(consumer.consumerTag).toBe('consumer-tag-001');
        });

        it('should throw when channel.consume throws', async () => {
            mockChannel.consume.mockRejectedValue(new Error('Channel error'));
            await expect(consumer.startConsuming('payout_queue')).rejects.toThrow('Channel error');
        });
    });

    // ── handleMessage() — success path ─────────────────────────────────────────
    describe('handleMessage() — success', () => {
        it('should parse payload, call handler, and ack the message', async () => {
            const payload = { transactionId: 'TXN_001', userId: 'user_001', amount: 100 };
            const msg = createMsg(payload);

            await consumer.handleMessage(msg);

            expect(mockHandler).toHaveBeenCalledWith(payload, msg);
            expect(mockChannel.ack).toHaveBeenCalledWith(msg);
            expect(mockChannel.nack).not.toHaveBeenCalled();
        });
    });

    // ── handleMessage() — failure paths ────────────────────────────────────────
    describe('handleMessage() — failure', () => {
        it('should nack and schedule retry on first failure', async () => {
            jest.useFakeTimers();
            mockHandler.mockRejectedValue(new Error('processing failed'));
            const msg = createMsg({ transactionId: 'TXN_002', userId: 'user_002', amount: 200 }, 0);

            await consumer.handleMessage(msg);

            expect(mockChannel.ack).not.toHaveBeenCalled();
            expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
            jest.useRealTimers();
        });

        it('should nack to DLQ when retry count exceeds max retries', async () => {
            mockHandler.mockRejectedValue(new Error('always fails'));
            const msg = createMsg(
                { transactionId: 'TXN_003', userId: 'user_003', amount: 300 },
                100 // way above MAX_RETRY_ATTEMPTS=3
            );

            await consumer.handleMessage(msg);

            expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
            // Should NOT re-enqueue when max retries exceeded
            expect(mockChannel.sendToQueue).not.toHaveBeenCalled();
        });
    });

    // ── stopConsuming() ────────────────────────────────────────────────────────
    describe('stopConsuming()', () => {
        it('should cancel the consumer and clear consumerTag', async () => {
            consumer.consumerTag = 'consumer-tag-001';
            await consumer.stopConsuming();
            expect(mockChannel.cancel).toHaveBeenCalledWith('consumer-tag-001');
            expect(consumer.consumerTag).toBeNull();
        });

        it('should do nothing when consumerTag is null', async () => {
            consumer.consumerTag = null;
            await consumer.stopConsuming();
            expect(mockChannel.cancel).not.toHaveBeenCalled();
        });

        it('should throw when channel.cancel throws', async () => {
            consumer.consumerTag = 'tag-001';
            mockChannel.cancel.mockRejectedValue(new Error('cancel error'));
            await expect(consumer.stopConsuming()).rejects.toThrow('cancel error');
        });
    });
});
