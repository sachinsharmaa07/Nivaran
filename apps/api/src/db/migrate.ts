import path from "node:path";
import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";
import { resolvePostgresUrl } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(): Promise<void> {
  const dbUrl = resolvePostgresUrl(process.env["POSTGRES_OWNER_URL"]);
  const migrationsDir = path.resolve(__dirname, "../../migrations");

  console.log(`Running migrations against database...`);
  await runner({
    databaseUrl: dbUrl,
    dir: migrationsDir,
    direction: "up",
    migrationsTable: "pgmigrations",
    count: Infinity,
    verbose: false,
  });
  console.log("Migrations applied successfully.");
}

// Allow direct execution
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("migrate.ts") || process.argv[1].endsWith("migrate.js"));

if (isDirectRun) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
