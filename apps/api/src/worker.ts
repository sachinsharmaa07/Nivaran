import { pino } from "pino";
import { connectMongo } from "./db/mongo.js";
import { startSlaWorker } from "./services/sla-queue.js";
import { startPostPublisherWorker, closePostPublisher } from "./services/post-scheduler.js";
import { deleteUnreferencedMedia } from "./services/media-service.js";
import { PlatformDb } from "./db/platform-db.js";

const log = pino({ level: process.env["LOG_LEVEL"] ?? "info" });

async function main() {
  log.info("Starting CivicPulse background worker...");

  try {
    await connectMongo();
    log.info("Connected to MongoDB");
  } catch (err) {
    log.error({ err }, "Failed to connect to MongoDB in worker");
  }

  const slaWorker = startSlaWorker();
  log.info("SLA worker registered and listening on queue: sla-escalations");

  const postWorker = startPostPublisherWorker();
  log.info("Post publisher worker registered and listening on queue: post-publisher");

  // 15-minute rescoring job for open issues (SPEC §6)
  const RESCORE_INTERVAL_MS = 15 * 60 * 1000;
  const { rescoreOpenIssues } = await import("./services/rescoring.js");
  const rescoreTimer = setInterval(() => {
    rescoreOpenIssues()
      .then((res) =>
        log.info({ rescored: res.rescored }, "Periodic 15-min priority rescore complete")
      )
      .catch((err) => log.error({ err }, "Periodic 15-min priority rescore failed"));
  }, RESCORE_INTERVAL_MS);

  // Periodic cleanup of media unreferenced for 24 hours (SPEC §14)
  const MEDIA_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // hourly check
  const mediaCleanupTimer = setInterval(async () => {
    try {
      const platformDb = new PlatformDb();
      const tenants = await platformDb.listTenants();
      for (const t of tenants) {
        const deleted = await deleteUnreferencedMedia(t.id);
        if (deleted > 0) {
          log.info({ tenantId: t.id, deleted }, "Deleted unreferenced media");
        }
      }
    } catch (err) {
      log.error({ err }, "Periodic media cleanup failed");
    }
  }, MEDIA_CLEANUP_INTERVAL_MS);

  const shutdown = async () => {
    log.info("Worker shutting down gracefully...");
    clearInterval(rescoreTimer);
    clearInterval(mediaCleanupTimer);
    await slaWorker.close();
    await postWorker.close();
    await closePostPublisher();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

void main();
