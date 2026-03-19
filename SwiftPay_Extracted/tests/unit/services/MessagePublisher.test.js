import { jest } from '@jest/globals';
import MessagePublisher from '../../../src/services/MessagePublisher.js';

describe('MessagePublisher', () => {
    let publisher;
    let mockChannel;

    const testPayload = {
        transactionId: 'TXN_TEST_001',
        userId: 'user_001',
        amount: 100,
        currency: 'USD',
        metadata: { source: 'api', description: 'test payout' },
    };

    beforeEach(() => {
        mockChannel = {
            sendToQueue: jest.fn(),
            confirmSelect: jest.fn(),
        };
        publisher = new MessagePublisher(mockChannel);
    });

    // ── publishPayoutMessage() ─────────────────────────────────────────────────
    describe('publishPayoutMessage()', () => {
        it('should publish message and return true on success', async () => {
            mockChannel.sendToQueue.mockReturnValue(true);
            const result = await publisher.publishPayoutMessage(testPayload);
            expect(result).toBe(true);
            expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
                'payout_queue',
                expect.any(Buffer),
                expect.objectContaining({
                    persistent: true,
                    contentType: 'application/json',
                    messageId: 'TXN_TEST_001',
                })
            );
        });

        it('should return false when queue buffer is full', async () => {
            mockChannel.sendToQueue.mockReturnValue(false);
            const result = await publisher.publishPayoutMessage(testPayload);
            expect(result).toBe(false);
        });

        it('should include all required fields in the serialized message', async () => {
            mockChannel.sendToQueue.mockReturnValue(true);
            await publisher.publishPayoutMessage(testPayload);

            const call = mockChannel.sendToQueue.mock.calls[0];
            const sentMessage = JSON.parse(call[1].toString());

            expect(sentMessage.transactionId).toBe('TXN_TEST_001');
            expect(sentMessage.userId).toBe('user_001');
            expect(sentMessage.amount).toBe(100);
            expect(sentMessage.currency).toBe('USD');
            expect(sentMessage.timestamp).toBeDefined();
        });

        it('should include retry count header of 0 in the options', async () => {
            mockChannel.sendToQueue.mockReturnValue(true);
            await publisher.publishPayoutMessage(testPayload);

            const opts = mockChannel.sendToQueue.mock.calls[0][2];
            expect(opts.headers['x-retry-count']).toBe(0);
        });

        it('should throw when channel.sendToQueue throws', async () => {
            mockChannel.sendToQueue.mockImplementation(() => {
                throw new Error('Channel closed');
            });
            await expect(publisher.publishPayoutMessage(testPayload)).rejects.toThrow('Channel closed');
        });

        it('should send message as a Buffer', async () => {
            mockChannel.sendToQueue.mockReturnValue(true);
            await publisher.publishPayoutMessage(testPayload);
            const msgArg = mockChannel.sendToQueue.mock.calls[0][1];
            expect(Buffer.isBuffer(msgArg)).toBe(true);
        });
    });
});
