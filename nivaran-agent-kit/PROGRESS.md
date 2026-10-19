# PROGRESS.md: Nivaran

The single progress file. Agents edit it in place at the end of every plan, implement, review and close step (AGENTS.md section 8). Humans may edit it too.

## Resume here

- **Current phase:** P0 (not started)
- **Step:** waiting for `/phase-audit` then `/phase-plan P0`
- **Next action for the agent:** none until the human starts a step
- **Next action for the human:** complete HUMAN-CHECKLIST sections A to C, then run the Prompt 0 check in docs/PROMPTS.md
- **Last verified known-good tag:** none
- **Last updated:** (agent fills date and step)

## Phase table

Status: `todo`, `planning`, `plan-approved`, `implementing`, `in-review`, `done` (done only after `/phase-close`).

| Phase | Name                        | Status | Tag | Closed on |
| ----- | --------------------------- | ------ | --- | --------- |
| P0    | Foundation                  | todo   |     |           |
| P1    | Tenancy and auth            | todo   |     |           |
| P2    | Design system and app shell | todo   |     |           |
| P3    | Tenant configuration        | todo   |     |           |
| P4    | Reporting                   | todo   |     |           |
| P5    | Dedup, priority, routing    | todo   |     |           |
| P6    | Workflow and SLA            | todo   |     |           |
| P7    | Metrics and transparency    | todo   |     |           |
| P8    | PWA and multilingual        | todo   |     |           |
| P9    | AI assist                   | todo   |     |           |
| P10   | Hardening and evidence      | todo   |     |           |
| P11   | CI/CD and local Kubernetes  | todo   |     |           |
| P12   | AWS deployment              | todo   |     |           |
| P13   | Optional extensions         | todo   |     |           |

## Current phase checklist

Copy the acceptance criteria from the phase card here at plan time. Tick `[x]` only with evidence in the Verification log.

- [ ] (empty until `/phase-plan`)

## Human actions

Agents add rows when a human-only step blocks work (AGENTS.md N9). The human marks them done.

| ID   | Needed for | Exact steps                                                                          | Status |
| ---- | ---------- | ------------------------------------------------------------------------------------ | ------ |
| H-01 | P0         | HUMAN-CHECKLIST sections A to C (tools, GitHub repo, copy kit, Antigravity settings) | open   |
| H-02 | P9         | Create Gemini API key and put it in local `.env` (HUMAN-CHECKLIST section D)         | open   |
| H-03 | P12        | AWS account preparation (HUMAN-CHECKLIST section E)                                  | open   |

## Decisions log

Proposed defaults. Change a row only with the human's approval and add a dated note.

| ID    | Decision                                                                                                                              | Reason                                                                    | Status            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------- |
| D-001 | TypeScript strict for web, api and shared                                                                                             | Catches contract drift across a monorepo; agents make fewer silent errors | proposed          |
| D-002 | pnpm workspaces monorepo                                                                                                              | One lockfile, fast installs, clean package boundaries                     | proposed          |
| D-003 | CSS Modules + design tokens, no Tailwind or UI kit                                                                                    | Tokens stay the single source of design truth; readable markup            | proposed          |
| D-004 | Hybrid databases: PostgreSQL+PostGIS for reference and analytics, MongoDB for operational data                                        | One authority per entity (SPEC section 4)                                 | proposed          |
| D-005 | Hybrid AI: deterministic core, AI only at intake and similarity                                                                       | Defensible, explainable, works when AI is down                            | proposed          |
| D-006 | Local-first on Docker Compose, then local Kubernetes (kind), then AWS                                                                 | Rehearse before spending money                                            | approved by human |
| D-007 | AWS target: public and private subnets, EKS, EC2 for MongoDB, RDS for PostgreSQL                                                      | Human's choice                                                            | approved by human |
| D-008 | Vitest + Playwright + axe-core + k6 (k6 via Docker) for testing                                                                       | One runner for TS, browser and accessibility checks                       | proposed          |
| D-009 | Minimal dependencies: phase-gated installs, exact pins, ledger enforced by `make deps-check`, no scaffolders, tools run in containers | Human requirement: no extra packages or modules                           | approved by human |

## Assumptions to confirm

Every threshold or default in SPEC marked `[A]` is an assumption. Agents record new ones here with the phase that needs them.

| ID    | Assumption                                                                                                          | Where used | Status |
| ----- | ------------------------------------------------------------------------------------------------------------------- | ---------- | ------ |
| A-001 | Defaults marked `[A]` in SPEC sections 5 and 6 (radii, weights, thresholds) are starting points tuned by evaluation | P5         | open   |
| A-002 | Demo city uses synthetic ward polygons, not real municipal boundaries                                               | P3         | open   |
| A-003 | Calendar-hour SLAs, no holiday calendar                                                                             | P6         | open   |

## Dependency ledger

One row per direct dependency, added in the task that installs it. `make deps-check` compares this table with every `package.json` and `requirements*.txt`. Remove the row when the package is removed.

| Package    | Version | Workspace | Phase | Purpose | Built-in alternative considered |
| ---------- | ------- | --------- | ----- | ------- | ------------------------------- |
| (none yet) |         |           |       |         |                                 |

## Known issues

| ID         | Issue | Phase | Severity | Status |
| ---------- | ----- | ----- | -------- | ------ |
| (none yet) |       |       |          |        |

## Verification log

Newest first. One line per check: date, command, result summary.

| Date       | Command | Result |
| ---------- | ------- | ------ |
| (none yet) |         |        |

## Changelog

One line per closed phase: date, tag, what exists now.

- (none yet)
