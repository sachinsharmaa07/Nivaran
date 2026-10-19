import { z } from "zod";

export const NIVARAN_VERSION = "0.1.0";

// ── Roles & ULB Types ────────────────────────────────────────────────────────

export const ROLES = ["citizen", "staff", "dept_head", "tenant_admin", "platform_admin"] as const;
export type Role = (typeof ROLES)[number];

export const ULB_TYPES = [
  "municipal_corporation",
  "municipality",
  "nagar_panchayat",
  "other",
] as const;
export type UlbType = (typeof ULB_TYPES)[number];

// ── Phone normalizer ─────────────────────────────────────────────────────────

export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, "");
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }
  return cleaned;
}

export const phoneSchema = z
  .string()
  .transform(normalizePhone)
  .refine(
    (val) => /^\+[1-9]\d{9,14}$/.test(val),
    "Invalid phone number. Must be valid E.164 format (e.g. +919876543210)"
  );

// ── Auth Schemas ─────────────────────────────────────────────────────────────

export const registerSchema = z
  .object({
    tenantSlug: z.string().min(1, "Tenant slug is required"),
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email().optional(),
    phone: phoneSchema.optional(),
    password: z.string().min(8, "Password must be at least 8 characters"),
    locale: z.string().default("en"),
    consent: z.boolean().refine((val) => val, {
      message: "Consent to data processing is required",
    }),
  })
  .refine((data) => Boolean(data.email || data.phone), "Either email or phone must be provided");

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  identifier: z.string().min(1, "Email or phone is required"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const otpSendSchema = z.object({
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  phone: phoneSchema,
});

export const otpVerifySchema = z.object({
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  phone: phoneSchema,
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
});

// ── Tenant Onboarding Schema ─────────────────────────────────────────────────

// ── SLA Calendar Schema ───────────────────────────────────────────────────────

export const slaCalendarSchema = z.object({
  type: z.enum(["24x7", "business_hours", "custom"]).default("24x7"),
  working_days: z.array(z.number().min(0).max(6)).default([1, 2, 3, 4, 5]),
  start_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:MM format")
    .default("09:00"),
  end_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:MM format")
    .default("18:00"),
  timezone: z.string().default("Asia/Kolkata"),
});

export type SlaCalendar = z.infer<typeof slaCalendarSchema>;

export const tenantOnboardSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  state_code: z.string().length(2, "State code must be 2 characters (e.g. PB, MH)"),
  district: z.string().min(2, "District is required"),
  ulb_type: z.enum(ULB_TYPES),
  center: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
  }),
  default_locale: z.string().default("en"),
  enabled_locales: z.array(z.string()).default(["en"]),
  lgd_code: z.string().optional(),
  sla_calendar: slaCalendarSchema.optional(),
});

export type TenantOnboardInput = z.infer<typeof tenantOnboardSchema>;

// ── Admin CRUD Schemas ───────────────────────────────────────────────────────

export const departmentSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
});

export const departmentUpdateSchema = departmentSchema.partial();

export const wardSchema = z.object({
  ward_number: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  boundary: z
    .object({
      type: z.literal("Polygon"),
      coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
    })
    .optional(),
});

export const wardUpdateSchema = wardSchema.partial();

export const slaPolicySchema = z.object({
  name: z.string().min(1).max(255),
  respond_hours: z.number().int().positive(),
  resolve_hours: z.number().int().positive(),
  escalation_levels: z
    .array(
      z.object({
        at_percent: z.number().min(1).max(200),
        notify_role: z.string(),
      })
    )
    .default([]),
});

export const slaPolicyUpdateSchema = slaPolicySchema.partial();

export const categorySchema = z.object({
  code: z.string().min(1).max(50),
  names: z
    .record(z.string(), z.string())
    .refine(
      (names) => Object.keys(names).length > 0 && Boolean(names["en"]),
      "At least English name ('en') must be provided"
    ),
  department_id: z.string().uuid().optional().nullable(),
  sla_policy_id: z.string().uuid().optional().nullable(),
  dedup_radius_m: z.number().int().nonnegative().default(30),
  default_safety_risk: z.number().min(0).max(1).default(0.0),
  evidence_required: z.boolean().default(true),
  active: z.boolean().default(true),
});

export const categoryUpdateSchema = categorySchema.partial();

export const facilitySchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().min(1).max(50),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
  }),
});

export const facilityUpdateSchema = facilitySchema.partial();

// ── Error Format & Helpers ───────────────────────────────────────────────────

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: ApiErrorDetail[] | unknown;
  requestId: string;
}

export interface ApiErrorResponse {
  error: ApiError;
}

export function createErrorResponse(
  code: string,
  message: string,
  requestId: string,
  details?: ApiErrorDetail[] | unknown
): ApiErrorResponse {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      requestId,
    },
  };
}

// ── Locale Fallback Helper ───────────────────────────────────────────────────

export function resolveLocale(
  requestedLocale: string | undefined,
  enabledLocales: string[],
  defaultLocale: string
): string {
  if (!requestedLocale) return defaultLocale;
  const normalized = requestedLocale.toLowerCase();
  if (enabledLocales.map((l) => l.toLowerCase()).includes(normalized)) {
    return normalized;
  }
  // Try language prefix (e.g. en-US -> en)
  const langPrefix = normalized.split("-")[0];
  if (langPrefix && enabledLocales.map((l) => l.toLowerCase()).includes(langPrefix)) {
    return langPrefix;
  }
  return defaultLocale;
}

// ── India Additions: Issue Reporting, GPS & Priority Helpers ───────────────────

export const pincodeSchema = z
  .string()
  .regex(/^[1-9][0-9]{5}$/, "Pincode must be exactly 6 digits and cannot start with 0");

export const issueReportSchema = z.object({
  tenant_slug: z.string().min(1, "Tenant slug is required"),
  category_code: z.string().min(1, "Category is required"),
  description: z.string().min(5, "Description must be at least 5 characters").max(2000),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  landmark: z.string().max(255).optional(),
  pincode: pincodeSchema.optional(),
  evidence_keys: z.array(z.string()).default([]),
});

export type IssueReportInput = z.infer<typeof issueReportSchema>;

/**
 * Validates whether GPS coordinates fall within India's approximate geographic bounding box.
 * Mainland + islands: Lat ~ 6.5°N - 37.5°N, Lon ~ 68.0°E - 97.5°E
 */
export function isInsideIndia(lat: number, lon: number): boolean {
  return lat >= 6.5 && lat <= 37.5 && lon >= 68.0 && lon <= 97.5;
}

/**
 * Priority scoring reporters factor:
 * Counts distinct reporter accounts with a saturating curve (saturates asymptotically to 1.0).
 * With N=1 reporter, factor is 0. With N=5 reporters, factor is 0.5. With N large, approaches 1.0.
 * Formula: f(N) = (N - 1) / (N - 1 + K) for N >= 1, where K = saturationHalfPoint (default 4).
 */
export function calculateReportersFactor(
  uniqueReporterCount: number,
  saturationHalfPoint = 4
): number {
  if (uniqueReporterCount <= 1) return 0;
  const extraReporters = uniqueReporterCount - 1;
  return Math.min(1, Math.max(0, extraReporters / (extraReporters + saturationHalfPoint)));
}
