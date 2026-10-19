---
trigger: glob
globs: "apps/api/**/*.ts, packages/shared/**/*.ts, **/*.sql"
description: "Tenant isolation, data ownership, validation, audit and security rules for API, worker, shared schemas and SQL."
---

# Backend rules (full detail: @docs/SPEC.md sections 4, 5, 7, 8)

1. **Tenant isolation, twice.** Postgres: every tenant table has `tenant_id` and an RLS policy; the API connects as `nivaran_app`, never the owner; set `app.tenant_id` with `SET LOCAL` inside the request transaction. Mongo: all access goes through the scoped repository; every index starts with `tenantId`; no raw collection access in modules.
2. **One authority per entity.** Check SPEC section 4 before adding a table or collection. Cross-store copies are snapshots or derived read models only. Never dual-write an authoritative record.
3. **Validate at the boundary** with zod schemas from `packages/shared`. The same schema drives the web form. Reject unknown fields.
4. **Authorize twice:** route-level role check, then resource-level check (tenant, department, ownership).
5. **Audit in the same transaction** as every state change. Config changes write `config_audit`; issue changes write `audit_events` plus an `outbox` row.
6. **Idempotency:** create endpoints accept `Idempotency-Key`; job ids are deterministic so retries cannot double-fire.
7. **Errors** use the shape in SPEC section 7 with stable codes and a message that says how to fix it. Never leak stack traces, SQL or internal ids.
8. **Logging:** pino JSON to stdout, request id on every line, no PII, tokens, passwords or full emails.
9. **Every new route** must be covered by the tenant-attack suite (`make test-tenant`). A route without coverage fails the suite by design. Do not exempt routes.
10. **Migrations** are forward-only, reviewed, and never edited after merge. RLS is part of the same migration that creates the table.
11. **Uploads:** magic-byte check, size and count limits, re-encode, strip EXIF, presigned URLs only (SPEC section 8).
12. No `any`, no `// @ts-ignore`, no swallowed errors.
