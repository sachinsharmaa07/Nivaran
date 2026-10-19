# AGENTS.md: Nivaran (always on, non-negotiable)

Nivaran is a multi-tenant civic issue reporting and resolution platform (college capstone, built local-first in Docker, then moved to AWS).
These rules apply to every task. If a request conflicts with them, stop and ask. Details live in the files named below. Do not duplicate them here or anywhere else.

## 0. Start of every task

1. Read `PROGRESS.md`: current phase, pending human actions, decisions, assumptions.
2. Read `docs/SPEC.md` (what to build) and the current phase card in `docs/PHASES.md`.
3. UI work: also read `docs/DESIGN.md`.
4. Run `git status` and `git diff --stat`. Never overwrite uncommitted human changes.
5. If a file above is missing or contradicts another, stop and report.

## 1. Source of truth (higher wins)

1. The human's latest explicit chat instruction
2. This file
3. `docs/SPEC.md`, then `docs/PHASES.md`, then `docs/DESIGN.md`
4. Existing working code

Two sources disagree: quote both, stop, ask. Never resolve by guessing.

## 2. Non-negotiable rules

- **N1 Inspect before editing.** Search the code before claiming something is missing.
- **N2 One phase at a time.** Never start the next phase. Never pre-build later-phase code.
- **N3 No invented requirements.** API contracts, fields, env vars, thresholds and business rules come from SPEC. A gap becomes a question, or a labelled assumption in PROGRESS.md. Never silent code.
- **N4 Smallest sufficient change.** No unrelated refactors, renames, reformatting or "improvements". Suggest them in the report instead.
- **N5 Zero extra installs.** Install nothing (npm or pip packages, apt or brew packages, Docker images, Antigravity plugins, MCP servers, marketplace skills, scaffolders such as `create-vite`, one-off `npx` or `pnpm dlx`, global tools) unless the current phase card's Dependencies list names it AND the human approved the plan. Built-ins first. Every install is exact-pinned and gets a row in the PROGRESS.md dependency ledger. Anything unused is removed in the same task. A new file or folder also needs a stated reason tied to a requirement.
- **N6 Verify, don't claim.** Say "passed" only for a check you ran and observed. Report failures and checks you could not run.
- **N7 Never weaken a test.** No deleted assertions, skipped tests, loosened validation or swallowed errors to get green.
- **N8 Secrets.** Never commit, print, log or ask for them in chat. Real values live only in the human's untracked `.env`. Keep `.env.example` in sync with SPEC section 10.
- **N9 Human-only actions** (accounts, API keys, logins, paid resources, `terraform apply` or `destroy`, pushing to remotes): stop, write exact steps under "Human actions" in PROGRESS.md, wait. Never mock around them silently. Never attempt them yourself.
- **N10 No destructive commands without approval:** `rm -rf` outside build dirs, `git reset --hard`, history rewrite, force-push, `docker system prune`, deleting volumes outside `make reset`, dropping databases, global installs, `sudo`.
- **N11 No commit, tag or push unless the human asks.** Propose the commit message instead.
- **N12 Honest evidence.** Metrics, accuracy, benchmark and TRL statements come only from committed scripts run on documented datasets. Label synthetic data as synthetic. Never fabricate numbers or claim production readiness.
- **N13 Stop and ask when:** requirements conflict; a decision changes architecture, data model or public API; an unapproved dependency is needed; a check cannot pass without weakening it; scope would grow beyond the phase card.

## 3. Fixed stack (changes need human approval and a Decisions-log entry)

TypeScript (strict) everywhere except `apps/ai` (Python 3.12, FastAPI). pnpm workspaces. Fewest dependencies that work (SPEC section 3). React + Vite with CSS Modules and design tokens (no Tailwind, no UI kit). Express API as a modular monolith plus a BullMQ worker from the same codebase. PostgreSQL + PostGIS and MongoDB each own specific data (SPEC section 4). Redis, MinIO (S3 stand-in), Mailpit (SMTP stand-in). Vitest, Playwright, axe-core, k6. Docker Compose locally first. AWS only from P12.

## 4. Repository layout (the only allowed top level)

```
apps/web         React PWA                 apps/api    API + worker
apps/ai          FastAPI AI service        packages/shared   zod schemas, types, constants
infra/           compose | terraform | ansible | helm | k8s
scripts/         tiny zero-dependency Node scripts (for example deps-check)
data/            synthetic (generators) | seeds
tests/           e2e | load | tenant-isolation
docs/            SPEC, DESIGN, PHASES, PROMPTS, HUMAN-CHECKLIST, runbooks/, evidence/
.agents/         rules and skills (do not edit unless asked)
.github/workflows
```

Root files allowed: `AGENTS.md PROGRESS.md README.md Makefile package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json .nvmrc .env.example .gitignore .gitattributes .editorconfig` and ESLint/Prettier config. Anything else at root needs approval.

Placement rules:

- API code by domain: `apps/api/src/modules/<domain>/` containing `routes.ts service.ts repo.ts schema.ts *.test.ts`.
- Web code by feature: `apps/web/src/features/<feature>/`. Shared UI in `apps/web/src/ui/`. Tokens only in `apps/web/src/styles/tokens.css`.
- No `utils`, `helpers` or `common` dumping folders. Name files by purpose.
- File at most 300 lines, function at most 50 lines. Split by responsibility, not arbitrarily.
- No commented-out code. No `TODO` without a PROGRESS.md entry.
- No documentation outside `docs/`, `README.md` and `PROGRESS.md`. Never create NOTES, PLAN, SUMMARY or CHANGELOG files.
- Unit tests sit beside the unit. Cross-service tests live under `tests/`.

## 5. Architecture invariants (detail in SPEC and `.agents/rules/`)

- Every tenant-owned row or document carries a tenant id. Isolation is enforced twice: Postgres RLS (the API connects as the non-owner role `nivaran_app`) and a mandatory scoped Mongo repository. No query bypasses either.
- One authority per entity (SPEC section 4). Cross-store copies are snapshots or derived read models only.
- AI never decides priority, routing, merging, closure or any status change. AI only suggests at intake and in similarity, behind a provider adapter, with timeout and fallback.
- Every state change writes an audit event in the same transaction. Mutating endpoints where retries are plausible accept an idempotency key.
- All input is validated at the boundary with zod schemas from `packages/shared`.
- Config comes only from environment variables. Services expose `/healthz` and `/readyz`, log JSON to stdout, and never log PII.
- Local-first, cloud-parity: nothing may assume `localhost`, local file paths or Compose-only behaviour.

## 6. Commands: the Makefile is the only interface

`make up | down | reset | migrate | seed | lint | typecheck | test | test-tenant | e2e | build | deps-check`. Targets appear as phases deliver them. Add a target only when the phase card requires it.

Before reporting a task done run `make lint typecheck test deps-check`. Also run `make test-tenant` if `apps/api` or SQL changed, and `make e2e` if UI flows changed. Report the real outcome.

## 7. Workflow (use the `/phase-*` skills)

Audit, then Plan (stop for approval), then Implement, then Review, then Close. Planning and implementation are separate steps with a human approval between them. Never merge steps. UI work must be checked in the browser at 360 px and 1440 px with screenshots.

## 8. PROGRESS.md protocol (the single progress file)

- Update it at the end of every plan, implement, review and close step. It is how the next conversation resumes. Edit in place. Never create another progress or notes file.
- Update: "Resume here", the phase table, the phase checklist (tick only with evidence), Human actions, Decisions, Assumptions, Verification log, and one Changelog line at close.
- Evidence means command, date and real result summary. No evidence, no tick.

## 9. Definition of done (all must hold)

Acceptance criteria in the phase card met with evidence. Lint, typecheck, tests and `make deps-check` green. No unrelated diff, unlisted dependency, secret or stray file. Ledger matches the manifests. UI states complete per DESIGN section 8. PROGRESS.md and `.env.example` updated. Remaining limitations stated honestly.

## 10. Report format (end of every task)

Implemented. Files changed and why. Commands run and real outcomes. Acceptance criteria pass or fail. Assumptions made. Open questions and blockers. Deviations. Keep facts, assumptions and suggestions visibly separate. Be concise.
