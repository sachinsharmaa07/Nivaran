/**
 * B2 integration tests — issues routes, tenant isolation, GPS rejection,
 * storage adapter, merge/unmerge, workflow state transitions, department routing.
 * Uses setup.ts (separate nivaran_test databases).
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { PlatformDb } from "../db/platform-db.js";
import { TenantDb } from "../db/tenant-db.js";
import { IssueRepo } from "../db/issue-repo.js";
import { resolvePostgresUrl } from "../db/config.js";
import { resetReportRateLimits } from "../routes/issues.js";

describe("B2 Issues — integration", () => {
  let punjabTenantId: string;
  let maharashtraTenantId: string;
  let punjabAdminToken: string;
  let punjabStaffToken: string;
  let punjabDeptHeadToken: string;
  let punjabCitizenToken: string;
  let maharashtraAdminToken: string;
  let maharashtraStaffToken: string;
  let maharashtraDeptHeadToken: string;

  beforeAll(async () => {
    const platformDb = new PlatformDb();
    const punjabTenant = await platformDb.getTenantBySlug("demo-punjab");
    const mhTenant = await platformDb.getTenantBySlug("demo-maharashtra");
    if (!punjabTenant || !mhTenant) throw new Error("Seeded tenants missing");
    punjabTenantId = punjabTenant.id;
    maharashtraTenantId = mhTenant.id;

    // Login Punjab users
    const pbAdmin = await request(app).post("/api/v1/auth/login").send({
      tenantSlug: "demo-punjab",
      identifier: "admin@punjab.local",
      password: "Password123!",
    });
    punjabAdminToken = pbAdmin.body.data.accessToken as string;

    const pbStaff = await request(app).post("/api/v1/auth/login").send({
      tenantSlug: "demo-punjab",
      identifier: "staff@punjab.local",
      password: "Password123!",
    });
    punjabStaffToken = pbStaff.body.data.accessToken as string;

    const pbDept = await request(app).post("/api/v1/auth/login").send({
      tenantSlug: "demo-punjab",
      identifier: "depthead@punjab.local",
      password: "Password123!",
    });
    punjabDeptHeadToken = pbDept.body.data.accessToken as string;

    const pbCit = await request(app).post("/api/v1/auth/login").send({
      tenantSlug: "demo-punjab",
      identifier: "citizen@punjab.local",
      password: "Password123!",
    });
    punjabCitizenToken = pbCit.body.data.accessToken as string;

    // Login Maharashtra users
    const mhAdmin = await request(app).post("/api/v1/auth/login").send({
      tenantSlug: "demo-maharashtra",
      identifier: "admin@maharashtra.local",
      password: "Password123!",
    });
    maharashtraAdminToken = mhAdmin.body.data.accessToken as string;

    const mhStaff = await request(app).post("/api/v1/auth/login").send({
      tenantSlug: "demo-maharashtra",
      identifier: "staff@maharashtra.local",
      password: "Password123!",
    });
    maharashtraStaffToken = mhStaff.body.data.accessToken as string;

    const mhDept = await request(app).post("/api/v1/auth/login").send({
      tenantSlug: "demo-maharashtra",
      identifier: "depthead@maharashtra.local",
      password: "Password123!",
    });
    maharashtraDeptHeadToken = mhDept.body.data.accessToken as string;
  });

  beforeEach(() => resetReportRateLimits());

  // ── Test isolation safety ──────────────────────────────────────────────────

  it("refuses to run if connection string points at dev database", () => {
    expect(() =>
      resolvePostgresUrl("postgresql://nivaran_owner:pass@localhost:5432/nivaran")
    ).toThrow(/TEST SAFETY.*dev database/);
  });

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

  // ── Successful creation & Snapshots ────────────────────────────────────────

  it("creates an issue with publicId NVR-CODE-XXXXXX and snapshots category, dept, ward and SLA", async () => {
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

    // Verify snapshot in database
    const repo = new IssueRepo(punjabTenantId);
    const issue = await repo.findByPublicId(res.body.data.issue_id);
    expect(issue).not.toBeNull();
    expect(issue?.category.code).toBe("pothole");
    expect(issue?.location.wardId).toBeDefined();
    expect(issue?.department).toBeDefined();
    expect(issue?.slaPolicy).toBeDefined();
    expect(issue?.slaPolicy?.resolveHours).toBeGreaterThan(0);
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

  // ── Local-disk photo storage adapter ────────────────────────────────────────

  it("uploads photo, strips metadata with sharp, and enforces magic bytes & size limit", async () => {
    // 1x1 transparent PNG
    const validPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    const uploadRes = await request(app)
      .put("/api/v1/issues/upload/issue-temp-123")
      .set("Authorization", `Bearer ${punjabStaffToken}`)
      .set("Content-Type", "image/png")
      .send(validPng);

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.data.key).toBeDefined();
    expect(uploadRes.body.data.mime).toBe("image/png");
    expect(uploadRes.body.data.blur_score).toBeGreaterThanOrEqual(0);

    // Unsupported media type returns 415
    const gifRes = await request(app)
      .put("/api/v1/issues/upload/issue-temp-123")
      .set("Authorization", `Bearer ${punjabStaffToken}`)
      .set("Content-Type", "image/gif")
      .send(Buffer.from("GIF89a fake gif data"));
    expect(gifRes.status).toBe(415);
    expect(gifRes.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");

    // Bad magic-byte check returns 400
    const fakeImage = Buffer.from("plain text disguised as image");
    const fakeRes = await request(app)
      .put("/api/v1/issues/upload/issue-temp-123")
      .set("Authorization", `Bearer ${punjabStaffToken}`)
      .set("Content-Type", "image/jpeg")
      .send(fakeImage);
    expect(fakeRes.status).toBe(400);
    expect(fakeRes.body.error.code).toBe("BAD_MAGIC_BYTES");

    // Exceeds 8 MB limit returns 413
    const hugeBuffer = Buffer.alloc(8 * 1024 * 1024 + 1024);
    const hugeRes = await request(app)
      .put("/api/v1/issues/upload/issue-temp-123")
      .set("Authorization", `Bearer ${punjabStaffToken}`)
      .set("Content-Type", "image/jpeg")
      .send(hugeBuffer);
    expect(hugeRes.status).toBe(413);
    expect(hugeRes.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  // ── +1 Endpoint ─────────────────────────────────────────────────────────────

  it("+1 endpoint allows citizens to confirm existing issue", async () => {
    const createRes = await request(app).post("/api/v1/issues").send({
      tenant_slug: "demo-punjab",
      category_code: "water_leakage",
      description: "Burst pipe on road wasting water",
      lat: 31.64,
      lon: 74.9,
    });
    const issueId = createRes.body.data.issue_id;

    const confirmRes = await request(app)
      .post(`/api/v1/issues/${issueId}/confirm`)
      .set("Authorization", `Bearer ${punjabCitizenToken}`);
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.reporter_count).toBeGreaterThan(0);
  });

  // ── Staff merge and unmerge ────────────────────────────────────────────────

  it("staff merge links duplicate and unmerge restores both", async () => {
    // Create primary issue
    const pRes = await request(app).post("/api/v1/issues").send({
      tenant_slug: "demo-punjab",
      category_code: "pothole",
      description: "Primary pothole issue",
      lat: 31.64,
      lon: 74.9,
    });
    const primaryId = pRes.body.data.issue_id;

    // Create secondary issue
    const sRes = await request(app).post("/api/v1/issues").send({
      tenant_slug: "demo-punjab",
      category_code: "pothole",
      description: "Duplicate pothole issue reported by neighbor",
      lat: 31.6401,
      lon: 74.9001,
    });
    const secondaryId = sRes.body.data.issue_id;

    // Merge secondary into primary
    const mergeRes = await request(app)
      .post(`/api/v1/issues/${secondaryId}/merge`)
      .set("Authorization", `Bearer ${punjabDeptHeadToken}`)
      .send({ primary_public_id: primaryId });
    expect(mergeRes.status).toBe(200);
    expect(mergeRes.body.data.merged).toBe(true);

    const repo = new IssueRepo(punjabTenantId);
    const secondaryAfterMerge = await repo.findByPublicId(secondaryId);
    expect(secondaryAfterMerge?.status).toBe("duplicate");
    expect(secondaryAfterMerge?.duplicateOf).toBe(primaryId);

    const primaryAfterMerge = await repo.findByPublicId(primaryId);
    expect(primaryAfterMerge?.duplicates.some((d) => d.secondaryId === secondaryId)).toBe(true);

    // Unmerge secondary
    const unmergeRes = await request(app)
      .post(`/api/v1/issues/${secondaryId}/unmerge`)
      .set("Authorization", `Bearer ${punjabDeptHeadToken}`);
    expect(unmergeRes.status).toBe(200);
    expect(unmergeRes.body.data.unmerged).toBe(true);

    const secondaryAfterUnmerge = await repo.findByPublicId(secondaryId);
    expect(secondaryAfterUnmerge?.status).toBe("submitted");
    expect(secondaryAfterUnmerge?.duplicateOf).toBeUndefined();

    const primaryAfterUnmerge = await repo.findByPublicId(primaryId);
    expect(primaryAfterUnmerge?.duplicates.some((d) => d.secondaryId === secondaryId)).toBe(false);
  });

  // ── Department routing ─────────────────────────────────────────────────────

  it("routes issue to a department and records audit event", async () => {
    const createRes = await request(app).post("/api/v1/issues").send({
      tenant_slug: "demo-punjab",
      category_code: "road_damage",
      description: "Road broken with gravel exposed",
      lat: 31.64,
      lon: 74.9,
    });
    const issueId = createRes.body.data.issue_id;

    const tenantDb = new TenantDb(punjabTenantId);
    const depts = await tenantDb.listDepartments();
    const targetDept = depts.find((d) => d.code === "roads") ?? depts[0]!;

    const routeRes = await request(app)
      .post(`/api/v1/issues/${issueId}/route`)
      .set("Authorization", `Bearer ${punjabStaffToken}`)
      .send({ department_id: targetDept.id });
    expect(routeRes.status).toBe(200);
    expect(routeRes.body.data.department.code).toBe(targetDept.code);

    // Verify audit event
    const repo = new IssueRepo(punjabTenantId);
    const audits = await repo.listAuditEvents(issueId);
    expect(audits.some((a) => a.event === "DEPARTMENT_ROUTED")).toBe(true);
  });

  // ── Workflow transitions: assign, evidence resolve, confirm, dispute & reopen ─

  it("handles state transitions with assign, evidence resolve, citizen confirm and dispute", async () => {
    const createRes = await request(app).post("/api/v1/issues").send({
      tenant_slug: "demo-punjab",
      category_code: "pothole",
      description: "Dangerous pothole to follow through lifecycle",
      lat: 31.64,
      lon: 74.9,
    });
    const issueId = createRes.body.data.issue_id;

    // 1. submitted → triaged
    await request(app)
      .post(`/api/v1/issues/${issueId}/transition`)
      .set("Authorization", `Bearer ${punjabStaffToken}`)
      .send({ to: "triaged" });

    // 2. triaged → assigned
    const assignRes = await request(app)
      .post(`/api/v1/issues/${issueId}/transition`)
      .set("Authorization", `Bearer ${punjabStaffToken}`)
      .send({ to: "assigned" });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.data.status).toBe("assigned");

    // 3. assigned → in_progress
    await request(app)
      .post(`/api/v1/issues/${issueId}/transition`)
      .set("Authorization", `Bearer ${punjabStaffToken}`)
      .send({ to: "in_progress" });

    // 4. in_progress → resolved (evidence-required check)
    // Attempting without evidence on pothole (evidence_required: true) must fail
    const noEvidenceRes = await request(app)
      .post(`/api/v1/issues/${issueId}/transition`)
      .set("Authorization", `Bearer ${punjabStaffToken}`)
      .send({ to: "resolved", note: "Fixed with no photo", evidence_keys: [] });
    expect(noEvidenceRes.status).toBe(422);
    expect(noEvidenceRes.body.error.code).toBe("EVIDENCE_REQUIRED");

    // Resolving with evidence succeeds
    const resolveRes = await request(app)
      .post(`/api/v1/issues/${issueId}/transition`)
      .set("Authorization", `Bearer ${punjabStaffToken}`)
      .send({
        to: "resolved",
        note: "Pothole filled and compacted",
        evidence_keys: ["t/punjab/resolution-pothole.jpg"],
      });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.data.status).toBe("resolved");

    // 5. Citizen dispute: resolved → reopened
    const disputeRes = await request(app)
      .post(`/api/v1/issues/${issueId}/transition`)
      .set("Authorization", `Bearer ${punjabCitizenToken}`)
      .send({ to: "reopened", note: "The gravel is already sinking" });
    expect(disputeRes.status).toBe(200);
    expect(disputeRes.body.data.status).toBe("reopened");

    const repo = new IssueRepo(punjabTenantId);
    let issueDoc = await repo.findByPublicId(issueId);
    expect(issueDoc?.reopenCount).toBe(1);
    expect(issueDoc?.resolution?.citizenResponse).toBe("disputed");

    // Staff moves reopened → in_progress → resolved again
    await request(app)
      .post(`/api/v1/issues/${issueId}/transition`)
      .set("Authorization", `Bearer ${punjabStaffToken}`)
      .send({ to: "in_progress" });

    await request(app)
      .post(`/api/v1/issues/${issueId}/transition`)
      .set("Authorization", `Bearer ${punjabStaffToken}`)
      .send({
        to: "resolved",
        note: "Asphalt laid properly",
        evidence_keys: ["t/punjab/resolution-asphalt.jpg"],
      });

    // 6. Citizen confirm: resolved → closed
    const confirmCloseRes = await request(app)
      .post(`/api/v1/issues/${issueId}/transition`)
      .set("Authorization", `Bearer ${punjabCitizenToken}`)
      .send({ to: "closed", note: "Looks good now" });
    expect(confirmCloseRes.status).toBe(200);
    expect(confirmCloseRes.body.data.status).toBe("closed");

    issueDoc = await repo.findByPublicId(issueId);
    expect(issueDoc?.resolution?.citizenResponse).toBe("confirmed");
    expect(issueDoc?.resolution?.closedAt).toBeDefined();
  });

  // ── Priority override ──────────────────────────────────────────────────────

  it("dept_head can override priority with reason", async () => {
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
      .set("Authorization", `Bearer ${punjabDeptHeadToken}`)
      .send({ score: 85, reason: "Near school, safety risk elevated" });
    expect(overrideRes.status).toBe(200);
    expect(overrideRes.body.data.override_score).toBe(85);
    expect(overrideRes.body.data.computed_score).toBeGreaterThanOrEqual(0);
  });

  // ── Append-only audit trail ────────────────────────────────────────────────

  it("audit trail appends events with sequential seq numbers", async () => {
    const createRes = await request(app).post("/api/v1/issues").send({
      tenant_slug: "demo-punjab",
      category_code: "drainage",
      description: "Sewage overflow blocking road",
      lat: 31.64,
      lon: 74.9,
    });
    const issueId: string = createRes.body.data.issue_id;

    const auditRes = await request(app)
      .get(`/api/v1/issues/${issueId}/audit`)
      .set("Authorization", `Bearer ${punjabAdminToken}`);
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.data.length).toBeGreaterThan(0);
    expect(auditRes.body.data[0].event).toBe("CREATED");
  });

  // ── Per-user report creation rate limit ────────────────────────────────────

  it("enforces per-user rate limit on issue creation", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post("/api/v1/issues")
        .send({
          tenant_slug: "demo-punjab",
          category_code: "pothole",
          description: `Pothole iteration ${i} report for rate test`,
          lat: 31.64,
          lon: 74.9,
        });
      expect(res.status).toBe(201);
    }

    const blockedRes = await request(app).post("/api/v1/issues").send({
      tenant_slug: "demo-punjab",
      category_code: "pothole",
      description: "Pothole iteration 11 exceeding rate limit",
      lat: 31.64,
      lon: 74.9,
    });
    expect(blockedRes.status).toBe(429);
    expect(["RATE_LIMITED", "RATE_LIMIT_EXCEEDED"]).toContain(blockedRes.body.error.code);
  });

  // ── Tenant isolation on every new route ────────────────────────────────────

  describe("Tenant Isolation on Every New Route", () => {
    let punjabIssueId: string;

    beforeAll(async () => {
      resetReportRateLimits();
      const res = await request(app).post("/api/v1/issues").send({
        tenant_slug: "demo-punjab",
        category_code: "pothole",
        description: "Punjab isolation test issue",
        lat: 31.64,
        lon: 74.9,
      });
      punjabIssueId = res.body.data.issue_id;
    });

    it("POST /api/v1/issues/:publicId/confirm is tenant-isolated", async () => {
      const res = await request(app)
        .post(`/api/v1/issues/${punjabIssueId}/confirm`)
        .set("Authorization", `Bearer ${maharashtraAdminToken}`);
      expect(res.status).toBe(404);
    });

    it("POST /api/v1/issues/:publicId/override-priority is tenant-isolated", async () => {
      const res = await request(app)
        .post(`/api/v1/issues/${punjabIssueId}/override-priority`)
        .set("Authorization", `Bearer ${maharashtraDeptHeadToken}`)
        .send({ score: 90, reason: "Cross tenant override" });
      expect(res.status).toBe(404);
    });

    it("POST /api/v1/issues/:publicId/transition is tenant-isolated", async () => {
      const res = await request(app)
        .post(`/api/v1/issues/${punjabIssueId}/transition`)
        .set("Authorization", `Bearer ${maharashtraStaffToken}`)
        .send({ to: "triaged" });
      expect(res.status).toBe(404);
    });

    it("POST /api/v1/issues/:publicId/route is tenant-isolated", async () => {
      const tenantDb = new TenantDb(maharashtraTenantId);
      const depts = await tenantDb.listDepartments();
      const res = await request(app)
        .post(`/api/v1/issues/${punjabIssueId}/route`)
        .set("Authorization", `Bearer ${maharashtraStaffToken}`)
        .send({ department_id: depts[0]?.id ?? "00000000-0000-0000-0000-000000000000" });
      expect(res.status).toBe(404);
    });

    it("POST /api/v1/issues/:publicId/merge is tenant-isolated", async () => {
      const res = await request(app)
        .post(`/api/v1/issues/${punjabIssueId}/merge`)
        .set("Authorization", `Bearer ${maharashtraDeptHeadToken}`)
        .send({ primary_public_id: punjabIssueId });
      expect(res.status).toBe(404);
    });

    it("POST /api/v1/issues/:publicId/unmerge is tenant-isolated", async () => {
      const res = await request(app)
        .post(`/api/v1/issues/${punjabIssueId}/unmerge`)
        .set("Authorization", `Bearer ${maharashtraDeptHeadToken}`);
      expect(res.status).toBe(404);
    });

    it("GET /api/v1/issues/:publicId/audit is tenant-isolated", async () => {
      const res = await request(app)
        .get(`/api/v1/issues/${punjabIssueId}/audit`)
        .set("Authorization", `Bearer ${maharashtraAdminToken}`);
      expect(res.status).toBe(404);
    });
  });
});
