/**
 * Mock MongoDB for Testing
 * 
 * Uses mongodb-memory-server for in-memory MongoDB instance.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongoServer = null;

/**
 * Start in-memory MongoDB server
 */
export async function startMockMongoDB() {
  if (mongoServer) {
    return mongoServer;
  }

  mongoServer = await MongoMemoryServer.create({
    instance: {
      dbName: 'swiftpay_test',
    },
  });

  const uri = mongoServer.getUri();
  
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  return mongoServer;
}

/**
 * Stop in-memory MongoDB server
 */
export async function stopMockMongoDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
}

/**
 * Clear all collections in the database
 */
export async function clearMockMongoDB() {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  const collections = mongoose.connection.collections;

  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
}

/**
 * Get MongoDB connection URI
 */
export function getMockMongoDBUri() {
  return mongoServer ? mongoServer.getUri() : null;
}

export default {
  start: startMockMongoDB,
  stop: stopMockMongoDB,
  clear: clearMockMongoDB,
  getUri: getMockMongoDBUri,
};
