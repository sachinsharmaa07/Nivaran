import { randomBytes } from "node:crypto";
import { PlatformDb } from "./platform-db.js";
import { TenantDb } from "./tenant-db.js";
import { hashPassword } from "../auth/password.js";
import { closePools, getAppPool } from "./config.js";
import { disconnectMongo } from "./mongo.js";

/**
 * Production Database Seed
 * Loads national states and category templates (if not already present),
 * creates a platform tenant and exactly ONE platform administrator with
 * a securely generated random password printed once to stdout.
 *
 * Refuses to create demo users, synthetic data, or fake passwords.
 */
export async function seedProductionDatabase(): Promise<void> {
  const pool = getAppPool();
  const platformDb = new PlatformDb(pool);

  // 1. Verify / insert Indian states
  const states = await platformDb.listStates();
  if (states.length === 0) {
    console.log("Seeding states table...");
    await pool.query(`
      INSERT INTO states (code, name) VALUES
        ('AN', 'Andaman and Nicobar Islands'), ('AP', 'Andhra Pradesh'),
        ('AR', 'Arunachal Pradesh'), ('AS', 'Assam'), ('BR', 'Bihar'),
        ('CH', 'Chandigarh'), ('CG', 'Chhattisgarh'), ('DH', 'Dadra and Nagar Haveli and Daman and Diu'),
        ('DL', 'Delhi'), ('GA', 'Goa'), ('GJ', 'Gujarat'), ('HR', 'Haryana'),
        ('HP', 'Himachal Pradesh'), ('JK', 'Jammu and Kashmir'), ('JH', 'Jharkhand'),
        ('KA', 'Karnataka'), ('KL', 'Kerala'), ('LA', 'Ladakh'), ('LD', 'Lakshadweep'),
        ('MP', 'Madhya Pradesh'), ('MH', 'Maharashtra'), ('MN', 'Manipur'),
        ('ML', 'Meghalaya'), ('MZ', 'Mizoram'), ('NL', 'Nagaland'), ('OD', 'Odisha'),
        ('PY', 'Puducherry'), ('PB', 'Punjab'), ('RJ', 'Rajasthan'), ('SK', 'Sikkim'),
        ('TN', 'Tamil Nadu'), ('TS', 'Telangana'), ('TR', 'Tripura'), ('UP', 'Uttar Pradesh'),
        ('UK', 'Uttarakhand'), ('WB', 'West Bengal')
      ON CONFLICT (code) DO NOTHING;
    `);
  }

  // 2. Verify category templates
  const templates = await platformDb.listCategoryTemplates();
  if (templates.length === 0) {
    console.log("Seeding category templates...");
    await pool.query(`
      INSERT INTO category_templates (code, names, default_sla_hours, dedup_radius_m, default_safety_risk, evidence_required) VALUES
        ('pothole', '{"en": "Pothole", "hi": "गड्ढा", "pa": "ਟੋਆ"}'::jsonb, 48, 25, 0.7, true),
        ('garbage', '{"en": "Garbage Dump", "hi": "कचरे का ढेर", "pa": "ਕੂੜੇ ਦਾ ਢੇਰ"}'::jsonb, 24, 40, 0.4, true),
        ('streetlight', '{"en": "Broken Streetlight", "hi": "खराब स्ट्रीटलाइट", "pa": "ਖਰਾਬ ਸਟ੍ਰੀਟ ਲਾਈਟ"}'::jsonb, 48, 15, 0.5, true),
        ('water_leakage', '{"en": "Water Leakage", "hi": "पानी का रिसाव", "pa": "ਪਾਣੀ ਦਾ ਲੀਕੇਜ"}'::jsonb, 24, 25, 0.3, true),
        ('drainage', '{"en": "Drainage or Sewerage", "hi": "जल निकासी या सीवेज", "pa": "ਨਿਕਾਸੀ ਜਾਂ ਸੀਵਰੇਜ"}'::jsonb, 36, 40, 0.6, true),
        ('road_damage', '{"en": "Road Damage", "hi": "सड़क की खराबी", "pa": "ਸੜਕ ਦਾ ਨੁਕਸਾਨ"}'::jsonb, 72, 30, 0.6, true),
        ('other', '{"en": "Other Civic Issue", "hi": "अन्य नागरिक समस्या", "pa": "ਹੋਰ ਨਾਗਰਿਕ ਮੁੱਦਾ"}'::jsonb, 72, 30, 0.2, false)
      ON CONFLICT (code) DO NOTHING;
    `);
  }

  // 3. Ensure Platform Tenant exists
  const platformTenantSlug = "platform";
  let platformTenant = await platformDb.getTenantBySlug(platformTenantSlug);

  if (!platformTenant) {
    console.log("Creating Platform Administration tenant...");
    const client = await pool.connect();
    try {
      const res = await client.query(
        `INSERT INTO tenants (slug, code, name, ulb_type, state_code, district, center, default_locale, enabled_locales, sla_calendar)
         VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326), $9, $10, $11)
         ON CONFLICT (slug) DO UPDATE SET updated_at = NOW()
         RETURNING id, slug, code, name, ulb_type, state_code, district, lgd_code,
                   json_build_object('lat', ST_Y(center::geometry), 'lon', ST_X(center::geometry)) AS center,
                   default_locale, enabled_locales, timezone, status, sla_calendar, created_at, updated_at`,
        [
          platformTenantSlug,
          "PLAT",
          "CivicPulse Platform Administration",
          "other",
          "DL",
          "New Delhi",
          77.209,
          28.6139,
          "en",
          ["en", "hi", "pa"],
          JSON.stringify({ type: "24x7" }),
        ]
      );
      platformTenant = res.rows[0];
    } finally {
      client.release();
    }
  }

  if (!platformTenant) {
    throw new Error("Failed to initialize platform tenant");
  }

  // 4. Create one Platform Admin with a cryptographically secure random password
  const tenantDb = new TenantDb(platformTenant.id);
  const adminEmail = process.env["PLATFORM_ADMIN_EMAIL"] || "admin@nivaran.gov.in";
  const existingAdmin = await tenantDb.findUserByIdentifier(adminEmail);

  if (existingAdmin) {
    console.log(`Platform admin '${adminEmail}' already exists. Skipping user creation.`);
    return;
  }

  const generatedPassword = randomBytes(16).toString("base64url");
  const hashedPassword = await hashPassword(generatedPassword);

  await tenantDb.createUser({
    name: "Platform Administrator",
    email: adminEmail,
    password_hash: hashedPassword,
    roles: ["platform_admin"],
    locale: "en",
    consent_at: new Date(),
  });

  console.log("\n======================================================================");
  console.log("  NIVARAN PRODUCTION SEED COMPLETED");
  console.log("======================================================================");
  console.log(`Platform Tenant: ${platformTenant.slug}`);
  console.log(`Admin Email:     ${adminEmail}`);
  console.log(`Password:        ${generatedPassword}`);
  console.log("----------------------------------------------------------------------");
  console.log("Save these credentials securely. The password will NOT be shown again.");
  console.log("======================================================================\n");
}

// Allow standalone execution
if (import.meta.url === `file://${process.argv[1]}`) {
  seedProductionDatabase()
    .then(async () => {
      await closePools();
      await disconnectMongo();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("Production seed failed:", err);
      await closePools();
      await disconnectMongo();
      process.exit(1);
    });
}
