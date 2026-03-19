import 'dotenv/config';
import App from './src/app.js';
import logger from './src/utils/logger.js';

const PORT = process.env.PORT || 3000;

let appInstance = null;

async function startServer() {
  try {
    const app = new App();
    await app.initialize();

    const server = app.getServer();
    
    server.listen(PORT, () => {
      logger.info(`🚀 SwiftPay Server listening on port ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
      logger.info(`🔌 WebSocket server ready`);
      logger.info(`🤖 AI Features: ${process.env.ENABLE_AI_FEATURES === 'true' ? 'Enabled' : 'Disabled'}`);
    });

    appInstance = app;

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

async function gracefulShutdown(signal) {
  logger.info(`\n${signal} received, shutting down gracefully...`);
  
  if (appInstance) {
    try {
      await appInstance.shutdown();
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('💥 Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

startServer();