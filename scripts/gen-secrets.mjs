#!/usr/bin/env node
/**
 * scripts/gen-secrets.mjs
 * Generates cryptographically secure secrets and creates untracked .env.prod with chmod 600.
 * Node built-ins only. Never logs or prints secrets.
 */

import { randomBytes } from "node:crypto";
import { writeFileSync, chmodSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function generateSecret(bytes = 32, encoding = "hex") {
  return randomBytes(bytes).toString(encoding);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let domain = process.env.DOMAIN || "example.com";
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--domain" && args[i + 1]) {
      domain = args[i + 1];
      i++;
    } else if (args[i] === "--force" || args[i] === "-f") {
      force = true;
    }
  }

  return { domain, force };
}

function main() {
  const { domain, force } = parseArgs();
  const repoRoot = resolve(process.cwd());
  const prodEnvPath = resolve(repoRoot, "infra/prod/.env.prod");
  const rootEnvPath = resolve(repoRoot, ".env.prod");

  if (existsSync(prodEnvPath) && !force) {
    console.error(`Error: ${prodEnvPath} already exists.`);
    console.error("Pass --force to overwrite existing production secrets.");
    process.exit(1);
  }

  const pgPassword = generateSecret(24, "base64url");
  const jwtAccessSecret = generateSecret(32, "hex");
  const jwtRefreshSecret = generateSecret(32, "hex");

  const envContent = `# Nivaran Production Environment (Generated)
# Generated at: ${new Date().toISOString()}
# Permissions: 0600 (Restricted to owner)

# Domain & Web Configuration
ENV_FILE=.env.prod
DOMAIN=${domain}
NODE_ENV=production
PORT=4000
LOG_LEVEL=info
WEB_ORIGIN=https://${domain}
API_BASE_URL=https://${domain}/api/v1

# Databases & Cache (Internal Docker network URLs)
POSTGRES_PASSWORD=${pgPassword}
POSTGRES_OWNER_URL=postgresql://nivaran_owner:${pgPassword}@postgres:5432/nivaran
POSTGRES_APP_URL=postgresql://nivaran_app:nivaran_app_pass@postgres:5432/nivaran
MONGO_URI=mongodb://mongo:27017/nivaran?replicaSet=rs0
REDIS_URL=redis://redis:6379

# Object Storage (AWS S3)
S3_ENDPOINT_INTERNAL=
S3_ENDPOINT_PUBLIC=
S3_REGION=ap-south-1
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=

# Authentication Tokens
JWT_ACCESS_SECRET=${jwtAccessSecret}
JWT_REFRESH_SECRET=${jwtRefreshSecret}
ACCESS_TTL_MIN=15
REFRESH_TTL_DAYS=14

# Email / Notifications
SMTP_HOST=
SMTP_PORT=587
MAIL_FROM=noreply@${domain}

# AI Services
AI_SERVICE_URL=http://ai:8000
AI_TIMEOUT_MS=4000
LLM_PROVIDER=gemini
LLM_MODEL=gemini-1.5-flash
GEMINI_API_KEY=

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://${domain}/api/v1/auth/google/callback
`;

  // Write with restricted mode 0600
  writeFileSync(prodEnvPath, envContent, { mode: 0o600 });
  chmodSync(prodEnvPath, 0o600);

  // Also write to repo root .env.prod for convenience
  writeFileSync(rootEnvPath, envContent, { mode: 0o600 });
  chmodSync(rootEnvPath, 0o600);

  console.log("Successfully generated production environment configuration:");
  console.log(`- ${prodEnvPath} (mode 0600)`);
  console.log(`- ${rootEnvPath} (mode 0600)`);
  console.log("Remember to update DOMAIN, S3, SMTP, and OAuth values before deploying.");
}

main();
