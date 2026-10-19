import type { Pool, PoolClient } from "pg";
import { isInsideIndia } from "@nivaran/shared";
import { getAppPool } from "./config.js";

export interface DepartmentRow {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export interface WardRow {
  id: string;
  tenant_id: string;
  ward_number: string;
  name: string;
  boundary?: unknown;
  created_at: Date;
  updated_at: Date;
}

export interface SlaPolicyRow {
  id: string;
  tenant_id: string;
  name: string;
  respond_hours: number;
  resolve_hours: number;
  escalation_levels: { at_percent: number; notify_role: string }[];
  created_at: Date;
  updated_at: Date;
}

export interface CategoryRow {
  id: string;
  tenant_id: string;
  code: string;
  names: Record<string, string>;
  department_id: string | null;
  sla_policy_id: string | null;
  dedup_radius_m: number;
  default_safety_risk: number;
  evidence_required: boolean;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface FacilityRow {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  location: { lat: number; lon: number };
  created_at: Date;
  updated_at: Date;
}

export interface UserRow {
  id: string;
  tenant_id: string;
  roles: string[];
  name: string;
  email: string | null;
  phone: string | null;
  password_hash: string | null;
  google_sub?: string | null;
  locale: string;
  consent_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface RefreshTokenRow {
  id: string;
  tenant_id: string;
  user_id: string;
  token_hash: string;
  family_id: string;
  is_revoked: boolean;
  expires_at: Date;
  created_at: Date;
}

/**
 * TenantDb: strictly scoped data access layer.
 * Every tenant-owned row has tenant_id and is accessed ONLY through this layer.
 * No query runs without tenant_id.
 */
export class TenantDb {
  public readonly tenantId: string;
  private readonly pool: Pool | PoolClient;

  constructor(tenantId: string, pool: Pool | PoolClient = getAppPool()) {
    if (!tenantId) {
      throw new Error("TenantDb requires a non-empty tenantId");
    }
    this.tenantId = tenantId;
    this.pool = pool;
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  async findUserById(id: string): Promise<UserRow | null> {
    const res = await this.pool.query<UserRow>(
      `SELECT * FROM users WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return res.rows[0] ?? null;
  }

  async findUserByIdentifier(identifier: string): Promise<UserRow | null> {
    const res = await this.pool.query<UserRow>(
      `SELECT * FROM users 
       WHERE (LOWER(email) = LOWER($1) OR phone = $1) AND tenant_id = $2`,
      [identifier, this.tenantId]
    );
    return res.rows[0] ?? null;
  }

  async findUserByGoogleSub(googleSub: string): Promise<UserRow | null> {
    const res = await this.pool.query<UserRow>(
      `SELECT * FROM users WHERE google_sub = $1 AND tenant_id = $2`,
      [googleSub, this.tenantId]
    );
    return res.rows[0] ?? null;
  }

  async linkGoogleSub(userId: string, googleSub: string): Promise<UserRow | null> {
    const res = await this.pool.query<UserRow>(
      `UPDATE users
       SET google_sub = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [googleSub, userId, this.tenantId]
    );
    return res.rows[0] ?? null;
  }

  async createUser(data: {
    name: string;
    email?: string | null | undefined;
    phone?: string | null | undefined;
    password_hash?: string | null | undefined;
    google_sub?: string | null | undefined;
    roles?: string[] | undefined;
    locale?: string | undefined;
    consent_at?: Date | undefined;
  }): Promise<UserRow> {
    const res = await this.pool.query<UserRow>(
      `INSERT INTO users (tenant_id, name, email, phone, password_hash, google_sub, roles, locale, consent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        this.tenantId,
        data.name,
        data.email ?? null,
        data.phone ?? null,
        data.password_hash ?? null,
        data.google_sub ?? null,
        data.roles ?? ["citizen"],
        data.locale ?? "en",
        data.consent_at ?? new Date(),
      ]
    );
    const row = res.rows[0];
    if (!row) throw new Error("Failed to insert user");
    return row;
  }

  async deleteUser(id: string): Promise<boolean> {
    const res = await this.pool.query(`DELETE FROM users WHERE id = $1 AND tenant_id = $2`, [
      id,
      this.tenantId,
    ]);
    return (res.rowCount ?? 0) > 0;
  }

  // ── Refresh Tokens ─────────────────────────────────────────────────────────

  async createRefreshToken(data: {
    userId: string;
    tokenHash: string;
    familyId: string;
    expiresAt: Date;
  }): Promise<RefreshTokenRow> {
    const res = await this.pool.query<RefreshTokenRow>(
      `INSERT INTO refresh_tokens (tenant_id, user_id, token_hash, family_id, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [this.tenantId, data.userId, data.tokenHash, data.familyId, data.expiresAt]
    );
    return res.rows[0]!;
  }

  async findRefreshToken(tokenHash: string): Promise<RefreshTokenRow | null> {
    const res = await this.pool.query<RefreshTokenRow>(
      `SELECT * FROM refresh_tokens WHERE token_hash = $1 AND tenant_id = $2`,
      [tokenHash, this.tenantId]
    );
    return res.rows[0] ?? null;
  }

  async revokeTokenFamily(familyId: string): Promise<void> {
    await this.pool.query(
      `UPDATE refresh_tokens SET is_revoked = true WHERE family_id = $1 AND tenant_id = $2`,
      [familyId, this.tenantId]
    );
  }

  async revokeToken(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE refresh_tokens SET is_revoked = true WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
  }

  // ── Departments ────────────────────────────────────────────────────────────

  async listDepartments(): Promise<DepartmentRow[]> {
    const res = await this.pool.query<DepartmentRow>(
      `SELECT * FROM departments WHERE tenant_id = $1 ORDER BY name ASC`,
      [this.tenantId]
    );
    return res.rows;
  }

  async getDepartment(id: string): Promise<DepartmentRow | null> {
    const res = await this.pool.query<DepartmentRow>(
      `SELECT * FROM departments WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return res.rows[0] ?? null;
  }

  async createDepartment(data: { code: string; name: string }): Promise<DepartmentRow> {
    const res = await this.pool.query<DepartmentRow>(
      `INSERT INTO departments (tenant_id, code, name)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [this.tenantId, data.code, data.name]
    );
    return res.rows[0]!;
  }

  async updateDepartment(
    id: string,
    data: { code?: string | undefined; name?: string | undefined }
  ): Promise<DepartmentRow | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.code !== undefined) {
      fields.push(`code = $${idx++}`);
      values.push(data.code);
    }
    if (data.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (fields.length === 0) return this.getDepartment(id);

    fields.push(`updated_at = NOW()`);
    values.push(id, this.tenantId);

    const res = await this.pool.query<DepartmentRow>(
      `UPDATE departments SET ${fields.join(", ")}
       WHERE id = $${idx++} AND tenant_id = $${idx}
       RETURNING *`,
      values
    );
    return res.rows[0] ?? null;
  }

  async deleteDepartment(id: string): Promise<boolean> {
    const res = await this.pool.query(`DELETE FROM departments WHERE id = $1 AND tenant_id = $2`, [
      id,
      this.tenantId,
    ]);
    return (res.rowCount ?? 0) > 0;
  }

  // ── Wards ──────────────────────────────────────────────────────────────────

  async listWards(): Promise<WardRow[]> {
    const res = await this.pool.query(
      `SELECT id, tenant_id, ward_number, name,
              ST_AsGeoJSON(boundary)::json AS boundary,
              created_at, updated_at
       FROM wards WHERE tenant_id = $1 ORDER BY ward_number ASC`,
      [this.tenantId]
    );
    return res.rows;
  }

  async getWard(id: string): Promise<WardRow | null> {
    const res = await this.pool.query(
      `SELECT id, tenant_id, ward_number, name,
              ST_AsGeoJSON(boundary)::json AS boundary,
              created_at, updated_at
       FROM wards WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return res.rows[0] ?? null;
  }

  async getWardByNumber(wardNumber: string): Promise<WardRow | null> {
    const res = await this.pool.query(
      `SELECT id, tenant_id, ward_number, name,
              ST_AsGeoJSON(boundary)::json AS boundary,
              created_at, updated_at
       FROM wards WHERE ward_number = $1 AND tenant_id = $2`,
      [wardNumber, this.tenantId]
    );
    return res.rows[0] ?? null;
  }

  async createWard(data: {
    ward_number: string;
    name: string;
    boundary?: unknown;
  }): Promise<WardRow> {
    let query: string;
    let params: unknown[];

    if (data.boundary) {
      query = `INSERT INTO wards (tenant_id, ward_number, name, boundary)
               VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326))
               RETURNING id, tenant_id, ward_number, name, ST_AsGeoJSON(boundary)::json AS boundary, created_at, updated_at`;
      params = [this.tenantId, data.ward_number, data.name, JSON.stringify(data.boundary)];
    } else {
      query = `INSERT INTO wards (tenant_id, ward_number, name)
               VALUES ($1, $2, $3)
               RETURNING id, tenant_id, ward_number, name, null as boundary, created_at, updated_at`;
      params = [this.tenantId, data.ward_number, data.name];
    }

    const res = await this.pool.query(query, params);
    return res.rows[0];
  }

  async updateWard(
    id: string,
    data: { ward_number?: string | undefined; name?: string | undefined; boundary?: unknown }
  ): Promise<WardRow | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.ward_number !== undefined) {
      fields.push(`ward_number = $${idx++}`);
      values.push(data.ward_number);
    }
    if (data.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.boundary !== undefined) {
      if (data.boundary === null) {
        fields.push(`boundary = null`);
      } else {
        fields.push(`boundary = ST_SetSRID(ST_GeomFromGeoJSON($${idx++}), 4326)`);
        values.push(JSON.stringify(data.boundary));
      }
    }
    if (fields.length === 0) return this.getWard(id);

    fields.push(`updated_at = NOW()`);
    values.push(id, this.tenantId);

    const res = await this.pool.query(
      `UPDATE wards SET ${fields.join(", ")}
       WHERE id = $${idx++} AND tenant_id = $${idx}
       RETURNING id, tenant_id, ward_number, name, ST_AsGeoJSON(boundary)::json AS boundary, created_at, updated_at`,
      values
    );
    return res.rows[0] ?? null;
  }

  async deleteWard(id: string): Promise<boolean> {
    const res = await this.pool.query(`DELETE FROM wards WHERE id = $1 AND tenant_id = $2`, [
      id,
      this.tenantId,
    ]);
    return (res.rowCount ?? 0) > 0;
  }

  // ── Categories ─────────────────────────────────────────────────────────────

  async listCategories(): Promise<CategoryRow[]> {
    const res = await this.pool.query<CategoryRow>(
      `SELECT * FROM categories WHERE tenant_id = $1 ORDER BY code ASC`,
      [this.tenantId]
    );
    return res.rows;
  }

  async getCategory(id: string): Promise<CategoryRow | null> {
    const res = await this.pool.query<CategoryRow>(
      `SELECT * FROM categories WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return res.rows[0] ?? null;
  }

  async getCategoryByCode(code: string): Promise<CategoryRow | null> {
    const res = await this.pool.query<CategoryRow>(
      `SELECT * FROM categories WHERE code = $1 AND tenant_id = $2`,
      [code, this.tenantId]
    );
    return res.rows[0] ?? null;
  }

  async createCategory(data: {
    code: string;
    names: Record<string, string>;
    department_id?: string | null | undefined;
    sla_policy_id?: string | null | undefined;
    dedup_radius_m?: number | undefined;
    default_safety_risk?: number | undefined;
    evidence_required?: boolean | undefined;
    active?: boolean | undefined;
  }): Promise<CategoryRow> {
    const res = await this.pool.query<CategoryRow>(
      `INSERT INTO categories 
       (tenant_id, code, names, department_id, sla_policy_id, dedup_radius_m, default_safety_risk, evidence_required, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        this.tenantId,
        data.code,
        JSON.stringify(data.names),
        data.department_id ?? null,
        data.sla_policy_id ?? null,
        data.dedup_radius_m ?? 30,
        data.default_safety_risk ?? 0.0,
        data.evidence_required ?? true,
        data.active ?? true,
      ]
    );
    return res.rows[0]!;
  }

  async updateCategory(
    id: string,
    data: { [K in keyof CategoryRow]?: CategoryRow[K] | undefined }
  ): Promise<CategoryRow | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.code !== undefined) {
      fields.push(`code = $${idx++}`);
      values.push(data.code);
    }
    if (data.names !== undefined) {
      fields.push(`names = $${idx++}`);
      values.push(JSON.stringify(data.names));
    }
    if (data.department_id !== undefined) {
      fields.push(`department_id = $${idx++}`);
      values.push(data.department_id);
    }
    if (data.sla_policy_id !== undefined) {
      fields.push(`sla_policy_id = $${idx++}`);
      values.push(data.sla_policy_id);
    }
    if (data.dedup_radius_m !== undefined) {
      fields.push(`dedup_radius_m = $${idx++}`);
      values.push(data.dedup_radius_m);
    }
    if (data.default_safety_risk !== undefined) {
      fields.push(`default_safety_risk = $${idx++}`);
      values.push(data.default_safety_risk);
    }
    if (data.evidence_required !== undefined) {
      fields.push(`evidence_required = $${idx++}`);
      values.push(data.evidence_required);
    }
    if (data.active !== undefined) {
      fields.push(`active = $${idx++}`);
      values.push(data.active);
    }
    if (fields.length === 0) return this.getCategory(id);

    fields.push(`updated_at = NOW()`);
    values.push(id, this.tenantId);

    const res = await this.pool.query<CategoryRow>(
      `UPDATE categories SET ${fields.join(", ")}
       WHERE id = $${idx++} AND tenant_id = $${idx}
       RETURNING *`,
      values
    );
    return res.rows[0] ?? null;
  }

  async deleteCategory(id: string): Promise<boolean> {
    const res = await this.pool.query(`DELETE FROM categories WHERE id = $1 AND tenant_id = $2`, [
      id,
      this.tenantId,
    ]);
    return (res.rowCount ?? 0) > 0;
  }

  // ── SLA Policies ───────────────────────────────────────────────────────────

  async listSlaPolicies(): Promise<SlaPolicyRow[]> {
    const res = await this.pool.query<SlaPolicyRow>(
      `SELECT * FROM sla_policies WHERE tenant_id = $1 ORDER BY name ASC`,
      [this.tenantId]
    );
    return res.rows;
  }

  async getSlaPolicy(id: string): Promise<SlaPolicyRow | null> {
    const res = await this.pool.query<SlaPolicyRow>(
      `SELECT * FROM sla_policies WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return res.rows[0] ?? null;
  }

  async createSlaPolicy(data: {
    name: string;
    respond_hours: number;
    resolve_hours: number;
    escalation_levels?: { at_percent: number; notify_role: string }[];
  }): Promise<SlaPolicyRow> {
    const res = await this.pool.query<SlaPolicyRow>(
      `INSERT INTO sla_policies (tenant_id, name, respond_hours, resolve_hours, escalation_levels)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        this.tenantId,
        data.name,
        data.respond_hours,
        data.resolve_hours,
        JSON.stringify(data.escalation_levels ?? []),
      ]
    );
    return res.rows[0]!;
  }

  async updateSlaPolicy(
    id: string,
    data: {
      name?: string | undefined;
      respond_hours?: number | undefined;
      resolve_hours?: number | undefined;
      escalation_levels?: { at_percent: number; notify_role: string }[] | undefined;
    }
  ): Promise<SlaPolicyRow | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.respond_hours !== undefined) {
      fields.push(`respond_hours = $${idx++}`);
      values.push(data.respond_hours);
    }
    if (data.resolve_hours !== undefined) {
      fields.push(`resolve_hours = $${idx++}`);
      values.push(data.resolve_hours);
    }
    if (data.escalation_levels !== undefined) {
      fields.push(`escalation_levels = $${idx++}`);
      values.push(JSON.stringify(data.escalation_levels));
    }
    if (fields.length === 0) return this.getSlaPolicy(id);

    fields.push(`updated_at = NOW()`);
    values.push(id, this.tenantId);

    const res = await this.pool.query<SlaPolicyRow>(
      `UPDATE sla_policies SET ${fields.join(", ")}
       WHERE id = $${idx++} AND tenant_id = $${idx}
       RETURNING *`,
      values
    );
    return res.rows[0] ?? null;
  }

  async deleteSlaPolicy(id: string): Promise<boolean> {
    const res = await this.pool.query(`DELETE FROM sla_policies WHERE id = $1 AND tenant_id = $2`, [
      id,
      this.tenantId,
    ]);
    return (res.rowCount ?? 0) > 0;
  }

  // ── Priority Configs ───────────────────────────────────────────────────────

  async getActivePriorityConfig(): Promise<any> {
    const res = await this.pool.query(
      `SELECT * FROM priority_configs WHERE tenant_id = $1 AND is_active = true ORDER BY version DESC LIMIT 1`,
      [this.tenantId]
    );
    return res.rows[0] ?? null;
  }

  async createPriorityConfig(data: {
    version: number;
    weights: Record<string, number>;
  }): Promise<any> {
    const res = await this.pool.query(
      `INSERT INTO priority_configs (tenant_id, version, weights, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING *`,
      [this.tenantId, data.version, JSON.stringify(data.weights)]
    );
    return res.rows[0];
  }

  // ── Facilities ─────────────────────────────────────────────────────────────

  async listFacilities(): Promise<FacilityRow[]> {
    const res = await this.pool.query(
      `SELECT id, tenant_id, name, type,
              json_build_object('lat', ST_Y(location::geometry), 'lon', ST_X(location::geometry)) AS location,
              created_at, updated_at
       FROM facilities WHERE tenant_id = $1 ORDER BY name ASC`,
      [this.tenantId]
    );
    return res.rows;
  }

  async getFacility(id: string): Promise<FacilityRow | null> {
    const res = await this.pool.query(
      `SELECT id, tenant_id, name, type,
              json_build_object('lat', ST_Y(location::geometry), 'lon', ST_X(location::geometry)) AS location,
              created_at, updated_at
       FROM facilities WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return res.rows[0] ?? null;
  }

  async createFacility(data: {
    name: string;
    type: string;
    location: { lat: number; lon: number };
  }): Promise<FacilityRow> {
    const res = await this.pool.query(
      `INSERT INTO facilities (tenant_id, name, type, location)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326))
       RETURNING id, tenant_id, name, type,
                 json_build_object('lat', ST_Y(location::geometry), 'lon', ST_X(location::geometry)) AS location,
                 created_at, updated_at`,
      [this.tenantId, data.name, data.type, data.location.lon, data.location.lat]
    );
    return res.rows[0];
  }

  async updateFacility(
    id: string,
    data: {
      name?: string | undefined;
      type?: string | undefined;
      location?: { lat: number; lon: number } | undefined;
    }
  ): Promise<FacilityRow | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.type !== undefined) {
      fields.push(`type = $${idx++}`);
      values.push(data.type);
    }
    if (data.location !== undefined) {
      fields.push(`location = ST_SetSRID(ST_MakePoint($${idx++}, $${idx++}), 4326)`);
      values.push(data.location.lon, data.location.lat);
    }
    if (fields.length === 0) return this.getFacility(id);

    fields.push(`updated_at = NOW()`);
    values.push(id, this.tenantId);

    const res = await this.pool.query(
      `UPDATE facilities SET ${fields.join(", ")}
       WHERE id = $${idx++} AND tenant_id = $${idx}
       RETURNING id, tenant_id, name, type,
                 json_build_object('lat', ST_Y(location::geometry), 'lon', ST_X(location::geometry)) AS location,
                 created_at, updated_at`,
      values
    );
    return res.rows[0] ?? null;
  }

  async deleteFacility(id: string): Promise<boolean> {
    const res = await this.pool.query(`DELETE FROM facilities WHERE id = $1 AND tenant_id = $2`, [
      id,
      this.tenantId,
    ]);
    return (res.rowCount ?? 0) > 0;
  }

  // ── India Additions: GPS & Service Area Validation ─────────────────────────

  /**
   * Validates if a report location is within India and inside the tenant's service area.
   * If the tenant has imported wards with boundaries, the point must be within at least one ward.
   * If zero wards are configured, the service area defaults to a 30 km circle from the tenant center.
   */
  async validateLocation(
    lat: number,
    lon: number
  ): Promise<{ valid: boolean; reason?: string; wardId?: string }> {
    // 1. Check if point is inside India
    if (!isInsideIndia(lat, lon)) {
      return {
        valid: false,
        reason: "GPS coordinates are outside India",
      };
    }

    // 2. Check if tenant has any wards with polygon boundaries
    const wardsCountRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM wards WHERE tenant_id = $1 AND boundary IS NOT NULL`,
      [this.tenantId]
    );
    const wardCount = parseInt(wardsCountRes.rows[0]?.count ?? "0", 10);

    if (wardCount > 0) {
      // Must fall inside one of the ward polygons
      const matchRes = await this.pool.query<{ id: string }>(
        `SELECT id FROM wards
         WHERE tenant_id = $1 AND boundary IS NOT NULL
           AND ST_Contains(boundary, ST_SetSRID(ST_MakePoint($2, $3), 4326))
         LIMIT 1`,
        [this.tenantId, lon, lat]
      );

      if (matchRes.rowCount && matchRes.rowCount > 0 && matchRes.rows[0]?.id) {
        return { valid: true, wardId: matchRes.rows[0].id };
      }

      return {
        valid: false,
        reason: "Location is outside the municipal service area (not inside any ward)",
      };
    }

    // 3. Zero-ward fallback: service area = 30 km circle around tenant center
    const circleRes = await this.pool.query<{ inside: boolean }>(
      `SELECT ST_DWithin(
                center::geography,
                ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
                30000
              ) AS inside
       FROM tenants WHERE id = $1`,
      [this.tenantId, lon, lat]
    );

    const isInsideCircle = Boolean(circleRes.rows[0]?.inside);
    if (!isInsideCircle) {
      return {
        valid: false,
        reason: "Location is outside the tenant's 30 km service area circle",
      };
    }

    return { valid: true };
  }

  // ── India Additions: SLA Calendar ──────────────────────────────────────────

  async getSlaCalendar(): Promise<Record<string, unknown>> {
    const res = await this.pool.query<{ sla_calendar: Record<string, unknown> | null }>(
      `SELECT sla_calendar FROM tenants WHERE id = $1`,
      [this.tenantId]
    );
    return res.rows[0]?.sla_calendar ?? { type: "24x7" };
  }

  async updateSlaCalendar(calendar: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await this.pool.query<{ sla_calendar: Record<string, unknown> }>(
      `UPDATE tenants
       SET sla_calendar = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING sla_calendar`,
      [JSON.stringify(calendar), this.tenantId]
    );
    return res.rows[0]?.sla_calendar ?? calendar;
  }

  // ── India Additions: Issue Metrics Fact ────────────────────────────────────

  async recordIssueMetric(data: {
    issue_id: string;
    status: string;
    category_code?: string | undefined;
    department_id?: string | undefined;
    ward_id?: string | undefined;
    sla_breached?: boolean | undefined;
    resolution_time_hours?: number | undefined;
    lat?: number | undefined;
    lon?: number | undefined;
    landmark?: string | undefined;
    pincode?: string | undefined;
    created_at?: Date | undefined;
    resolved_at?: Date | undefined;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO issue_metrics_fact (
         tenant_id, issue_id, status, category_code, department_id, ward_id,
         sla_breached, resolution_time_hours, landmark, pincode,
         created_at, resolved_at, location
       )
       VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10,
         COALESCE($11::timestamptz, NOW()), $12::timestamptz,
         CASE
           WHEN $13::float8 IS NOT NULL AND $14::float8 IS NOT NULL
           THEN ST_SetSRID(ST_MakePoint($13::float8, $14::float8), 4326)
           ELSE NULL
         END
       )
       ON CONFLICT (tenant_id, issue_id) DO UPDATE SET
         status = EXCLUDED.status,
         sla_breached = EXCLUDED.sla_breached,
         resolution_time_hours = EXCLUDED.resolution_time_hours,
         resolved_at = EXCLUDED.resolved_at,
         version = issue_metrics_fact.version + 1`,
      [
        this.tenantId, // $1
        data.issue_id, // $2
        data.status, // $3
        data.category_code ?? null, // $4
        data.department_id ?? null, // $5
        data.ward_id ?? null, // $6
        data.sla_breached ?? false, // $7
        data.resolution_time_hours ?? null, // $8
        data.landmark ?? null, // $9
        data.pincode ?? null, // $10
        data.created_at ?? null, // $11
        data.resolved_at ?? null, // $12
        data.lon ?? null, // $13
        data.lat ?? null, // $14
      ]
    );
  }
}
