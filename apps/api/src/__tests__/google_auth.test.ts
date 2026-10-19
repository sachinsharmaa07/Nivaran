import { describe, expect, it, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT, type KeyLike } from "jose";
import { app } from "../app.js";
import { seedDatabase } from "../db/seed.js";
import { closePools } from "../db/config.js";
import { PlatformDb } from "../db/platform-db.js";
import { TenantDb } from "../db/tenant-db.js";
import { signOAuthState } from "../auth/jwt.js";
import { setGoogleAuthOverrides, resetGoogleAuthOverrides } from "../auth/google.js";

const TEST_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";
process.env["GOOGLE_CLIENT_ID"] = TEST_CLIENT_ID;
process.env["GOOGLE_CLIENT_SECRET"] = "mock-secret";
process.env["GOOGLE_REDIRECT_URI"] = "http://localhost:4000/api/v1/auth/google/callback";
process.env["WEB_ORIGIN"] = "http://localhost:5173";

let privateKey: KeyLike;
let mockIdTokenToReturn: string;

async function signMockIdToken(payload: {
  sub: string;
  email: string;
  email_verified?: boolean;
  aud?: string;
  iss?: string;
  exp?: number;
  name?: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jwt = new SignJWT({
    email: payload.email,
    email_verified: payload.email_verified ?? true,
    name: payload.name ?? "Test User",
  })
    .setProtectedHeader({ alg: "RS256", kid: "mock-key-id" })
    .setSubject(payload.sub)
    .setIssuer(payload.iss ?? "https://accounts.google.com")
    .setAudience(payload.aud ?? TEST_CLIENT_ID)
    .setIssuedAt(now);

  if (payload.exp !== undefined) {
    jwt.setExpirationTime(payload.exp);
  } else {
    jwt.setExpirationTime(now + 3600);
  }

  return jwt.sign(privateKey);
}

beforeAll(async () => {
  const platformDb = new PlatformDb();
  const tenant = await platformDb.getTenantBySlug("demo-punjab");
  if (!tenant) {
    await seedDatabase();
  }

  const keyPair = await generateKeyPair("RS256");
  privateKey = keyPair.privateKey;
  const publicJwk = await exportJWK(keyPair.publicKey);
  publicJwk.kid = "mock-key-id";
  publicJwk.alg = "RS256";

  const keySet = createLocalJWKSet({
    keys: [publicJwk],
  });

  setGoogleAuthOverrides({
    customJwksKeySet: keySet,
  });

  // Mock global.fetch for the Google token endpoint
  const originalFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.includes("oauth2.googleapis.com/token") || urlStr.includes("token")) {
      return new Response(
        JSON.stringify({
          access_token: "mock-google-access-token",
          id_token: mockIdTokenToReturn,
          token_type: "Bearer",
          expires_in: 3600,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    return originalFetch(input, init);
  };
});

afterAll(async () => {
  resetGoogleAuthOverrides();
  await closePools();
});

describe("B1g: Google Sign-in Flow", () => {
  const platformDb = new PlatformDb();

  describe("GET /api/v1/auth/google initiation", () => {
    it("rejects if consent is not true", async () => {
      const res = await request(app).get("/api/v1/auth/google?tenant=demo-punjab&consent=false");
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("CONSENT_REQUIRED");
    });

    it("rejects if tenant is unknown", async () => {
      const res = await request(app).get(
        "/api/v1/auth/google?tenant=non-existent-ulb&consent=true"
      );
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("TENANT_NOT_FOUND");
    });

    it("builds the Google URL and sets PKCE verifier + state in cookies", async () => {
      const res = await request(app).get("/api/v1/auth/google?tenant=demo-punjab&consent=true");
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("https://accounts.google.com/o/oauth2/v2/auth");
      expect(res.headers.location).toContain("client_id=");
      expect(res.headers.location).toContain("scope=openid+email+profile");
      expect(res.headers.location).toContain("code_challenge=");
      expect(res.headers.location).toContain("state=");

      const cookies = res.headers["set-cookie"];
      expect(cookies).toBeDefined();
      const cookieStr = Array.isArray(cookies) ? cookies.join("; ") : cookies;
      expect(cookieStr).toContain("g_verifier=");
      expect(cookieStr).toContain("g_state=");
      expect(cookieStr).toContain("HttpOnly");
    });
  });

  describe("GET /api/v1/auth/google/callback", () => {
    it("valid login creates a citizen with consent_at set and redirects to WEB_ORIGIN", async () => {
      const sub = `google_sub_${Date.now()}`;
      const email = `newgooglecitizen_${Date.now()}@punjab.local`;
      mockIdTokenToReturn = await signMockIdToken({
        sub,
        email,
        email_verified: true,
        name: "Google Citizen",
      });

      // 1. Initiate to obtain state & PKCE verifier cookie
      const initRes = await request(app).get("/api/v1/auth/google?tenant=demo-punjab&consent=true");
      const cookies = initRes.headers["set-cookie"];
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
      const verifierCookie = cookieArray.find((c: string) => c.startsWith("g_verifier="))!;
      const stateCookie = cookieArray.find((c: string) => c.startsWith("g_state="))!;

      // Extract state parameter from Location redirect URL
      const loc = new URL(initRes.headers.location);
      const stateParam = loc.searchParams.get("state")!;

      // 2. Callback
      const cbRes = await request(app)
        .get(`/api/v1/auth/google/callback?code=mock-code&state=${encodeURIComponent(stateParam)}`)
        .set("Cookie", [verifierCookie, stateCookie]);

      expect(cbRes.status).toBe(302);
      expect(cbRes.headers.location).toBe(process.env["WEB_ORIGIN"]);

      // Verify refresh cookie was set
      const cbCookies = cbRes.headers["set-cookie"];
      const cbCookieStr = Array.isArray(cbCookies) ? cbCookies.join("; ") : cbCookies;
      expect(cbCookieStr).toContain("refreshToken=");

      // Verify user in DB
      const tenant = await platformDb.getTenantBySlug("demo-punjab");
      const tenantDb = new TenantDb(tenant!.id);
      const user = await tenantDb.findUserByGoogleSub(sub);

      expect(user).not.toBeNull();
      expect(user?.email).toBe(email);
      expect(user?.roles).toEqual(["citizen"]);
      expect(user?.google_sub).toBe(sub);
      expect(user?.consent_at).toBeDefined();
      expect(user?.password_hash).toBeNull();

      // Password login for Google-only user returns clear error
      const loginRes = await request(app).post("/api/v1/auth/login").send({
        tenantSlug: "demo-punjab",
        identifier: email,
        password: "AnyPassword123!",
      });
      expect(loginRes.status).toBe(400);
      expect(loginRes.body.error.code).toBe("PASSWORD_LOGIN_DISABLED");
    });

    it("rejects invalid or tampered state", async () => {
      mockIdTokenToReturn = await signMockIdToken({
        sub: "sub_1",
        email: "test@punjab.local",
        email_verified: true,
      });

      const res = await request(app)
        .get("/api/v1/auth/google/callback?code=mock-code&state=tampered-invalid-state")
        .set("Cookie", ["g_verifier=mock-verifier"]);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_STATE");
    });

    it("rejects token with wrong audience", async () => {
      mockIdTokenToReturn = await signMockIdToken({
        sub: "sub_wrong_aud",
        email: "wrong_aud@punjab.local",
        email_verified: true,
        aud: "completely-wrong-client-id",
      });

      const state = await signOAuthState({ nonce: "test-nonce", tenantSlug: "demo-punjab" });

      const res = await request(app)
        .get(`/api/v1/auth/google/callback?code=mock-code&state=${encodeURIComponent(state)}`)
        .set("Cookie", ["g_verifier=mock-verifier", `g_state=${state}`]);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_ID_TOKEN");
    });

    it("rejects expired ID token", async () => {
      const pastTime = Math.floor(Date.now() / 1000) - 1000;
      mockIdTokenToReturn = await signMockIdToken({
        sub: "sub_expired",
        email: "expired@punjab.local",
        email_verified: true,
        exp: pastTime,
      });

      const state = await signOAuthState({ nonce: "test-nonce", tenantSlug: "demo-punjab" });

      const res = await request(app)
        .get(`/api/v1/auth/google/callback?code=mock-code&state=${encodeURIComponent(state)}`)
        .set("Cookie", ["g_verifier=mock-verifier", `g_state=${state}`]);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_ID_TOKEN");
    });

    it("rejects when email_verified is false", async () => {
      mockIdTokenToReturn = await signMockIdToken({
        sub: "sub_unverified",
        email: "unverified@punjab.local",
        email_verified: false,
      });

      const state = await signOAuthState({ nonce: "test-nonce", tenantSlug: "demo-punjab" });

      const res = await request(app)
        .get(`/api/v1/auth/google/callback?code=mock-code&state=${encodeURIComponent(state)}`)
        .set("Cookie", ["g_verifier=mock-verifier", `g_state=${state}`]);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("EMAIL_NOT_VERIFIED");
    });

    it("links an existing staff email to google_sub and keeps its staff role", async () => {
      const staffEmail = "staff@punjab.local";
      const googleSub = `google_sub_staff_${Date.now()}`;

      mockIdTokenToReturn = await signMockIdToken({
        sub: googleSub,
        email: staffEmail,
        email_verified: true,
        name: "Demo Staff",
      });

      const state = await signOAuthState({ nonce: "test-nonce", tenantSlug: "demo-punjab" });

      const res = await request(app)
        .get(`/api/v1/auth/google/callback?code=mock-code&state=${encodeURIComponent(state)}`)
        .set("Cookie", ["g_verifier=mock-verifier", `g_state=${state}`]);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(process.env["WEB_ORIGIN"]);

      const tenant = await platformDb.getTenantBySlug("demo-punjab");
      const tenantDb = new TenantDb(tenant!.id);
      const user = await tenantDb.findUserByGoogleSub(googleSub);

      expect(user).not.toBeNull();
      expect(user?.email).toBe(staffEmail);
      expect(user?.google_sub).toBe(googleSub);
      // Staff role is retained! Never downgraded or changed
      expect(user?.roles).toContain("staff");
    });

    it("creates separate users when the same email signs in to different tenants", async () => {
      const sharedEmail = `multi_tenant_${Date.now()}@example.com`;
      const sub1 = `sub_t1_${Date.now()}`;
      const sub2 = `sub_t2_${Date.now()}`;

      // Login to demo-punjab
      mockIdTokenToReturn = await signMockIdToken({
        sub: sub1,
        email: sharedEmail,
        email_verified: true,
      });
      const state1 = await signOAuthState({ nonce: "nonce1", tenantSlug: "demo-punjab" });
      const res1 = await request(app)
        .get(`/api/v1/auth/google/callback?code=mock-code&state=${encodeURIComponent(state1)}`)
        .set("Cookie", ["g_verifier=mock-verifier", `g_state=${state1}`]);
      expect(res1.status).toBe(302);

      // Login to demo-maharashtra with same email
      mockIdTokenToReturn = await signMockIdToken({
        sub: sub2,
        email: sharedEmail,
        email_verified: true,
      });
      const state2 = await signOAuthState({ nonce: "nonce2", tenantSlug: "demo-maharashtra" });
      const res2 = await request(app)
        .get(`/api/v1/auth/google/callback?code=mock-code&state=${encodeURIComponent(state2)}`)
        .set("Cookie", ["g_verifier=mock-verifier", `g_state=${state2}`]);
      expect(res2.status).toBe(302);

      const tenant1 = await platformDb.getTenantBySlug("demo-punjab");
      const tenant2 = await platformDb.getTenantBySlug("demo-maharashtra");
      const db1 = new TenantDb(tenant1!.id);
      const db2 = new TenantDb(tenant2!.id);

      const user1 = await db1.findUserByIdentifier(sharedEmail);
      const user2 = await db2.findUserByIdentifier(sharedEmail);

      expect(user1).not.toBeNull();
      expect(user2).not.toBeNull();
      expect(user1?.id).not.toBe(user2?.id);
      expect(user1?.tenant_id).toBe(tenant1!.id);
      expect(user2?.tenant_id).toBe(tenant2!.id);
      expect(user1?.google_sub).toBe(sub1);
      expect(user2?.google_sub).toBe(sub2);
    });
  });
});
