---
name: phase-recover
description: Stop and recover when the agent went off track, expanded scope, or broke something. Compares repo and diff against approved scope and proposes a minimal recovery plan without reverting anything blindly.
---

# Phase recover

Stop all implementation now. Do not delete or revert anything.

1. Compare `git diff`, `git status` and the file tree against the approved plan and the phase card.
2. List: files created or changed unnecessarily, features outside scope, duplicated code or dependencies, existing behaviour changed by accident, unverified claims, failing or weakened tests.
3. For every proposed removal, inspect what depends on it first.
4. Present findings and a minimal recovery plan (smallest set of edits or reverts, in order, with the risk of each).

Wait for the human's approval before changing anything. Record the incident in `PROGRESS.md` Known issues.
