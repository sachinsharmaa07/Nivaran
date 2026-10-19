import { Router, type Request, type Response } from "express";
import { tenantOnboardSchema } from "@nivaran/shared";
import { PlatformDb } from "../db/platform-db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const platformRouter: Router = Router();
const platformDb = new PlatformDb();

/**
 * Tenant onboarding (platform_admin only).
 * Creates a tenant, clones category_templates, creates default SLA policy and priority config.
 * Works with zero ward data (service area defaults to 30 km circle around center).
 */
platformRouter.post(
  "/tenants",
  requireAuth,
  requireRole("platform_admin"),
  async (req: Request, res: Response) => {
    const input = tenantOnboardSchema.parse(req.body);
    const result = await platformDb.onboardTenant(input);

    res.status(201).json({
      data: {
        tenant: result.tenant,
        message: "Tenant onboarded successfully with default categories and policies",
        serviceAreaRadiusKm: 30,
      },
    });
  }
);

platformRouter.get(
  "/tenants",
  requireAuth,
  requireRole("platform_admin"),
  async (_req: Request, res: Response) => {
    const tenants = await platformDb.listTenants();
    res.status(200).json({ data: tenants });
  }
);

platformRouter.get("/states", async (_req: Request, res: Response) => {
  const states = await platformDb.listStates();
  res.status(200).json({ data: states });
});

platformRouter.get("/category-templates", async (_req: Request, res: Response) => {
  const templates = await platformDb.listCategoryTemplates();
  res.status(200).json({ data: templates });
});
