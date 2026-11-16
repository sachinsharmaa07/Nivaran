#!/usr/bin/env node
/* global fetch */
/**
 * scripts/prod-smoke.mjs
 * Production smoke test for Nivaran.
 * Checks:
 *   1. https://$DOMAIN/api/v1/healthz returns 200 ok
 *   2. https://$DOMAIN/readyz returns 200 ready
 *   3. Login with seeded platform admin (if credentials provided)
 *   4. Verifies database/cache/internal ports (5432, 27017, 6379, 8025, 1025) are unreachable from outside
 */

import { createConnection } from "node:net";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const paths = [resolve("infra/prod/.env.prod"), resolve(".env.prod"), resolve(".env")];
  for (const p of paths) {
    if (existsSync(p)) {
      const content = readFileSync(p, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const [k, ...v] = trimmed.split("=");
        if (k && !process.env[k.trim()]) {
          process.env[k.trim()] = v
            .join("=")
            .trim()
            .replace(/^["']|["']$/g, "");
        }
      }
      break;
    }
  }
}

loadEnv();

const domain = process.argv[2] || process.env.DOMAIN;
const adminEmail = process.env.PLATFORM_ADMIN_EMAIL || "admin@nivaran.gov.in";
const adminPassword = process.env.PLATFORM_ADMIN_PASSWORD;

if (!domain) {
  console.error("Error: DOMAIN environment variable or command-line argument is required.");
  console.error("Usage: DOMAIN=example.com node scripts/prod-smoke.mjs");
  process.exit(1);
}

const baseUrl = domain.startsWith("http") ? domain : `https://${domain}`;
const targetHost = new URL(baseUrl).hostname;

async function testHttpEndpoint(path, expectedStatus = 200) {
  const url = `${baseUrl}${path}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.status === expectedStatus) {
      return { ok: true, detail: `HTTP ${res.status}` };
    }
    return { ok: false, detail: `Expected ${expectedStatus}, got ${res.status}` };
  } catch (err) {
    return { ok: false, detail: err.message };
  }
}

async function testAdminLogin() {
  if (!adminPassword) {
    return { ok: true, detail: "SKIPPED (PLATFORM_ADMIN_PASSWORD not set)" };
  }
  const url = `${baseUrl}/api/v1/auth/login`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantSlug: "platform",
        identifier: adminEmail,
        password: adminPassword,
      }),
    });
    if (res.status === 200) {
      const data = await res.json();
      return { ok: true, detail: `Logged in as ${data.data?.user?.email || adminEmail}` };
    }
    return { ok: false, detail: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, detail: err.message };
  }
}

function checkPortClosed(host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: timeoutMs });

    socket.on("connect", () => {
      socket.destroy();
      // If we could connect, that's a failure (the port is open!)
      resolve({ closed: false, detail: "PORT EXPOSED (SECURITY RISK)" });
    });

    socket.on("timeout", () => {
      socket.destroy();
      // Timeout means packet was dropped (firewalled / unreachable) -> PASS
      resolve({ closed: true, detail: "Closed (connection timed out)" });
    });

    socket.on("error", (err) => {
      socket.destroy();
      // Connection refused means no service is listening on host port -> PASS
      resolve({ closed: true, detail: `Closed (${err.code || "refused"})` });
    });
  });
}

async function runSmokeTest() {
  console.log(`==> Running Nivaran production smoke test against ${baseUrl}...\n`);

  let allPassed = true;

  // 1. Healthz check
  const healthz = await testHttpEndpoint("/api/v1/healthz");
  console.log(`[${healthz.ok ? "PASS" : "FAIL"}] /api/v1/healthz: ${healthz.detail}`);
  if (!healthz.ok) allPassed = false;

  // 2. Readyz check
  const readyz = await testHttpEndpoint("/readyz");
  console.log(`[${readyz.ok ? "PASS" : "FAIL"}] /readyz: ${readyz.detail}`);
  if (!readyz.ok) allPassed = false;

  // 3. Platform Admin Login
  const login = await testAdminLogin();
  console.log(`[${login.ok ? "PASS" : "FAIL"}] Platform admin login: ${login.detail}`);
  if (!login.ok) allPassed = false;

  // 4. Port security checks (must be unreachable from outside)
  console.log("\n--> Verifying internal service ports are unreachable from the outside:");
  const portsToTest = [
    { name: "PostgreSQL", port: 5432 },
    { name: "MongoDB", port: 27017 },
    { name: "Redis", port: 6379 },
    { name: "Mailpit SMTP", port: 1025 },
    { name: "Mailpit Web UI", port: 8025 },
  ];

  for (const svc of portsToTest) {
    const res = await checkPortClosed(targetHost, svc.port);
    const pass = res.closed;
    console.log(`[${pass ? "PASS" : "FAIL"}] Port ${svc.port} (${svc.name}): ${res.detail}`);
    if (!pass) allPassed = false;
  }

  console.log("\n--------------------------------------------------");
  if (allPassed) {
    console.log("==> PROD SMOKE TEST: ALL CHECKS PASSED");
    process.exit(0);
  } else {
    console.error("==> PROD SMOKE TEST: FAILURES DETECTED");
    process.exit(1);
  }
}

runSmokeTest();
