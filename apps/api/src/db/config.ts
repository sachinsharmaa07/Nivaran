import fs from "node:fs";
import pg from "pg";

export function resolvePostgresUrl(envUrl?: string): string {
  const isTest = process.env["NODE_ENV"] === "test" || Boolean(process.env["VITEST"]);
  const raw =
    envUrl ||
    process.env["POSTGRES_OWNER_URL"] ||
    process.env["POSTGRES_APP_URL"] ||
    (isTest
      ? "postgresql://nivaran_owner:nivaran_owner_pass@localhost:5432/nivaran_test"
      : "postgresql://nivaran_owner:nivaran_owner_pass@localhost:5432/nivaran");

  if (isTest) {
    const lc = raw.toLowerCase();
    if (lc.includes("/nivaran") && !lc.includes("/nivaran_test")) {
      throw new Error(
        `[TEST SAFETY] Connection string points at the dev database ('nivaran'). ` +
          `Tests must use 'nivaran_test'. Refusing to run.`
      );
    }
  }

  const inDocker = Boolean(process.env["IN_DOCKER"]) || fs.existsSync("/.dockerenv");
  // When running locally on host machine outside docker container,
  // replace @postgres: with @localhost:
  if (!inDocker && raw.includes("@postgres:")) {
    return raw.replace("@postgres:", "@localhost:");
  }
  return raw;
}

let ownerPoolInstance: pg.Pool | null = null;
let appPoolInstance: pg.Pool | null = null;

export function getOwnerPool(): pg.Pool {
  if (!ownerPoolInstance) {
    ownerPoolInstance = new pg.Pool({
      connectionString: resolvePostgresUrl(process.env["POSTGRES_OWNER_URL"]),
    });
  }
  return ownerPoolInstance;
}

export function getAppPool(): pg.Pool {
  if (!appPoolInstance) {
    appPoolInstance = new pg.Pool({
      connectionString: resolvePostgresUrl(
        process.env["POSTGRES_APP_URL"] || process.env["POSTGRES_OWNER_URL"]
      ),
    });
  }
  return appPoolInstance;
}

export async function closePools(): Promise<void> {
  if (ownerPoolInstance) {
    await ownerPoolInstance.end();
    ownerPoolInstance = null;
  }
  if (appPoolInstance) {
    await appPoolInstance.end();
    appPoolInstance = null;
  }
}
