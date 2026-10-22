import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { isInsideIndia } from "@nivaran/shared";
import { PlatformDb } from "../db/platform-db.js";
import { TenantDb } from "../db/tenant-db.js";
import { IssueRepo } from "../db/issue-repo.js";
import { AppError } from "../middleware/error-handler.js";
import {
  haversineMetres,
  scoreDuplicate,
  computePriority,
  canTransition,
  ROLE_RANKS,
} from "../domain/algorithms.js";

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

// ── Helpers ──────────────────────────────────────────────────────────────────

async function resolveTenant(slug: string) {
  const tenant = await platformDb.getTenantBySlug(slug);
  if (!tenant) throw new AppError("TENANT_NOT_FOUND", `Tenant '${slug}' not found`, 404);
  return tenant;
}

function actorFromReq(req: Request): { userId: string; role: string } {
  const userId = req.user?.userId ?? req.user?.sub ?? "anonymous";
  const role = req.user?.roles?.[0] ?? "anonymous";
  return { userId, role };
}

// ── POST /api/v1/issues — Submit civic issue ─────────────────────────────────

const createIssueSchema = z.object({
  tenant_slug: z.string().min(1),
  category_code: z.string().min(1),
  description: z.string().min(5).max(2000),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  gps_accuracy_m: z.number().min(0).max(500).optional(),
  landmark: z.string().max(255).optional(),
  pincode: z
    .string()
    .regex(/^[1-9][0-9]{5}$/)
    .optional(),
  severity: z.number().int().min(1).max(3).default(1),
  photo_keys: z.array(z.string()).max(4).default([]),
});

issuesRouter.post("/", async (req: Request, res: Response) => {
  const input = createIssueSchema.parse(req.body);
  const actor = actorFromReq(req);
  const userIdentifier = actor.userId !== "anonymous" ? actor.userId : (req.ip ?? "anonymous");
  checkReportRateLimit(userIdentifier, 10, 3600_000);

  const tenant = await resolveTenant(input.tenant_slug);
  const tenantDb = new TenantDb(tenant.id);

  // Validate GPS: India bbox + service area
  if (!isInsideIndia(input.lat, input.lon)) {
    throw new AppError("LOCATION_REJECTED", "GPS coordinates are outside India", 400);
  }
  const locationValidation = await tenantDb.validateLocation(input.lat, input.lon);
  if (!locationValidation.valid) {
    throw new AppError("LOCATION_REJECTED", locationValidation.reason ?? "Invalid location", 400);
  }

  // Fetch category snapshot from Postgres
  const category = await tenantDb.getCategoryByCode(input.category_code);
  if (!category) {
    throw new AppError("CATEGORY_NOT_FOUND", `Category '${input.category_code}' not found`, 404);
  }

  // Fetch department snapshot (if category has one)
  const department = category.department_id
    ? await tenantDb.getDepartment(category.department_id)
    : null;

  // Fetch SLA policy snapshot
  const slaPolicy = category.sla_policy_id
    ? await tenantDb.getSlaPolicy(category.sla_policy_id)
    : null;

  // Generate atomic publicId
  const repo = new IssueRepo(tenant.id);
  const seq = await repo.nextSeq();
  const publicId = `NVR-${tenant.code}-${String(seq).padStart(6, "0")}`;

  // Compute initial priority
  const now = new Date();
  const slaRespondBy = slaPolicy
    ? new Date(now.getTime() + slaPolicy.respond_hours * 3_600_000)
    : null;
  const slaResolveBy = slaPolicy
    ? new Date(now.getTime() + slaPolicy.resolve_hours * 3_600_000)
    : null;

  const priority = computePriority({
    safetyRisk: category.default_safety_risk,
    severity: input.severity,
    facilityProximity: 0, // TODO: compute from PostGIS in P5
    uniqueReporterCount: 1,
    daysOpen: 0,
    slaFraction: 0,
    confidence: input.photo_keys.length > 0 ? 1.0 : 0.9,
  });

  // Create issue in Mongo (snapshot rule: category, dept, SLA copied at creation)
  const issue = await repo.create({
    publicId,
    status: "submitted",
    reporterId: actor.userId,
    reporterIds: actor.userId !== "anonymous" ? [actor.userId] : [],
    location: {
      type: "Point",
      coordinates: [input.lon, input.lat],
      accuracyM: input.gps_accuracy_m,
      wardId: locationValidation.wardId,
    },
    landmark: input.landmark,
    pincode: input.pincode,
    description: input.description,
    severity: input.severity,
    category: {
      code: category.code,
      names: category.names,
      dedupRadiusM: category.dedup_radius_m,
      defaultSafetyRisk: category.default_safety_risk,
      evidenceRequired: category.evidence_required,
    },
    ...(department && {
      department: {
        id: department.id,
        code: department.code,
        name: department.name,
      },
    }),
    ...(slaPolicy && {
      slaPolicy: {
        id: slaPolicy.id,
        name: slaPolicy.name,
        respondHours: slaPolicy.respond_hours,
        resolveHours: slaPolicy.resolve_hours,
        escalationLevels: slaPolicy.escalation_levels,
        respondBy: slaRespondBy,
        resolveBy: slaResolveBy,
      },
    }),
    evidence: input.photo_keys.map((k) => ({ key: k })),
    priority: { breakdown: priority },
  });

  // Append audit event
  await repo.appendAuditEvent({
    issueId: publicId,
    actor,
    event: "CREATED",
    payload: { categoryCode: input.category_code, status: "submitted" },
  });

  // Write to Postgres issue_metrics_fact (outbox-style)
  await tenantDb.recordIssueMetric({
    issue_id: publicId,
    status: "submitted",
    category_code: input.category_code,
    department_id: department?.id,
    ward_id: locationValidation.wardId,
    lat: input.lat,
    lon: input.lon,
    landmark: input.landmark,
    pincode: input.pincode,
    sla_breached: false,
  });

  // Duplicate suggestions
  const gpsAccuracy = Math.min(input.gps_accuracy_m ?? 0, 30);
  const rEff = category.dedup_radius_m + gpsAccuracy;
  const candidates = await repo.findGeoNearCandidates(input.lon, input.lat, rEff * 2, publicId);

  const duplicateSuggestions = candidates
    .map((c) => {
      const dist = haversineMetres(
        input.lat,
        input.lon,
        c.issue.location.coordinates[1],
        c.issue.location.coordinates[0]
      );
      const sameCategory = c.issue.category?.code === input.category_code;
      const score = scoreDuplicate({
        distanceM: dist,
        rEff,
        sameCategory,
        compatibleCategory: false,
      });
      return score.suggestion ? { publicId: c.issue.publicId, score } : null;
    })
    .filter(Boolean);

  res.status(201).json({
    data: {
      issue_id: publicId,
      status: "submitted",
      tenant_slug: tenant.slug,
      category_code: input.category_code,
      description: input.description,
      location: { lat: input.lat, lon: input.lon },
      gps_accuracy_m: input.gps_accuracy_m ?? null,
      landmark: input.landmark ?? null,
      pincode: input.pincode ?? null,
      ward_id: locationValidation.wardId ?? null,
      severity: input.severity,
      priority_score: priority.score,
      photo_keys: input.photo_keys,
      created_at: issue.createdAt.toISOString(),
      duplicate_suggestions: duplicateSuggestions,
    },
  });
});

// ── PUT /api/v1/issues/upload/:issueId — Raw-body photo upload ───────────────

issuesRouter.put("/upload/:issueId", async (req: Request, res: Response) => {
  const issueId = req.params["issueId"] as string;
  if (!issueId) throw new AppError("BAD_REQUEST", "issueId is required", 400);

  const { processAndStorePhoto } = await import("../adapters/storage.js");

  // Read raw body from buffer (req.body should be raw Buffer when content-type is image/*)
  const rawBuffer: Buffer = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(req.body as ArrayBuffer);

  if (!rawBuffer.length) {
    throw new AppError("BAD_REQUEST", "Request body is empty", 400);
  }

  // Get tenant from JWT or header
  const tenantId = req.user?.tid;
  if (!tenantId) {
    throw new AppError("UNAUTHORIZED", "Authentication required for photo upload", 401);
  }

  const result = await processAndStorePhoto(rawBuffer, tenantId, issueId);

  res.status(200).json({
    data: {
      key: result.key,
      blur_score: result.blurScore,
      mime: result.mime,
      size_bytes: result.sizeBytes,
      low_quality: result.blurScore < 100,
    },
  });
});

// ── POST /api/v1/issues/:publicId/confirm — "+1" reporter ───────────────────

issuesRouter.post("/:publicId/confirm", async (req: Request, res: Response) => {
  const publicId = req.params["publicId"] as string;
  if (!publicId) throw new AppError("BAD_REQUEST", "publicId is required", 400);

  const actor = actorFromReq(req);
  if (actor.userId === "anonymous") {
    throw new AppError("UNAUTHORIZED", "Authentication required to confirm an issue", 401);
  }

  const tenantId = req.user?.tid;
  if (!tenantId) throw new AppError("UNAUTHORIZED", "Missing tenant in token", 401);

  const repo = new IssueRepo(tenantId);
  const issue = await repo.addReporter(publicId, actor.userId);
  if (!issue) {
    throw new AppError(
      "NOT_FOUND",
      `Issue '${publicId}' not found or already confirmed by this user`,
      404
    );
  }

  await repo.appendAuditEvent({
    issueId: publicId,
    actor,
    event: "REPORTER_ADDED",
    payload: { reporterCount: issue.reporterIds.length },
  });

  res.status(200).json({
    data: {
      public_id: publicId,
      reporter_count: issue.reporterIds.length,
    },
  });
});

// ── POST /api/v1/issues/:publicId/transition — State machine ────────────────

const transitionSchema = z.object({
  to: z.string().min(1),
  note: z.string().max(2000).optional(),
  evidence_keys: z.array(z.string()).optional(),
  rejection_reason: z.string().max(500).optional(),
});

issuesRouter.post("/:publicId/transition", async (req: Request, res: Response) => {
  const publicId = req.params["publicId"] as string;
  if (!publicId) throw new AppError("BAD_REQUEST", "publicId is required", 400);

  const input = transitionSchema.parse(req.body);
  const actor = actorFromReq(req);
  if (actor.userId === "anonymous") {
    throw new AppError("UNAUTHORIZED", "Authentication required", 401);
  }

  const tenantId = req.user?.tid;
  if (!tenantId) throw new AppError("UNAUTHORIZED", "Missing tenant in token", 401);

  const repo = new IssueRepo(tenantId);
  const issue = await repo.findByPublicId(publicId);
  if (!issue) throw new AppError("NOT_FOUND", `Issue '${publicId}' not found`, 404);

  const guard = canTransition(issue.status, input.to, actor.role);
  if (!guard.allowed) {
    throw new AppError("TRANSITION_FORBIDDEN", guard.reason ?? "Transition not allowed", 422);
  }

  // Evidence required for resolving categories that mandate it
  if (input.to === "resolved" && issue.category?.evidenceRequired) {
    const evidenceKeys = input.evidence_keys ?? [];
    if (evidenceKeys.length === 0) {
      throw new AppError(
        "EVIDENCE_REQUIRED",
        "Resolution evidence is required for this category",
        422
      );
    }
  }

  const extra: Record<string, unknown> = {};
  if (input.to === "rejected" && input.rejection_reason) {
    extra["resolution"] = { note: input.rejection_reason };
  }
  if (input.to === "resolved") {
    extra["resolution"] = {
      note: input.note,
      evidence: input.evidence_keys ?? [],
      resolvedAt: new Date(),
      responseDeadline: new Date(Date.now() + 7 * 86_400_000),
    };
  }
  if (input.to === "closed") {
    extra["resolution.citizenResponse"] = "confirmed";
    extra["resolution.closedAt"] = new Date();
  }
  if (input.to === "reopened") {
    extra["resolution.citizenResponse"] = "disputed";
  }

  const updated = await repo.transition(publicId, input.to, extra as Partial<typeof issue>);

  await repo.appendAuditEvent({
    issueId: publicId,
    actor,
    event: "STATUS_CHANGED",
    payload: { from: issue.status, to: input.to, note: input.note },
  });

  res.status(200).json({
    data: { public_id: publicId, status: updated?.status },
  });
});

// ── POST /api/v1/issues/:publicId/merge — Staff merge duplicate ──────────────

const mergeSchema = z.object({
  primary_public_id: z.string().min(1),
});

issuesRouter.post("/:publicId/merge", async (req: Request, res: Response) => {
  const publicId = req.params["publicId"] as string;
  if (!publicId) throw new AppError("BAD_REQUEST", "publicId is required", 400);

  const input = mergeSchema.parse(req.body);
  const actor = actorFromReq(req);
  if ((ROLE_RANKS[actor.role] ?? 0) < ROLE_RANKS["dept_head"]!) {
    throw new AppError("FORBIDDEN", "Only dept_head or above can merge duplicates", 403);
  }

  const tenantId = req.user?.tid;
  if (!tenantId) throw new AppError("UNAUTHORIZED", "Missing tenant in token", 401);

  const repo = new IssueRepo(tenantId);
  const secondary = await repo.findByPublicId(publicId);
  const primary = await repo.findByPublicId(input.primary_public_id);
  if (!secondary || !primary) {
    throw new AppError("NOT_FOUND", "Issue not found in this tenant", 404);
  }

  await repo.mergeDuplicate(publicId, input.primary_public_id, actor.userId);

  await repo.appendAuditEvent({
    issueId: publicId,
    actor,
    event: "MERGED_AS_DUPLICATE",
    payload: { primaryId: input.primary_public_id },
  });

  res.status(200).json({ data: { merged: true } });
});

// ── POST /api/v1/issues/:publicId/unmerge ───────────────────────────────────

issuesRouter.post("/:publicId/unmerge", async (req: Request, res: Response) => {
  const publicId = req.params["publicId"] as string;
  if (!publicId) throw new AppError("BAD_REQUEST", "publicId is required", 400);

  const actor = actorFromReq(req);
  if ((ROLE_RANKS[actor.role] ?? 0) < ROLE_RANKS["dept_head"]!) {
    throw new AppError("FORBIDDEN", "Only dept_head or above can unmerge duplicates", 403);
  }

  const tenantId = req.user?.tid;
  if (!tenantId) throw new AppError("UNAUTHORIZED", "Missing tenant in token", 401);

  const repo = new IssueRepo(tenantId);
  const issue = await repo.findByPublicId(publicId);
  if (!issue?.duplicateOf) {
    throw new AppError("NOT_FOUND", "Issue is not currently marked as a duplicate", 404);
  }

  await repo.unmergeDuplicate(publicId, issue.duplicateOf);

  await repo.appendAuditEvent({
    issueId: publicId,
    actor,
    event: "UNMERGED",
    payload: { wasLinkedTo: issue.duplicateOf },
  });

  res.status(200).json({ data: { unmerged: true } });
});

// ── POST /api/v1/issues/:publicId/override-priority ─────────────────────────

const overrideSchema = z.object({
  score: z.number().min(0).max(100),
  reason: z.string().min(5).max(500),
});

issuesRouter.post("/:publicId/override-priority", async (req: Request, res: Response) => {
  const publicId = req.params["publicId"] as string;
  if (!publicId) throw new AppError("BAD_REQUEST", "publicId is required", 400);

  const input = overrideSchema.parse(req.body);
  const actor = actorFromReq(req);
  if ((ROLE_RANKS[actor.role] ?? 0) < ROLE_RANKS["dept_head"]!) {
    throw new AppError("FORBIDDEN", "Only dept_head or above can override priority", 403);
  }

  const tenantId = req.user?.tid;
  if (!tenantId) throw new AppError("UNAUTHORIZED", "Missing tenant in token", 401);

  const repo = new IssueRepo(tenantId);
  const updated = await repo.setOverride(publicId, {
    score: input.score,
    reason: input.reason,
    byUserId: actor.userId,
  });

  if (!updated) throw new AppError("NOT_FOUND", `Issue '${publicId}' not found`, 404);

  await repo.appendAuditEvent({
    issueId: publicId,
    actor,
    event: "PRIORITY_OVERRIDDEN",
    payload: { score: input.score, reason: input.reason },
  });

  res.status(200).json({
    data: {
      public_id: publicId,
      computed_score: updated.priority?.breakdown?.score,
      override_score: input.score,
      override_reason: input.reason,
    },
  });
});

// ── GET /api/v1/issues/:publicId/audit — Audit trail ────────────────────────

issuesRouter.get("/:publicId/audit", async (req: Request, res: Response) => {
  const publicId = req.params["publicId"] as string;
  if (!publicId) throw new AppError("BAD_REQUEST", "publicId is required", 400);

  const tenantId = req.user?.tid;
  if (!tenantId) throw new AppError("UNAUTHORIZED", "Authentication required", 401);

  const repo = new IssueRepo(tenantId);
  const issue = await repo.findByPublicId(publicId);
  if (!issue) throw new AppError("NOT_FOUND", `Issue '${publicId}' not found`, 404);

  const events = await repo.listAuditEvents(publicId);

  res.status(200).json({
    data: events.map((e) => ({
      seq: e.seq,
      event: e.event,
      actor: e.actor,
      payload: e.payload,
      at: e.createdAt,
    })),
  });
});

// ── POST /api/v1/issues/:publicId/route — Route to department ───────────────

const routeSchema = z.object({
  department_id: z.string().min(1),
});

issuesRouter.post("/:publicId/route", async (req: Request, res: Response) => {
  const publicId = req.params["publicId"] as string;
  if (!publicId) throw new AppError("BAD_REQUEST", "publicId is required", 400);

  const input = routeSchema.parse(req.body);
  const actor = actorFromReq(req);
  if ((ROLE_RANKS[actor.role] ?? 0) < ROLE_RANKS["staff"]!) {
    throw new AppError("FORBIDDEN", "Only staff or above can route issues", 403);
  }

  const tenantId = req.user?.tid;
  if (!tenantId) throw new AppError("UNAUTHORIZED", "Missing tenant in token", 401);

  const tenantDb = new TenantDb(tenantId);
  const dept = await tenantDb.getDepartment(input.department_id);
  if (!dept) {
    throw new AppError(
      "DEPARTMENT_NOT_FOUND",
      `Department '${input.department_id}' not found`,
      404
    );
  }

  const repo = new IssueRepo(tenantId);
  const issue = await repo.findByPublicId(publicId);
  if (!issue) throw new AppError("NOT_FOUND", `Issue '${publicId}' not found`, 404);

  const updated = await repo.routeDepartment(publicId, {
    id: dept.id,
    code: dept.code,
    name: dept.name,
  });

  await repo.appendAuditEvent({
    issueId: publicId,
    actor,
    event: "DEPARTMENT_ROUTED",
    payload: {
      fromDepartment: issue.department?.code,
      toDepartment: dept.code,
    },
  });

  res.status(200).json({
    data: {
      public_id: publicId,
      department: updated?.department,
    },
  });
});
