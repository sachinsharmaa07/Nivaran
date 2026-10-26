/**
 * Public Metrics Endpoint Router — B4
 * Supports /api/v1/metrics/hotspots?tenant_id=... or ?tenant_slug=...
 */
import { Router, type Request, type Response } from "express";
import { PlatformDb } from "../db/platform-db.js";
import { AppError } from "../middleware/error-handler.js";
import { connectMongo } from "../db/mongo.js";
import { Issue } from "../db/models/issue.model.js";
import { computeHotspots } from "../domain/metrics.js";

export const metricsRouter: Router = Router();
const platformDb = new PlatformDb();

metricsRouter.get("/hotspots", async (req: Request, res: Response) => {
  const tenantId = req.query["tenant_id"] as string | undefined;
  const tenantSlug = req.query["tenant_slug"] as string | undefined;

  let tenant = null;
  if (tenantSlug) {
    tenant = await platformDb.getTenantBySlug(tenantSlug);
  } else if (tenantId) {
    tenant = await platformDb.getTenantById(tenantId);
  }

  if (!tenant) {
    throw new AppError("TENANT_NOT_FOUND", "Tenant not found", 404);
  }

  await connectMongo();
  const issues = await Issue.find({
    tenantId: tenant.id,
    "location.coordinates": { $exists: true },
  })
    .select({ "location.coordinates": 1, "category.code": 1 })
    .lean();

  const records: {
    lat?: number | null | undefined;
    lon?: number | null | undefined;
    category_code?: string | null | undefined;
  }[] = issues.map((i) => ({
    lat: i.location?.coordinates?.[1],
    lon: i.location?.coordinates?.[0],
    category_code: i.category?.code,
  }));

  const hotspots = computeHotspots(records);

  res.status(200).json({
    data: {
      tenant_slug: tenant.slug,
      tenant_id: tenant.id,
      cell_size_meters: 500,
      hotspots,
    },
  });
});
