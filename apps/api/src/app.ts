import { createConnection } from "node:net";
import fs from "node:fs";
import express, { type Express } from "express";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { authMiddleware } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authRouter, accountRouter } from "./routes/auth.js";
import { platformRouter } from "./routes/platform.js";
import { adminRouter } from "./routes/admin.js";
import { publicRouter } from "./routes/public.js";
import { issuesRouter } from "./routes/issues.js";
import { connectMongo } from "./db/mongo.js";

// Connect to Mongo lazily (non-blocking start; healthz checks TCP separately)
connectMongo().catch(() => {
  // ignore — will surface in /readyz
});

export const app: Express = express();

// Raw-body parser for photo upload endpoint (must come BEFORE express.json)
app.use(
  "/api/v1/issues/upload",
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "8mb" })
);
app.use(express.json());
app.use(requestIdMiddleware);
app.use(authMiddleware);

// Health and readiness endpoints
app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/readyz", (_req, res) => {
  void checkDependencies().then((checks) => {
    const ready = checks.mongo && checks.postgres && checks.redis;
    if (!ready) {
      res.status(503).send("not ready");
      return;
    }
    if (_req.headers.accept?.includes("application/json")) {
      res.status(200).json({ ...checks, ready: true, status: "ready" });
    } else {
      res.status(200).send("ready");
    }
  });
});

// API Routes
app.use("/api/v1", accountRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/platform", platformRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/public", publicRouter);
app.use("/api/v1/issues", issuesRouter);

// Central error handler
app.use(errorHandler);

async function checkDependencies(): Promise<{
  mongo: boolean;
  postgres: boolean;
  redis: boolean;
}> {
  const [mongo, postgres, redis] = await Promise.all([
    tcpPing(process.env["MONGO_URI"] ?? "mongodb://mongo:27017", 27017),
    tcpPing(
      process.env["POSTGRES_APP_URL"] ??
        process.env["POSTGRES_OWNER_URL"] ??
        "postgres://localhost:5432",
      5432
    ),
    tcpPing(process.env["REDIS_URL"] ?? "redis://redis:6379", 6379),
  ]);
  return { mongo, postgres, redis };
}

function tcpPing(uri: string, defaultPort: number): Promise<boolean> {
  return new Promise((resolve) => {
    let host = "localhost";
    let port = defaultPort;
    const inDocker = Boolean(process.env["IN_DOCKER"]) || fs.existsSync("/.dockerenv");
    try {
      const url = new URL(uri);
      host = url.hostname || "localhost";
      if (!inDocker && host === "postgres") {
        host = "localhost";
      }
      if (!inDocker && host === "mongo") {
        host = "localhost";
      }
      if (!inDocker && host === "redis") {
        host = "localhost";
      }
      port = url.port ? Number(url.port) : defaultPort;
    } catch {
      // keep defaults
    }
    const socket = createConnection({ host, port, timeout: 2000 }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      resolve(false);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}
