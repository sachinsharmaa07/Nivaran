import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { registerSchema, loginSchema, otpSendSchema, otpVerifySchema } from "@nivaran/shared";
import { PlatformDb } from "../db/platform-db.js";
import { TenantDb } from "../db/tenant-db.js";
import {
  signAccessToken,
  generateRefreshTokenString,
  hashRefreshToken,
  signOAuthState,
  verifyOAuthState,
  generateCodeVerifier,
  generateCodeChallenge,
} from "../auth/jwt.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { exchangeGoogleCode, verifyGoogleIdToken } from "../auth/google.js";
import { MockOtpAdapter } from "../adapters/otp.js";
import { AppError } from "../middleware/error-handler.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter: Router = Router();
const platformDb = new PlatformDb();

const REFRESH_COOKIE_NAME = "refreshToken";
const REFRESH_TTL_DAYS = Number(process.env["REFRESH_TTL_DAYS"] ?? "14");
const REFRESH_COOKIE_MAX_AGE = REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;

function parseCookies(header?: string): Record<string, string> {
  if (!header) return {};
  const list: Record<string, string> = {};
  header.split(";").forEach((cookie) => {
    const parts = cookie.split("=");
    const name = parts[0]?.trim();
    if (name) {
      list[name] = decodeURIComponent(parts.slice(1).join("=").trim());
    }
  });
  return list;
}

function setRefreshCookie(res: Response, token: string): void {
  const secure = process.env["NODE_ENV"] === "production" ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `${REFRESH_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age=${Math.floor(REFRESH_COOKIE_MAX_AGE / 1000)}${secure}`
  );
}

function clearRefreshCookie(res: Response): void {
  const secure = process.env["NODE_ENV"] === "production" ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `${REFRESH_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age=0${secure}`
  );
}

function setOAuthCookies(res: Response, verifier: string, state: string): void {
  const secure = process.env["NODE_ENV"] === "production" ? "; Secure" : "";
  const maxAge = 600; // 10 minutes
  res.append(
    "Set-Cookie",
    `g_verifier=${encodeURIComponent(verifier)}; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age=${maxAge}${secure}`
  );
  res.append(
    "Set-Cookie",
    `g_state=${encodeURIComponent(state)}; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age=${maxAge}${secure}`
  );
}

function clearOAuthCookies(res: Response): void {
  const secure = process.env["NODE_ENV"] === "production" ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `g_verifier=; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age=0${secure}`
  );
  res.append(
    "Set-Cookie",
    `g_state=; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age=0${secure}`
  );
}

// ── Register ─────────────────────────────────────────────────────────────────

authRouter.post("/register", async (req: Request, res: Response) => {
  const input = registerSchema.parse(req.body);

  const tenant = await platformDb.getTenantBySlug(input.tenantSlug);
  if (!tenant) {
    throw new AppError("TENANT_NOT_FOUND", `Tenant '${input.tenantSlug}' does not exist`, 404);
  }

  const tenantDb = new TenantDb(tenant.id);

  // Check uniqueness of email or phone in this tenant
  if (input.email) {
    const existing = await tenantDb.findUserByIdentifier(input.email);
    if (existing) {
      throw new AppError(
        "USER_EXISTS",
        "A user with this email already exists in this tenant",
        409
      );
    }
  }
  if (input.phone) {
    const existing = await tenantDb.findUserByIdentifier(input.phone);
    if (existing) {
      throw new AppError(
        "USER_EXISTS",
        "A user with this phone number already exists in this tenant",
        409
      );
    }
  }

  const passwordHash = await hashPassword(input.password);
  const user = await tenantDb.createUser({
    name: input.name,
    email: input.email,
    phone: input.phone,
    password_hash: passwordHash,
    roles: ["citizen"],
    locale: input.locale,
    consent_at: new Date(),
  });

  const accessToken = await signAccessToken({
    sub: user.id,
    tid: tenant.id,
    role: "citizen",
    roles: ["citizen"],
  });

  const rawRefreshToken = generateRefreshTokenString();
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const familyId = randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_COOKIE_MAX_AGE);

  await tenantDb.createRefreshToken({
    userId: user.id,
    tokenHash,
    familyId,
    expiresAt,
  });

  setRefreshCookie(res, rawRefreshToken);

  res.status(201).json({
    data: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        roles: user.roles,
        locale: user.locale,
        tenantId: tenant.id,
      },
      accessToken,
    },
  });
});

// ── Login ────────────────────────────────────────────────────────────────────

authRouter.post("/login", async (req: Request, res: Response) => {
  const input = loginSchema.parse(req.body);

  const tenant = await platformDb.getTenantBySlug(input.tenantSlug);
  if (!tenant) {
    throw new AppError("TENANT_NOT_FOUND", `Tenant '${input.tenantSlug}' does not exist`, 404);
  }

  const tenantDb = new TenantDb(tenant.id);
  const user = await tenantDb.findUserByIdentifier(input.identifier);

  if (!user) {
    throw new AppError("INVALID_CREDENTIALS", "Invalid email/phone or password", 401);
  }

  if (!user.password_hash) {
    throw new AppError(
      "PASSWORD_LOGIN_DISABLED",
      "This account was created with Google Sign-in. Please sign in with Google.",
      400
    );
  }

  const isValidPassword = await verifyPassword(user.password_hash, input.password);
  if (!isValidPassword) {
    throw new AppError("INVALID_CREDENTIALS", "Invalid email/phone or password", 401);
  }

  const primaryRole = user.roles[0] || "citizen";
  const accessToken = await signAccessToken({
    sub: user.id,
    tid: tenant.id,
    role: primaryRole,
    roles: user.roles,
  });

  const rawRefreshToken = generateRefreshTokenString();
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const familyId = randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_COOKIE_MAX_AGE);

  await tenantDb.createRefreshToken({
    userId: user.id,
    tokenHash,
    familyId,
    expiresAt,
  });

  setRefreshCookie(res, rawRefreshToken);

  res.status(200).json({
    data: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        roles: user.roles,
        locale: user.locale,
        tenantId: tenant.id,
      },
      accessToken,
    },
  });
});

// ── Google OAuth ─────────────────────────────────────────────────────────────

authRouter.get("/google", async (req: Request, res: Response) => {
  const consent = req.query["consent"];
  if (consent !== "true") {
    throw new AppError(
      "CONSENT_REQUIRED",
      "Citizen consent is required to sign in with Google",
      400
    );
  }

  const tenantSlug = typeof req.query["tenant"] === "string" ? req.query["tenant"].trim() : "";
  if (!tenantSlug) {
    throw new AppError("TENANT_REQUIRED", "Tenant parameter is required", 400);
  }

  const tenant = await platformDb.getTenantBySlug(tenantSlug);
  if (!tenant) {
    throw new AppError("TENANT_NOT_FOUND", `Tenant '${tenantSlug}' does not exist`, 404);
  }

  const nonce = randomUUID();
  const state = await signOAuthState({ nonce, tenantSlug });
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  setOAuthCookies(res, codeVerifier, state);

  const clientId = process.env["GOOGLE_CLIENT_ID"] ?? "";
  const redirectUri =
    process.env["GOOGLE_REDIRECT_URI"] ?? "http://localhost:4000/api/v1/auth/google/callback";

  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.set("client_id", clientId);
  googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", "openid email profile");
  googleAuthUrl.searchParams.set("state", state);
  googleAuthUrl.searchParams.set("code_challenge", codeChallenge);
  googleAuthUrl.searchParams.set("code_challenge_method", "S256");

  if (req.query["format"] === "json") {
    res
      .status(200)
      .json({ data: { url: googleAuthUrl.toString() }, url: googleAuthUrl.toString() });
  } else {
    res.redirect(googleAuthUrl.toString());
  }
});

authRouter.get("/google/callback", async (req: Request, res: Response) => {
  const cookies = parseCookies(req.headers.cookie);
  const stateParam = typeof req.query["state"] === "string" ? req.query["state"] : undefined;
  const code = typeof req.query["code"] === "string" ? req.query["code"] : undefined;

  if (!stateParam) {
    throw new AppError("INVALID_STATE", "OAuth state parameter missing", 400);
  }
  if (!code) {
    throw new AppError("INVALID_CODE", "Authorization code missing", 400);
  }

  const verifier = cookies["g_verifier"];
  if (!verifier) {
    throw new AppError("INVALID_PKCE", "PKCE code verifier cookie missing", 400);
  }

  let statePayload: { nonce: string; tenantSlug: string };
  try {
    statePayload = await verifyOAuthState(stateParam);
  } catch {
    throw new AppError("INVALID_STATE", "Invalid or expired OAuth state", 400);
  }

  const stateCookie = cookies["g_state"];
  if (stateCookie && stateCookie !== stateParam) {
    throw new AppError("INVALID_STATE", "OAuth state mismatch", 400);
  }

  const tenant = await platformDb.getTenantBySlug(statePayload.tenantSlug);
  if (!tenant) {
    throw new AppError(
      "TENANT_NOT_FOUND",
      `Tenant '${statePayload.tenantSlug}' does not exist`,
      404
    );
  }

  clearOAuthCookies(res);

  const tokens = await exchangeGoogleCode(code, verifier);
  const googleUser = await verifyGoogleIdToken(tokens.id_token);

  const tenantDb = new TenantDb(tenant.id);

  // 1. Find user by google_sub within tenant
  let user = await tenantDb.findUserByGoogleSub(googleUser.sub);

  if (!user) {
    // 2. Else by verified email within tenant (and link google_sub)
    const existing = await tenantDb.findUserByIdentifier(googleUser.email);
    if (existing) {
      user = await tenantDb.linkGoogleSub(existing.id, googleUser.sub);
    } else {
      // 3. Else create a citizen with consent_at set. Never grant a role above citizen.
      user = await tenantDb.createUser({
        name: googleUser.name || googleUser.email.split("@")[0] || "Citizen",
        email: googleUser.email,
        google_sub: googleUser.sub,
        roles: ["citizen"],
        consent_at: new Date(),
      });
    }
  }

  if (!user) {
    throw new AppError("INTERNAL_ERROR", "Failed to retrieve or create user", 500);
  }

  const primaryRole = user.roles[0] || "citizen";
  const accessToken = await signAccessToken({
    sub: user.id,
    tid: tenant.id,
    role: primaryRole,
    roles: user.roles,
  });

  const rawRefreshToken = generateRefreshTokenString();
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const familyId = randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_COOKIE_MAX_AGE);

  await tenantDb.createRefreshToken({
    userId: user.id,
    tokenHash,
    familyId,
    expiresAt,
  });

  setRefreshCookie(res, rawRefreshToken);

  const webOrigin = process.env["WEB_ORIGIN"] ?? "http://localhost:5173";
  if (req.query["format"] === "json") {
    res.status(200).json({
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          roles: user.roles,
          locale: user.locale,
          tenantId: tenant.id,
        },
        accessToken,
      },
      redirect: webOrigin,
    });
  } else {
    res.redirect(webOrigin);
  }
});

// ── Refresh (rotation with family revocation) ────────────────────────────────

authRouter.post("/refresh", async (req: Request, res: Response) => {
  const cookies = parseCookies(req.headers.cookie);
  const rawRefreshToken = cookies[REFRESH_COOKIE_NAME];

  if (!rawRefreshToken) {
    throw new AppError("UNAUTHORIZED", "Refresh token cookie missing", 401);
  }

  const tokenHash = hashRefreshToken(rawRefreshToken);
  const tenantSlug = req.body?.tenantSlug;
  let tenantId: string | undefined;

  if (tenantSlug) {
    const tenant = await platformDb.getTenantBySlug(tenantSlug);
    if (tenant) tenantId = tenant.id;
  }

  // If no tenantSlug was given in body, look up token across tenants or from query
  let foundToken: any = null;
  let tenantDb: TenantDb | null = null;

  if (tenantId) {
    tenantDb = new TenantDb(tenantId);
    foundToken = await tenantDb.findRefreshToken(tokenHash);
  } else {
    // Search across tenants
    const tenants = await platformDb.listTenants();
    for (const t of tenants) {
      const db = new TenantDb(t.id);
      const tok = await db.findRefreshToken(tokenHash);
      if (tok) {
        foundToken = tok;
        tenantDb = db;
        tenantId = t.id;
        break;
      }
    }
  }

  if (!foundToken || !tenantDb || !tenantId) {
    clearRefreshCookie(res);
    throw new AppError("INVALID_TOKEN", "Invalid refresh token", 401);
  }

  // Token reuse detection: if revoked token is used, revoke entire family!
  if (foundToken.is_revoked) {
    await tenantDb.revokeTokenFamily(foundToken.family_id);
    clearRefreshCookie(res);
    throw new AppError(
      "TOKEN_COMPROMISED",
      "Compromised refresh token reused. All associated sessions revoked.",
      401
    );
  }

  if (new Date() > new Date(foundToken.expires_at)) {
    await tenantDb.revokeToken(foundToken.id);
    clearRefreshCookie(res);
    throw new AppError("TOKEN_EXPIRED", "Refresh token has expired", 401);
  }

  // Revoke current token and issue new one in same family
  await tenantDb.revokeToken(foundToken.id);

  const user = await tenantDb.findUserById(foundToken.user_id);
  if (!user) {
    clearRefreshCookie(res);
    throw new AppError("USER_NOT_FOUND", "User associated with token not found", 401);
  }

  const newAccessToken = await signAccessToken({
    sub: user.id,
    tid: tenantId,
    role: user.roles[0] || "citizen",
    roles: user.roles,
  });

  const newRawRefreshToken = generateRefreshTokenString();
  const newTokenHash = hashRefreshToken(newRawRefreshToken);
  const newExpiresAt = new Date(Date.now() + REFRESH_COOKIE_MAX_AGE);

  await tenantDb.createRefreshToken({
    userId: user.id,
    tokenHash: newTokenHash,
    familyId: foundToken.family_id,
    expiresAt: newExpiresAt,
  });

  setRefreshCookie(res, newRawRefreshToken);

  res.status(200).json({
    data: {
      accessToken: newAccessToken,
    },
  });
});

// ── Logout ───────────────────────────────────────────────────────────────────

authRouter.post("/logout", async (req: Request, res: Response) => {
  const cookies = parseCookies(req.headers.cookie);
  const rawRefreshToken = cookies[REFRESH_COOKIE_NAME];

  if (rawRefreshToken) {
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const tenants = await platformDb.listTenants();
    for (const t of tenants) {
      const db = new TenantDb(t.id);
      const tok = await db.findRefreshToken(tokenHash);
      if (tok) {
        await db.revokeToken(tok.id);
        break;
      }
    }
  }

  clearRefreshCookie(res);
  res.status(200).json({ data: { message: "Logged out successfully" } });
});

// ── Mock OTP ─────────────────────────────────────────────────────────────────

authRouter.post("/otp/send", async (req: Request, res: Response) => {
  const input = otpSendSchema.parse(req.body);
  await MockOtpAdapter.sendOtp(input.phone);
  res.status(200).json({ data: { message: "Demo OTP sent successfully" } });
});

authRouter.post("/otp/verify", (req: Request, res: Response) => {
  const input = otpVerifySchema.parse(req.body);
  const verified = MockOtpAdapter.verifyOtp(input.phone, input.otp);
  if (!verified) {
    throw new AppError("INVALID_OTP", "Invalid or expired OTP", 400);
  }
  res.status(200).json({ data: { verified: true, message: "Phone verified successfully" } });
});

// ── Delete Account & Data ────────────────────────────────────────────────────

export const accountRouter: Router = Router();

const handleAccountDelete = async (req: Request, res: Response) => {
  if (!req.tenantDb || !req.user) {
    throw new AppError("UNAUTHORIZED", "Authentication required", 401);
  }

  const deleted = await req.tenantDb.deleteUser(req.user.userId);
  if (!deleted) {
    throw new AppError("USER_NOT_FOUND", "User not found", 404);
  }

  clearRefreshCookie(res);
  res.status(200).json({ data: { message: "Account and personal data removed successfully" } });
};

authRouter.delete("/me", requireAuth, handleAccountDelete);
accountRouter.delete("/me", requireAuth, handleAccountDelete);
