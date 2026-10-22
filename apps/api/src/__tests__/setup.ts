/**
 * Global test setup — B2
 * Creates, migrates, seeds and drops nivaran_test databases in both Postgres and Mongo.
 * Refuses to run if any connection string points at the dev database.
 */
import pg from "pg";
import mongoose from "mongoose";
import { runner } from "node-pg-migrate";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedDatabase } from "../db/seed.js";
import { closePools } from "../db/config.js";
import { disconnectMongo } from "../db/mongo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Safety: refuse to run against dev databases ───────────────────────────────

export function assertTestDatabase(url: string, label: string): void {
  const lc = url.toLowerCase();
  // If the URL contains the word "nivaran" but not "nivaran_test", block it
  if (lc.includes("/nivaran") && !lc.includes("/nivaran_test")) {
    throw new Error(
      `[TEST SAFETY] ${label} URL points at the dev database ('nivaran'). ` +
        `Tests must use 'nivaran_test'. Refusing to run.`
    );
  }
}

// ── Resolve test URLs ──────────────────────────────────────────────────────────

export function resolveTestPostgresOwnerUrl(): string {
  const base =
    process.env["POSTGRES_TEST_OWNER_URL"] ??
    process.env["POSTGRES_OWNER_URL"] ??
    "postgresql://nivaran_owner:nivaran_owner_pass@localhost:5432/nivaran_test";
  if (base.includes("/nivaran") && !base.includes("/nivaran_test")) {
    assertTestDatabase(base, "POSTGRES_OWNER_URL");
  }
  return base;
}

export function resolveTestPostgresAppUrl(): string {
  const base =
    process.env["POSTGRES_TEST_APP_URL"] ??
    process.env["POSTGRES_APP_URL"] ??
    process.env["POSTGRES_OWNER_URL"] ??
    "postgresql://nivaran_owner:nivaran_owner_pass@localhost:5432/nivaran_test";
  if (base.includes("/nivaran") && !base.includes("/nivaran_test")) {
    assertTestDatabase(base, "POSTGRES_APP_URL");
  }
  return base;
}

export function resolveTestMongoUri(): string {
  let base =
    process.env["MONGO_TEST_URI"] ??
    process.env["MONGO_URI"] ??
    "mongodb://localhost:27017/nivaran_test?directConnection=true";
  if (base.includes("/nivaran") && !base.includes("/nivaran_test")) {
    assertTestDatabase(base, "MONGO_URI");
  }
  if (!base.includes("directConnection=true") && !process.env["IN_DOCKER"]) {
    base = base.replace(/replicaSet=[^&]+/, "directConnection=true");
    if (!base.includes("directConnection=true")) {
      base += (base.includes("?") ? "&" : "?") + "directConnection=true";
    }
  }
  return base;
}

// ── Setup & Teardown ──────────────────────────────────────────────────────────

export async function setup(): Promise<void> {
  process.env["NODE_ENV"] = "test";
  const pgOwnerUrl = resolveTestPostgresOwnerUrl();
  const pgAppUrl = resolveTestPostgresAppUrl();
  const mongoUri = resolveTestMongoUri();

  assertTestDatabase(pgOwnerUrl, "POSTGRES_TEST_OWNER_URL");
  assertTestDatabase(pgAppUrl, "POSTGRES_TEST_APP_URL");
  assertTestDatabase(mongoUri, "MONGO_TEST_URI");

  // Inject test URLs into process.env so all modules pick them up
  process.env["POSTGRES_OWNER_URL"] = pgOwnerUrl;
  process.env["POSTGRES_APP_URL"] = pgAppUrl;
  process.env["MONGO_URI"] = mongoUri;

  // Connect to postgres maintenance DB
  const adminUrl = pgOwnerUrl.replace(/\/nivaran_test(\?|$)/, "/postgres$1");
  const adminClient = new pg.Client({ connectionString: adminUrl });
  await adminClient.connect();

  // Terminate any existing connections to nivaran_test and recreate clean database
  await adminClient.query(`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = 'nivaran_test' AND pid <> pg_backend_pid();
  `);
  await adminClient.query(`DROP DATABASE IF EXISTS nivaran_test`);
  await adminClient.query(`CREATE DATABASE nivaran_test`);
  await adminClient.end();

  // Run migrations on nivaran_test
  const migrationsDir = path.resolve(__dirname, "../../migrations");
  await runner({
    databaseUrl: pgOwnerUrl,
    dir: migrationsDir,
    direction: "up",
    migrationsTable: "pgmigrations",
    count: Infinity,
    verbose: false,
  });

  // Connect Mongo to nivaran_test, drop existing test db to ensure clean state
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.db?.dropDatabase();

  // Seed test tenants and users into nivaran_test
  await seedDatabase({ includeSynthetic: false });

  await mongoose.disconnect();
  await disconnectMongo();
  await closePools();
}

export async function teardown(): Promise<void> {
  const pgOwnerUrl = resolveTestPostgresOwnerUrl();
  const mongoUri = resolveTestMongoUri();

  // Drop Mongo test database
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
    await disconnectMongo();
  } catch {
    // ignore
  }

  // Close Postgres pools
  await closePools();

  // Drop Postgres test database
  try {
    const adminUrl = pgOwnerUrl.replace(/\/nivaran_test(\?|$)/, "/postgres$1");
    const adminClient = new pg.Client({ connectionString: adminUrl });
    await adminClient.connect();
    await adminClient.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = 'nivaran_test' AND pid <> pg_backend_pid();
    `);
    await adminClient.query(`DROP DATABASE IF EXISTS nivaran_test`);
    await adminClient.end();
  } catch {
    // ignore
  }
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  await setup();
  return async () => {
    await teardown();
  };
}
