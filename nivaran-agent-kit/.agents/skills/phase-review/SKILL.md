---
name: phase-review
description: Strict independent code review of a just-implemented Nivaran phase against its card and plan. The phase id is given in the user's message. Reports findings without changing code.
---

# Phase review (report only)

Act as a strict reviewer who did not write this code. Do not edit anything in this step.

1. Read the phase card, the approved plan (PROGRESS.md and conversation), and the full `git diff` against the last tag or base.
2. Re-run the verification commands yourself. Do not trust earlier claims.
3. Check: incorrect or incomplete behaviour, tenant isolation and authorization gaps, validation and error handling, audit and idempotency, accessibility and all UI states, secrets and PII in logs, regressions, weakened tests, duplicate or needlessly complex code, unapproved dependencies, stray or unrelated files, scope beyond the card, unsupported claims.
4. For each finding give: id (F1, F2...), severity (blocker, major, minor), file and location, evidence, minimal fix. Separate **confirmed defects** from **potential risks**.
5. **Dependency audit:** diff every `package.json`, `requirements*.txt` and the lockfile against the base. Every added direct dependency must be on the card's list, approved in the plan, exact-pinned, have a ledger row, and be actually imported. Report unused packages, scaffolder leftovers, and unexpectedly heavy transitive additions. Run `make deps-check`.
6. Say explicitly which acceptance criteria pass, fail or are unverified.

Stop. Wait for the human to choose which findings to fix.
