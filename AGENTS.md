# Nivaran rules

Multi-tenant civic issue reporting platform (college capstone). Build fast, keep it working.

- Read only the doc sections the prompt names. Don't explore the repo beyond what you need.
- Build what the prompt asks in as few tool calls as possible. No plan step, no questions unless truly blocked.
- Install only packages the code needs; no scaffolders; prefer Node/browser built-ins. Mention new packages in one line.
- Every tenant-owned row/document has tenant_id and is accessed only through the tenant-scoped data layer.
- AI never decides priority, routing or status.
- Validate input with zod. Never log tokens, passwords or emails. Secrets only in .env.
- Don't commit or push. No terraform apply. No destructive commands.
- When done run `make lint typecheck test` once and reply in 6 lines max: files changed, results, blockers. No code in the reply, command output tail -30 only.
- No new markdown files. Update PROGRESS.md only by ticking its checklist.
