/**
 * Migration 003: Add users.google_sub (nullable, unique per tenant) and make password_hash nullable
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export async function up(pgm) {
  pgm.sql(`
    -- 1. Add google_sub column to users
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255);

    -- 2. Make password_hash nullable for Google-only users
    ALTER TABLE users
    ALTER COLUMN password_hash DROP NOT NULL;

    -- 3. Unique per tenant for google_sub
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_google_sub
    ON users(tenant_id, google_sub)
    WHERE google_sub IS NOT NULL;
  `);
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export async function down(pgm) {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_users_tenant_google_sub;
    ALTER TABLE users DROP COLUMN IF EXISTS google_sub;
    ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
  `);
}
