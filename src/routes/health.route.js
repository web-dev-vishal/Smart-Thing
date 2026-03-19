import express from "express";

const createHealthRouter = ({ database, redis, rabbitmq, websocket }) => {
    const router = express.Router();

    router.get("/", (req, res) => {
        res.status(200).json({
            success:   true,
            status:    "healthy",
            timestamp: new Date().toISOString(),
            service:   "swiftpay",
        });
    });

    router.get("/live", (req, res) => {
        res.status(200).json({ success: true, alive: true });
    });

    router.get("/ready", async (req, res) => {
        try {
            const [mongoOk, redisOk, rabbitOk] = await Promise.all([
                Promise.resolve(database.isHealthy()),
                redis.isHealthy(),
                Promise.resolve(rabbitmq.isHealthy()),
            ]);

            const ready = mongoOk && redisOk && rabbitOk;
            res.status(ready ? 200 : 503).json({ success: ready, ready });
        } catch (error) {
            res.status(503).json({ success: false, ready: false, error: error.message });
        }
    });

    router.get("/detailed", async (req, res) => {
        const deps = {};
        let degraded = false;

        try {
            deps.mongodb = { status: database.isHealthy() ? "healthy" : "unhealthy" };
            if (!database.isHealthy()) degraded = true;
        } catch (e) {
            deps.mongodb = { status: "unhealthy", error: e.message };
            degraded = true;
        }

        try {
            const ok = await redis.isHealthy();
            deps.redis = { status: ok ? "healthy" : "unhealthy" };
            if (!ok) degraded = true;
        } catch (e) {
            deps.redis = { status: "unhealthy", error: e.message };
            degraded = true;
        }

        try {
            deps.rabbitmq = { status: rabbitmq.isHealthy() ? "healthy" : "unhealthy" };
            if (!rabbitmq.isHealthy()) degraded = true;
        } catch (e) {
            deps.rabbitmq = { status: "unhealthy", error: e.message };
            degraded = true;
        }

        try {
            deps.websocket = {
                status:            "healthy",
                activeConnections: websocket.getConnectedClientsCount(),
            };
        } catch (e) {
            deps.websocket = { status: "unhealthy", error: e.message };
        }

        const status = degraded ? "degraded" : "healthy";
        res.status(degraded ? 503 : 200).json({
            success:      !degraded,
            status,
            timestamp:    new Date().toISOString(),
            service:      "swiftpay",
            dependencies: deps,
        });
    });

    return router;
};

export default createHealthRouter;
