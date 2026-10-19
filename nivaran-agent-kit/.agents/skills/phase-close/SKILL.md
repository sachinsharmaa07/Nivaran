---
name: phase-close
description: Close a Nivaran phase after the human approved the review. The phase id is given in the user's message. Updates PROGRESS.md and proposes the commit and tag. Never commits.
---

# Phase close

1. Confirm the human approved the review result. If not, stop and ask.
2. Check every acceptance criterion in the phase card has evidence in the Verification log. If any lacks evidence, stop and list it.
3. Confirm no unresolved blocker findings, that `.env.example` and docs match the code, and that `make deps-check` passes with the ledger matching the manifests.
4. Update `PROGRESS.md`: phase status `done` with date and tag, one Changelog line, clear the phase checklist, move the next phase to `todo` with "Resume here" pointing to `/phase-audit` then `/phase-plan <next>`.
5. Print for the human to run (do not run them): `git add -A`, a conventional commit message, `git tag pN-done`.

Stop.
