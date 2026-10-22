/**
 * B2: MongoDB indexes for issues, counters, audit_events.
 * Postgres: priority_configs table for per-tenant scoring weights.
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export async function up(pgm) {
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_priority_configs_tenant_active ON priority_configs(tenant_id, is_active);

    -- Add department routing: ward_department_coverage
    CREATE TABLE IF NOT EXISTS ward_department_coverage (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      ward_id UUID NOT NULL REFERENCES wards(id) ON DELETE CASCADE,
      department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      category_code VARCHAR(50),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, ward_id, department_id, category_code)
    );

    CREATE INDEX IF NOT EXISTS idx_ward_dept_coverage_tenant ON ward_department_coverage(tenant_id, ward_id);
  `);
}

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export async function down(pgm) {
  pgm.sql(`
    DROP TABLE IF EXISTS ward_department_coverage;
    DROP INDEX IF EXISTS idx_priority_configs_tenant_active;
  `);
}
