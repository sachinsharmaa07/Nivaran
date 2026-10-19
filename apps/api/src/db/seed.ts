import { PlatformDb } from "./platform-db.js";
import { TenantDb } from "./tenant-db.js";
import { hashPassword } from "../auth/password.js";

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

const DEMO_PASSWORD = "Password123!"; // Fake password for seed data demo

export async function seedDatabase(): Promise<void> {
  const platformDb = new PlatformDb();

  const tenantsConfig = [
    {
      name: "Demo Punjab",
      state_code: "PB",
      district: "Amritsar",
      ulb_type: "municipal_corporation",
      center: { lat: 31.634, lon: 74.8723 },
      default_locale: "en",
      enabled_locales: ["en", "hi", "pa"],
      domainPrefix: "punjab",
      phonePrefix: "+91981111111",
    },
    {
      name: "Demo Maharashtra",
      state_code: "MH",
      district: "Pune",
      ulb_type: "municipal_corporation",
      center: { lat: 18.5204, lon: 73.8567 },
      default_locale: "en",
      enabled_locales: ["en", "hi"],
      domainPrefix: "maharashtra",
      phonePrefix: "+91982222222",
    },
    {
      name: "Demo Tamil Nadu",
      state_code: "TN",
      district: "Chennai",
      ulb_type: "municipal_corporation",
      center: { lat: 13.0827, lon: 80.2707 },
      default_locale: "en",
      enabled_locales: ["en"], // en only to prove fallback
      domainPrefix: "tamilnadu",
      phonePrefix: "+91983333333",
    },
  ];

  console.log("Seeding fake tenants and users...");
  const hashedPassword = await hashPassword(DEMO_PASSWORD);

  for (let i = 0; i < tenantsConfig.length; i++) {
    const cfg = tenantsConfig[i]!;

    // Check if tenant already exists
    let tenant = await platformDb.getTenantBySlug(cfg.name.toLowerCase().replace(/\s+/g, "-"));

    if (!tenant) {
      console.log(`Onboarding tenant: ${cfg.name}`);
      const onboardResult = await platformDb.onboardTenant({
        name: cfg.name,
        state_code: cfg.state_code,
        district: cfg.district,
        ulb_type: cfg.ulb_type,
        center: cfg.center,
        default_locale: cfg.default_locale,
        enabled_locales: cfg.enabled_locales,
      });
      tenant = onboardResult.tenant;
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

    // 2. Seed/update the 6 categories with translations
    for (const cat of SEED_CATEGORIES) {
      const existing = await tenantDb.getCategoryByCode(cat.code);
      if (!existing) {
        await tenantDb.createCategory({
          code: cat.code,
          names: cat.names,
          dedup_radius_m: cat.dedup_radius_m,
          default_safety_risk: cat.default_safety_risk,
          evidence_required: true,
          active: true,
        });
      } else {
        await tenantDb.updateCategory(existing.id, {
          names: cat.names,
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
  }

  console.log("Seeding completed successfully.");
}

const isDirectRun =
  process.argv[1] && (process.argv[1].endsWith("seed.ts") || process.argv[1].endsWith("seed.js"));

if (isDirectRun) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
