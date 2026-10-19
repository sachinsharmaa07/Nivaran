import { createConnection } from "node:net";
import express, { type Express } from "express";

export const app: Express = express();

app.use(express.json());

app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/readyz", (_req, res) => {
  void checkDependencies().then((checks) => {
    const ready = checks.mongo && checks.postgres && checks.redis;
    res.status(ready ? 200 : 503).json({ ...checks, ready });
  });
});

async function checkDependencies(): Promise<{
  mongo: boolean;
  postgres: boolean;
  redis: boolean;
}> {
  const [mongo, postgres, redis] = await Promise.all([
    tcpPing(process.env["MONGO_URI"] ?? "mongodb://mongo:27017", 27017),
    tcpPing(process.env["POSTGRES_APP_URL"] ?? "postgres://postgres:5432", 5432),
    tcpPing(process.env["REDIS_URL"] ?? "redis://redis:6379", 6379),
  ]);
  return { mongo, postgres, redis };
}

function tcpPing(uri: string, defaultPort: number): Promise<boolean> {
  return new Promise((resolve) => {
    let host = "localhost";
    let port = defaultPort;
    try {
      const url = new URL(uri);
      host = url.hostname || "localhost";
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
