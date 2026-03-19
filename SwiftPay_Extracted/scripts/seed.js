/**
 * SwiftPay Database Seeder
 * Seeds test users into MongoDB for local development and testing.
 *
 * Usage: npm run seed
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import logger from '../src/utils/logger.js';

// ─── MongoDB Connection ───────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set in .env');
    process.exit(1);
}

// ─── User Schema (inline to avoid circular deps) ─────────────────────────────
const userSchema = new mongoose.Schema(
    {
        userId: { type: String, required: true, unique: true, index: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        name: { type: String, required: true, trim: true },
        balance: { type: Number, required: true, default: 0, min: 0 },
        currency: { type: String, required: true, default: 'USD', enum: ['USD', 'EUR', 'GBP', 'INR'] },
        country: { type: String, default: 'US', trim: true },
        status: { type: String, required: true, enum: ['active', 'suspended', 'closed'], default: 'active' },
        metadata: {
            lastPayoutAt: Date,
            totalPayouts: { type: Number, default: 0 },
            totalPayoutAmount: { type: Number, default: 0 },
        },
    },
    { timestamps: true, versionKey: false }
);

const User = mongoose.model('User', userSchema);

// ─── Seed Data ────────────────────────────────────────────────────────────────
const TEST_USERS = [
    {
        userId: 'user_001',
        email: 'alice@swiftpay-test.com',
        name: 'Alice Johnson',
        balance: 10000.00,
        currency: 'USD',
        country: 'US',
        status: 'active',
    },
    {
        userId: 'user_002',
        email: 'bob@swiftpay-test.com',
        name: 'Bob Müller',
        balance: 5000.00,
        currency: 'EUR',
        country: 'DE',
        status: 'active',
    },
    {
        userId: 'user_003',
        email: 'ravi@swiftpay-test.com',
        name: 'Ravi Kumar',
        balance: 50000.00,
        currency: 'INR',
        country: 'IN',
        status: 'active',
    },
    {
        userId: 'user_004',
        email: 'sophie@swiftpay-test.com',
        name: 'Sophie Williams',
        balance: 2500.00,
        currency: 'GBP',
        country: 'GB',
        status: 'active',
    },
    {
        userId: 'user_suspended',
        email: 'suspended@swiftpay-test.com',
        name: 'Suspended User',
        balance: 1000.00,
        currency: 'USD',
        country: 'US',
        status: 'suspended',
    },
];

// ─── Main Seeder ──────────────────────────────────────────────────────────────
async function seed() {
    try {
        console.log('🌱 SwiftPay Database Seeder');
        console.log('═'.repeat(50));

        console.log(`📡 Connecting to MongoDB...`);
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Clear existing test users (only those with test IDs)
        const testUserIds = TEST_USERS.map(u => u.userId);
        const deleted = await User.deleteMany({ userId: { $in: testUserIds } });
        if (deleted.deletedCount > 0) {
            console.log(`🗑️  Cleared ${deleted.deletedCount} existing test user(s)`);
        }

        // Insert fresh users
        console.log('👤 Seeding users...\n');

        for (const userData of TEST_USERS) {
            const user = await User.create(userData);
            console.log(`  ✅ ${user.userId.padEnd(18)} | ${user.name.padEnd(20)} | Balance: ${userData.balance.toFixed(2)} ${userData.currency} | Status: ${userData.status}`);
        }

        console.log('\n' + '═'.repeat(50));
        console.log(`✅ Seeded ${TEST_USERS.length} users successfully!\n`);

        console.log('📋 Test User Credentials:');
        console.log('─'.repeat(50));
        TEST_USERS.filter(u => u.status === 'active').forEach(u => {
            console.log(`  userId: ${u.userId}  | balance: ${u.balance} ${u.currency}`);
        });
        console.log('');

        console.log('🚀 Example payout request:');
        console.log(`  curl -X POST http://localhost:${process.env.PORT || 3000}/api/payout \\`);
        console.log(`    -H "Content-Type: application/json" \\`);
        console.log(`    -d '{"userId":"user_001","amount":100,"currency":"USD","description":"test"}'`);
        console.log('');

    } catch (error) {
        console.error('\n❌ Seeder failed:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.error('   → Make sure MongoDB is running (npm run docker:up)');
        }
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Database connection closed.');
        process.exit(0);
    }
}

seed();
