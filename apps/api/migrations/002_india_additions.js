/**
 * India additions: SLA calendar on tenants, issue_metrics_fact table
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export async function up(pgm) {
  pgm.sql(`
    -- 1. Add SLA calendar to tenants table
    ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS sla_calendar JSONB DEFAULT '{"type":"24x7"}'::jsonb;

    -- 2. Create issue_metrics_fact for derived issue analytics and public stats
    CREATE TABLE IF NOT EXISTS issue_metrics_fact (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      issue_id TEXT NOT NULL,
      version INT DEFAULT 1,
      status TEXT NOT NULL,
      category_code TEXT,
      department_id UUID,
      ward_id UUID,
      sla_breached BOOLEAN DEFAULT false,
      resolution_time_hours NUMERIC,
      location GEOMETRY(Point, 4326),
      landmark TEXT,
      pincode VARCHAR(6),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      UNIQUE(tenant_id, issue_id)
    );

    CREATE INDEX IF NOT EXISTS idx_issue_metrics_tenant_status ON issue_metrics_fact(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_issue_metrics_created_at ON issue_metrics_fact(tenant_id, created_at);
  `);
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export async function down(pgm) {
  pgm.sql(`
    DROP TABLE IF EXISTS issue_metrics_fact;
    ALTER TABLE tenants DROP COLUMN IF EXISTS sla_calendar;
  `);
}
