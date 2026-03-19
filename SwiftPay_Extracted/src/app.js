import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import http from 'http';

import database from './config/database.js';
import redisConnection from './config/redis.js';
import rabbitmq from './config/rabbitmq.js';
import websocketServer from './config/websocket.js';

import DistributedLock from './services/DistributedLock.js';
import RedisBalanceService from './services/RedisBalanceService.js';
import MessagePublisher from './services/MessagePublisher.js';
import PayoutService from './services/PayoutService.js';
import GroqClient from './services/GroqClient.js';
import IPValidator from './services/IPValidator.js';
import CurrencyValidator from './services/CurrencyValidator.js';

import PayoutController from './controllers/payout.controller.js';
import AIController from './controllers/ai.controller.js';

import { errorHandler, notFoundHandler, setGroqClient } from './middleware/errorHandler.js';
import { createRateLimiter, createUserRateLimiter } from './middleware/rateLimiter.js';

import createRouter from './routes/index.js';
import logger from './utils/logger.js';

class App {
  constructor() {
    this.app = express();
    this.server = null;
    this.redis = null;
    this.rabbitmqChannel = null;
    this.io = null;
  }

  async initialize() {
    try {
      logger.info('Initializing SwiftPay Application...');

      logger.info('Connecting to MongoDB...');
      await database.connect();

      logger.info('Connecting to Redis...');
      await redisConnection.connect();
      this.redis = redisConnection.getClient();

      logger.info('Connecting to RabbitMQ...');
      await rabbitmq.connect();
      this.rabbitmqChannel = rabbitmq.getChannel();

      this.setupMiddleware();
      const services = this.initializeServices();
      this.setupRoutes(services);
      this.setupErrorHandling();

      this.server = http.createServer(this.app);

      logger.info('Initializing WebSocket server...');
      this.io = websocketServer.initialize(this.server);

      this.setupWebSocketBridge();

      logger.info('SwiftPay Application initialized successfully');

      return this;
    } catch (error) {
      logger.error('Failed to initialize application:', error);
      throw error;
    }
  }

  setupMiddleware() {
    this.app.use(helmet());

    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true,
    }));

    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    this.app.use((req, res, next) => {
      logger.info('Incoming request', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      next();
    });

    const globalRateLimiter = createRateLimiter(this.redis);
    this.app.use('/api', globalRateLimiter);
  }

  initializeServices() {
    const distributedLock = new DistributedLock(this.redis);
    const balanceService = new RedisBalanceService(this.redis);
    const messagePublisher = new MessagePublisher(this.rabbitmqChannel);
    const groqClient = new GroqClient();
    const ipValidator = new IPValidator(this.redis);
    const currencyValidator = new CurrencyValidator(this.redis);

    setGroqClient(groqClient);

    const payoutService = new PayoutService(
      balanceService,
      distributedLock,
      messagePublisher,
      websocketServer,
      ipValidator,
      currencyValidator,
      groqClient
    );

    const payoutController = new PayoutController(payoutService);
    const aiController = new AIController(ipValidator, currencyValidator);
    const userRateLimiter = createUserRateLimiter(this.redis);

    return {
      distributedLock,
      balanceService,
      messagePublisher,
      payoutService,
      payoutController,
      aiController,
      userRateLimiter,
      groqClient,
      ipValidator,
      currencyValidator,
    };
  }

  setupRoutes(services) {
    const router = createRouter({
      payoutController: services.payoutController,
      aiController: services.aiController,
      userRateLimiter: services.userRateLimiter,
      healthDependencies: {
        database,
        redis: redisConnection,
        rabbitmq,
        websocket: websocketServer,
      },
    });

    this.app.use('/api', router);
  }

  setupErrorHandling() {
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  setupWebSocketBridge() {
    const subscriber = this.redis.duplicate();
    
    subscriber.subscribe('websocket:events', (err) => {
      if (err) {
        logger.error('Failed to subscribe to websocket:events channel:', err);
      } else {
        logger.info('Subscribed to websocket:events channel');
      }
    });

    subscriber.on('message', (channel, message) => {
      try {
        const { userId, event, data } = JSON.parse(message);

        switch (event) {
          case 'PAYOUT_PROCESSING':
            websocketServer.emitPayoutProcessing(userId, data);
            break;
          case 'PAYOUT_COMPLETED':
            websocketServer.emitPayoutCompleted(userId, data);
            break;
          case 'PAYOUT_FAILED':
            websocketServer.emitPayoutFailed(userId, data);
            break;
          default:
            logger.warn('Unknown WebSocket event type:', event);
        }
      } catch (error) {
        logger.error('Error processing WebSocket event from Redis:', error);
      }
    });
  }

  getServer() {
    return this.server;
  }

  getApp() {
    return this.app;
  }

  async shutdown() {
    logger.info('Shutting down SwiftPay Application...');

    try {
      if (this.io) {
        await websocketServer.close();
      }

      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
      }

      await rabbitmq.disconnect();
      await redisConnection.disconnect();
      await database.disconnect();

      logger.info('SwiftPay Application shut down successfully');
    } catch (error) {
      logger.error('Error during shutdown:', error);
      throw error;
    }
  }
}

export default App;
