import { describe, it, expect, beforeEach, vi } from "vitest";
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

  it("confirms atomic increment and EXPIRE in a single Redis script", async () => {
    const { redisRateLimit } = await import("../db/redis.js");
    const testKey = `rl:test:atomic:${Date.now()}`;

    // Concurrently invoke rate limit 5 times
    const results = await Promise.all([
      redisRateLimit(testKey, 5, 60),
      redisRateLimit(testKey, 5, 60),
      redisRateLimit(testKey, 5, 60),
      redisRateLimit(testKey, 5, 60),
      redisRateLimit(testKey, 5, 60),
    ]);

    // All 5 must have unique counts from 1 to 5, all allowed
    const counts = results.map((r) => r.current).sort((a, b) => a - b);
    expect(counts).toEqual([1, 2, 3, 4, 5]);
    expect(results.every((r) => r.allowed)).toBe(true);
    expect(results.every((r) => r.ttl > 0 && r.ttl <= 60)).toBe(true);

    // 6th call must be blocked atomically
    const sixth = await redisRateLimit(testKey, 5, 60);
    expect(sixth.current).toBe(6);
    expect(sixth.allowed).toBe(false);
  });

  it("logs a warning and lets request through if Redis is down (fail-open)", async () => {
    const { setRedisConfigOverride } = await import("../db/redis.js");
    const warnSpy = vi.spyOn(console, "warn").mockReturnValue(undefined);

    // Point to unreachable port
    setRedisConfigOverride({ host: "127.0.0.1", port: 59999 });

    try {
      const res = await request(app).post("/api/v1/auth/login").send({
        tenantSlug: "demo-punjab",
        identifier: "failopen_test@punjab.local",
        password: "WrongPassword123!",
      });

      // Request must proceed through rate limiter without failing login
      // (returns 401 credentials check or 404, but definitely not 500 or rate limiter rejection)
      expect(res.status).not.toBe(429);
      expect(res.status).not.toBe(500);

      // Warning was logged
      expect(warnSpy).toHaveBeenCalled();
      const warned = warnSpy.mock.calls.some((args) =>
        args.some((arg) => typeof arg === "string" && arg.includes("[RateLimiter] Redis is down"))
      );
      expect(warned).toBe(true);
    } finally {
      setRedisConfigOverride(null);
      warnSpy.mockRestore();
    }
  });
});
