/**
 * B2 integration tests — issues routes, tenant isolation, GPS rejection.
 * Uses setup.ts (separate nivaran_test databases).
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { PlatformDb } from "../db/platform-db.js";
import { resetReportRateLimits } from "../routes/issues.js";

describe("B2 Issues — integration", () => {
  let _punjabTenantId: string;
  let _maharashtraTenantId: string;
  let punjabAdminToken: string;
  let maharashtraAdminToken: string;

  beforeAll(async () => {
    const platformDb = new PlatformDb();
    const punjabTenant = await platformDb.getTenantBySlug("demo-punjab");
    const mhTenant = await platformDb.getTenantBySlug("demo-maharashtra");
    if (!punjabTenant || !mhTenant) throw new Error("Seeded tenants missing");
    _punjabTenantId = punjabTenant.id;
    _maharashtraTenantId = mhTenant.id;

    // Login Punjab admin
    const pbRes = await request(app).post("/api/v1/auth/login").send({
      tenantSlug: "demo-punjab",
      identifier: "admin@punjab.local",
      password: "Password123!",
    });
    expect(pbRes.status).toBe(200);
    punjabAdminToken = pbRes.body.data.accessToken as string;

    // Login Maharashtra admin
    const mhRes = await request(app).post("/api/v1/auth/login").send({
      tenantSlug: "demo-maharashtra",
      identifier: "admin@maharashtra.local",
      password: "Password123!",
    });
    expect(mhRes.status).toBe(200);
    maharashtraAdminToken = mhRes.body.data.accessToken as string;
  });

  beforeEach(() => resetReportRateLimits());

  // ── GPS rejection ──────────────────────────────────────────────────────────

  it("rejects GPS outside India", async () => {
    const res = await request(app).post("/api/v1/issues").send({
      tenant_slug: "demo-punjab",
      category_code: "pothole",
      description: "Pothole in Trafalgar Square, London",
      lat: 51.5074,
      lon: -0.1278,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("LOCATION_REJECTED");
    expect(res.body.error.message).toContain("outside India");
  });

  it("rejects GPS inside India but outside tenant service area", async () => {
    const res = await request(app).post("/api/v1/issues").send({
      tenant_slug: "demo-punjab",
      category_code: "pothole",
      description: "Pothole issue in Bangalore, not in Punjab",
      lat: 12.9716,
      lon: 77.5946,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("LOCATION_REJECTED");
    expect(res.body.error.message).toContain("service area");
  });

  // ── Successful creation ────────────────────────────────────────────────────

  it("creates an issue with publicId in NVR-CODE-XXXXXX format", async () => {
    const res = await request(app).post("/api/v1/issues").send({
      tenant_slug: "demo-punjab",
      category_code: "pothole",
      description: "Large dangerous pothole near Bus Stand",
      lat: 31.64,
      lon: 74.9,
      gps_accuracy_m: 5,
      landmark: "Near Bus Terminal, Amritsar",
      pincode: "143001",
      severity: 3,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.issue_id).toMatch(/^NVR-[A-Z0-9]+-\d{6}$/);
    expect(res.body.data.status).toBe("submitted");
    expect(res.body.data.severity).toBe(3);
    expect(res.body.data.priority_score).toBeGreaterThan(0);
    expect(Array.isArray(res.body.data.duplicate_suggestions)).toBe(true);
  });

  it("publicId counter increments atomically", async () => {
    const ids = await Promise.all(
      [1, 2, 3].map(() =>
        request(app).post("/api/v1/issues").send({
          tenant_slug: "demo-punjab",
          category_code: "garbage",
          description: "Garbage dump on the main road near park",
          lat: 31.64,
          lon: 74.9,
        })
      )
    );
    const publicIds = ids.map((r) => r.body.data?.issue_id as string).filter(Boolean);
    const unique = new Set(publicIds);
    expect(unique.size).toBe(publicIds.length);
  });

  // ── Tenant isolation ───────────────────────────────────────────────────────

  it("tenant isolation: cannot confirm issue belonging to another tenant", async () => {
    // Create issue in Punjab
    const createRes = await request(app).post("/api/v1/issues").send({
      tenant_slug: "demo-punjab",
      category_code: "pothole",
      description: "Pothole in Amritsar near Golden Temple",
      lat: 31.64,
      lon: 74.9,
    });
    expect(createRes.status).toBe(201);
    const punjabIssueId: string = createRes.body.data.issue_id;

    // Maharashtra admin token has tid=maharashtra — cannot confirm Punjab issue
    const confirmRes = await request(app)
      .post(`/api/v1/issues/${punjabIssueId}/confirm`)
      .set("Authorization", `Bearer ${maharashtraAdminToken}`);
    // Should 404 because IssueRepo scopes by tenantId from JWT
    expect(confirmRes.status).toBe(404);
  });

  it("tenant isolation: priority override from wrong tenant returns 404", async () => {
    const createRes = await request(app).post("/api/v1/issues").send({
      tenant_slug: "demo-punjab",
      category_code: "garbage",
      description: "Large garbage dump near city center",
      lat: 31.64,
      lon: 74.9,
    });
    expect(createRes.status).toBe(201);
    const punjabIssueId: string = createRes.body.data.issue_id;

    // Maharashtra dept_head tries to override priority on Punjab issue
    const overrideRes = await request(app)
      .post(`/api/v1/issues/${punjabIssueId}/override-priority`)
      .set("Authorization", `Bearer ${maharashtraAdminToken}`)
      .send({ score: 50, reason: "Cross-tenant override attempt" });
    expect(overrideRes.status).toBe(404);
  });

  // ── State machine ──────────────────────────────────────────────────────────

  it("transitions submitted → triaged when authenticated as staff", async () => {
    // Login as staff
    const staffRes = await request(app).post("/api/v1/auth/login").send({
      tenantSlug: "demo-punjab",
      identifier: "staff@punjab.local",
      password: "Password123!",
    });
    const staffToken: string = staffRes.body.data.accessToken;

    const createRes = await request(app).post("/api/v1/issues").send({
      tenant_slug: "demo-punjab",
      category_code: "streetlight",
      description: "Streetlight broken on main road for three weeks",
      lat: 31.64,
      lon: 74.9,
    });
    expect(createRes.status).toBe(201);
    const issueId: string = createRes.body.data.issue_id;

    const transRes = await request(app)
      .post(`/api/v1/issues/${issueId}/transition`)
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ to: "triaged" });
    expect(transRes.status).toBe(200);
    expect(transRes.body.data.status).toBe("triaged");
  });

  it("forbids invalid transition submitted → closed", async () => {
    const staffRes = await request(app).post("/api/v1/auth/login").send({
      tenantSlug: "demo-punjab",
      identifier: "staff@punjab.local",
      password: "Password123!",
    });
    const staffToken: string = staffRes.body.data.accessToken;

    const createRes = await request(app).post("/api/v1/issues").send({
      tenant_slug: "demo-punjab",
      category_code: "pothole",
      description: "Pothole with gravel spread over 2 meters",
      lat: 31.64,
      lon: 74.9,
    });
    const issueId: string = createRes.body.data.issue_id;

    const transRes = await request(app)
      .post(`/api/v1/issues/${issueId}/transition`)
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ to: "closed" });
    expect(transRes.status).toBe(422);
    expect(transRes.body.error.code).toBe("TRANSITION_FORBIDDEN");
  });

  // ── Priority override ──────────────────────────────────────────────────────

  it("dept_head can override priority with reason", async () => {
    const deptRes = await request(app).post("/api/v1/auth/login").send({
      tenantSlug: "demo-punjab",
      identifier: "depthead@punjab.local",
      password: "Password123!",
    });
    const deptToken: string = deptRes.body.data.accessToken;

    const createRes = await request(app).post("/api/v1/issues").send({
      tenant_slug: "demo-punjab",
      category_code: "pothole",
      description: "Critical pothole near school zone",
      lat: 31.64,
      lon: 74.9,
    });
    const issueId: string = createRes.body.data.issue_id;

    const overrideRes = await request(app)
      .post(`/api/v1/issues/${issueId}/override-priority`)
      .set("Authorization", `Bearer ${deptToken}`)
      .send({ score: 85, reason: "Near school, safety risk elevated" });
    expect(overrideRes.status).toBe(200);
    expect(overrideRes.body.data.override_score).toBe(85);
    expect(overrideRes.body.data.computed_score).toBeGreaterThanOrEqual(0);
  });

  it("citizen cannot override priority", async () => {
    const citizenRes = await request(app).post("/api/v1/auth/login").send({
      tenantSlug: "demo-punjab",
      identifier: "citizen@punjab.local",
      password: "Password123!",
    });
    const citizenToken: string = citizenRes.body.data.accessToken;

    const createRes = await request(app).post("/api/v1/issues").send({
      tenant_slug: "demo-punjab",
      category_code: "pothole",
      description: "Pothole blocking road drainage",
      lat: 31.64,
      lon: 74.9,
    });
    const issueId: string = createRes.body.data.issue_id;

    const overrideRes = await request(app)
      .post(`/api/v1/issues/${issueId}/override-priority`)
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({ score: 50, reason: "citizen override attempt" });
    expect(overrideRes.status).toBe(403);
  });

  // ── Audit trail ────────────────────────────────────────────────────────────

  it("audit trail has CREATED event after issue creation", async () => {
    const createRes = await request(app).post("/api/v1/issues").send({
      tenant_slug: "demo-punjab",
      category_code: "drainage",
      description: "Sewage overflow blocking road",
      lat: 31.64,
      lon: 74.9,
    });
    expect(createRes.status).toBe(201);
    const issueId: string = createRes.body.data.issue_id;

    const auditRes = await request(app)
      .get(`/api/v1/issues/${issueId}/audit`)
      .set("Authorization", `Bearer ${punjabAdminToken}`);
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.data.length).toBeGreaterThan(0);
    expect(auditRes.body.data[0].event).toBe("CREATED");
  });
});
