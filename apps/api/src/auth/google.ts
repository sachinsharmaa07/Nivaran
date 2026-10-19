import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { AppError } from "../middleware/error-handler.js";

const DEFAULT_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

export interface GoogleIdTokenPayload {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string | undefined;
  picture?: string | undefined;
}

export interface GoogleAuthOverrides {
  tokenUrl?: string | undefined;
  jwksUrl?: string | undefined;
  customJwksKeySet?: JWTVerifyGetKey | undefined;
}

let overrides: GoogleAuthOverrides = {};

export function setGoogleAuthOverrides(newOverrides: GoogleAuthOverrides): void {
  overrides = { ...newOverrides };
  remoteJwksInstance = null;
}

export function resetGoogleAuthOverrides(): void {
  overrides = {};
  remoteJwksInstance = null;
}

let remoteJwksInstance: JWTVerifyGetKey | null = null;

function getJwks(): JWTVerifyGetKey {
  if (overrides.customJwksKeySet) {
    return overrides.customJwksKeySet;
  }
  if (!remoteJwksInstance) {
    const url = overrides.jwksUrl ?? DEFAULT_JWKS_URL;
    remoteJwksInstance = createRemoteJWKSet(new URL(url));
  }
  return remoteJwksInstance;
}

export async function exchangeGoogleCode(
  code: string,
  codeVerifier: string
): Promise<{ id_token: string; access_token: string }> {
  const tokenUrl = overrides.tokenUrl ?? DEFAULT_TOKEN_URL;
  const clientId = process.env["GOOGLE_CLIENT_ID"] ?? "";
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"] ?? "";
  const redirectUri =
    process.env["GOOGLE_REDIRECT_URI"] ?? "http://localhost:4000/api/v1/auth/google/callback";

  const bodyParams = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: bodyParams.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new AppError(
      "GOOGLE_TOKEN_EXCHANGE_FAILED",
      `Failed to exchange authorization code: ${errorText}`,
      400
    );
  }

  const data = (await response.json()) as { id_token?: string; access_token?: string };
  if (!data.id_token) {
    throw new AppError(
      "GOOGLE_TOKEN_EXCHANGE_FAILED",
      "Missing id_token in Google token response",
      400
    );
  }

  return {
    id_token: data.id_token,
    access_token: data.access_token ?? "",
  };
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdTokenPayload> {
  const jwks = getJwks();
  const clientId = process.env["GOOGLE_CLIENT_ID"] ?? "";

  try {
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });

    const email = payload["email"] as string | undefined;
    const emailVerified = Boolean(payload["email_verified"]);
    const sub = payload.sub;

    if (!sub || !email) {
      throw new AppError("INVALID_ID_TOKEN", "Google ID token missing sub or email", 400);
    }

    if (!emailVerified) {
      throw new AppError("EMAIL_NOT_VERIFIED", "Google account email is not verified", 400);
    }

    return {
      sub,
      email,
      email_verified: emailVerified,
      name: payload["name"] as string | undefined,
      picture: payload["picture"] as string | undefined,
    };
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : "ID token verification failed";
    throw new AppError("INVALID_ID_TOKEN", `Invalid Google ID token: ${message}`, 400);
  }
}
