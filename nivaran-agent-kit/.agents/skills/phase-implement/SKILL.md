---
name: phase-implement
description: Implement an approved Nivaran phase exactly as planned. The phase id is given in the user's message. Use only after the human approved the plan. Implements, verifies, reports, then stops.
---

# Phase implement

1. Confirm the human approved the plan in this conversation or `PROGRESS.md` says `plan-approved`. If not, stop and ask. Record "plan approved" and set status `implementing` in `PROGRESS.md`.
2. Re-inspect every affected file and `git status`. Preserve uncommitted human changes. If the repo no longer matches the plan, stop and report.
3. Install only the packages in the approved dependency table, exactly pinned, using the procedure in `.agents/rules/dependencies.md`. No scaffolders, `npx`, global installs or host installs. Add ledger rows immediately.
   3b. Implement only the approved scope. Reuse existing modules. No speculative features, duplicate utilities, stray docs or unrelated edits. If a material design decision appears, stop and ask.
4. UI work: follow `docs/DESIGN.md`, build in the gallery first, then screens. Open the app in the browser and capture screenshots at 360 px and 1440 px, light and dark, plus a reduced-motion check.
5. Verify with real commands: `make lint typecheck test deps-check`, plus `make test-tenant` if API or SQL changed, plus `make e2e` if flows changed, plus the phase-specific commands. Do not claim success without observed output.
6. Review your own diff: unrelated edits, new files, new or unused dependencies (`pnpm ls --depth 0 -r` must equal the plan; remove leftovers), secrets, weakened tests. Fix before reporting.
7. Update `PROGRESS.md`: status `in-review`, tick checklist items only with evidence, add Verification log rows, Human actions, Decisions and Assumptions, set "Resume here".
8. Report in the AGENTS.md section 10 format.

Stop. Do not start the next phase. Do not commit.
