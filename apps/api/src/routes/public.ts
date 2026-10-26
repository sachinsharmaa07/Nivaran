import { Router, type Request, type Response } from "express";
import { resolveLocale } from "@nivaran/shared";
import { PlatformDb } from "../db/platform-db.js";
import { TenantDb } from "../db/tenant-db.js";
import { AppError } from "../middleware/error-handler.js";
import { connectMongo } from "../db/mongo.js";
import { Issue } from "../db/models/issue.model.js";
import { computeCellMetrics, computeHotspots, type IssueMetricRecord } from "../domain/metrics.js";

export const publicRouter: Router = Router();
const platformDb = new PlatformDb();

function getParam(req: Request, key: string): string {
  const val = req.params[key];
  return Array.isArray(val) ? (val[0] ?? "") : (val ?? "");
}

// ── India Additions: Public State & Tenant Directory ─────────────────────────

publicRouter.get("/states", async (_req: Request, res: Response) => {
  const states = await platformDb.listStates();
  res.status(200).json({ data: states });
});

publicRouter.get("/tenants", async (req: Request, res: Response) => {
  const stateCode = req.query["state_code"] as string | undefined;
  const tenants = await platformDb.listTenants(stateCode);
  res.status(200).json({ data: tenants });
});

/**
 * Public state summary returning per-ULB open count, SLA compliance and median resolution.
 * Public data only, hiding any cell under 10 issues for privacy.
 */
publicRouter.get("/states/:code/summary", async (req: Request, res: Response) => {
  const code = getParam(req, "code").toUpperCase();
  const summary = await platformDb.getStateSummary(code);
  res.status(200).json({
    data: {
      state_code: code,
      ulbs: summary,
    },
  });
});

publicRouter.get("/:tenantSlug/info", async (req: Request, res: Response) => {
  const slug = getParam(req, "tenantSlug");
  const tenant = await platformDb.getTenantBySlug(slug);
  if (!tenant) {
    throw new AppError("TENANT_NOT_FOUND", "Tenant not found", 404);
  }
  res.status(200).json({ data: tenant });
});

publicRouter.get("/:tenantSlug/categories", async (req: Request, res: Response) => {
  const slug = getParam(req, "tenantSlug");
  const tenant = await platformDb.getTenantBySlug(slug);
  if (!tenant) {
    throw new AppError("TENANT_NOT_FOUND", "Tenant not found", 404);
  }

  const tenantDb = new TenantDb(tenant.id);
  const categories = await tenantDb.listCategories();

  // Resolve requested locale using fallback chain
  const requestedLocale =
    (req.query["locale"] as string) || req.headers["accept-language"]?.split(",")[0]?.trim();

  const activeLocale = resolveLocale(
    requestedLocale,
    tenant.enabled_locales,
    tenant.default_locale
  );

  const localizedCategories = categories
    .filter((c) => c.active)
    .map((c) => {
      const names = c.names;
      const localizedName =
        names[activeLocale] || names[tenant.default_locale] || names["en"] || c.code;

      return {
        id: c.id,
        code: c.code,
        name: localizedName,
        locale: activeLocale,
        names: c.names,
        dedup_radius_m: c.dedup_radius_m,
        default_safety_risk: c.default_safety_risk,
        evidence_required: c.evidence_required,
      };
    });

  res.status(200).json({
    data: {
      tenantSlug: tenant.slug,
      resolvedLocale: activeLocale,
      categories: localizedCategories,
    },
  });
});

// ── B4: Public Metrics & Hotspots Endpoints (Anonymous, Nearest-Rank, <10 Masked) ──

async function getTenantMetricRecords(tenantId: string): Promise<IssueMetricRecord[]> {
  await connectMongo();
  const mongoIssues = await Issue.find({ tenantId }).lean();

  const tenantDb = new TenantDb(tenantId);
  let pgFacts: Awaited<ReturnType<typeof tenantDb.getIssueMetricsFact>> = [];

  try {
    pgFacts = await tenantDb.getIssueMetricsFact();
  } catch {
    // ignore
  }

  const pgMap = new Map(pgFacts.map((f) => [f.issue_id, f]));
  const records: IssueMetricRecord[] = [];
  const processed = new Set<string>();

  for (const doc of mongoIssues) {
    processed.add(doc.publicId);
    const pg = pgMap.get(doc.publicId);

    const status = pg?.status ?? doc.status;
    const catCode = pg?.category_code ?? doc.category?.code;
    const deptId = pg?.department_id ?? doc.department?.id;
    const wardId = pg?.ward_id ?? doc.location?.wardId;

    let resHours = pg?.resolution_time_hours;
    if (resHours == null && doc.resolution?.resolvedAt && doc.createdAt) {
      resHours = Math.max(
        0.1,
        Number(
          (
            (new Date(doc.resolution.resolvedAt).getTime() - new Date(doc.createdAt).getTime()) /
            3_600_000
          ).toFixed(2)
        )
      );
    }

    let slaBreached = pg?.sla_breached;
    if (slaBreached == null && doc.slaPolicy?.resolveBy) {
      const finishTime = doc.resolution?.resolvedAt
        ? new Date(doc.resolution.resolvedAt).getTime()
        : Date.now();
      slaBreached = finishTime > new Date(doc.slaPolicy.resolveBy).getTime();
    }

    const lat = pg?.lat ?? doc.location?.coordinates?.[1];
    const lon = pg?.lon ?? doc.location?.coordinates?.[0];

    records.push({
      issue_id: doc.publicId,
      status,
      category_code: catCode,
      department_id: deptId,
      ward_id: wardId,
      sla_breached: slaBreached ?? false,
      resolution_time_hours: resHours ?? null,
      reopen_count: doc.reopenCount ?? 0,
      lat,
      lon,
      created_at: doc.createdAt,
      resolved_at: doc.resolution?.resolvedAt ?? pg?.resolved_at,
    });
  }

  for (const fact of pgFacts) {
    if (!processed.has(fact.issue_id)) {
      records.push({
        issue_id: fact.issue_id,
        status: fact.status,
        category_code: fact.category_code,
        department_id: fact.department_id,
        ward_id: fact.ward_id,
        sla_breached: fact.sla_breached,
        resolution_time_hours: fact.resolution_time_hours,
        lat: fact.lat,
        lon: fact.lon,
        created_at: fact.created_at,
        resolved_at: fact.resolved_at,
      });
    }
  }

  return records;
}

/**
 * GET /api/v1/public/:tenantSlug/metrics
 * Returns median, p90 (nearest-rank), SLA compliance, reopen rate, open count
 * by department and ward. Cells with < 10 issues return "insufficient".
 */
publicRouter.get("/:tenantSlug/metrics", async (req: Request, res: Response) => {
  const slug = getParam(req, "tenantSlug");
  const tenant = await platformDb.getTenantBySlug(slug);
  if (!tenant) {
    throw new AppError("TENANT_NOT_FOUND", "Tenant not found", 404);
  }

  const tenantDb = new TenantDb(tenant.id);
  const [departments, wards, records] = await Promise.all([
    tenantDb.listDepartments(),
    tenantDb.listWards(),
    getTenantMetricRecords(tenant.id),
  ]);

  const overall = computeCellMetrics(records);

  const byDepartment = departments.map((dept) => {
    const deptIssues = records.filter(
      (r) => r.department_id === dept.id || r.department_id === dept.code
    );
    return {
      department_id: dept.id,
      department_code: dept.code,
      department_name: dept.name,
      metrics: computeCellMetrics(deptIssues),
    };
  });

  const byWard = wards.map((w) => {
    const wardIssues = records.filter((r) => r.ward_id === w.id);
    return {
      ward_id: w.id,
      ward_number: w.ward_number,
      ward_name: w.name,
      metrics: computeCellMetrics(wardIssues),
    };
  });

  res.status(200).json({
    data: {
      tenant_slug: tenant.slug,
      tenant_name: tenant.name,
      overall,
      by_department: byDepartment,
      by_ward: byWard,
    },
  });
});

/**
 * GET /api/v1/public/:tenantSlug/hotspots
 * Returns ~500m spatial grid counts.
 * Anonymous: no personal data, no user IDs, no photos.
 */
publicRouter.get("/:tenantSlug/hotspots", async (req: Request, res: Response) => {
  const slug = getParam(req, "tenantSlug");
  const tenant = await platformDb.getTenantBySlug(slug);
  if (!tenant) {
    throw new AppError("TENANT_NOT_FOUND", "Tenant not found", 404);
  }

  const records = await getTenantMetricRecords(tenant.id);
  const hotspots = computeHotspots(records);

  res.status(200).json({
    data: {
      tenant_slug: tenant.slug,
      cell_size_meters: 500,
      hotspots,
    },
  });
});
