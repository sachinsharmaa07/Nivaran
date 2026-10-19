import { pino } from "pino";

const log = pino({ level: process.env["LOG_LEVEL"] ?? "info" });

log.info("Worker started (stub — no queues registered in P0)");

setInterval(() => {
  log.debug("worker idle");
}, 60_000);
