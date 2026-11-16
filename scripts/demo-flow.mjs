#!/usr/bin/env node
/**
 * Nivaran Demo Flow Script
 * Executes end-to-end civic issue reporting, dedup, triage, routing, assignment,
 * resolution with evidence, citizen confirmation, notifications and public metrics.
 * Uses only Node built-ins (fetch, Buffer, crypto, etc.).
 */

/* global fetch */
import { Buffer } from "node:buffer";
import { setTimeout as sleep } from "node:timers/promises";

const API_BASE = process.env.API_BASE_URL || "http://localhost:4000";
const MAILPIT_BASE = process.env.MAILPIT_URL || "http://localhost:8025";
const TENANT_SLUG = "demo-punjab";

// Valid 10x10 JPEG image buffer decodable by sharp
const TINY_JPEG_BASE64 =
  "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAKAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgj/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABykX//Z";
const TINY_JPEG_BUFFER = Buffer.from(TINY_JPEG_BASE64, "base64");

async function request(path, options = {}) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, options);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const errorMsg = json.error?.message || json.message || text || `HTTP ${res.status}`;
    throw new Error(`Request to ${url} failed (${res.status}): ${errorMsg}`);
  }
  return json;
}

async function main() {
  console.log("=== NIVARAN DEMO FLOW START ===");

  // 1. Register a new citizen in demo-punjab (unique email)
  const uniqueEmail = `citizen_${Date.now()}_${Math.floor(Math.random() * 10000)}@punjab.example.com`;
  console.log(`[1/8] Registering citizen in ${TENANT_SLUG} with email: ${uniqueEmail}`);
  const registerRes = await request("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenantSlug: TENANT_SLUG,
      name: "Demo Citizen",
      email: uniqueEmail,
      password: "Password123!",
      consent: true,
      locale: "en",
    }),
  });

  const citizenToken = registerRes.data.accessToken;
  const citizenId = registerRes.data.user.id;
  console.log(`  Citizen registered: user_id=${citizenId}`);

  // 2. Submit an issue with a small generated JPEG inside the service area
  console.log("[2/8] Uploading JPEG photo and submitting issue inside Amritsar service area...");
  const tempUploadId = `temp-${Date.now()}`;
  const uploadRes1 = await request(`/api/v1/issues/upload/${tempUploadId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${citizenToken}`,
      "Content-Type": "image/jpeg",
    },
    body: TINY_JPEG_BUFFER,
  });
  const photoKey1 = uploadRes1.data.key;

  // Center of Amritsar is lat: 31.634, lon: 74.8723. W01 is within [31.634..31.654, 74.8723..74.8923]
  const lat1 = 31.64;
  const lon1 = 74.88;

  const issue1Res = await request("/api/v1/issues", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${citizenToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tenant_slug: TENANT_SLUG,
      category_code: "pothole",
      description: "Severe pothole causing traffic obstruction on GT Road near Amritsar bus stand",
      lat: lat1,
      lon: lon1,
      gps_accuracy_m: 5,
      severity: 2,
      photo_keys: [photoKey1],
    }),
  });

  const issue1Id = issue1Res.data.issue_id;
  console.log(`  Issue 1 created: ${issue1Id}`);

  // 3. Submit a second nearby report and observe duplicate suggestions
  console.log("[3/8] Submitting second nearby report to verify duplicate detection...");
  const lat2 = 31.64008; // ~9 meters away
  const lon2 = 74.88008;

  const issue2Res = await request("/api/v1/issues", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${citizenToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tenant_slug: TENANT_SLUG,
      category_code: "pothole",
      description: "Another report of deep crater pothole at the exact same location",
      lat: lat2,
      lon: lon2,
      gps_accuracy_m: 5,
      severity: 2,
      photo_keys: [],
    }),
  });

  const issue2Id = issue2Res.data.issue_id;
  const duplicateSuggestions = issue2Res.data.duplicate_suggestions || [];
  console.log(`  Issue 2 created: ${issue2Id}`);
  console.log(`  Duplicate suggestions count: ${duplicateSuggestions.length}`);
  const match = duplicateSuggestions.find((d) => d.publicId === issue1Id);
  if (!match) {
    console.warn(
      `  Warning: Issue 1 (${issue1Id}) was not in suggestions list:`,
      duplicateSuggestions
    );
  } else {
    console.log(
      `  Match confirmed: ${match.publicId} scored confidence ${(match.score?.total * 100).toFixed(1)}% (spatial: ${match.score?.spatial?.toFixed(2)}, category: ${match.score?.category})`
    );
  }

  // 4. +1 the issue (Citizen confirms / upvotes issue)
  console.log("[4/8] Confirming (+1) report...");
  // Login as seeded citizen to +1 issue 1
  const seededCitizenLogin = await request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenantSlug: TENANT_SLUG,
      identifier: "citizen@punjab.local",
      password: "Password123!",
    }),
  });
  const seededCitizenToken = seededCitizenLogin.data.accessToken;

  const confirmRes = await request(`/api/v1/issues/${issue1Id}/confirm`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${seededCitizenToken}`,
    },
  });
  console.log(
    `  Issue ${issue1Id} now confirmed by additional citizen. Total reporters: ${confirmRes.data.reporter_count}`
  );

  // 5. Log in as seeded staff and dept_head
  console.log("[5/8] Logging in as seeded staff and dept_head...");
  const staffLogin = await request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenantSlug: TENANT_SLUG,
      identifier: "staff@punjab.local",
      password: "Password123!",
    }),
  });
  const staffToken = staffLogin.data.accessToken;

  const deptHeadLogin = await request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenantSlug: TENANT_SLUG,
      identifier: "depthead@punjab.local",
      password: "Password123!",
    }),
  });
  const deptHeadToken = deptHeadLogin.data.accessToken;
  console.log("  Staff & Dept Head credentials verified successfully.");

  // 6. Route and assign the issue
  console.log("[6/8] Routing to department and assigning issue...");
  // Fetch issue detail to get department ID or use roads department
  const issueDetail = await request(`/api/v1/issues/${issue1Id}`, {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  const deptId = issueDetail.data.department?.id;

  // Route issue (dept_head routes to department)
  if (deptId) {
    await request(`/api/v1/issues/${issue1Id}/route`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${deptHeadToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ department_id: deptId }),
    });
  }

  // Transition: submitted -> triaged
  await request(`/api/v1/issues/${issue1Id}/transition`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${staffToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to: "triaged", note: "Issue triaged and validated by staff" }),
  });

  // Transition: triaged -> assigned
  await request(`/api/v1/issues/${issue1Id}/transition`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${staffToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to: "assigned", note: "Assigned to road maintenance division crew" }),
  });
  console.log(`  Issue ${issue1Id} triaged and assigned.`);

  // 7. Resolve the issue with evidence
  console.log("[7/8] Starting progress and resolving issue with photo evidence...");
  await request(`/api/v1/issues/${issue1Id}/transition`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${staffToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to: "in_progress", note: "Repair equipment and crew dispatched" }),
  });

  // Upload resolution evidence photo
  const uploadRes2 = await request(`/api/v1/issues/upload/${issue1Id}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${staffToken}`,
      "Content-Type": "image/jpeg",
    },
    body: TINY_JPEG_BUFFER,
  });
  const evidenceKey = uploadRes2.data.key;

  // Transition: in_progress -> resolved
  await request(`/api/v1/issues/${issue1Id}/transition`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${staffToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: "resolved",
      note: "Pothole filled with dense bituminous macadam and leveled with road surface",
      evidence_keys: [evidenceKey],
    }),
  });
  console.log(`  Issue ${issue1Id} resolved with photo evidence key: ${evidenceKey}`);

  // 8. Citizen confirms it (resolved -> closed)
  console.log("[8/8] Citizen confirming resolution...");
  await request(`/api/v1/issues/${issue1Id}/transition`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${citizenToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: "closed",
      note: "Confirmed by citizen: road surface restored smoothly",
    }),
  });
  console.log(`  Issue ${issue1Id} confirmed and closed by citizen.`);

  // Allow asynchronous background tasks (notifications, metrics) to flush
  await sleep(600);

  // ── FINAL OUTPUT PRINTING (SPECIFIED BY PROMPT) ──────────────────────────────
  console.log("\n=======================================================");
  console.log("                  DEMO FLOW RESULTS                    ");
  console.log("=======================================================");

  // 1. The public ID
  console.log(`\n1. Public ID:\n   ${issue1Id}`);

  // 2. Priority score and factor breakdown
  const finalIssueRes = await request(`/api/v1/issues/${issue1Id}`, {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  const priorityBreakdown = finalIssueRes.data.priority?.breakdown || {};
  console.log(`\n2. Priority Score and Factor Breakdown:`);
  console.log(`   Final Score: ${priorityBreakdown.score}`);
  console.log(`   Breakdown:`, JSON.stringify(priorityBreakdown, null, 2));

  // 3. The status timeline
  const auditRes = await request(`/api/v1/issues/${issue1Id}/audit`, {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  const timeline = auditRes.data || [];
  console.log(`\n3. Status Timeline (Audit Trail):`);
  timeline.forEach((event, idx) => {
    const payloadStr = event.payload ? JSON.stringify(event.payload) : "none";
    console.log(
      `   [${idx + 1}] ${event.at} | Event: ${event.event} | Actor: ${event.actor?.role} (${event.actor?.userId}) | Details: ${payloadStr}`
    );
  });

  // 4. The number of emails now in Mailpit
  let mailpitCount = "unknown";
  try {
    const mailRes = await request(`${MAILPIT_BASE}/api/v1/messages`);
    mailpitCount = mailRes.total ?? mailRes.messages_count ?? mailRes.messages?.length ?? 0;
  } catch (err) {
    mailpitCount = `Error querying Mailpit: ${err.message}`;
  }
  console.log(`\n4. Emails in Mailpit (HTTP API):`);
  console.log(`   Total Message Count: ${mailpitCount}`);

  // 5. The notifications count for the citizen
  const notifRes = await request("/api/v1/notifications", {
    headers: { Authorization: `Bearer ${citizenToken}` },
  });
  const citizenNotifications = notifRes.data || [];
  console.log(`\n5. Notifications Count for Citizen:`);
  console.log(`   Count: ${citizenNotifications.length}`);
  citizenNotifications.forEach((n, idx) => {
    console.log(`   [${idx + 1}] Type: ${n.type} | Title: "${n.title}" | Body: "${n.body}"`);
  });

  // 6. The public metrics response for demo-punjab
  const metricsRes = await request(`/api/v1/public/${TENANT_SLUG}/metrics`);
  console.log(`\n6. Public Metrics Response for ${TENANT_SLUG}:`);
  console.log(JSON.stringify(metricsRes, null, 2));

  console.log("\n=== NIVARAN DEMO FLOW COMPLETED SUCCESSFULLY ===");
}

main().catch((err) => {
  console.error("\n❌ DEMO FLOW FAILED:", err);
  process.exit(1);
});
