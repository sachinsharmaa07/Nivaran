-- PostgreSQL init: create app role and grant schema access.
-- Migration runs as nivaran_owner; API connects as nivaran_app (no BYPASSRLS).

CREATE USER nivaran_app WITH PASSWORD 'nivaran_app_pass';
GRANT CONNECT ON DATABASE nivaran TO nivaran_app;
GRANT USAGE ON SCHEMA public TO nivaran_app;

-- Future migrations will grant table-level and RLS policies.
-- Roles are created idempotently; this script runs once on first start.
