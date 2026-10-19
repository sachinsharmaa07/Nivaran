import { Router, type Request, type Response } from "express";
import {
  departmentSchema,
  departmentUpdateSchema,
  wardSchema,
  wardUpdateSchema,
  categorySchema,
  categoryUpdateSchema,
  slaPolicySchema,
  slaPolicyUpdateSchema,
  facilitySchema,
  facilityUpdateSchema,
  slaCalendarSchema,
} from "@nivaran/shared";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";

export const adminRouter: Router = Router();

// Every admin route requires tenant_admin role and an attached tenantDb
adminRouter.use(requireAuth, requireRole("tenant_admin"));

function getDb(req: Request) {
  if (!req.tenantDb) {
    throw new AppError("UNAUTHORIZED", "Tenant database context missing", 401);
  }
  return req.tenantDb;
}

function getId(req: Request): string {
  const val = req.params["id"];
  return Array.isArray(val) ? (val[0] ?? "") : (val ?? "");
}

// ── Departments CRUD ─────────────────────────────────────────────────────────

adminRouter.get("/departments", async (req: Request, res: Response) => {
  const departments = await getDb(req).listDepartments();
  res.status(200).json({ data: departments });
});

adminRouter.post("/departments", async (req: Request, res: Response) => {
  const input = departmentSchema.parse(req.body);
  const created = await getDb(req).createDepartment(input);
  res.status(201).json({ data: created });
});

adminRouter.get("/departments/:id", async (req: Request, res: Response) => {
  const dept = await getDb(req).getDepartment(getId(req));
  if (!dept) {
    throw new AppError("NOT_FOUND", "Department not found in this tenant", 404);
  }
  res.status(200).json({ data: dept });
});

adminRouter.put("/departments/:id", async (req: Request, res: Response) => {
  const input = departmentUpdateSchema.parse(req.body);
  const updated = await getDb(req).updateDepartment(getId(req), input);
  if (!updated) {
    throw new AppError("NOT_FOUND", "Department not found in this tenant", 404);
  }
  res.status(200).json({ data: updated });
});

adminRouter.delete("/departments/:id", async (req: Request, res: Response) => {
  const deleted = await getDb(req).deleteDepartment(getId(req));
  if (!deleted) {
    throw new AppError("NOT_FOUND", "Department not found in this tenant", 404);
  }
  res.status(200).json({ data: { message: "Department deleted successfully" } });
});

// ── Wards CRUD (GeoJSON polygon) ─────────────────────────────────────────────

adminRouter.get("/wards", async (req: Request, res: Response) => {
  const wards = await getDb(req).listWards();
  res.status(200).json({ data: wards });
});

adminRouter.post("/wards", async (req: Request, res: Response) => {
  const input = wardSchema.parse(req.body);
  const created = await getDb(req).createWard({
    ward_number: input.ward_number,
    name: input.name,
    boundary: input.boundary,
  });
  res.status(201).json({ data: created });
});

adminRouter.get("/wards/:id", async (req: Request, res: Response) => {
  const ward = await getDb(req).getWard(getId(req));
  if (!ward) {
    throw new AppError("NOT_FOUND", "Ward not found in this tenant", 404);
  }
  res.status(200).json({ data: ward });
});

adminRouter.put("/wards/:id", async (req: Request, res: Response) => {
  const input = wardUpdateSchema.parse(req.body);
  const updated = await getDb(req).updateWard(getId(req), {
    ward_number: input.ward_number,
    name: input.name,
    boundary: input.boundary,
  });
  if (!updated) {
    throw new AppError("NOT_FOUND", "Ward not found in this tenant", 404);
  }
  res.status(200).json({ data: updated });
});

adminRouter.delete("/wards/:id", async (req: Request, res: Response) => {
  const deleted = await getDb(req).deleteWard(getId(req));
  if (!deleted) {
    throw new AppError("NOT_FOUND", "Ward not found in this tenant", 404);
  }
  res.status(200).json({ data: { message: "Ward deleted successfully" } });
});

// ── Categories CRUD (jsonb locale map) ───────────────────────────────────────

adminRouter.get("/categories", async (req: Request, res: Response) => {
  const categories = await getDb(req).listCategories();
  res.status(200).json({ data: categories });
});

adminRouter.post("/categories", async (req: Request, res: Response) => {
  const input = categorySchema.parse(req.body);
  const created = await getDb(req).createCategory({
    code: input.code,
    names: input.names,
    department_id: input.department_id,
    sla_policy_id: input.sla_policy_id,
    dedup_radius_m: input.dedup_radius_m,
    default_safety_risk: input.default_safety_risk,
    evidence_required: input.evidence_required,
    active: input.active,
  });
  res.status(201).json({ data: created });
});

adminRouter.get("/categories/:id", async (req: Request, res: Response) => {
  const category = await getDb(req).getCategory(getId(req));
  if (!category) {
    throw new AppError("NOT_FOUND", "Category not found in this tenant", 404);
  }
  res.status(200).json({ data: category });
});

adminRouter.put("/categories/:id", async (req: Request, res: Response) => {
  const input = categoryUpdateSchema.parse(req.body);
  const updated = await getDb(req).updateCategory(getId(req), input);
  if (!updated) {
    throw new AppError("NOT_FOUND", "Category not found in this tenant", 404);
  }
  res.status(200).json({ data: updated });
});

adminRouter.delete("/categories/:id", async (req: Request, res: Response) => {
  const deleted = await getDb(req).deleteCategory(getId(req));
  if (!deleted) {
    throw new AppError("NOT_FOUND", "Category not found in this tenant", 404);
  }
  res.status(200).json({ data: { message: "Category deleted successfully" } });
});

// ── SLA Policies CRUD ────────────────────────────────────────────────────────

adminRouter.get("/sla-policies", async (req: Request, res: Response) => {
  const policies = await getDb(req).listSlaPolicies();
  res.status(200).json({ data: policies });
});

adminRouter.post("/sla-policies", async (req: Request, res: Response) => {
  const input = slaPolicySchema.parse(req.body);
  const created = await getDb(req).createSlaPolicy(input);
  res.status(201).json({ data: created });
});

adminRouter.get("/sla-policies/:id", async (req: Request, res: Response) => {
  const policy = await getDb(req).getSlaPolicy(getId(req));
  if (!policy) {
    throw new AppError("NOT_FOUND", "SLA Policy not found in this tenant", 404);
  }
  res.status(200).json({ data: policy });
});

adminRouter.put("/sla-policies/:id", async (req: Request, res: Response) => {
  const input = slaPolicyUpdateSchema.parse(req.body);
  const updated = await getDb(req).updateSlaPolicy(getId(req), input);
  if (!updated) {
    throw new AppError("NOT_FOUND", "SLA Policy not found in this tenant", 404);
  }
  res.status(200).json({ data: updated });
});

adminRouter.delete("/sla-policies/:id", async (req: Request, res: Response) => {
  const deleted = await getDb(req).deleteSlaPolicy(getId(req));
  if (!deleted) {
    throw new AppError("NOT_FOUND", "SLA Policy not found in this tenant", 404);
  }
  res.status(200).json({ data: { message: "SLA Policy deleted successfully" } });
});

// ── Facilities CRUD ──────────────────────────────────────────────────────────

adminRouter.get("/facilities", async (req: Request, res: Response) => {
  const facilities = await getDb(req).listFacilities();
  res.status(200).json({ data: facilities });
});

adminRouter.post("/facilities", async (req: Request, res: Response) => {
  const input = facilitySchema.parse(req.body);
  const created = await getDb(req).createFacility(input);
  res.status(201).json({ data: created });
});

adminRouter.get("/facilities/:id", async (req: Request, res: Response) => {
  const facility = await getDb(req).getFacility(getId(req));
  if (!facility) {
    throw new AppError("NOT_FOUND", "Facility not found in this tenant", 404);
  }
  res.status(200).json({ data: facility });
});

adminRouter.put("/facilities/:id", async (req: Request, res: Response) => {
  const input = facilityUpdateSchema.parse(req.body);
  const updated = await getDb(req).updateFacility(getId(req), input);
  if (!updated) {
    throw new AppError("NOT_FOUND", "Facility not found in this tenant", 404);
  }
  res.status(200).json({ data: updated });
});

adminRouter.delete("/facilities/:id", async (req: Request, res: Response) => {
  const deleted = await getDb(req).deleteFacility(getId(req));
  if (!deleted) {
    throw new AppError("NOT_FOUND", "Facility not found in this tenant", 404);
  }
  res.status(200).json({ data: { message: "Facility deleted successfully" } });
});

// ── SLA Calendar Config ──────────────────────────────────────────────────────

adminRouter.get("/sla-calendar", async (req: Request, res: Response) => {
  const calendar = await getDb(req).getSlaCalendar();
  res.status(200).json({ data: calendar });
});

adminRouter.put("/sla-calendar", async (req: Request, res: Response) => {
  const input = slaCalendarSchema.parse(req.body);
  const updated = await getDb(req).updateSlaCalendar(input);
  res.status(200).json({ data: updated });
});
