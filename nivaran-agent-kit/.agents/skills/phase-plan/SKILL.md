---
name: phase-plan
description: Plan one Nivaran phase without editing code. The phase id (for example P4) is given in the user's message. Use before implementing any phase. Produces a plan and change budget, then stops for approval.
---

# Phase plan (planning only)

The phase id comes from the user's message. If missing or not in `docs/PHASES.md`, ask.

Do not edit code, install dependencies or run migrations.

1. Read `PROGRESS.md`, `docs/SPEC.md`, the phase card, and `docs/DESIGN.md` if the phase touches UI. Check earlier phases are `done`; if not, stop and say so.
2. Inspect existing code that can be reused. Check `git status`.
3. Produce the plan:
   - Problem being solved, included requirements, explicit exclusions (copied from the card).
   - **Change budget:** existing files to change (why), new files required (why an existing file cannot hold it), **dependency table** (each package: exact version, workspace, purpose, built-in alternative considered and why insufficient; only packages named in the card's Dependencies line; drop any you cannot justify; state "no new dependencies" when true), API and schema changes, tests to add.
   - Acceptance criteria copied from the card, each with the exact command or test that will prove it.
   - Security, error-handling, tenant-isolation and UI-state considerations.
   - Human actions required (accounts, keys, approvals).
   - Risks and open questions. Every assumption labelled.
4. Do not add features because they seem useful. Suggest them separately.
5. Update `PROGRESS.md`: status `planning`, copy the acceptance criteria into "Current phase checklist", set "Resume here" to "plan awaiting approval". Nothing else.

Stop and wait for the human's approval message. Do not implement.
