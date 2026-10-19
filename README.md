# Nivaran

Multi-tenant civic issue reporting platform. Citizens report potholes, garbage, water leaks and more. The city resolves them.

## Requirements

- Docker ≥ 25, Docker Compose v2
- Node 22 LTS (`nvm use`)
- pnpm ≥ 10 (`corepack enable`)

## Quickstart

```sh
git clone <repo-url> nivaran && cd nivaran
cp .env.example .env           # review defaults — no secrets needed locally
make up                        # starts all services (downloads images first time)
```

Services:

| Service    | URL                   |
| ---------- | --------------------- |
| Web app    | http://localhost:5173 |
| API        | http://localhost:4000 |
| AI service | http://localhost:8000 |
| MinIO UI   | http://localhost:9001 |
| Mailpit    | http://localhost:8025 |

## Development commands

```sh
make up          # start all containers
make down        # stop containers (keep data)
make reset       # wipe volumes and rebuild images
make logs        # follow all logs
make lint        # ESLint + Prettier + ruff
make typecheck   # TypeScript strict check
make test        # Vitest + pytest
make build       # build Docker images only
make deps-check  # verify package list vs P0 plan
```

## Project layout

```
apps/web        React PWA
apps/api        Express API + worker
apps/ai         FastAPI embeddings service
packages/shared Zod schemas and types (P1+)
infra/compose   Docker Compose files
scripts/        Zero-dependency Node scripts
docs/           SPEC, DESIGN, PHASES, runbooks
```

See `docs/SPEC.md` for the full specification and `PROGRESS.md` for the build journal.
