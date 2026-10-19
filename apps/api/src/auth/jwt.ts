import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "node:crypto";

const ACCESS_SECRET = new TextEncoder().encode(
  process.env["JWT_ACCESS_SECRET"] ?? "nivaran-default-access-secret-at-least-32-chars-long"
);

export interface TokenPayload {
  sub: string; // userId
  userId: string;
  tid: string; // tenantId
  role: string; // primary role
  roles: string[]; // all roles
}

export async function signAccessToken(payload: {
  sub: string;
  tid: string;
  role: string;
  roles: string[];
}): Promise<string> {
  const ttlMin = Number(process.env["ACCESS_TTL_MIN"] ?? "15");
  return new SignJWT({
    tid: payload.tid,
    role: payload.role,
    roles: payload.roles,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlMin}m`)
    .sign(ACCESS_SECRET);
}

export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, ACCESS_SECRET);
  const sub = payload.sub!;
  return {
    sub,
    userId: sub,
    tid: (payload["tid"] as string) || "",
    role: (payload["role"] as string) || "citizen",
    roles: (payload["roles"] as string[]) || ["citizen"],
  };
}

export function generateRefreshTokenString(): string {
  return randomBytes(32).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ── Google OAuth State & PKCE ────────────────────────────────────────────────

export async function signOAuthState(payload: {
  nonce: string;
  tenantSlug: string;
}): Promise<string> {
  return new SignJWT({
    nonce: payload.nonce,
    tenantSlug: payload.tenantSlug,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(ACCESS_SECRET);
}

export async function verifyOAuthState(
  stateToken: string
): Promise<{ nonce: string; tenantSlug: string }> {
  const { payload } = await jwtVerify(stateToken, ACCESS_SECRET);
  return {
    nonce: typeof payload["nonce"] === "string" ? payload["nonce"] : "",
    tenantSlug: typeof payload["tenantSlug"] === "string" ? payload["tenantSlug"] : "",
  };
}

export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
