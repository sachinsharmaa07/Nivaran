import type { Pool } from "pg";
import { getAppPool } from "./config.js";
import { TenantDb } from "./tenant-db.js";

export interface TenantRow {
  id: string;
  slug: string;
  code: string;
  name: string;
  ulb_type: string;
  state_code: string;
  district: string;
  lgd_code: string | null;
  center: { lat: number; lon: number };
  default_locale: string;
  enabled_locales: string[];
  timezone: string;
  status: string;
  sla_calendar?: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface StateRow {
  code: string;
  name: string;
}

export interface CategoryTemplateRow {
  id: string;
  code: string;
  names: Record<string, string>;
  default_sla_hours: number;
  dedup_radius_m: number;
  default_safety_risk: number;
  evidence_required: boolean;
  created_at: Date;
}

export class PlatformDb {
  private readonly pool: Pool;

  constructor(pool: Pool = getAppPool()) {
    this.pool = pool;
  }

  // ── States ─────────────────────────────────────────────────────────────────

  async listStates(): Promise<StateRow[]> {
    const res = await this.pool.query<StateRow>(`SELECT * FROM states ORDER BY name ASC`);
    return res.rows;
  }

  // ── Category Templates ─────────────────────────────────────────────────────

  async listCategoryTemplates(): Promise<CategoryTemplateRow[]> {
    const res = await this.pool.query<CategoryTemplateRow>(
      `SELECT * FROM category_templates ORDER BY code ASC`
    );
    return res.rows;
  }

  // ── Tenants ────────────────────────────────────────────────────────────────

  async listTenants(stateCode?: string): Promise<TenantRow[]> {
    let query = `SELECT id, slug, code, name, ulb_type, state_code, district, lgd_code,
                        json_build_object('lat', ST_Y(center::geometry), 'lon', ST_X(center::geometry)) AS center,
                        default_locale, enabled_locales, timezone, status, sla_calendar,
                        created_at, updated_at
                 FROM tenants`;
    const params: unknown[] = [];
    if (stateCode) {
      query += ` WHERE UPPER(state_code) = UPPER($1)`;
      params.push(stateCode);
    }
    query += ` ORDER BY name ASC`;

    const res = await this.pool.query<TenantRow>(query, params);
    return res.rows;
  }

  async getTenantById(id: string): Promise<TenantRow | null> {
    const res = await this.pool.query<TenantRow>(
      `SELECT id, slug, code, name, ulb_type, state_code, district, lgd_code,
              json_build_object('lat', ST_Y(center::geometry), 'lon', ST_X(center::geometry)) AS center,
              default_locale, enabled_locales, timezone, status, sla_calendar,
              created_at, updated_at
       FROM tenants WHERE id = $1`,
      [id]
    );
    return res.rows[0] ?? null;
  }

  async getTenantBySlug(slug: string): Promise<TenantRow | null> {
    const res = await this.pool.query<TenantRow>(
      `SELECT id, slug, code, name, ulb_type, state_code, district, lgd_code,
              json_build_object('lat', ST_Y(center::geometry), 'lon', ST_X(center::geometry)) AS center,
              default_locale, enabled_locales, timezone, status, sla_calendar,
              created_at, updated_at
       FROM tenants WHERE slug = $1`,
      [slug]
    );
    return res.rows[0] ?? null;
  }

  /**
   * Public summary for a state: per-ULB open count, SLA compliance, and median resolution.
   * Privacy rule: any cell under 10 issues is masked (returns nulls).
   */
  async getStateSummary(stateCode: string): Promise<
    {
      tenant_id: string;
      tenant_name: string;
      tenant_slug: string;
      ulb_type: string;
      district: string;
      open_count: number | null;
      sla_compliance_pct: number | null;
      median_resolution_hours: number | null;
      masked: boolean;
    }[]
  > {
    const res = await this.pool.query<{
      tenant_id: string;
      tenant_name: string;
      tenant_slug: string;
      ulb_type: string;
      district: string;
      total_issues: string;
      open_count: string;
      sla_met_count: string;
      resolved_count: string;
      median_res_hours: string | null;
    }>(
      `SELECT
         t.id AS tenant_id,
         t.name AS tenant_name,
         t.slug AS tenant_slug,
         t.ulb_type,
         t.district,
         COUNT(m.id)::text AS total_issues,
         COUNT(m.id) FILTER (WHERE m.status NOT IN ('resolved', 'closed', 'rejected', 'duplicate'))::text AS open_count,
         COUNT(m.id) FILTER (WHERE m.status IN ('resolved', 'closed') AND m.sla_breached = false)::text AS sla_met_count,
         COUNT(m.id) FILTER (WHERE m.status IN ('resolved', 'closed'))::text AS resolved_count,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY m.resolution_time_hours) FILTER (WHERE m.status IN ('resolved', 'closed') AND m.resolution_time_hours IS NOT NULL)::text AS median_res_hours
       FROM tenants t
       LEFT JOIN issue_metrics_fact m ON t.id = m.tenant_id
       WHERE UPPER(t.state_code) = UPPER($1)
       GROUP BY t.id, t.name, t.slug, t.ulb_type, t.district
       ORDER BY t.name ASC`,
      [stateCode]
    );

    return res.rows.map((row) => {
      const total = parseInt(row.total_issues || "0", 10);
      if (total < 10) {
        return {
          tenant_id: row.tenant_id,
          tenant_name: row.tenant_name,
          tenant_slug: row.tenant_slug,
          ulb_type: row.ulb_type,
          district: row.district,
          open_count: null,
          sla_compliance_pct: null,
          median_resolution_hours: null,
          masked: true,
        };
      }

      const openCount = parseInt(row.open_count || "0", 10);
      const slaMet = parseInt(row.sla_met_count || "0", 10);
      const resolved = parseInt(row.resolved_count || "0", 10);
      const compliancePct = resolved > 0 ? Math.round((slaMet / resolved) * 100) : 100;
      const medianRes =
        row.median_res_hours != null ? Number(Number(row.median_res_hours).toFixed(1)) : null;

      return {
        tenant_id: row.tenant_id,
        tenant_name: row.tenant_name,
        tenant_slug: row.tenant_slug,
        ulb_type: row.ulb_type,
        district: row.district,
        open_count: openCount,
        sla_compliance_pct: compliancePct,
        median_resolution_hours: medianRes,
        masked: false,
      };
    });
  }

  /**
   * Onboard a new tenant in a single transaction:
   * 1. Creates tenant record
   * 2. Creates default department ("Public Works")
   * 3. Creates default SLA policy
   * 4. Clones all category_templates into categories
   * 5. Creates default priority_config
   */
  async onboardTenant(data: {
    name: string;
    state_code: string;
    district: string;
    ulb_type: string;
    center: { lat: number; lon: number };
    default_locale?: string | undefined;
    enabled_locales?: string[] | undefined;
    lgd_code?: string | undefined;
    sla_calendar?: Record<string, unknown> | undefined;
  }): Promise<{ tenant: TenantRow }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Generate slug and code from name
      let baseSlug = data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      if (!baseSlug) baseSlug = "tenant";

      let slug = baseSlug;
      let counter = 1;
      while (true) {
        const existing = await client.query(`SELECT id FROM tenants WHERE slug = $1`, [slug]);
        if (existing.rowCount === 0) break;
        slug = `${baseSlug}-${counter++}`;
      }

      // Generate code (e.g. 3-4 letters uppercase)
      const letters = data.name.replace(/[^a-zA-Z]/g, "").toUpperCase();
      const baseCode = letters.slice(0, 4) || "TEN";
      let code = baseCode;
      let codeCounter = 1;
      while (true) {
        const existing = await client.query(`SELECT id FROM tenants WHERE code = $1`, [code]);
        if (existing.rowCount === 0) break;
        code = `${baseCode.slice(0, 3)}${codeCounter++}`;
      }

      const defaultLocale = data.default_locale ?? "en";
      const enabledLocales = data.enabled_locales ?? [defaultLocale];
      if (!enabledLocales.includes(defaultLocale)) {
        enabledLocales.unshift(defaultLocale);
      }

      const slaCalendar = data.sla_calendar ?? { type: "24x7" };

      // 1. Insert tenant
      const tenantRes = await client.query(
        `INSERT INTO tenants (slug, code, name, ulb_type, state_code, district, lgd_code, center, default_locale, enabled_locales, sla_calendar)
         VALUES ($1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_MakePoint($8, $9), 4326), $10, $11, $12)
         RETURNING id, slug, code, name, ulb_type, state_code, district, lgd_code,
                   json_build_object('lat', ST_Y(center::geometry), 'lon', ST_X(center::geometry)) AS center,
                   default_locale, enabled_locales, timezone, status, sla_calendar, created_at, updated_at`,
        [
          slug,
          code,
          data.name,
          data.ulb_type,
          data.state_code,
          data.district,
          data.lgd_code ?? null,
          data.center.lon,
          data.center.lat,
          defaultLocale,
          enabledLocales,
          JSON.stringify(slaCalendar),
        ]
      );
      const tenant = tenantRes.rows[0];
      const tenantId = tenant.id;

      const tenantDb = new TenantDb(tenantId, client);

      // 2. Create default department
      const dept = await tenantDb.createDepartment({
        code: "PWD",
        name: "Public Works Department",
      });

      // 3. Create default SLA policy
      const slaPolicy = await tenantDb.createSlaPolicy({
        name: "Standard Civic SLA",
        respond_hours: 24,
        resolve_hours: 72,
        escalation_levels: [
          { at_percent: 50, notify_role: "staff" },
          { at_percent: 100, notify_role: "dept_head" },
          { at_percent: 150, notify_role: "tenant_admin" },
        ],
      });

      // 4. Clone category_templates into categories
      const templates = await client.query<CategoryTemplateRow>(`SELECT * FROM category_templates`);
      for (const tpl of templates.rows) {
        await tenantDb.createCategory({
          code: tpl.code,
          names: tpl.names,
          department_id: dept.id,
          sla_policy_id: slaPolicy.id,
          dedup_radius_m: tpl.dedup_radius_m,
          default_safety_risk: tpl.default_safety_risk,
          evidence_required: tpl.evidence_required,
          active: true,
        });
      }

      // 5. Create default priority config (SPEC section 6 weights)
      await tenantDb.createPriorityConfig({
        version: 1,
        weights: {
          safety: 0.25,
          severity: 0.15,
          facility: 0.15,
          reporters: 0.1,
          age: 0.1,
          sla_pressure: 0.25,
        },
      });

      await client.query("COMMIT");
      return { tenant };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
