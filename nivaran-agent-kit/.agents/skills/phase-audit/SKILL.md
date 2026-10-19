---
name: phase-audit
description: Read-only audit of the repository against SPEC and the current phase card. Use at the start of a phase, when resuming in a new conversation, or when the repo state is unclear. Makes no changes.
---

# Phase audit (read-only)

Do not create, modify, rename, delete or install anything. Do not run migrations or containers.

1. Read `PROGRESS.md`, `docs/SPEC.md`, the current phase card in `docs/PHASES.md`, and `git status` plus `git log --oneline -15`.
2. Inspect the directory tree, config, dependencies, tests and docs. Derive the real architecture from repository evidence, not from assumption.
3. Search before claiming something is missing.
4. Compare the repo with the phase card and SPEC. Cite file paths.
5. Separate **confirmed findings** from **uncertainties**. Do not resolve contradictions by guessing.
6. Check the tree against AGENTS.md section 4 and list stray files, duplicates, unapproved dependencies and unused code.

Return exactly: current state, existing architecture, coverage of the phase card, confirmed problems with evidence, uncertainties needing a human decision, files likely to change next and why.

Stop. Wait for the human. Do not edit PROGRESS.md in this step.
