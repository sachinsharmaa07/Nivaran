import { Router, type Request, type Response } from "express";
import { issueReportSchema, calculateReportersFactor } from "@nivaran/shared";
import { PlatformDb } from "../db/platform-db.js";
import { TenantDb } from "../db/tenant-db.js";
import { AppError } from "../middleware/error-handler.js";

export const issuesRouter: Router = Router();
const platformDb = new PlatformDb();

// ── Per-User Rate Limiting (10 reports per hour per user/IP) ─────────────────

interface RateLimitRecord {
  timestamps: number[];
}

const reportRateLimits = new Map<string, RateLimitRecord>();

export function checkReportRateLimit(identifier: string, limit = 10, windowMs = 3600000): void {
  const now = Date.now();
  let record = reportRateLimits.get(identifier);
  if (!record) {
    record = { timestamps: [] };
    reportRateLimits.set(identifier, record);
  }

  // Filter timestamps within sliding window
  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (record.timestamps.length >= limit) {
    throw new AppError(
      "RATE_LIMIT_EXCEEDED",
      `Report creation rate limit exceeded. Maximum ${limit} reports per hour allowed.`,
      429
    );
  }

  record.timestamps.push(now);
}

export function resetReportRateLimits(): void {
  reportRateLimits.clear();
}

// ── Submit Civic Issue Report ────────────────────────────────────────────────

issuesRouter.post("/", async (req: Request, res: Response) => {
  const input = issueReportSchema.parse(req.body);

  // Identify user by authenticated user ID or client IP
  const userIdentifier = req.user?.userId ?? req.user?.sub ?? req.ip ?? "anonymous";
  checkReportRateLimit(userIdentifier, 10, 3600000);

  // Look up tenant
  const tenant = await platformDb.getTenantBySlug(input.tenant_slug);
  if (!tenant) {
    throw new AppError("TENANT_NOT_FOUND", `Tenant '${input.tenant_slug}' not found`, 404);
  }

  const tenantDb = new TenantDb(tenant.id);

  // Validate GPS coordinates: India bounding box & tenant service area (wards or 30km circle)
  const validation = await tenantDb.validateLocation(input.lat, input.lon);
  if (!validation.valid) {
    throw new AppError("LOCATION_REJECTED", validation.reason ?? "Invalid location", 400);
  }

  // Generate public issue ID format: NVR-<TENANTCODE>-<6 digits>
  const randNum = Math.floor(100000 + Math.random() * 900000);
  const issueId = `NVR-${tenant.code}-${randNum}`;

  // Priority reporters factor calculation using saturating curve
  const initialReporterCount = 1;
  const reportersFactor = calculateReportersFactor(initialReporterCount);

  // Record into issue_metrics_fact for reporting and state statistics
  await tenantDb.recordIssueMetric({
    issue_id: issueId,
    status: "submitted",
    category_code: input.category_code,
    ward_id: validation.wardId,
    lat: input.lat,
    lon: input.lon,
    landmark: input.landmark,
    pincode: input.pincode,
    sla_breached: false,
  });

  res.status(201).json({
    data: {
      issue_id: issueId,
      status: "submitted",
      tenant_slug: tenant.slug,
      category_code: input.category_code,
      description: input.description,
      location: { lat: input.lat, lon: input.lon },
      landmark: input.landmark ?? null,
      pincode: input.pincode ?? null,
      ward_id: validation.wardId ?? null,
      evidence_keys: input.evidence_keys,
      reporters_count: initialReporterCount,
      reporters_factor: reportersFactor,
      created_at: new Date().toISOString(),
    },
  });
});
