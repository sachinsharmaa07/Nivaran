import { pino } from "pino";
import { app } from "./app.js";

const log = pino({ level: process.env["LOG_LEVEL"] ?? "info" });
const PORT = Number(process.env["PORT"] ?? 4000);

app.listen(PORT, "0.0.0.0", () => {
  log.info({ port: PORT }, "API server started");
});
