import { PlatformDb } from "./platform-db.js";
import { TenantDb } from "./tenant-db.js";
import { hashPassword } from "../auth/password.js";
import { generateSyntheticIssues } from "./synthetic.js";
import { closePools } from "./config.js";
import { connectMongo, disconnectMongo } from "./mongo.js";
import { seedPostsForTenants } from "./seed-posts.js";
import { Issue } from "./models/issue.model.js";
import { AuditEvent } from "./models/audit-event.model.js";
import { Counter } from "./models/counter.model.js";

// Category translations in en, hi, pa are unreviewed for prototype demo
const SEED_CATEGORIES = [
  {
    code: "pothole",
    names: {
      en: "Pothole",
      hi: "सड़क पर गड्ढा",
      pa: "ਸੜਕ ਤੇ ਟੋਆ",
    },
    dedup_radius_m: 25,
    default_safety_risk: 0.7,
  },
  {
    code: "garbage",
    names: {
      en: "Garbage Dump",
      hi: "कचरे का ढेर",
      pa: "ਕੂੜੇ ਦਾ ਢੇਰ",
    },
    dedup_radius_m: 40,
    default_safety_risk: 0.4,
  },
  {
    code: "streetlight",
    names: {
      en: "Broken Streetlight",
      hi: "खराब स्ट्रीटलाइट",
      pa: "ਖਰਾਬ ਸਟ੍ਰੀਟ ਲਾਈਟ",
    },
    dedup_radius_m: 15,
    default_safety_risk: 0.5,
  },
  {
    code: "water_leakage",
    names: {
      en: "Water Pipeline Leakage",
      hi: "पानी की पाइपलाइन का रिसाव",
      pa: "ਪਾਣੀ ਦੀ ਪਾਈਪ ਦਾ ਲੀਕੇਜ",
    },
    dedup_radius_m: 25,
    default_safety_risk: 0.3,
  },
  {
    code: "drainage",
    names: {
      en: "Drainage or Sewerage Overflow",
      hi: "जल निकासी या सीवर ओवरफ्लो",
      pa: "ਨਿਕਾਸੀ ਜਾਂ ਸੀਵਰੇਜ ਓਵਰਫਲੋ",
    },
    dedup_radius_m: 40,
    default_safety_risk: 0.6,
  },
  {
    code: "road_damage",
    names: {
      en: "Road Damage",
      hi: "सड़क का भारी नुकसान",
      pa: "ਸੜਕ ਦਾ ਨੁਕਸਾਨ",
    },
    dedup_radius_m: 30,
    default_safety_risk: 0.6,
  },
];

interface TenantConfigItem {
  name: string;
  slug: string;
  code: string;
  state_code: string;
  district: string;
  pincode: string;
  ulb_type: string;
  center: { lat: number; lon: number };
  default_locale: string;
  enabled_locales: string[];
  domainPrefix: string;
  phonePrefix: string;
}

const DEMO_PASSWORD = "Password123!"; // Fake password for seed data demo

async function seedShowcaseIncidentsForTenant(
  tenant: { id: string; code: string; slug: string; center: { lat: number; lon: number } },
  tenantDb: TenantDb,
  pincode: string
): Promise<void> {
  const wards = await tenantDb.listWards();
  const w01 = wards.find((w) => w.ward_number === "W01") ?? wards[0];
  const w02 = wards.find((w) => w.ward_number === "W02") ?? wards[0];
  const depts = await tenantDb.listDepartments();
  const roadsDept = depts.find((d) => d.code === "roads") ?? depts[0];
  const sanitationDept = depts.find((d) => d.code === "sanitation") ?? depts[0];
  const electricalDept = depts.find((d) => d.code === "electrical") ?? depts[0];

  const categories = await tenantDb.listCategories();
  const potholeCat = categories.find((c) => c.code === "pothole");
  const garbageCat = categories.find((c) => c.code === "garbage");
  const streetlightCat = categories.find((c) => c.code === "streetlight");

  const now = Date.now();

  const showcaseDefs = [
    {
      publicId: `NVR-${tenant.code}-000001`,
      status: "closed",
      category: potholeCat,
      dept: roadsDept,
      ward: w01,
      severity: 3,
      coords: [tenant.center.lon + 0.005, tenant.center.lat + 0.005] as [number, number],
      landmark: "Near Central Square & Clock Tower Junction",
      description:
        "Severe pothole cluster across the north junction causing traffic deceleration and two-wheeler skidding hazards during evening rush.",
      evidence: [
        {
          key: "pothole_initial_survey.jpg",
          takenAt: new Date(now - 3 * 86_400_000),
          blurScore: 0.12,
        },
        {
          key: "pothole_depth_marker.jpg",
          takenAt: new Date(now - 3 * 86_400_000),
          blurScore: 0.1,
        },
      ],
      score: 72,
      createdAt: new Date(now - 3 * 86_400_000),
      resolvedAt: new Date(now - 36 * 3_600_000),
      closedAt: new Date(now - 24 * 3_600_000),
      resolution: {
        note: "Pothole filled with high-grade hot mix bituminous asphalt, compacted with roller, and road marking reapplied.",
        evidence: ["pothole_repaired_surface_clean.jpg"],
        citizenResponse: "confirmed" as const,
        resolvedAt: new Date(now - 36 * 3_600_000),
        closedAt: new Date(now - 24 * 3_600_000),
      },
      reporterIds: [`citizen@${tenant.slug}.local`],
      auditSequence: [
        { event: "CREATED", role: "citizen", deltaHours: 0, payload: { channel: "web_portal" } },
        {
          event: "DEPARTMENT_ROUTED",
          role: "system",
          deltaHours: 0.1,
          payload: { departmentCode: "roads" },
        },
        {
          event: "ASSIGNED_TO_STAFF",
          role: "dept_head",
          deltaHours: 1.5,
          payload: { assignedTo: `staff@${tenant.slug}.local` },
        },
        {
          event: "STATUS_CHANGED",
          role: "staff",
          deltaHours: 2.0,
          payload: { from: "assigned", to: "in_progress" },
        },
        {
          event: "ISSUE_RESOLVED",
          role: "staff",
          deltaHours: 36,
          payload: { note: "Asphalt patch applied and compacted." },
        },
        {
          event: "CITIZEN_CONFIRMED",
          role: "citizen",
          deltaHours: 48,
          payload: { satisfaction: 5, comment: "Fixed properly, thank you!" },
        },
        {
          event: "ISSUE_CLOSED",
          role: "system",
          deltaHours: 48.1,
          payload: { reason: "citizen_confirmed" },
        },
      ],
    },
    {
      publicId: `NVR-${tenant.code}-000002`,
      status: "in_progress",
      category: garbageCat,
      dept: sanitationDept,
      ward: w02,
      severity: 3,
      coords: [tenant.center.lon + 0.012, tenant.center.lat + 0.008] as [number, number],
      landmark: "Behind Municipal Vegetable Market Complex",
      description:
        "Overflowing commercial garbage bin onto pedestrian pavement attracting stray cattle and blocking storm drain.",
      evidence: [
        {
          key: "garbage_overflow_bin_lane.jpg",
          takenAt: new Date(now - 14 * 3_600_000),
          blurScore: 0.08,
        },
      ],
      score: 65,
      createdAt: new Date(now - 14 * 3_600_000),
      resolvedAt: null,
      closedAt: null,
      resolution: undefined,
      reporterIds: [
        `citizen1@${tenant.slug}.local`,
        `citizen2@${tenant.slug}.local`,
        `citizen3@${tenant.slug}.local`,
      ],
      auditSequence: [
        { event: "CREATED", role: "citizen", deltaHours: 0, payload: { channel: "web_portal" } },
        { event: "UPVOTED", role: "citizen", deltaHours: 1.2, payload: { totalReporters: 2 } },
        { event: "UPVOTED", role: "citizen", deltaHours: 2.5, payload: { totalReporters: 3 } },
        {
          event: "DEPARTMENT_ROUTED",
          role: "system",
          deltaHours: 2.6,
          payload: { departmentCode: "sanitation" },
        },
        {
          event: "STATUS_CHANGED",
          role: "staff",
          deltaHours: 4.0,
          payload: { from: "submitted", to: "assigned" },
        },
        {
          event: "STATUS_CHANGED",
          role: "staff",
          deltaHours: 6.0,
          payload: { from: "assigned", to: "in_progress", note: "Compactor truck dispatched" },
        },
      ],
    },
    {
      publicId: `NVR-${tenant.code}-000003`,
      status: "submitted",
      category: streetlightCat,
      dept: electricalDept,
      ward: w01,
      severity: 2,
      coords: [tenant.center.lon + 0.008, tenant.center.lat + 0.014] as [number, number],
      landmark: "Opposite Senior Secondary School Gate 2",
      description:
        "Twin LED streetlights not functioning for 3 nights in a row, creating completely dark transit path for students.",
      evidence: [
        {
          key: "streetlight_dark_school_lane.jpg",
          takenAt: new Date(now - 4 * 3_600_000),
          blurScore: 0.15,
        },
      ],
      score: 42,
      createdAt: new Date(now - 4 * 3_600_000),
      resolvedAt: null,
      closedAt: null,
      resolution: undefined,
      reporterIds: [`citizen@${tenant.slug}.local`],
      auditSequence: [
        { event: "CREATED", role: "citizen", deltaHours: 0, payload: { channel: "web_portal" } },
        {
          event: "DEPARTMENT_ROUTED",
          role: "system",
          deltaHours: 0.2,
          payload: { departmentCode: "electrical" },
        },
      ],
    },
  ];

  await connectMongo();

  for (const item of showcaseDefs) {
    if (!item.category) continue;

    const existing = await Issue.findOne({ tenantId: tenant.id, publicId: item.publicId });
    const issueData = {
      tenantId: tenant.id,
      publicId: item.publicId,
      status: item.status,
      reporterId: item.reporterIds[0] ?? `citizen@${tenant.slug}.local`,
      reporterIds: item.reporterIds,
      location: {
        type: "Point" as const,
        coordinates: item.coords,
        accuracyM: 5,
        wardId: item.ward?.id,
      },
      landmark: item.landmark,
      pincode: pincode,
      description: item.description,
      severity: item.severity,
      category: {
        code: item.category.code,
        names: item.category.names,
        dedupRadiusM: item.category.dedup_radius_m,
        defaultSafetyRisk: item.category.default_safety_risk,
        evidenceRequired: item.category.evidence_required,
      },
      ...(item.dept && {
        department: {
          id: item.dept.id,
          code: item.dept.code,
          name: item.dept.name,
        },
      }),
      slaPolicy: {
        resolveHours: 72,
        respondHours: 24,
        resolveBy: new Date(item.createdAt.getTime() + 72 * 3_600_000),
        respondBy: new Date(item.createdAt.getTime() + 24 * 3_600_000),
      },
      evidence: item.evidence,
      priority: {
        breakdown: {
          score: item.score,
          safety: {
            raw: item.category.default_safety_risk,
            weight: 0.25,
            contribution: Math.round(item.score * 0.35),
          },
          severity: {
            raw: item.severity / 3,
            weight: 0.15,
            contribution: Math.round(item.score * 0.25),
          },
          facility: { raw: 0.5, weight: 0.15, contribution: Math.round(item.score * 0.15) },
          reporters: {
            raw: item.reporterIds.length / 3,
            weight: 0.1,
            contribution: Math.round(item.score * 0.1),
          },
          age: { raw: 0.2, weight: 0.1, contribution: Math.round(item.score * 0.05) },
          slaPressure: { raw: 0.5, weight: 0.25, contribution: Math.round(item.score * 0.1) },
          confidence: 1.0,
          configVersion: 1,
          computedAt: new Date(),
        },
      },
      ...(item.resolution && { resolution: item.resolution }),
      reopenCount: 0,
      createdAt: item.createdAt,
      updatedAt: item.closedAt ?? item.resolvedAt ?? item.createdAt,
      version: 1,
    };

    if (existing) {
      await Issue.updateOne({ tenantId: tenant.id, publicId: item.publicId }, { $set: issueData });
    } else {
      await Issue.create(issueData);
    }

    // Refresh audit trail if none exist for this issue
    const existingEvents = await AuditEvent.find({ tenantId: tenant.id, issueId: item.publicId });
    if (existingEvents.length === 0) {
      const maxAudit = await AuditEvent.findOne({ tenantId: tenant.id })
        .sort({ seq: -1 })
        .select("seq")
        .lean();
      let currentAuditSeq = (maxAudit as { seq?: number } | null)?.seq ?? 0;

      for (const step of item.auditSequence) {
        const eventTime = new Date(item.createdAt.getTime() + step.deltaHours * 3_600_000);
        currentAuditSeq++;
        await AuditEvent.create({
          tenantId: tenant.id,
          seq: currentAuditSeq,
          issueId: item.publicId,
          actor: {
            userId:
              step.role === "citizen"
                ? `citizen@${tenant.slug}.local`
                : `${step.role}@${tenant.slug}.local`,
            role: step.role,
          },
          event: step.event,
          payload: step.payload,
          createdAt: eventTime,
        });
      }
      await Counter.findOneAndUpdate(
        { tenantId: `audit_${tenant.id}` },
        { $set: { seq: currentAuditSeq } },
        { upsert: true }
      );
    }

    const resolutionHours = item.resolvedAt
      ? Math.round(((item.resolvedAt.getTime() - item.createdAt.getTime()) / 3_600_000) * 10) / 10
      : null;

    await tenantDb.recordIssueMetric({
      issue_id: item.publicId,
      status: item.status,
      category_code: item.category.code,
      department_id: item.dept?.id,
      ward_id: item.ward?.id,
      sla_breached: false,
      resolution_time_hours: resolutionHours ?? undefined,
      landmark: item.landmark,
      pincode: pincode,
      created_at: item.createdAt,
      resolved_at: item.resolvedAt ?? undefined,
      lon: item.coords[0],
      lat: item.coords[1],
    });
  }

  // Ensure atomic counter is at least 3
  await Counter.findOneAndUpdate({ tenantId: tenant.id }, { $max: { seq: 3 } }, { upsert: true });
}

export async function seedDatabase(options: { includeSynthetic?: boolean } = {}): Promise<void> {
  if (process.env["NODE_ENV"] === "production" && process.env["ALLOW_DEMO_SEED"] !== "true") {
    throw new Error(
      "SECURITY ERROR: Refusing to run demo seed with fake passwords in production! Use 'make seed-prod' instead."
    );
  }
  const includeSynthetic = options.includeSynthetic ?? process.env["NODE_ENV"] !== "test";
  const platformDb = new PlatformDb();

  // 3 Municipal Corporations in Punjab + 3 in Maharashtra + Tamil Nadu
  const tenantsConfig: TenantConfigItem[] = [
    // Punjab ULBs
    {
      name: "Municipal Corporation Amritsar",
      slug: "demo-punjab",
      code: "DPB",
      state_code: "PB",
      district: "Amritsar",
      pincode: "143001",
      ulb_type: "municipal_corporation",
      center: { lat: 31.634, lon: 74.8723 },
      default_locale: "en",
      enabled_locales: ["en", "hi", "pa"],
      domainPrefix: "punjab",
      phonePrefix: "+91981111111",
    },
    {
      name: "Municipal Corporation Ludhiana",
      slug: "mc-ludhiana",
      code: "LDH",
      state_code: "PB",
      district: "Ludhiana",
      pincode: "141001",
      ulb_type: "municipal_corporation",
      center: { lat: 30.901, lon: 75.8573 },
      default_locale: "pa",
      enabled_locales: ["en", "hi", "pa"],
      domainPrefix: "ludhiana",
      phonePrefix: "+91981122334",
    },
    {
      name: "Municipal Corporation Jalandhar",
      slug: "mc-jalandhar",
      code: "JAL",
      state_code: "PB",
      district: "Jalandhar",
      pincode: "144001",
      ulb_type: "municipal_corporation",
      center: { lat: 31.326, lon: 75.5762 },
      default_locale: "pa",
      enabled_locales: ["en", "hi", "pa"],
      domainPrefix: "jalandhar",
      phonePrefix: "+91981133445",
    },
    // Maharashtra ULBs
    {
      name: "Pune Municipal Corporation",
      slug: "demo-maharashtra",
      code: "DMH",
      state_code: "MH",
      district: "Pune",
      pincode: "411001",
      ulb_type: "municipal_corporation",
      center: { lat: 18.5204, lon: 73.8567 },
      default_locale: "en",
      enabled_locales: ["en", "hi"],
      domainPrefix: "maharashtra",
      phonePrefix: "+91982222222",
    },
    {
      name: "Brihanmumbai Municipal Corporation",
      slug: "mc-mumbai",
      code: "BMC",
      state_code: "MH",
      district: "Mumbai",
      pincode: "400001",
      ulb_type: "municipal_corporation",
      center: { lat: 19.076, lon: 72.8777 },
      default_locale: "en",
      enabled_locales: ["en", "hi"],
      domainPrefix: "mumbai",
      phonePrefix: "+91982233445",
    },
    {
      name: "Nagpur Municipal Corporation",
      slug: "mc-nagpur",
      code: "NMC",
      state_code: "MH",
      district: "Nagpur",
      pincode: "440001",
      ulb_type: "municipal_corporation",
      center: { lat: 21.1458, lon: 79.0882 },
      default_locale: "en",
      enabled_locales: ["en", "hi"],
      domainPrefix: "nagpur",
      phonePrefix: "+91982244556",
    },
    // Tamil Nadu
    {
      name: "Greater Chennai Corporation",
      slug: "demo-tamil-nadu",
      code: "DTN",
      state_code: "TN",
      district: "Chennai",
      pincode: "600001",
      ulb_type: "municipal_corporation",
      center: { lat: 13.0827, lon: 80.2707 },
      default_locale: "en",
      enabled_locales: ["en"],
      domainPrefix: "tamilnadu",
      phonePrefix: "+91983333333",
    },
  ];

  console.log("Seeding fake tenants and users...");
  const hashedPassword = await hashPassword(DEMO_PASSWORD);

  for (let i = 0; i < tenantsConfig.length; i++) {
    const cfg = tenantsConfig[i]!;

    // Check if tenant already exists by slug or name
    let tenant = await platformDb.getTenantBySlug(cfg.slug);
    if (!tenant) {
      tenant = await platformDb.getTenantBySlug(cfg.name.toLowerCase().replace(/\s+/g, "-"));
    }

    if (!tenant) {
      console.log(`Onboarding tenant: ${cfg.name} (${cfg.slug})`);
      const onboardResult = await platformDb.onboardTenant({
        name: cfg.name,
        slug: cfg.slug,
        code: cfg.code,
        state_code: cfg.state_code,
        district: cfg.district,
        ulb_type: cfg.ulb_type,
        center: cfg.center,
        default_locale: cfg.default_locale,
        enabled_locales: cfg.enabled_locales,
      });
      tenant = onboardResult.tenant;
    } else {
      // Update tenant metadata in case name, code or district updated
      await platformDb.updateTenant(tenant.id, {
        name: cfg.name,
        code: cfg.code,
        district: cfg.district,
        default_locale: cfg.default_locale,
        enabled_locales: cfg.enabled_locales,
        center: cfg.center,
      });
    }

    const tenantDb = new TenantDb(tenant.id);

    // 1. Seed 4 grid wards per tenant (2x2 grid around center)
    const delta = 0.02;
    for (let w = 1; w <= 4; w++) {
      const existingWard = await tenantDb.getWardByNumber(`W0${w}`);
      if (!existingWard) {
        const dx = (w % 2) * delta;
        const dy = Math.floor((w - 1) / 2) * delta;
        const minX = cfg.center.lon + dx;
        const minY = cfg.center.lat + dy;
        const maxX = minX + delta;
        const maxY = minY + delta;

        const polygon = {
          type: "Polygon",
          coordinates: [
            [
              [minX, minY],
              [maxX, minY],
              [maxX, maxY],
              [minX, maxY],
              [minX, minY],
            ],
          ],
        };

        try {
          await tenantDb.createWard({
            ward_number: `W0${w}`,
            name: `Ward ${w}`,
            boundary: polygon,
          });
        } catch {
          // ignore unique constraint conflict
        }
      }
    }

    // 2a. Seed SLA policy
    let slaPolicyId: string | undefined;
    const existingSlas = await tenantDb.listSlaPolicies();
    if (existingSlas.length > 0) {
      slaPolicyId = existingSlas[0]!.id;
    } else {
      const sla = await tenantDb.createSlaPolicy({
        name: "Standard 72h SLA",
        respond_hours: 24,
        resolve_hours: 72,
        escalation_levels: [
          { at_percent: 50, notify_role: "staff" },
          { at_percent: 100, notify_role: "dept_head" },
        ],
      });
      slaPolicyId = sla.id;
    }

    // 2b. Seed departments
    const deptCodes = [
      { code: "roads", name: "Roads & Infrastructure" },
      { code: "sanitation", name: "Solid Waste & Sanitation" },
      { code: "electrical", name: "Electrical & Street Lighting" },
      { code: "water", name: "Water Supply & Sewerage" },
    ];
    const deptMap = new Map<string, string>();
    const existingDepts = await tenantDb.listDepartments();
    for (const d of deptCodes) {
      const match = existingDepts.find((x) => x.code === d.code);
      if (match) {
        deptMap.set(d.code, match.id);
      } else {
        const created = await tenantDb.createDepartment(d);
        deptMap.set(d.code, created.id);
      }
    }

    const catToDept: Record<string, string> = {
      pothole: "roads",
      road_damage: "roads",
      garbage: "sanitation",
      streetlight: "electrical",
      water_leakage: "water",
      drainage: "water",
    };

    // 2c. Seed/update the 6 categories with translations, departments and SLAs
    for (const cat of SEED_CATEGORIES) {
      const deptId = deptMap.get(catToDept[cat.code] ?? "roads");
      const existing = await tenantDb.getCategoryByCode(cat.code);
      if (!existing) {
        await tenantDb.createCategory({
          code: cat.code,
          names: cat.names,
          department_id: deptId,
          sla_policy_id: slaPolicyId,
          dedup_radius_m: cat.dedup_radius_m,
          default_safety_risk: cat.default_safety_risk,
          evidence_required: true,
          active: true,
        });
      } else {
        await tenantDb.updateCategory(existing.id, {
          names: cat.names,
          department_id: deptId,
          sla_policy_id: slaPolicyId,
        });
      }
    }

    // 3. Seed users for each role (citizen, staff, dept_head, tenant_admin)
    const rolesToSeed: { role: string; suffix: string; num: string }[] = [
      { role: "citizen", suffix: "citizen", num: "1" },
      { role: "staff", suffix: "staff", num: "2" },
      { role: "dept_head", suffix: "depthead", num: "3" },
      { role: "tenant_admin", suffix: "admin", num: "4" },
    ];

    if (i === 0) {
      // Add platform_admin to first tenant for testing
      rolesToSeed.push({
        role: "platform_admin",
        suffix: "platform",
        num: "0",
      });
    }

    for (const r of rolesToSeed) {
      const email = `${r.suffix}@${cfg.domainPrefix}.local`;
      const phone = `${cfg.phonePrefix}${r.num}`;
      const existingUser = await tenantDb.findUserByIdentifier(email);

      if (!existingUser) {
        await tenantDb.createUser({
          name: `${cfg.name} ${r.role}`,
          email,
          phone,
          password_hash: hashedPassword,
          roles: [r.role],
          locale: cfg.default_locale,
          consent_at: new Date(),
        });
      }
    }

    // 4. Seed 3 proper showcase incidents per tenant with rich data, photos and audit events
    await seedShowcaseIncidentsForTenant(tenant, tenantDb, cfg.pincode);
  }

  if (includeSynthetic) {
    console.log("Seeding synthetic issues...");
    await generateSyntheticIssues();
  }

  console.log("Seeding civic updates & media...");
  await seedPostsForTenants();

  console.log("Seeding completed successfully.");
}

const isDirectRun =
  process.argv[1] && (process.argv[1].endsWith("seed.ts") || process.argv[1].endsWith("seed.js"));

if (isDirectRun) {
  seedDatabase()
    .then(async () => {
      await disconnectMongo();
      await closePools();
      process.exit(0);
    })
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
