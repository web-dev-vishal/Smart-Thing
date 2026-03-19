import express from 'express';

const createHealthRouter = (dependencies) => {
  const { database, redis, rabbitmq, websocket } = dependencies;

  const router = express.Router();

  router.get('/', (req, res) => {
    res.status(200).json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'swiftpay-api-gateway',
    });
  });

  router.get('/detailed', async (req, res) => {
    const health = {
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'swiftpay-api-gateway',
      dependencies: {},
    };

    try {
      health.dependencies.mongodb = {
        status: database.isHealthy() ? 'healthy' : 'unhealthy',
        connected: database.isHealthy(),
      };
    } catch (error) {
      health.dependencies.mongodb = {
        status: 'unhealthy',
        connected: false,
        error: error.message,
      };
      health.success = false;
      health.status = 'degraded';
    }

    try {
      const redisHealthy = await redis.isHealthy();
      health.dependencies.redis = {
        status: redisHealthy ? 'healthy' : 'unhealthy',
        connected: redisHealthy,
      };
    } catch (error) {
      health.dependencies.redis = {
        status: 'unhealthy',
        connected: false,
        error: error.message,
      };
      health.success = false;
      health.status = 'degraded';
    }

    try {
      health.dependencies.rabbitmq = {
        status: rabbitmq.isHealthy() ? 'healthy' : 'unhealthy',
        connected: rabbitmq.isHealthy(),
      };
    } catch (error) {
      health.dependencies.rabbitmq = {
        status: 'unhealthy',
        connected: false,
        error: error.message,
      };
      health.success = false;
      health.status = 'degraded';
    }

    try {
      const wsConnections = websocket.getConnectedClientsCount();
      health.dependencies.websocket = {
        status: 'healthy',
        activeConnections: wsConnections,
      };
    } catch (error) {
      health.dependencies.websocket = {
        status: 'unhealthy',
        error: error.message,
      };
    }

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  });

  router.get('/ready', async (req, res) => {
    try {
      const mongoHealthy = database.isHealthy();
      const redisHealthy = await redis.isHealthy();
      const rabbitHealthy = rabbitmq.isHealthy();

      if (mongoHealthy && redisHealthy && rabbitHealthy) {
        res.status(200).json({
          success: true,
          ready: true,
        });
      } else {
        res.status(503).json({
          success: false,
          ready: false,
        });
      }
    } catch (error) {
      res.status(503).json({
        success: false,
        ready: false,
        error: error.message,
      });
    }
  });

  router.get('/live', (req, res) => {
    res.status(200).json({
      success: true,
      alive: true,
    });
  });

  return router;
};

export default createHealthRouter;