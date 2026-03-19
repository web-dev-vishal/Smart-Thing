db = db.getSiblingDB('swiftpay');

// Create collections
db.createCollection('users');
db.createCollection('transactions');
db.createCollection('accounts');
db.createCollection('sessions');

// Create indexes for users collection
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ createdAt: 1 });

// Create indexes for transactions collection
db.transactions.createIndex({ userId: 1 });
db.transactions.createIndex({ status: 1 });
db.transactions.createIndex({ createdAt: -1 });
db.transactions.createIndex({ transactionId: 1 }, { unique: true });

// Create indexes for accounts collection
db.accounts.createIndex({ userId: 1 });
db.accounts.createIndex({ accountNumber: 1 }, { unique: true });

// Create indexes for sessions collection
db.sessions.createIndex({ userId: 1 });
db.sessions.createIndex({ token: 1 }, { unique: true });
db.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

print('SwiftPay database initialized successfully!');