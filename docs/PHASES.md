# PHASES: Nivaran

One card per phase. The card is the scope contract: do what **Includes** says, nothing in **Excludes**, and prove **Acceptance** with evidence. Phases run in order. A phase is done only after `/phase-close`.

Every phase also requires: only the packages in its **Dependencies** line are installed, `make deps-check` passes, and unused packages are removed.

Human checkpoint after each phase: `git add -A && git commit -m "<msg>" && git tag pN-done`.

---

## P0: Foundation

**Goal:** clean monorepo, one-command local stack, CI skeleton.

**Includes:**

- pnpm workspace, `apps/web` (blank Vite React TS shell), `apps/api` (Express TS with `/healthz` and `/readyz`, worker entrypoint stub), `apps/ai` (FastAPI `/healthz`), `packages/shared`.
- `infra/compose`: `core` and `app` profiles per SPEC section 11, healthchecks, `service_healthy` ordering, resource limits, Mongo replica-set init, MinIO bucket creation, pinned image tags.
- Multi-stage non-root Dockerfiles per app.
- Makefile: `up down reset logs lint typecheck test build deps-check`.
- `.env.example` per SPEC section 10. ESLint, Prettier, strict tsconfig, Vitest wired with one trivial real test per app.
- `.github/workflows/ci.yml`: lint, typecheck, test, docker build.
- README quickstart (under 60 lines).

**Excludes:** database schemas, auth, any feature code, UI beyond a blank shell.

**Dependencies (only these):** root dev: `typescript`, `eslint`, `@eslint/js`, `typescript-eslint`, `prettier`, `vitest`. web: `react`, `react-dom`, `vite`, `@vitejs/plugin-react`. api: `express`, `pino`, `@types/express`, `@types/node`. ai (container only): `fastapi`, `uvicorn`, `pytest`, `ruff`, `httpx` (dev, required by FastAPI's TestClient). Compose images only. No `tsx`, `dotenv`, `nodemon`, scaffolders. Use `tsc` plus `node --env-file`; if native TypeScript execution cannot run the code, the plan may propose `tsx` (dev only) for approval. Also build `scripts/deps-check.mjs` (zero dependencies) and `.npmrc` with `save-exact=true`.

**Acceptance:**

1. `make reset && make up` yields all services healthy (`docker compose ps`).
2. `/healthz` returns 200 on web, api and ai; `/readyz` on api reflects Mongo, Postgres and Redis reachability.
3. `make lint typecheck test` pass.
4. CI green on a pull request.
5. No secrets committed (gitleaks clean). Repo tree matches AGENTS.md section 4.
6. `make deps-check` passes, and `pnpm ls --depth 0 -r` shows exactly the P0 list. Every package has a ledger row.

**Human:** HUMAN-CHECKLIST sections A to C. **Tag:** `p0-done`.

---

## P1: Tenancy and auth

**Goal:** isolated tenants, secure authentication, RBAC.

**Includes:**

- node-pg-migrate. Tables: tenants, platform_admins, users, refresh_tokens, email_tokens. Roles `nivaran_app` and the limited platform role. RLS policies. A request-scoped transaction helper that sets `app.tenant_id` with `SET LOCAL`.
- Auth: citizen register, email verification (via Mailpit), login, refresh rotation with reuse detection, logout, password reset. argon2id. RBAC middleware. Platform routes to create and suspend tenants and bootstrap a tenant_admin.
- Mongo scoped repository base class and index bootstrap.
- Rate limits on auth routes.
- Seed: two demo tenants with one user per role.
- Tenant-attack test suite v1 (`make test-tenant`).

**Excludes:** departments, wards, issues, any UI.

**Dependencies (only these):** api: `pg`, `node-pg-migrate`, `mongoose`, `ioredis`, `express-rate-limit`, `rate-limit-redis`, `argon2`, `jose`, `helmet`, `cors`, `nodemailer`; dev: `supertest`; `@types/*` only where the package ships no types. shared: `zod`. Cookie parsing: a hand-written parser or `cookie-parser`, the plan picks one with a reason.

**Acceptance:**

1. Tenant A token cannot read or write tenant B data on every existing endpoint. The suite discovers routes from the route table, so a new route without a test fails the suite.
2. As `nivaran_app`, a cross-tenant SELECT returns zero rows. The owner role is never used at runtime.
3. Refresh token reuse revokes the whole family (tested).
4. Platform admin cannot read tenant issue data (tested).
5. Login and register rate limits enforced (tested). No PII or tokens in logs (tested with a log capture).

**Human:** none beyond running `make up`. **Tag:** `p1-done`.

---

## P2: Design system and app shell

**Goal:** the visual and interaction foundation every later screen reuses.

**Includes:**

- `tokens.css` from DESIGN section 2, fonts via @fontsource, light, dark and system theme.
- Components from DESIGN section 5 with all states, the `/dev/ui` gallery (dev only), motion primitives (lane-line loader and timeline, toast, dialog, sheet, reduced-motion handling).
- App shell for citizen and staff, i18n scaffolding (EN strings, HI and PA structure ready), auth screens (register, verify email, login, reset), 403, 404 and offline pages.
- Playwright plus axe checks.

**Excludes:** reporting, map screens with real data, dashboards, translations beyond English.

**Dependencies (only these):** web: `react-router`, `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`, `motion`, `lucide-react` (import individual icons), `i18next`, `react-i18next`, the four `@fontsource` packages (needed weights and subsets only); dev: `@playwright/test`, `@axe-core/playwright`. Use native `<dialog>`, `<details>` and form controls first. A `@radix-ui/react-*` primitive is allowed only where the plan shows native elements fall short (for example Select or Popover), one package per proven need. `@testing-library/react` plus `jsdom` only if component tests are in the plan.

**Acceptance:**

1. Gallery shows every component in every state, light and dark.
2. axe: zero serious or critical on gallery and auth screens.
3. Keyboard-only login works. Reduced-motion run verified.
4. Screenshots at 360 px and 1440 px reviewed by the human.
5. No hard-coded colors or durations outside `tokens.css` (check script).
6. DESIGN section 12 gate passed and reported.

**Human:** review screenshots, approve palette and typography. **Tag:** `p2-done`.

---

## P3: Tenant configuration

**Goal:** each ULB configures its own structure.

**Includes:**

- Migrations: departments, staff_profiles, wards (PostGIS), ward_department_coverage, categories, sla_policies, priority_configs, facilities, config_audit (all with RLS).
- Admin API and UI: CRUD for each, GeoJSON ward import with validation, tenant onboarding wizard for platform_admin, staff invitation.
- Seed: a fictional demo city with synthetic grid wards, categories with Hindi and Punjabi names, SLA policies, facilities (assumption A-002).

**Excludes:** issues, scoring, any citizen-facing screen.

**Dependencies:** none expected. GeoJSON validation uses PostGIS (`ST_IsValid`). Any package needs human approval.

**Acceptance:**

1. RLS on every new table, covered by the tenant-attack suite.
2. Config changes write `config_audit` in the same transaction (tested with forced failure).
3. Ward lookup returns the correct ward for 20 fixture points, including boundary and outside-city points.
4. Category, department and SLA integrity enforced (cannot delete referenced rows).
5. All DESIGN section 8 states present on admin screens.

**Human:** review admin screens. **Tag:** `p3-done`.

---

## P4: Reporting

**Goal:** a citizen can report an issue with a photo and track it.

**Includes:**

- Mongo: issues, confirmations, idempotency_keys, counters, audit_events with hash chain and verify endpoint, publicId generator, snapshot-at-creation.
- Upload pipeline: presigned PUT to MinIO, worker validates magic bytes, re-encodes, strips EXIF, computes blur score.
- Citizen UI: map-first home, 4-step report wizard (Where, What, Photos, Review) with GPS accuracy, My reports, issue page with public lane timeline.
- Public tracking page by publicId. Rate limits. Email-verified requirement.

**Excludes:** duplicate suggestion, scoring, routing, assignment, offline mode, AI.

**Dependencies (only these):** api: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `sharp`, `bullmq`. web: `leaflet`, `react-leaflet`, `@types/leaflet`. IDs use `crypto.randomUUID`. Marker clustering is not included; the plan may propose it only with measured need.

**Acceptance:**

1. Same idempotency key twice yields exactly one issue.
2. Audit chain verify endpoint passes, and fails after a tampered event (tested).
3. Stored images contain no EXIF GPS (fixture test). Spoofed file types are rejected.
4. Tenant-attack suite extended to new routes and passes.
5. E2E (Playwright): register, verify, report with photo, see it on the map and in My reports.
6. DESIGN section 12 gate passed.

**Human:** try the flow on a real phone over the local network (HUMAN-CHECKLIST section F). **Tag:** `p4-done`.

---

## P5: Dedup, priority, routing

**Goal:** explainable intelligence with measured quality.

**Includes:**

- Haversine implementation, `$geoNear` candidate query, duplicate scoring per SPEC section 6, suggestion in the wizard (+1 flow), staff merge and unmerge.
- Priority engine with stored breakdown, recompute triggers, 15-minute rescoring job, override with reason. Rule-based routing.
- `data/synthetic` generator (seeded, documented) and `make eval-dedup` producing precision, recall and F1 tables for the three baselines.
- Staff queue UI with ExplainPanel and animated reorder.

**Excludes:** embeddings, LLM, SLA timers, workflow transitions beyond assign.

**Dependencies:** none. Haversine, scoring and the evaluation scripts are written in-house with Node built-ins.

**Acceptance:**

1. Haversine matches reference distances within 0.5 percent (table test).
2. Priority property tests: bounds, weight sum, monotonic factors, deterministic tie-break.
3. Evaluation table reproducible from the seed, committed in `docs/evidence/`, with dataset limits stated.
4. Merge is reversible: unmerge restores both issues. No code path auto-merges.
5. Override logged and displayed beside the computed score.
6. DESIGN section 12 gate passed on queue and wizard changes.

**Human:** sanity-check the evaluation numbers and weights. **Tag:** `p5-done`.

---

## P6: Workflow and SLA

**Goal:** issues move through a safe lifecycle with deadlines enforced.

**Includes:**

- Table-driven state machine per SPEC section 5, assignment, evidence-required closure, citizen confirm or dispute, auto-close after 7 days.
- BullMQ SLA timers with deterministic job ids, escalation levels, retries, dead-letter queue and admin view.
- Notifications (in-app and email via Mailpit) with templates and retry.
- Accelerated-clock harness (`make test-sla`).

**Excludes:** metrics dashboards, SMS, AI.

**Dependencies:** none (BullMQ, nodemailer and ioredis already installed).

**Acceptance:**

1. Every allowed and every forbidden transition covered by a table-driven test.
2. Simulation of at least 1000 issues: zero missed and zero duplicated escalations, counts reported.
3. Worker restart mid-simulation causes no duplicate escalation (tested).
4. SMTP outage retried then dead-lettered (tested).
5. Tenant-attack suite still green. UI states complete.

**Human:** click through a full lifecycle in the browser and read the emails in Mailpit. **Tag:** `p6-done`.

---

## P7: Metrics and transparency

**Goal:** public accountability without leaking or misleading.

**Includes:**

- Outbox processor, `issue_metrics_fact`, `make rebuild-metrics`.
- Metrics API (median, p90, SLA compliance, reopen rate, open counts, workload), small-count suppression.
- Public dashboard UI, map filters, hotspots (PostGIS clustering) and heatmap, admin-only fairness check, methodology page.

**Excludes:** dataset export, forecasting.

**Dependencies (only this):** web: `recharts`. Clustering and heatmaps use PostGIS in SQL.

**Acceptance:**

1. Dashboard values equal an independent recomputation from Mongo on the seed dataset (test).
2. `make rebuild-metrics` yields an identical table.
3. Suppression verified; no personal data in any public response (tested).
4. Fairness check admin-only (tested).
5. DESIGN gate passed. Count-up respects reduced motion.

**Human:** review the methodology wording. **Tag:** `p7-done`.

---

## P8: PWA and multilingual

**Goal:** works offline and in English, Hindi and Punjabi.

**Includes:**

- Service worker, installable PWA, offline drafts in IndexedDB, sync with idempotency keys (foreground fallback where background sync is unsupported), offline banner.
- Full i18n for EN, HI, PA, language switcher, Indic fonts, pseudo-locale layout test, missing-key check script.

**Excludes:** voice input, AI translation.

**Dependencies (only these):** web: `idb`, `vite-plugin-pwa`.

**Acceptance:**

1. Airplane-mode draft then reconnect creates exactly one issue (E2E).
2. App installable; offline shell loads.
3. Missing-key script passes. Layout holds at +40 percent text width and with Indic samples.
4. axe clean in all three languages.

**Human:** a fluent Hindi and Punjabi reader reviews translations (the agent cannot certify translation quality). **Tag:** `p8-done`.

---

## P9: AI assist

**Goal:** helpful suggestions that can never block or decide anything.

**Includes:**

- Provider adapter (`gemini`, `disabled`), intake assistant endpoint and UI (editable suggestions, confidence, "AI-suggested" labels), PII redaction, `ai_logs`.
- `apps/ai` embeddings endpoint, integration into dedup text component behind a flag, circuit breaker.
- Evaluation harness with a human-labelled multilingual set (at least 100 samples) reporting field accuracy, correction rate, and dedup with versus without text.

**Excludes:** image classifiers, voice, any AI-made decision.

**Dependencies (only these):** api: `@google/genai`. ai: one embedding runtime chosen in the plan after comparing installed image size (see SPEC section 9) and passing the Punjabi test. Anything transitive must be reported with the final image size.

**Acceptance:**

1. With `LLM_PROVIDER=disabled` or the AI service stopped, every user flow still works (E2E).
2. Schema-invalid output is dropped (tested). Prompt-injection fixtures cannot alter anything outside the validated fields.
3. No PII leaves the system: redaction tested on fixtures.
4. Evaluation report generated by script with stated limits.
5. Punjabi coverage of the embedding model verified on a test set, result reported either way.

**Human:** H-02 (Gemini key) and labelling the evaluation set. **Tag:** `p9-done`.

---

## P10: Hardening and evidence

**Goal:** prove it works and fails safely, locally.

**Includes:** k6 scenarios with stated thresholds, failure drills (kill each container, Mongo dump and restore, Redis flush, AI down, MinIO down), security scans (dependency audit, Trivy, gitleaks), full Playwright suite, runbooks in `docs/runbooks/`, README diagrams, generated evidence pack in `docs/evidence/`.

**Excludes:** new features, cloud.

**Dependencies:** none installed. k6, Trivy and gitleaks run from official Docker images or CI. `pnpm audit` is built in.

**Acceptance:**

1. Each drill executed and logged with measured recovery behaviour.
2. `make reset && make up && make seed` works from a clean clone in under 10 minutes.
3. All reports in `docs/evidence/` are script-generated with dataset, seed, date and limits.
4. Open vulnerabilities listed honestly with triage.
5. Accessibility audit of all main screens recorded.

**Human:** read the evidence pack for claims you cannot back up. **Tag:** `p10-done`.

---

## P11: CI/CD and local Kubernetes

**Goal:** rehearse Kubernetes without spending money.

**Includes:** GitHub Actions build and push (SHA tags), Trivy gate, Helm charts for web, api, worker, ai and in-cluster Redis, probes, resource requests and limits, ConfigMaps and Secrets, HPA, kind cluster scripts (`make kind-up`), rolling update and rollback drill.

**Excludes:** AWS resources.

**Dependencies:** no packages. Helm and kind are binaries the human installs at the start of this phase, not before.

**Acceptance:**

1. `make kind-up` deploys the whole stack and the E2E smoke test passes against it.
2. A rolling update and a rollback are performed and logged.
3. CI builds and scans all images; images tagged by commit SHA, never `latest`.
4. Charts pass lint and template rendering in CI.

**Human:** none. **Tag:** `p11-done`.

---

## P12: AWS deployment

**Goal:** the same system on AWS with public and private tiers.

**Includes:** Terraform (VPC with public and private subnets, EKS, RDS PostgreSQL with PostGIS, ECR, S3, IAM with IRSA, SSM parameters, Budgets), Ansible for the MongoDB EC2 host (hardening, replica set, CloudWatch agent, backup cron to S3), ALB ingress, CloudFront plus S3 for the web app, CloudWatch logs and alarms, GitHub OIDC deploy role, teardown (`make aws-destroy` prints the plan; the human runs it), architecture doc stating plainly that private subnets are not a private cloud, cost notes using current verified pricing.

**Excludes:** multi-region, service mesh, anything not in the list.

**Dependencies:** no packages. Terraform, Ansible, AWS CLI and kubectl are tools the human installs at the start of this phase, not before.

**Acceptance:**

1. The agent produces `terraform plan` output only. **The human runs every apply and destroy** (N9).
2. Deploy from clean using the documented commands; health checks green; rollback performed.
3. MongoDB backup restored to a fresh host (drill logged).
4. After teardown, a checklist and Cost Explorer review confirm no billable resources remain.
5. Cost estimate reconciled with the actual bill for the demo window.

**Human:** H-03 and running apply and destroy. **Tag:** `p12-done`.

---

## P13: Optional extensions

Each only on explicit written approval, one at a time, each as its own mini-phase with its own acceptance criteria written at plan time: spike detection, what-if queue simulator (labelled a simulation), voice input, image category suggestion (classification only, never severity), bulk actions, open dataset export.
