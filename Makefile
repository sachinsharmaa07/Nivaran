# Makefile — Nivaran
# The ONLY interface for building, running and checking the project (AGENTS.md section 6).
# Compatible with GNU Make 3.81 (macOS default): tabs for recipes, no ::=, no $(file ...).
#
# Targets: up down reset logs lint typecheck test build migrate seed
#
# Usage:
#   make up          — start all services (core + app profiles)
#   make down        — stop all containers (keep volumes)
#   make reset       — stop, remove containers, volumes and rebuild images
#   make logs        — tail logs for all running services
#   make lint        — ESLint + Prettier check + ruff (Python)
#   make typecheck   — TypeScript strict check for all workspaces
#   make test        — Vitest (all workspaces) + pytest (ai, in Docker)
#   make build       — build Docker images without starting
#   make migrate     — run database migrations
#   make seed        — seed database with fake tenants and users

COMPOSE = docker compose --env-file .env -f infra/compose/docker-compose.yml
ENV_FILE = .env
AI_TEST_IMAGE = nivaran-ai-test

.PHONY: up
up: $(ENV_FILE)
	@echo "==> Starting core data services..."
	$(COMPOSE) --profile core up -d --wait
	@echo "==> Starting app services..."
	$(COMPOSE) --profile app up -d --wait
	@echo "==> All services healthy. Run 'make logs' to follow."

.PHONY: down
down:
	$(COMPOSE) --profile app --profile core down

.PHONY: reset
reset:
	@echo "==> Stopping and removing containers and volumes..."
	$(COMPOSE) --profile app --profile core down -v --remove-orphans
	@echo "==> Rebuilding images (no cache)..."
	$(COMPOSE) --profile app build --no-cache
	@echo "==> Reset complete. Run 'make up' to start."

.PHONY: logs
logs:
	$(COMPOSE) --profile app --profile core logs -f

.PHONY: lint
lint: node_modules
	@echo "==> ESLint..."
	pnpm run lint
	@echo "==> Prettier check..."
	pnpm exec prettier --check .
	@echo "==> Ruff (AI image test stage)..."
	docker build -f apps/ai/Dockerfile --target test -t $(AI_TEST_IMAGE) .
	docker run --rm $(AI_TEST_IMAGE) ruff check .
	@echo "==> Lint: OK"

.PHONY: typecheck
typecheck: node_modules
	@echo "==> TypeScript type check..."
	pnpm run typecheck
	@echo "==> Typecheck: OK"

.PHONY: test
test: node_modules
	@echo "==> Vitest (all workspaces)..."
	pnpm exec vitest run
	@echo "==> pytest (AI image test stage)..."
	docker build -f apps/ai/Dockerfile --target test -t $(AI_TEST_IMAGE) .
	docker run --rm $(AI_TEST_IMAGE) pytest
	@echo "==> Test: OK"

.PHONY: build
build:
	@echo "==> Building all Docker images..."
.PHONY: migrate
migrate: node_modules
	@echo "==> Running database migrations..."
	pnpm --filter @nivaran/api run build
	node --env-file=.env apps/api/dist/db/migrate.js
	@echo "==> Migrations: OK"

.PHONY: seed
seed: node_modules
	@echo "==> Seeding database..."
	pnpm --filter @nivaran/api run build
	node --env-file=.env apps/api/dist/db/seed.js
	@echo "==> Seed: OK"

.PHONY: eval-dedup
eval-dedup: node_modules
	@echo "==> Evaluating duplicate detection precision/recall..."
	pnpm --filter @nivaran/api run build
	node --env-file=.env apps/api/dist/db/eval-dedup.js
	@echo "==> eval-dedup: OK"

# ── Helpers ───────────────────────────────────────────────────────────────────

$(ENV_FILE):
	@echo "==> .env not found — copying from .env.example"
	cp .env.example $(ENV_FILE)
	@echo "==> .env created. Review it before running make up."

node_modules: package.json pnpm-workspace.yaml
	pnpm install --frozen-lockfile
	@touch node_modules
