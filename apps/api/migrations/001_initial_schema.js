/**
 * Initial Nivaran schema
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export async function up(pgm) {
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS "postgis";`);

  // 1. States and Union Territories (36 total)
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS states (
      code VARCHAR(2) PRIMARY KEY,
      name VARCHAR(100) NOT NULL
    );

    INSERT INTO states (code, name) VALUES
      ('AN', 'Andaman and Nicobar Islands'),
      ('AP', 'Andhra Pradesh'),
      ('AR', 'Arunachal Pradesh'),
      ('AS', 'Assam'),
      ('BR', 'Bihar'),
      ('CH', 'Chandigarh'),
      ('CG', 'Chhattisgarh'),
      ('DN', 'Dadra and Nagar Haveli and Daman and Diu'),
      ('DL', 'Delhi'),
      ('GA', 'Goa'),
      ('GJ', 'Gujarat'),
      ('HR', 'Haryana'),
      ('HP', 'Himachal Pradesh'),
      ('JK', 'Jammu and Kashmir'),
      ('JH', 'Jharkhand'),
      ('KA', 'Karnataka'),
      ('KL', 'Kerala'),
      ('LA', 'Ladakh'),
      ('LD', 'Lakshadweep'),
      ('MP', 'Madhya Pradesh'),
      ('MH', 'Maharashtra'),
      ('MN', 'Manipur'),
      ('ML', 'Meghalaya'),
      ('MZ', 'Mizoram'),
      ('NL', 'Nagaland'),
      ('OD', 'Odisha'),
      ('PY', 'Puducherry'),
      ('PB', 'Punjab'),
      ('RJ', 'Rajasthan'),
      ('SK', 'Sikkim'),
      ('TN', 'Tamil Nadu'),
      ('TS', 'Telangana'),
      ('TR', 'Tripura'),
      ('UP', 'Uttar Pradesh'),
      ('UK', 'Uttarakhand'),
      ('WB', 'West Bengal')
    ON CONFLICT (code) DO NOTHING;
  `);

  // 2. Category Templates (National defaults: pothole, garbage, streetlight, water leakage, drainage or sewerage, road damage, other)
  // Translations in en, hi, pa are unreviewed for prototype demo
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS category_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(50) UNIQUE NOT NULL,
      names JSONB NOT NULL,
      default_sla_hours INTEGER NOT NULL,
      dedup_radius_m INTEGER NOT NULL,
      default_safety_risk DOUBLE PRECISION NOT NULL DEFAULT 0.0,
      evidence_required BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

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

  // 3. Tenants table
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug VARCHAR(50) UNIQUE NOT NULL,
      code VARCHAR(10) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      ulb_type VARCHAR(50) NOT NULL CHECK (ulb_type IN ('municipal_corporation', 'municipality', 'nagar_panchayat', 'other')),
      state_code VARCHAR(2) NOT NULL REFERENCES states(code),
      district VARCHAR(100) NOT NULL,
      lgd_code VARCHAR(50),
      center GEOMETRY(Point, 4326) NOT NULL,
      default_locale VARCHAR(10) NOT NULL DEFAULT 'en',
      enabled_locales TEXT[] NOT NULL DEFAULT '{"en"}',
      timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
    CREATE INDEX IF NOT EXISTS idx_tenants_code ON tenants(code);
  `);

  // 4. Users table (roles citizen|staff|dept_head|tenant_admin|platform_admin)
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      roles TEXT[] NOT NULL DEFAULT '{"citizen"}',
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(20),
      password_hash TEXT NOT NULL,
      locale VARCHAR(10) NOT NULL DEFAULT 'en',
      consent_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_user_email_or_phone CHECK (email IS NOT NULL OR phone IS NOT NULL)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_email ON users(tenant_id, LOWER(email)) WHERE email IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_phone ON users(tenant_id, phone) WHERE phone IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
  `);

  // 5. Refresh tokens table (with family tracking for rotation)
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      family_id UUID NOT NULL,
      is_revoked BOOLEAN NOT NULL DEFAULT false,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_tenant_user ON refresh_tokens(tenant_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);
  `);

  // 6. Departments table
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS departments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      code VARCHAR(50) NOT NULL,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_departments_tenant_code UNIQUE(tenant_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_departments_tenant_id ON departments(tenant_id);
  `);

  // 7. Wards table (boundary polygon optional)
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS wards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      ward_number VARCHAR(50) NOT NULL,
      name VARCHAR(255) NOT NULL,
      boundary GEOMETRY(Geometry, 4326),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_wards_tenant_number UNIQUE(tenant_id, ward_number)
    );
    CREATE INDEX IF NOT EXISTS idx_wards_tenant_id ON wards(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_wards_boundary ON wards USING GIST(boundary);
  `);

  // 8. SLA Policies table
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS sla_policies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      respond_hours INTEGER NOT NULL,
      resolve_hours INTEGER NOT NULL,
      escalation_levels JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_sla_policies_tenant_id ON sla_policies(tenant_id);
  `);

  // 9. Categories table (names as jsonb locale map)
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      code VARCHAR(50) NOT NULL,
      names JSONB NOT NULL,
      department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
      sla_policy_id UUID REFERENCES sla_policies(id) ON DELETE SET NULL,
      dedup_radius_m INTEGER NOT NULL DEFAULT 30,
      default_safety_risk DOUBLE PRECISION NOT NULL DEFAULT 0.0,
      evidence_required BOOLEAN NOT NULL DEFAULT true,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_categories_tenant_code UNIQUE(tenant_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_categories_tenant_id ON categories(tenant_id);
  `);

  // 10. Priority configs table
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS priority_configs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      version INTEGER NOT NULL DEFAULT 1,
      weights JSONB NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_priority_configs_tenant_id ON priority_configs(tenant_id);
  `);

  // 11. Facilities table (with location point)
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS facilities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL,
      location GEOMETRY(Point, 4326) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_facilities_tenant_id ON facilities(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_facilities_location ON facilities USING GIST(location);
  `);

  // Grant privileges to nivaran_app
  pgm.sql(`
    GRANT USAGE ON SCHEMA public TO nivaran_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nivaran_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nivaran_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nivaran_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO nivaran_app;
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP TABLE IF EXISTS facilities CASCADE;
    DROP TABLE IF EXISTS priority_configs CASCADE;
    DROP TABLE IF EXISTS categories CASCADE;
    DROP TABLE IF EXISTS sla_policies CASCADE;
    DROP TABLE IF EXISTS wards CASCADE;
    DROP TABLE IF EXISTS departments CASCADE;
    DROP TABLE IF EXISTS refresh_tokens CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP TABLE IF EXISTS tenants CASCADE;
    DROP TABLE IF EXISTS category_templates CASCADE;
    DROP TABLE IF EXISTS states CASCADE;
  `);
}
