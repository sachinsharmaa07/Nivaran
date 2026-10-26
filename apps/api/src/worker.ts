import { pino } from "pino";
import { connectMongo } from "./db/mongo.js";
import { startSlaWorker } from "./services/sla-queue.js";

const log = pino({ level: process.env["LOG_LEVEL"] ?? "info" });

async function main() {
  log.info("Starting Nivaran SLA background worker...");

  try {
    await connectMongo();
    log.info("Connected to MongoDB");
  } catch (err) {
    log.error({ err }, "Failed to connect to MongoDB in worker");
  }

  const worker = startSlaWorker();
  log.info("SLA worker registered and listening on queue: sla-escalations");

  // 15-minute rescoring job for open issues (SPEC §6)
  const RESCORE_INTERVAL_MS = 15 * 60 * 1000;
  const { rescoreOpenIssues } = await import("./services/rescoring.js");
  const rescoreTimer = setInterval(() => {
    rescoreOpenIssues()
      .then((res) => log.info({ rescored: res.rescored }, "Periodic 15-min priority rescore complete"))
      .catch((err) => log.error({ err }, "Periodic 15-min priority rescore failed"));
  }, RESCORE_INTERVAL_MS);

  const shutdown = async () => {
    log.info("Worker shutting down gracefully...");
    clearInterval(rescoreTimer);
    await worker.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

void main();
