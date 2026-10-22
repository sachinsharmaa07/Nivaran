/**
 * Global test setup — B2
 * Creates nivaran_test (Postgres) and uses nivaran_test (Mongo DB name).
 * Refuses to run if connection strings point at the dev database.
 * Runs migrations and seeds test data; drops everything in teardown.
 */
import { beforeAll, afterAll } from "vitest";
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

function assertTestDatabase(url: string, label: string): void {
  const lc = url.toLowerCase();
  // If the URL contains the word "nivaran" but not "nivaran_test", block it
  if (lc.includes("/nivaran") && !lc.includes("/nivaran_test")) {
    throw new Error(
      `[TEST SAFETY] ${label} URL points at the dev database ('nivaran'). ` +
        `Tests must use 'nivaran_test'. Set POSTGRES_TEST_URL / MONGO_TEST_URI in your env.`
    );
  }
}

// ── Resolve test URLs ──────────────────────────────────────────────────────────

function resolveTestPostgresOwnerUrl(): string {
  const base =
    process.env["POSTGRES_TEST_OWNER_URL"] ??
    process.env["POSTGRES_OWNER_URL"] ??
    "postgresql://nivaran_owner:nivaran_owner_pass@localhost:5432/nivaran";
  // Rewrite DB name to nivaran_test
  return base.replace(/\/([^/?]+)(\?|$)/, "/nivaran_test$2");
}

function resolveTestPostgresAppUrl(): string {
  const base =
    process.env["POSTGRES_TEST_APP_URL"] ??
    process.env["POSTGRES_APP_URL"] ??
    process.env["POSTGRES_OWNER_URL"] ??
    "postgresql://nivaran_owner:nivaran_owner_pass@localhost:5432/nivaran";
  return base.replace(/\/([^/?]+)(\?|$)/, "/nivaran_test$2");
}

function resolveTestMongoUri(): string {
  const base =
    process.env["MONGO_TEST_URI"] ??
    process.env["MONGO_URI"] ??
    "mongodb://localhost:27017/nivaran?replicaSet=rs0";
  return base.replace(/\/([^/?]+)(\?|$)/, "/nivaran_test$2");
}

// ── Global setup / teardown ───────────────────────────────────────────────────

beforeAll(async () => {
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

  // Create nivaran_test if it doesn't exist (connect to postgres maintenance DB)
  const adminUrl = pgOwnerUrl.replace(/\/nivaran_test(\?|$)/, "/postgres$1");
  const adminClient = new pg.Client({ connectionString: adminUrl });
  await adminClient.connect();
  const dbExists = await adminClient.query(
    `SELECT 1 FROM pg_database WHERE datname = 'nivaran_test'`
  );
  if (dbExists.rowCount === 0) {
    await adminClient.query(`CREATE DATABASE nivaran_test`);
  }
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

  // Connect Mongo to nivaran_test
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });

  // Seed test tenants and users
  await seedDatabase();
}, 60_000);

afterAll(async () => {
  // Drop all Mongo collections in test DB
  if (mongoose.connection.readyState === mongoose.ConnectionStates.connected) {
    const collections = await mongoose.connection.db?.listCollections().toArray();
    if (collections) {
      for (const col of collections) {
        await mongoose.connection.db?.dropCollection(col.name);
      }
    }
  }
  await disconnectMongo();
  await closePools();
}, 30_000);
