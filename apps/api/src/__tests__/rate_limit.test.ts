import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { resetRedisRateLimits } from "../db/redis.js";

describe("Redis-backed Auth Rate Limiting (5 per minute per IP + identifier)", () => {
  beforeEach(async () => {
    await resetRedisRateLimits();
  });

  it("limits /api/v1/auth/login to 5 requests per minute per IP+identifier", async () => {
    const payload = {
      tenantSlug: "demo-punjab",
      identifier: "ratelimit_login@punjab.local",
      password: "WrongPassword123!",
    };

    // First 5 requests should not be rate limited (they return 401 for wrong credentials or 404)
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/api/v1/auth/login").send(payload);
      expect(res.status).not.toBe(429);
    }

    // 6th request must be rate limited
    const res = await request(app).post("/api/v1/auth/login").send(payload);
    expect(res.status).toBe(429);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(res.headers["retry-after"]).toBeDefined();
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("limits /api/v1/auth/register to 5 requests per minute per IP+identifier", async () => {
    const payload = {
      tenantSlug: "demo-punjab",
      name: "Rate Limit User",
      email: "ratelimit_reg@punjab.local",
      password: "Password123!",
      consent: true,
    };

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/api/v1/auth/register").send(payload);
      expect(res.status).not.toBe(429);
    }

    const res = await request(app).post("/api/v1/auth/register").send(payload);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(res.headers["retry-after"]).toBeDefined();
  });

  it("limits /api/v1/auth/forgot-password to 5 requests per minute per IP+identifier", async () => {
    const payload = {
      tenantSlug: "demo-punjab",
      identifier: "forgot_user@punjab.local",
    };

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/api/v1/auth/forgot-password").send(payload);
      expect(res.status).not.toBe(429);
    }

    const res = await request(app).post("/api/v1/auth/forgot-password").send(payload);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(res.headers["retry-after"]).toBeDefined();
  });

  it("limits /api/v1/auth/otp/send to 5 requests per minute per IP+phone", async () => {
    const payload = {
      phone: "+919876500001",
    };

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/api/v1/auth/otp/send").send(payload);
      expect(res.status).not.toBe(429);
    }

    const res = await request(app).post("/api/v1/auth/otp/send").send(payload);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(res.headers["retry-after"]).toBeDefined();
  });

  it("does not block a different identifier from the same IP", async () => {
    const userA = {
      tenantSlug: "demo-punjab",
      identifier: "user_a@punjab.local",
      password: "Password123!",
    };
    const userB = {
      tenantSlug: "demo-punjab",
      identifier: "user_b@punjab.local",
      password: "Password123!",
    };

    // Exhaust user A
    for (let i = 0; i < 5; i++) {
      await request(app).post("/api/v1/auth/login").send(userA);
    }
    const resA = await request(app).post("/api/v1/auth/login").send(userA);
    expect(resA.status).toBe(429);

    // User B should NOT be rate limited
    const resB = await request(app).post("/api/v1/auth/login").send(userB);
    expect(resB.status).not.toBe(429);
  });
});
