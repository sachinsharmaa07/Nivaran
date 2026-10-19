import { describe, expect, it, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { runMigrations } from "../db/migrate.js";
import { seedDatabase } from "../db/seed.js";
import { closePools } from "../db/config.js";

beforeAll(async () => {
  await runMigrations();
  await seedDatabase();
});

afterAll(async () => {
  await closePools();
});

describe("B1: Backend Core Tests", () => {
  describe("Auth Flow", () => {
    const testEmail = `newcitizen_${Date.now()}@punjab.local`;
    const testPhone = `+919876${Math.floor(100000 + Math.random() * 900000)}`;
    let accessToken: string;
    let refreshCookie: string;

    it("requires consent during registration", async () => {
      const res = await request(app).post("/api/v1/auth/register").send({
        tenantSlug: "demo-punjab",
        name: "No Consent User",
        email: "noconsent@punjab.local",
        password: "Password123!",
        consent: false,
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("requires email or phone during registration", async () => {
      const res = await request(app).post("/api/v1/auth/register").send({
        tenantSlug: "demo-punjab",
        name: "Anonymous User",
        password: "Password123!",
        consent: true,
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("successfully registers a new citizen with email and returns access token + cookie", async () => {
      const res = await request(app).post("/api/v1/auth/register").send({
        tenantSlug: "demo-punjab",
        name: "Test Citizen",
        email: testEmail,
        phone: testPhone,
        password: "Password123!",
        consent: true,
        locale: "pa",
      });

      expect(res.status).toBe(201);
      expect(res.body.data.user.email).toBe(testEmail);
      expect(res.body.data.user.roles).toContain("citizen");
      expect(res.body.data.accessToken).toBeDefined();

      accessToken = res.body.data.accessToken;
      const cookies = res.headers["set-cookie"];
      expect(cookies).toBeDefined();
      refreshCookie = cookies[0]!;
      expect(refreshCookie).toContain("refreshToken=");
    });

    it("rejects duplicate email in the same tenant", async () => {
      const res = await request(app).post("/api/v1/auth/register").send({
        tenantSlug: "demo-punjab",
        name: "Duplicate Citizen",
        email: testEmail,
        password: "Password123!",
        consent: true,
      });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("USER_EXISTS");
    });

    it("successfully logs in with email and password", async () => {
      const res = await request(app).post("/api/v1/auth/login").send({
        tenantSlug: "demo-punjab",
        identifier: testEmail,
        password: "Password123!",
      });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.email).toBe(testEmail);
    });

    it("successfully logs in with phone and password", async () => {
      const res = await request(app).post("/api/v1/auth/login").send({
        tenantSlug: "demo-punjab",
        identifier: testPhone,
        password: "Password123!",
      });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
    });

    it("rejects login with incorrect password", async () => {
      const res = await request(app).post("/api/v1/auth/login").send({
        tenantSlug: "demo-punjab",
        identifier: testEmail,
        password: "WrongPassword999!",
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    });

    it("rotates refresh token and issues new access token", async () => {
      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", refreshCookie)
        .send({ tenantSlug: "demo-punjab" });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();

      const newCookie = res.headers["set-cookie"]?.[0];
      expect(newCookie).toBeDefined();

      // Test token reuse detection: old refresh cookie must now be revoked and fail
      const reuseRes = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", refreshCookie)
        .send({ tenantSlug: "demo-punjab" });

      expect(reuseRes.status).toBe(401);
      expect(reuseRes.body.error.code).toBe("TOKEN_COMPROMISED");
    });

    it("sends and verifies demo mock OTP", async () => {
      const sendRes = await request(app).post("/api/v1/auth/otp/send").send({
        tenantSlug: "demo-punjab",
        phone: "+919876543210",
      });
      expect(sendRes.status).toBe(200);

      // Verify wrong OTP fails
      const failRes = await request(app).post("/api/v1/auth/otp/verify").send({
        tenantSlug: "demo-punjab",
        phone: "+919876543210",
        otp: "000000",
      });
      expect(failRes.status).toBe(400);
      expect(failRes.body.error.code).toBe("INVALID_OTP");
    });

    it("DELETE /api/v1/me removes the authenticated user account and data", async () => {
      const deleteRes = await request(app)
        .delete("/api/v1/me")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(deleteRes.status).toBe(200);

      // Attempting to login after deletion fails
      const loginRes = await request(app).post("/api/v1/auth/login").send({
        tenantSlug: "demo-punjab",
        identifier: testEmail,
        password: "Password123!",
      });

      expect(loginRes.status).toBe(401);
    });
  });

  describe("Cross-Tenant Isolation on Admin Routes", () => {
    let punjabAdminToken: string;
    let maharashtraAdminToken: string;
    let punjabCitizenToken: string;

    let punjabDeptId: string;
    let punjabWardId: string;
    let punjabCategoryId: string;
    let punjabSlaId: string;
    let punjabFacilityId: string;

    beforeAll(async () => {
      // Login Punjab Admin
      const pRes = await request(app).post("/api/v1/auth/login").send({
        tenantSlug: "demo-punjab",
        identifier: "admin@punjab.local",
        password: "Password123!",
      });
      punjabAdminToken = pRes.body.data.accessToken;

      // Login Maharashtra Admin
      const mRes = await request(app).post("/api/v1/auth/login").send({
        tenantSlug: "demo-maharashtra",
        identifier: "admin@maharashtra.local",
        password: "Password123!",
      });
      maharashtraAdminToken = mRes.body.data.accessToken;

      // Login Punjab Citizen
      const cRes = await request(app).post("/api/v1/auth/login").send({
        tenantSlug: "demo-punjab",
        identifier: "citizen@punjab.local",
        password: "Password123!",
      });
      punjabCitizenToken = cRes.body.data.accessToken;

      // Punjab Admin creates test resources
      const uid = Date.now().toString().slice(-5);
      const dept = await request(app)
        .post("/api/v1/admin/departments")
        .set("Authorization", `Bearer ${punjabAdminToken}`)
        .send({ code: `DEPT_${uid}`, name: `Punjab Test Dept ${uid}` });
      punjabDeptId = dept.body.data.id;

      const ward = await request(app)
        .post("/api/v1/admin/wards")
        .set("Authorization", `Bearer ${punjabAdminToken}`)
        .send({
          ward_number: `W_${uid}`,
          name: `Punjab Test Ward ${uid}`,
          boundary: {
            type: "Polygon",
            coordinates: [
              [
                [74.8, 31.6],
                [74.9, 31.6],
                [74.9, 31.7],
                [74.8, 31.7],
                [74.8, 31.6],
              ],
            ],
          },
        });
      punjabWardId = ward.body.data.id;

      const sla = await request(app)
        .post("/api/v1/admin/sla-policies")
        .set("Authorization", `Bearer ${punjabAdminToken}`)
        .send({ name: `Punjab SLA Test ${uid}`, respond_hours: 12, resolve_hours: 48 });
      punjabSlaId = sla.body.data.id;

      const cat = await request(app)
        .post("/api/v1/admin/categories")
        .set("Authorization", `Bearer ${punjabAdminToken}`)
        .send({
          code: `CAT_${uid}`,
          names: { en: `Test Category ${uid}`, pa: `ਟੈਸਟ ਕੈਟਾਗਰੀ ${uid}` },
          department_id: punjabDeptId,
          sla_policy_id: punjabSlaId,
        });
      punjabCategoryId = cat.body.data.id;

      const fac = await request(app)
        .post("/api/v1/admin/facilities")
        .set("Authorization", `Bearer ${punjabAdminToken}`)
        .send({
          name: `Punjab Civil Hospital ${uid}`,
          type: "hospital",
          location: { lat: 31.63, lon: 74.87 },
        });
      punjabFacilityId = fac.body.data.id;
    });

    it("rejects non-admin citizen accessing admin routes (403 Forbidden)", async () => {
      const res = await request(app)
        .get("/api/v1/admin/departments")
        .set("Authorization", `Bearer ${punjabCitizenToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("denies Maharashtra admin reading Punjab department (404 Not Found)", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/departments/${punjabDeptId}`)
        .set("Authorization", `Bearer ${maharashtraAdminToken}`);
      expect(res.status).toBe(404);
    });

    it("denies Maharashtra admin modifying or deleting Punjab department", async () => {
      const putRes = await request(app)
        .put(`/api/v1/admin/departments/${punjabDeptId}`)
        .set("Authorization", `Bearer ${maharashtraAdminToken}`)
        .send({ name: "Hacked Name" });
      expect(putRes.status).toBe(404);

      const delRes = await request(app)
        .delete(`/api/v1/admin/departments/${punjabDeptId}`)
        .set("Authorization", `Bearer ${maharashtraAdminToken}`);
      expect(delRes.status).toBe(404);
    });

    it("denies Maharashtra admin reading/writing Punjab ward", async () => {
      const getRes = await request(app)
        .get(`/api/v1/admin/wards/${punjabWardId}`)
        .set("Authorization", `Bearer ${maharashtraAdminToken}`);
      expect(getRes.status).toBe(404);

      const putRes = await request(app)
        .put(`/api/v1/admin/wards/${punjabWardId}`)
        .set("Authorization", `Bearer ${maharashtraAdminToken}`)
        .send({ name: "Hacked Ward" });
      expect(putRes.status).toBe(404);
    });

    it("denies Maharashtra admin reading/writing Punjab category", async () => {
      const getRes = await request(app)
        .get(`/api/v1/admin/categories/${punjabCategoryId}`)
        .set("Authorization", `Bearer ${maharashtraAdminToken}`);
      expect(getRes.status).toBe(404);

      const putRes = await request(app)
        .put(`/api/v1/admin/categories/${punjabCategoryId}`)
        .set("Authorization", `Bearer ${maharashtraAdminToken}`)
        .send({ names: { en: "Hacked Category" } });
      expect(putRes.status).toBe(404);
    });

    it("denies Maharashtra admin reading/writing Punjab SLA policy", async () => {
      const getRes = await request(app)
        .get(`/api/v1/admin/sla-policies/${punjabSlaId}`)
        .set("Authorization", `Bearer ${maharashtraAdminToken}`);
      expect(getRes.status).toBe(404);

      const putRes = await request(app)
        .put(`/api/v1/admin/sla-policies/${punjabSlaId}`)
        .set("Authorization", `Bearer ${maharashtraAdminToken}`)
        .send({ name: "Hacked Policy" });
      expect(putRes.status).toBe(404);
    });

    it("denies Maharashtra admin reading/writing Punjab facility", async () => {
      const getRes = await request(app)
        .get(`/api/v1/admin/facilities/${punjabFacilityId}`)
        .set("Authorization", `Bearer ${maharashtraAdminToken}`);
      expect(getRes.status).toBe(404);

      const putRes = await request(app)
        .put(`/api/v1/admin/facilities/${punjabFacilityId}`)
        .set("Authorization", `Bearer ${maharashtraAdminToken}`)
        .send({ name: "Hacked Facility" });
      expect(putRes.status).toBe(404);
    });
  });

  describe("Tenant Onboarding & Zero-Ward Operation", () => {
    let platformToken: string;

    beforeAll(async () => {
      const res = await request(app).post("/api/v1/auth/login").send({
        tenantSlug: "demo-punjab",
        identifier: "platform@punjab.local",
        password: "Password123!",
      });
      platformToken = res.body.data.accessToken;
    });

    it("onboards a new tenant and works with zero ward data (service area = 30km circle)", async () => {
      const onboardRes = await request(app)
        .post("/api/v1/platform/tenants")
        .set("Authorization", `Bearer ${platformToken}`)
        .send({
          name: "Demo Karnataka Town",
          state_code: "KA",
          district: "Mysuru",
          ulb_type: "municipality",
          center: { lat: 12.2958, lon: 76.6394 },
          default_locale: "en",
          enabled_locales: ["en", "kn"],
        });

      expect(onboardRes.status).toBe(201);
      expect(onboardRes.body.data.serviceAreaRadiusKm).toBe(30);

      const newTenant = onboardRes.body.data.tenant;
      expect(newTenant.slug).toBeDefined();

      // Verify that categories were cloned from category_templates
      const catRes = await request(app).get(`/api/v1/public/${newTenant.slug}/categories`);
      expect(catRes.status).toBe(200);
      expect(catRes.body.data.categories.length).toBeGreaterThanOrEqual(6);

      // Verify a citizen can register and operate on this zero-ward tenant
      const regRes = await request(app).post("/api/v1/auth/register").send({
        tenantSlug: newTenant.slug,
        name: "Mysuru Citizen",
        email: "mysurucitizen@karnataka.local",
        password: "Password123!",
        consent: true,
      });
      expect(regRes.status).toBe(201);
    });
  });

  describe("Locale Fallback Chain", () => {
    it("returns Punjabi categories for Demo Punjab when pa requested", async () => {
      const res = await request(app).get("/api/v1/public/demo-punjab/categories?locale=pa");
      expect(res.status).toBe(200);
      expect(res.body.data.resolvedLocale).toBe("pa");

      const pothole = res.body.data.categories.find((c: any) => c.code === "pothole");
      expect(pothole.name).toBe("ਸੜਕ ਤੇ ਟੋਆ");
    });

    it("returns Hindi categories for Demo Punjab when hi requested", async () => {
      const res = await request(app).get("/api/v1/public/demo-punjab/categories?locale=hi");
      expect(res.status).toBe(200);
      expect(res.body.data.resolvedLocale).toBe("hi");

      const pothole = res.body.data.categories.find((c: any) => c.code === "pothole");
      expect(pothole.name).toBe("सड़क पर गड्ढा");
    });

    it("falls back to English for Demo Tamil Nadu (which has en only) when Tamil or Punjabi requested", async () => {
      const res = await request(app).get("/api/v1/public/demo-tamil-nadu/categories?locale=ta");
      expect(res.status).toBe(200);
      expect(res.body.data.resolvedLocale).toBe("en");

      const pothole = res.body.data.categories.find((c: any) => c.code === "pothole");
      expect(pothole.name).toBe("Pothole");
    });

    it("falls back to English for Demo Maharashtra when unsupported Punjabi is requested", async () => {
      const res = await request(app).get("/api/v1/public/demo-maharashtra/categories?locale=pa");
      expect(res.status).toBe(200);
      expect(res.body.data.resolvedLocale).toBe("en");
    });
  });
});
