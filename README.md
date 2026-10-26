# Nivaran

Multi-tenant civic issue reporting platform for Indian municipalities. Citizens report civic issues (potholes, garbage, water leaks), and municipal staff triage, route, assign, resolve, and monitor them under strict SLAs with DPDP-compliant public metrics.

## Quickstart

```sh
make up && make migrate && make seed && make demo-flow
```

## URLs & Seeded Demo Logins

- Web app: http://localhost:5173 | API: http://localhost:4000 | Mailpit: http://localhost:8025
- All demo accounts use password: `Password123!` (development only)
  - Demo Punjab: `citizen@punjab.local`, `staff@punjab.local`, `depthead@punjab.local`, `admin@punjab.local`
  - Demo Maharashtra: `citizen@maharashtra.local`, `staff@maharashtra.local`, `depthead@maharashtra.local`, `admin@maharashtra.local`
  - Demo Tamil Nadu: `citizen@tamilnadu.local`, `staff@tamilnadu.local`, `depthead@tamilnadu.local`, `admin@tamilnadu.local`

## Architecture

- **Web (`apps/web`)**: React 18 + Vite PWA; localized citizen reporting, staff triage & public analytics dashboard.
- **API (`apps/api`)**: Node/Express; multi-tenant RLS, auth (Argon2, OTP, Google OAuth PKCE), rate limiting.
- **Worker (`apps/api/src/worker.ts`)**: BullMQ delayed jobs for SLA escalation tracking; non-blocking Nodemailer.
- **Databases**: PostgreSQL 17 + PostGIS (tenants, users, departments, wards, metrics fact), MongoDB 8 (issues & audit logs), Redis 7 (sessions, rate limits, queues).
- **Storage**: Local disk (`/data/uploads`) with sharp image striping, blur scoring & magic bytes validation.
- **Tenancy**: Row-level security (`tenant_id`) across all tables; tenant-scoped queries with zero cross-tenant leak.

## What is Built vs Not Built

- **Built**: P0 compose stack, B1 auth & tenancy, B1g Google sign-in, B2 issue engine & dedup, B3 web UI, B4 SLA engine, notifications (Mailpit/Mongo) & public DPDP metrics (<10 masked).
- **Not Built**: Real SMS gateway (mock OTP used), real GIS ward boundaries (synthetic grids used), production translations (en/hi/pa prototype translations only), AWS cloud deployment, and full AI categorization models (heuristic dedup & rule-based scoring used).

## Test & Verification

```sh
make lint          # ESLint, Prettier, ruff
make typecheck     # TypeScript strict check across workspaces
make test          # Vitest (124+ unit/integration tests) + pytest
make eval-dedup    # Duplicate detection precision & recall benchmark
make demo-flow     # End-to-end integration flow against running stack
```
