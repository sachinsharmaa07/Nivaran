# Nivaran

A multi-tenant platform for crowdsourced civic issue reporting and resolution. Citizens report issues with a photo and location; municipal teams triage, resolve and are held to deadlines; the public sees accountability metrics.

Status: see [PROGRESS.md](PROGRESS.md).

## Quickstart

Filled in during P0. Target: `make up` starts everything, `make seed` loads demo data.

## Repository map

| Path              | Purpose                                                  |
| ----------------- | -------------------------------------------------------- |
| `apps/web`        | React PWA                                                |
| `apps/api`        | API and background worker                                |
| `apps/ai`         | AI service (embeddings)                                  |
| `packages/shared` | Shared schemas and types                                 |
| `infra/`          | Compose, Terraform, Ansible, Helm, Kubernetes            |
| `data/`           | Synthetic data generators and seeds                      |
| `tests/`          | End-to-end, load and tenant-isolation tests              |
| `docs/`           | Specification, design system, phases, runbooks, evidence |

## Documents

- [docs/SPEC.md](docs/SPEC.md): what to build
- [docs/DESIGN.md](docs/DESIGN.md): design system
- [docs/PHASES.md](docs/PHASES.md): phase plan and acceptance criteria
- [docs/PROMPTS.md](docs/PROMPTS.md): how to drive the AI agent
- [docs/HUMAN-CHECKLIST.md](docs/HUMAN-CHECKLIST.md): human-only setup steps
- [AGENTS.md](AGENTS.md): rules every agent session follows
