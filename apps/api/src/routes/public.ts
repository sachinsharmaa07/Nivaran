import { Router, type Request, type Response } from "express";
import { resolveLocale } from "@nivaran/shared";
import { PlatformDb } from "../db/platform-db.js";
import { TenantDb } from "../db/tenant-db.js";
import { AppError } from "../middleware/error-handler.js";

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
