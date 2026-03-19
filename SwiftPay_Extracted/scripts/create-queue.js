/**
 * SwiftPay Queue Setup Script
 * Creates RabbitMQ exchanges, queues, and bindings needed by the app.
 *
 * Usage: npm run setup:queue
 */

import 'dotenv/config';
import amqp from 'amqplib';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

// ─── Queue / Exchange Definitions ─────────────────────────────────────────────
const SETUP = {
    exchanges: [
        {
            name: 'swiftpay.direct',
            type: 'direct',
            options: { durable: true },
        },
        {
            name: 'swiftpay.dead-letter',
            type: 'direct',
            options: { durable: true },
        },
    ],
    queues: [
        {
            name: 'payout_queue',
            options: {
                durable: true,
                arguments: {
                    'x-dead-letter-exchange': 'swiftpay.dead-letter',
                    'x-dead-letter-routing-key': 'payout.dead',
                    'x-message-ttl': 86400000, // 24 hours
                },
            },
            exchange: 'swiftpay.direct',
            routingKey: 'payout',
        },
        {
            name: 'payout_dead_letter_queue',
            options: { durable: true },
            exchange: 'swiftpay.dead-letter',
            routingKey: 'payout.dead',
        },
    ],
};

// ─── Main Setup ────────────────────────────────────────────────────────────────
async function setupQueues() {
    let connection = null;
    let channel = null;

    try {
        console.log('🐇 SwiftPay RabbitMQ Setup');
        console.log('═'.repeat(50));

        console.log(`📡 Connecting to RabbitMQ...`);
        connection = await amqp.connect(RABBITMQ_URL);
        channel = await connection.createChannel();
        console.log('✅ Connected to RabbitMQ\n');

        // Create exchanges
        console.log('🔀 Setting up exchanges...');
        for (const exchange of SETUP.exchanges) {
            await channel.assertExchange(exchange.name, exchange.type, exchange.options);
            console.log(`  ✅ Exchange: ${exchange.name} (${exchange.type})`);
        }

        console.log('\n📥 Setting up queues...');
        for (const queue of SETUP.queues) {
            // Assert queue
            const result = await channel.assertQueue(queue.name, queue.options);
            console.log(`  ✅ Queue: ${queue.name} | Messages: ${result.messageCount}`);

            // Bind to exchange
            await channel.bindQueue(queue.name, queue.exchange, queue.routingKey);
            console.log(`     └─ Bound to exchange: ${queue.exchange} | routing: ${queue.routingKey}`);
        }

        console.log('\n' + '═'.repeat(50));
        console.log('✅ RabbitMQ setup complete!\n');
        console.log('📋 Summary:');
        console.log(`  Exchanges: ${SETUP.exchanges.length}`);
        console.log(`  Queues:    ${SETUP.queues.length}`);
        console.log('');

    } catch (error) {
        console.error('\n❌ Queue setup failed:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.error('   → Make sure RabbitMQ is running (npm run docker:up)');
        }
        process.exit(1);
    } finally {
        if (channel) await channel.close().catch(() => { });
        if (connection) await connection.close().catch(() => { });
        console.log('🔌 RabbitMQ connection closed.');
        process.exit(0);
    }
}

setupQueues();
