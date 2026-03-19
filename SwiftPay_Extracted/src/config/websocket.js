import { Server } from 'socket.io';
import logger from '../utils/logger.js';

class WebSocketServer {
  constructor() {
    this.io = null;
    this.clients = new Map();
  }

  initialize(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket', 'polling'],
    });

    this.setupEventHandlers();

    logger.info('WebSocket server initialized');
    return this.io;
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      logger.info('Client connected', {
        socketId: socket.id,
        transport: socket.conn.transport.name,
      });

      socket.on('authenticate', (data) => {
        this.handleAuthentication(socket, data);
      });

      socket.on('subscribe', (data) => {
        this.handleSubscription(socket, data);
      });

      socket.on('disconnect', (reason) => {
        this.handleDisconnection(socket, reason);
      });

      socket.on('error', (error) => {
        logger.error('Socket error:', {
          socketId: socket.id,
          error: error.message,
        });
      });
    });
  }

  handleAuthentication(socket, data) {
    try {
      const { userId, token } = data;

      socket.userId = userId;
      socket.join(`user:${userId}`);

      if (!this.clients.has(userId)) {
        this.clients.set(userId, new Set());
      }
      this.clients.get(userId).add(socket.id);

      socket.emit('authenticated', {
        success: true,
        userId,
        socketId: socket.id,
      });

      logger.info('Client authenticated', {
        socketId: socket.id,
        userId,
      });

    } catch (error) {
      logger.error('Authentication error:', error);
      socket.emit('authentication_error', {
        success: false,
        error: error.message,
      });
    }
  }

  handleSubscription(socket, data) {
    try {
      const { channels } = data;

      if (Array.isArray(channels)) {
        channels.forEach(channel => {
          socket.join(channel);
        });

        socket.emit('subscribed', {
          success: true,
          channels,
        });

        logger.debug('Client subscribed to channels', {
          socketId: socket.id,
          channels,
        });
      }

    } catch (error) {
      logger.error('Subscription error:', error);
      socket.emit('subscription_error', {
        success: false,
        error: error.message,
      });
    }
  }

  handleDisconnection(socket, reason) {
    logger.info('Client disconnected', {
      socketId: socket.id,
      userId: socket.userId,
      reason,
    });

    if (socket.userId && this.clients.has(socket.userId)) {
      const userSockets = this.clients.get(socket.userId);
      userSockets.delete(socket.id);

      if (userSockets.size === 0) {
        this.clients.delete(socket.userId);
      }
    }
  }

  emitToUser(userId, event, data) {
    try {
      this.io.to(`user:${userId}`).emit(event, {
        ...data,
        timestamp: new Date().toISOString(),
      });

      logger.debug(`Event emitted to user`, {
        userId,
        event,
        transactionId: data.transactionId,
      });

    } catch (error) {
      logger.error('Error emitting event to user:', error);
    }
  }

  emitPayoutInitiated(userId, data) {
    this.emitToUser(userId, 'PAYOUT_INITIATED', {
      status: 'initiated',
      ...data,
    });
  }

  emitPayoutProcessing(userId, data) {
    this.emitToUser(userId, 'PAYOUT_PROCESSING', {
      status: 'processing',
      ...data,
    });
  }

  emitPayoutCompleted(userId, data) {
    this.emitToUser(userId, 'PAYOUT_COMPLETED', {
      status: 'completed',
      ...data,
    });
  }

  emitPayoutFailed(userId, data) {
    this.emitToUser(userId, 'PAYOUT_FAILED', {
      status: 'failed',
      ...data,
    });
  }

  broadcast(event, data) {
    try {
      this.io.emit(event, {
        ...data,
        timestamp: new Date().toISOString(),
      });

      logger.debug('Event broadcasted', { event });

    } catch (error) {
      logger.error('Error broadcasting event:', error);
    }
  }

  getConnectedClientsCount() {
    return this.io.engine.clientsCount;
  }

  isUserConnected(userId) {
    return this.clients.has(userId) && this.clients.get(userId).size > 0;
  }

  async close() {
    return new Promise((resolve) => {
      if (this.io) {
        this.io.close(() => {
          logger.info('WebSocket server closed');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

export default new WebSocketServer();