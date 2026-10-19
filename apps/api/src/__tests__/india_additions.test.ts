import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { seedDatabase } from "../db/seed.js";
import {
  isInsideIndia,
  calculateReportersFactor,
  pincodeSchema,
  issueReportSchema,
} from "@nivaran/shared";
import { resetReportRateLimits } from "../routes/issues.js";
import { TenantDb } from "../db/tenant-db.js";
import { PlatformDb } from "../db/platform-db.js";

describe("India Additions Tests", () => {
  let punjabAdminToken: string;
  let punjabTenantId: string;

  beforeAll(async () => {
    const platformDb = new PlatformDb();
    let tenant = await platformDb.getTenantBySlug("demo-punjab");
    if (!tenant) {
      await seedDatabase();
      tenant = await platformDb.getTenantBySlug("demo-punjab");
    }
    if (!tenant) throw new Error("Demo Punjab tenant missing");
    punjabTenantId = tenant.id;

    // Login as Demo Punjab tenant_admin
    const res = await request(app).post("/api/v1/auth/login").send({
      tenantSlug: "demo-punjab",
      identifier: "admin@punjab.local",
      password: "Password123!",
    });

    expect(res.status).toBe(200);
    punjabAdminToken = res.body.data.accessToken;
  });

  describe("Pincode and Landmark Validation", () => {
    it("validates 6-digit Indian PIN codes", () => {
      expect(pincodeSchema.safeParse("141001").success).toBe(true);
      expect(pincodeSchema.safeParse("400001").success).toBe(true);
      expect(pincodeSchema.safeParse("600001").success).toBe(true);

      // Rejects invalid pincodes (must be 6 digits, cannot start with 0)
      expect(pincodeSchema.safeParse("012345").success).toBe(false);
      expect(pincodeSchema.safeParse("12345").success).toBe(false);
      expect(pincodeSchema.safeParse("1234567").success).toBe(false);
      expect(pincodeSchema.safeParse("abcdef").success).toBe(false);
    });

    it("accepts issue report with optional landmark and pincode", () => {
      const validReport = {
        tenant_slug: "demo-punjab",
        category_code: "pothole",
        description: "Large dangerous pothole on main road",
        lat: 30.901,
        lon: 75.8573,
        landmark: "Near Clock Tower, opposite SBI ATM",
        pincode: "141001",
      };

      const parsed = issueReportSchema.safeParse(validReport);
      expect(parsed.success).toBe(true);
    });
  });

  describe("GPS Validation: India Bounding Box & Service Area", () => {
    it("correctly identifies coordinates inside vs outside India", () => {
      // Inside India (Ludhiana, Mumbai, Chennai)
      expect(isInsideIndia(30.901, 75.8573)).toBe(true);
      expect(isInsideIndia(19.076, 72.8777)).toBe(true);
      expect(isInsideIndia(13.0827, 80.2707)).toBe(true);

      // Outside India (London, New York, Tokyo)
      expect(isInsideIndia(51.5074, -0.1278)).toBe(false);
      expect(isInsideIndia(40.7128, -74.006)).toBe(false);
      expect(isInsideIndia(35.6762, 139.6503)).toBe(false);
    });

    it("rejects issue report with GPS outside India", async () => {
      resetReportRateLimits();
      const res = await request(app).post("/api/v1/issues").send({
        tenant_slug: "demo-punjab",
        category_code: "pothole",
        description: "Pothole in Trafalgar Square",
        lat: 51.5074,
        lon: -0.1278,
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("LOCATION_REJECTED");
      expect(res.body.error.message).toContain("GPS coordinates are outside India");
    });

    it("rejects issue report outside tenant service area", async () => {
      resetReportRateLimits();
      // Valid coordinates inside India (e.g. Bangalore) but outside Demo Punjab (Ludhiana) service area
      const res = await request(app).post("/api/v1/issues").send({
        tenant_slug: "demo-punjab",
        category_code: "pothole",
        description: "Issue far away from Ludhiana",
        lat: 12.9716,
        lon: 77.5946,
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("LOCATION_REJECTED");
      expect(res.body.error.message).toContain("Location is outside the municipal service area");
    });

    it("accepts issue report within tenant service area", async () => {
      resetReportRateLimits();
      // Amritsar coordinates within Ward 1 polygon
      const res = await request(app).post("/api/v1/issues").send({
        tenant_slug: "demo-punjab",
        category_code: "pothole",
        description: "Dangerous pothole near bus stand",
        lat: 31.64,
        lon: 74.9,
        landmark: "Near Bus Terminal",
        pincode: "141001",
      });

      expect(res.status).toBe(201);
      expect(res.body.data.issue_id).toMatch(/^NVR-[A-Z0-9]+-\d{6}$/);
      expect(res.body.data.landmark).toBe("Near Bus Terminal");
      expect(res.body.data.pincode).toBe("141001");
      expect(res.body.data.status).toBe("submitted");
    });
  });

  describe("Reporters Factor with Saturating Curve", () => {
    it("computes saturating curve factor for distinct reporters", () => {
      // 1 reporter -> 0 factor
      expect(calculateReportersFactor(1)).toBe(0);

      // Multiple reporters saturate asymptotically to 1.0
      const factor2 = calculateReportersFactor(2);
      const factor5 = calculateReportersFactor(5);
      const factor10 = calculateReportersFactor(10);
      const factor50 = calculateReportersFactor(50);

      expect(factor2).toBeGreaterThan(0);
      expect(factor5).toBeGreaterThan(factor2);
      expect(factor10).toBeGreaterThan(factor5);
      expect(factor50).toBeGreaterThan(factor10);
      expect(factor50).toBeLessThanOrEqual(1.0);
    });
  });

  describe("Per-User Report Rate Limiting", () => {
    it("enforces max 10 reports per hour rate limit", async () => {
      resetReportRateLimits();

      // Submit 10 reports successfully
      for (let i = 0; i < 10; i++) {
        const res = await request(app)
          .post("/api/v1/issues")
          .send({
            tenant_slug: "demo-punjab",
            category_code: "pothole",
            description: `Valid report #${i + 1} on road`,
            lat: 31.64,
            lon: 74.9,
          });
        expect(res.status).toBe(201);
      }

      // 11th report exceeds rate limit -> 429
      const overflowRes = await request(app).post("/api/v1/issues").send({
        tenant_slug: "demo-punjab",
        category_code: "pothole",
        description: "11th report should be blocked",
        lat: 31.64,
        lon: 74.9,
      });

      expect(overflowRes.status).toBe(429);
      expect(overflowRes.body.error.code).toBe("RATE_LIMIT_EXCEEDED");
    });
  });

  describe("Per-Tenant SLA Calendar", () => {
    it("configures and reads custom SLA calendar for tenant", async () => {
      // 1. Configure custom SLA calendar
      const putRes = await request(app)
        .put("/api/v1/admin/sla-calendar")
        .set("Authorization", `Bearer ${punjabAdminToken}`)
        .send({
          type: "business_hours",
          working_days: [1, 2, 3, 4, 5],
          start_time: "09:00",
          end_time: "17:30",
          timezone: "Asia/Kolkata",
        });

      expect(putRes.status).toBe(200);
      expect(putRes.body.data.type).toBe("business_hours");
      expect(putRes.body.data.start_time).toBe("09:00");
      expect(putRes.body.data.end_time).toBe("17:30");

      // 2. Read back SLA calendar
      const getRes = await request(app)
        .get("/api/v1/admin/sla-calendar")
        .set("Authorization", `Bearer ${punjabAdminToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.type).toBe("business_hours");
    });
  });

  describe("Public State Summary: GET /api/v1/public/states/:code/summary", () => {
    it("returns per-ULB summary with privacy masking under 10 issues", async () => {
      // Query Punjab (PB)
      const res = await request(app).get("/api/v1/public/states/PB/summary");

      expect(res.status).toBe(200);
      expect(res.body.data.state_code).toBe("PB");
      expect(Array.isArray(res.body.data.ulbs)).toBe(true);

      const ulb = res.body.data.ulbs.find(
        (u: { tenant_slug: string }) => u.tenant_slug === "demo-punjab"
      );
      expect(ulb).toBeDefined();

      // Check if masked under 10 issues
      const tenantDb = new TenantDb(punjabTenantId);
      // Let's seed 12 issues for Demo Punjab to verify unmasked calculation
      for (let i = 1; i <= 12; i++) {
        await tenantDb.recordIssueMetric({
          issue_id: `METRIC-TEST-${i}`,
          status: i % 2 === 0 ? "resolved" : "in_progress",
          category_code: "pothole",
          sla_breached: i === 4,
          resolution_time_hours: 24.5,
        });
      }

      // Re-fetch after 12 issues recorded
      const unmaskedRes = await request(app).get("/api/v1/public/states/PB/summary");
      expect(unmaskedRes.status).toBe(200);

      const unmaskedUlb = unmaskedRes.body.data.ulbs.find(
        (u: { tenant_slug: string }) => u.tenant_slug === "demo-punjab"
      );
      expect(unmaskedUlb.masked).toBe(false);
      expect(unmaskedUlb.open_count).toBeGreaterThanOrEqual(6);
      expect(unmaskedUlb.sla_compliance_pct).toBeGreaterThan(0);
      expect(unmaskedUlb.median_resolution_hours).toBe(24.5);
    });

    it("masks ULBs with fewer than 10 issues", async () => {
      // Query Maharashtra (MH) where Demo Maharashtra has 0 issues recorded
      const res = await request(app).get("/api/v1/public/states/MH/summary");
      expect(res.status).toBe(200);

      const mhUlb = res.body.data.ulbs.find(
        (u: { tenant_slug: string }) => u.tenant_slug === "demo-maharashtra"
      );
      expect(mhUlb).toBeDefined();
      expect(mhUlb.masked).toBe(true);
      expect(mhUlb.open_count).toBeNull();
      expect(mhUlb.sla_compliance_pct).toBeNull();
      expect(mhUlb.median_resolution_hours).toBeNull();
    });
  });
});
