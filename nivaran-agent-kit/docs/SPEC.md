# SPEC: Nivaran

Authoritative requirements. Agents never invent anything missing here: ask, or record a labelled assumption in PROGRESS.md. `[A]` marks an assumption (a starting default to be tuned or confirmed).

## 1. Product

**Nivaran: A Multi-Tenant Platform for Crowdsourced Civic Issue Reporting and Resolution.** Category 3D05 Full Stack Application Development. Stated baseline TRL 4 (lab validation). SDG 11, 9, 16.

Citizens report civic issues (pothole, garbage, water leak, streetlight, drainage, road damage) with photo and GPS. The system suggests duplicates, scores priority with a visible breakdown, routes to a department, enforces SLAs with escalation, verifies resolution with citizen confirmation, and publishes an accountability dashboard. Each Urban Local Body (ULB) is an isolated tenant with its own departments, categories, SLAs, wards, scoring weights and branding.

### Roles

| Role           | Scope                               | Can                                                                                                     |
| -------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| anonymous      | public                              | Browse public map, tracking pages, dashboard                                                            |
| citizen        | one tenant                          | Report, confirm a duplicate (+1), comment, confirm or dispute a fix, rate                               |
| staff          | one tenant, one or more departments | Work assigned issues, add internal notes, upload resolution evidence                                    |
| dept_head      | one tenant, department              | Everything staff can, plus assign, override priority (with reason), merge or unmerge duplicates         |
| tenant_admin   | one tenant                          | Configure departments, wards, categories, SLAs, weights, users; view fairness and audit                 |
| platform_admin | platform                            | Create, suspend and list tenants and bootstrap a tenant_admin. **Cannot read any tenant's issue data.** |

### Scope tiers

- **MVP:** auth and RBAC, tenancy, tenant configuration, geo-tagged reporting with photo, duplicate suggestion, priority engine with breakdown and override, rule-based routing, workflow state machine, SLA timers and escalation, resolution evidence, citizen confirm or dispute, public tracking timeline, notifications, transparency dashboard, map, audit trail.
- **Core:** offline PWA drafts, EN/HI/PA, merge/unmerge, workload view, internal vs public comments, hotspots and heatmap, fairness check, hash-chained audit, AI intake assistant, embedding similarity, image quality check.
- **Extension (only on explicit approval, P13):** spike detection, what-if queue simulator, voice input, image category suggestion, bulk actions, open dataset export.
- **Non-goals:** blockchain, microservices beyond the three deployables, SMS (paid), reputation points, severity or size estimation from images, forecasting models, multi-region, training an LLM, native mobile apps.

## 2. Deployables

1. `apps/web`: React PWA.
2. `apps/api`: Express API (modular monolith) and a BullMQ worker (same codebase, different entrypoint).
3. `apps/ai`: FastAPI service (embeddings only; LLM calls are made from the API through a provider adapter).

## 3. Stack and dependency policy

Decisions are in PROGRESS.md (D-001 to D-009). Principle: **the fewest dependencies that work**. No extra packages, modules, plugins, images or tools.

**Rules**

1. **Built-in first.** Use the platform before any package: Node `fetch`, `node:crypto` (`randomUUID`, `createHash`), `URL`, `AbortController`, `Intl` for dates and numbers, `node --env-file` for local env loading; in the browser `fetch`, `Intl`, native `<dialog>` and form controls, CSS custom properties. A package replaces a built-in only with a written reason.
2. **Phase-gated.** A package may be installed only if the current phase card's **Dependencies** list names it and the human approved the plan. Not on the list means stop and ask. Do not install early "because a later phase needs it".
3. **No scaffolders or ad-hoc installs.** No `create-vite` or similar generators, no `npx` or `pnpm dlx` one-offs, no global installs, no `sudo`, no editing the system. Write the minimal files by hand.
4. **Exact pins.** `.npmrc` sets `save-exact=true`. Lockfiles are committed. CI and Docker builds use `pnpm install --frozen-lockfile`. Python uses pinned `requirements.txt` (runtime) and `requirements-dev.txt`. Never `latest`. Pick versions at least two weeks old.
5. **Build scripts opt-in.** Dependencies' install scripts run only for an explicit allowlist (for example native modules the phase actually needs, such as `argon2` or `sharp`). Verify the current pnpm setting name when writing `.npmrc` or `package.json`.
6. **Lean images.** Multi-stage builds. Runtime images contain production dependencies only and a minimal base. Dev tooling never ships.
7. **Tools run in containers or CI, not installed:** k6, Trivy and gitleaks run from their official Docker images or GitHub Actions. Python runs in the `apps/ai` container, not on the host.
8. **Ledger.** Every direct dependency has a row in the PROGRESS.md dependency ledger (package, version, workspace, phase, purpose, built-in alternative considered). `make deps-check` fails if any declared direct dependency has no ledger row, or a ledger row has no dependency.
9. **Remove the unused immediately** (`pnpm remove`), in the same task that made it unused. TypeScript `noUnusedLocals` and `noUnusedParameters` are on.
10. `@types/*` packages count as dependencies. Add one only when the package ships no types.

**Pre-denied** (never without the human's explicit approval): Tailwind or any CSS framework or UI kit (MUI, Chakra, Bootstrap, shadcn); state libraries (Redux, Zustand, MobX); axios, node-fetch, got; lodash, underscore; moment, dayjs, date-fns; dotenv, dotenv-flow, cross-env; nodemon, ts-node, concurrently, rimraf; uuid, nanoid; body-parser; jest, mocha; Prisma, TypeORM, Sequelize, knex; GraphQL; Socket.IO; Passport; bcrypt, bcryptjs, jsonwebtoken (jose is the single JWT library); Storybook; Husky, lint-staged, commitlint; Sentry or analytics SDKs; icon fonts; animation libraries other than `motion`; chart libraries other than `recharts`; anything that duplicates what Node or the browser already provides.

**Toolchain:** Node current Active LTS pinned in `.nvmrc`, pnpm, Python 3.12 inside the AI container, Docker Compose. Per-phase package lists live in `docs/PHASES.md`.

## 4. Data architecture

One authority per entity. Cross-store data is a snapshot or a derived read model.

| Store                                     | Owns                                                                                                                                                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL + PostGIS                      | Tenants, users, refresh tokens, email tokens, departments, staff profiles, wards (polygons), ward-department coverage, categories, SLA policies, priority configs, facilities, config audit, and the derived `issue_metrics_fact` |
| MongoDB (single-node replica set locally) | issues, confirmations, comments, notifications, audit_events, outbox, ai_logs, idempotency_keys, counters                                                                                                                         |
| Redis                                     | BullMQ queues, cache, rate-limit counters. Disposable, never authoritative                                                                                                                                                        |
| S3 (MinIO locally)                        | Evidence images only. Private bucket, keys `t/<tenantId>/issues/<issueId>/<uuid>.<ext>`, access via short-lived presigned URLs                                                                                                    |

### PostgreSQL rules

- Every tenant table has `tenant_id` and a Row Level Security policy based on `current_setting('app.tenant_id')`, set with `SET LOCAL` inside each request transaction.
- Migrations run as the owner role. The API connects as `nivaran_app` (no `BYPASSRLS`, not owner). Platform bootstrap uses a separate limited role touching only tenants and admin bootstrap.
- Tables (names indicative; the P1/P3 plan proposes exact columns): `tenants`, `platform_admins`, `users`, `refresh_tokens`, `email_tokens`, `departments`, `staff_profiles`, `wards`, `ward_department_coverage`, `categories`, `sla_policies`, `priority_configs`, `facilities`, `config_audit`, `issue_metrics_fact`.
- `categories`: code, names in en/hi/pa, department, SLA policy, `dedup_radius_m`, `default_safety_risk` (0 to 1), `evidence_required`, active.
- `sla_policies`: `respond_hours`, `resolve_hours`, escalation levels (`at_percent`, `notify_role`).
- Geometry: SRID 4326, GiST indexes on ward boundaries, facilities and fact points. Config changes write `config_audit` in the same transaction.

### MongoDB rules

- Every document has `tenantId`. All access goes through a scoped repository that injects it. Raw collection access outside the repository layer is forbidden.
- Every index starts with `tenantId`. `issues`: 2dsphere on `location`; `(status, priority.score desc)`; `(category.code, status, createdAt desc)`; partial index on `sla.resolveBy` for open issues; unique `publicId`. `audit_events`: unique `seq`. `idempotency_keys`: unique key with TTL.
- Issue document (indicative): publicId, status, reporterId, location (GeoJSON Point, accuracyM, wardId), description (original, language, English copy), category snapshot, department snapshot, SLA policy snapshot with computed deadlines, evidence array (key, takenAt, blurScore), priority breakdown, override, duplicateOf, reporterIds (unique), reopenCount, resolution (note, evidence, citizen response), version.
- **Snapshot rule:** category, department, ward and SLA policy are copied into the issue at creation. Later config edits never rewrite existing issues.
- `publicId` format: `NVR-<TENANTCODE>-<6 digits>` from an atomic per-tenant counter.
- **Audit chain:** `audit_events` are append-only, per-tenant `seq`, each stores `prevHash` and `hash` (SHA-256 over canonical event JSON plus `prevHash`). A verify endpoint recomputes the chain. An audit event is written in the same Mongo transaction as the state change.
- **Outbox:** state changes also insert an `outbox` document in the same transaction. A worker upserts `issue_metrics_fact` in Postgres, idempotent on `(issue_id, version)`. `make rebuild-metrics` replays everything from Mongo and must produce an identical table.

## 5. Domain rules

### Issue lifecycle

`submitted` then `triaged` then `assigned` then `in_progress` then `resolved` then `closed`. Side states: `reopened` (from `resolved` or `closed`, returns to `assigned`), `duplicate` (terminal, links to primary, reversible by unmerge), `rejected` (terminal, reason required, dept_head or above).

- Closing requires resolution evidence when the category has `evidence_required`.
- `resolved` asks the citizen to confirm or dispute. Confirm gives `closed`. Dispute gives `reopened` and an escalation. No response for 7 days gives `closed` automatically `[A]`.
- Every transition is validated by a table-driven guard (who may move from which state to which). Invalid transitions return a typed error and write nothing.

### SLA and escalation

Per category policy. Timers are BullMQ delayed jobs with deterministic job ids (`sla:<issueId>:<level>`) so retries and restarts never double-fire. Escalation levels notify roles at a percentage of the deadline and at breach. Failed jobs retry with backoff, then land in a dead-letter queue visible to tenant_admin. Calendar hours, no holiday calendar `[A]`.

### Routing

Category maps to department. A ward-department coverage row overrides it. Otherwise the issue goes to an `unrouted` queue owned by tenant_admin. Routing is rule-based and logged in the audit trail.

## 6. Algorithms (all defaults are `[A]`, tuned by the P5 evaluation)

### Duplicate detection (suggest only, never auto-merge)

Candidates: same tenant, open status, created within 21 days, within effective radius of the new report.

- `R_eff = category.dedup_radius_m + min(gps_accuracy_m, 30)`. Starting radii: pothole 25, road_damage 30, garbage 40, drainage 40, water_leak 25, streetlight 15, other 30 (metres).
- `spatial = max(0, 1 - d / R_eff)` with `d` from the Haversine function (own implementation, unit-tested against known distances) on candidates returned by `$geoNear`.
- `category = 1` same category, `0.5` compatible category (configurable map), else the candidate is excluded.
- `text` = cosine similarity of embeddings mapped to [0, 1]; present only when the AI service is available and the flag is on.
- Without text: `score = 0.75 spatial + 0.25 category`. With text: `0.6 spatial + 0.2 category + 0.2 text`.
- Suggest at `score >= 0.55`, highlight at `>= 0.8`. Staff merge and unmerge. A merge adds the confirming reporters and never deletes the secondary issue.

### Priority score (explainable)

`score = 100 x sum(w_i x f_i) x c`, each `f_i` in [0, 1], `c` = evidence-confidence multiplier in [0.8, 1.0] (reduced for blurry or missing photos).

| Factor             | Definition                                                                  |
| ------------------ | --------------------------------------------------------------------------- |
| safety             | category `default_safety_risk` plus hazard-tag bonus, capped at 1           |
| severity           | citizen-chosen 1 to 3 (staff may adjust at triage, logged), normalized      |
| facility proximity | max over facilities within 200 m of `type_weight x (1 - d / 200)` (PostGIS) |
| reporters          | `1 - exp(-(n_unique_verified - 1) / 3)`; one vote per verified reporter     |
| age                | `min(1, days_open / 30)`                                                    |
| sla_pressure       | 0 until 50 percent of the SLA elapsed, rising linearly to 1 at the deadline |

Default weights: safety 0.25, severity 0.15, facility 0.15, reporters 0.10, age 0.10, sla_pressure 0.25 (sum 1.0). Weights are per-tenant config with versioning. Tie-break: earlier `sla.resolveBy`, then earlier `createdAt`, then `publicId`. Report count never dominates (saturating, unique verified reporters only).

The stored breakdown holds per factor: raw, normalized, weight, contribution, plus config version, confidence, score and computedAt. Recompute on new confirmation, status change, and every 15 minutes for open issues. Override: dept_head or above, reason required, logged, shown beside the computed score, never replaces it.

### Fairness check (admin only, informational)

Per ward: mean priority, median time to first response, median resolution time, SLA compliance. Flag wards deviating more than 1.5 times the tenant median when `n >= 20`. Never published.

### Public metrics

Median and p90 resolution time, SLA compliance, reopen rate, open count, by department and ward. Any cell with fewer than 10 issues shows "not enough data" `[A]`. The methodology page defines every metric. No single opaque ranking.

## 7. API conventions

- Base `/api/v1`. Authenticated routes take the tenant from the JWT claim `tid`. Anonymous routes live under `/api/v1/public/:tenantSlug/...`.
- Errors: `{ "error": { "code", "message", "details?", "requestId" } }` with stable machine codes and human-readable messages that say how to fix the problem.
- Cursor pagination (`limit`, `cursor`). Timestamps ISO 8601 UTC. Every response carries `x-request-id`.
- Mutating create endpoints accept `Idempotency-Key`; the same key returns the original result.
- Validation with zod schemas from `packages/shared`; the same schemas drive form validation in the web app.
- Rate limits `[A]`: auth 5 per minute per IP and email; report creation 10 per hour per user; presign 30 per hour per user.

## 8. Security

- Passwords: argon2id. Access token 15 minutes, held in memory. Refresh token 14 days in an httpOnly SameSite=Lax cookie, rotated on every use with family revocation on reuse. Email verification required before a citizen may submit a report. Email goes through Mailpit locally.
- CORS allowlist from `WEB_ORIGIN`. helmet defaults. Authorization checked at route level and again at resource level (tenant, department, ownership).
- Uploads: JPEG, PNG, WebP only, at most 8 MB and 4 images per issue `[A]`. Verify magic bytes, ignore the client MIME type, re-encode with sharp, strip all EXIF including GPS. Presigned PUT expires in 5 minutes. Images are served through short-lived presigned GET URLs.
- Logs never contain PII, tokens or full emails. Secrets only via environment variables.
- AI: citizen text is data, never instructions. PII (phones, emails) is redacted before any external call. Outputs are validated against a zod schema and the tenant's category list.

## 9. AI components

- **Intake assistant (P9):** text in EN, HI or PA becomes `{ category_code, severity 1-3, hazard_tags[], description_clean, language, location_hint, confidence per field }` via `LLM_PROVIDER` (`gemini` or `disabled`). Timeout 4 s `[A]`. Invalid or low-confidence output is dropped and the manual form remains. The citizen edits and confirms every field. UI labels AI-suggested values.
- **Embeddings (P9):** `apps/ai` exposes `POST /embed` and health endpoints. A multilingual sentence-embedding model pinned in the image at build time (verify Punjabi coverage on a test set before relying on it). The P9 plan must compare runtimes by installed image size, because `sentence-transformers` pulls PyTorch (use CPU-only wheels if chosen) while an ONNX-based runtime is much smaller. Pick the smallest that passes the Punjabi test, with human approval. The API calls it with a 2 s timeout and a simple circuit breaker. Vectors and model version are stored on the issue.
- **Image quality:** blur score computed in the worker with sharp (variance of a Laplacian convolution). A low score reduces the confidence multiplier and prompts the citizen to retake. No ML model.
- Every AI call is logged to `ai_logs` (redacted input hash, provider, model, prompt version, latency, schema-valid, user corrections). Correction rate is an evaluation metric.
- Never use AI for priority, routing, merging, closure or status changes.

## 10. Environment contract (`.env.example` must list exactly these, with safe local defaults and no real secrets)

`NODE_ENV PORT LOG_LEVEL WEB_ORIGIN API_BASE_URL` · `MONGO_URI POSTGRES_OWNER_URL POSTGRES_APP_URL REDIS_URL` · `S3_ENDPOINT_INTERNAL S3_ENDPOINT_PUBLIC S3_REGION S3_BUCKET S3_ACCESS_KEY S3_SECRET_KEY` · `JWT_ACCESS_SECRET JWT_REFRESH_SECRET ACCESS_TTL_MIN REFRESH_TTL_DAYS` · `SMTP_HOST SMTP_PORT MAIL_FROM` · `AI_SERVICE_URL AI_TIMEOUT_MS LLM_PROVIDER LLM_MODEL GEMINI_API_KEY`.
Adding a variable requires a SPEC edit approved by the human.

## 11. Local services and ports

| Service  | Port                       | Image or build                         |
| -------- | -------------------------- | -------------------------------------- |
| web      | 5173                       | `apps/web`                             |
| api      | 4000                       | `apps/api`                             |
| ai       | 8000                       | `apps/ai`                              |
| mongo    | 27017                      | pinned `mongo` 7 or 8, `--replSet rs0` |
| postgres | 5432                       | pinned `postgis/postgis`               |
| redis    | 6379                       | pinned `redis:7-alpine`                |
| minio    | 9000 (API), 9001 (console) | pinned `minio/minio`                   |
| mailpit  | 8025 (UI), 1025 (SMTP)     | pinned `axllent/mailpit`               |

Compose profiles: `core` (data services), `app` (web, api, worker, ai). Healthchecks on everything, `depends_on` with `service_healthy`, resource limits set. Mongo replica set is initialised by a healthcheck or init step. Containers use `mongodb://mongo:27017/nivaran?replicaSet=rs0`; host tools use `directConnection=true`. MinIO needs separate internal and public endpoints so presigned URLs work from the browser.

## 12. Evaluation and evidence (no fabricated results)

- Dedup: synthetic generator with ground-truth clusters (GPS noise 5 to 25 m, paraphrased text, near-miss negatives 10 to 60 m apart). Report precision, recall and F1 across thresholds for three baselines: distance only, distance plus category, distance plus category plus text.
- Priority: property tests (weights sum, bounds, monotonicity, determinism) and a worked-example table.
- SLA: accelerated-clock simulation of at least 1000 issues; report missed and duplicated escalations.
- Tenant isolation: automated attack suite walking the route table, plus RLS tests as `nivaran_app`.
- Metrics: dashboard values equal an independent recomputation from Mongo on the seed dataset.
- Performance: k6 scenarios with stated thresholds. Resilience: container kill drills, Mongo restore, Redis flush, AI down.
- Everything in `docs/evidence/` is generated by committed scripts and states the dataset, seed, date and limits. TRL 4 claim = integrated components validated in a lab environment with this evidence. No higher TRL is claimed.

## 13. Glossary

ULB: Urban Local Body (municipal authority). Ward: administrative sub-area. SLA: service-level agreement (target response and resolution times). Tenant: one ULB's isolated workspace. Snapshot: copy of config stored on an issue at creation. Outbox: transactional record used to sync derived data.
