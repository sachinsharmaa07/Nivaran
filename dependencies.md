---
trigger: glob
globs: "**/package.json, pnpm-lock.yaml, pnpm-workspace.yaml, .npmrc, **/requirements*.txt, **/Dockerfile*, **/*.toml"
description: "Zero-extra-installs procedure. Apply whenever a manifest, lockfile, Dockerfile or install command is touched."
---

# Dependency rules (full detail: @docs/SPEC.md section 3 and the Dependencies line of the current phase card in @docs/PHASES.md)

Install nothing that is not named in the current phase card's Dependencies line **and** approved in the plan.

**Before installing anything**

1. Check whether Node, the browser, CSS, SQL, PostGIS or code already in the repo does the job. Written reason required to use a package instead.
2. Confirm the package is on the phase list. If not, stop and ask. Offer two alternatives that are on the list or built in.

**How to install** 3. Only `pnpm add --save-exact -F <workspace> <pkg>@<version>` (or `-D` for dev). Python: add one pinned line to `requirements.txt` or `requirements-dev.txt` and install inside the container. 4. Never use: `npm create`, `create-vite` or any scaffolder, `npx` or `pnpm dlx` one-offs, `npm install -g`, `pip install` on the host, `apt` or `brew`, `sudo`, `latest` or range specifiers. 5. Pick versions at least two weeks old. Do not accept install scripts from dependencies beyond the explicit allowlist the phase needs. 6. Add the ledger row in PROGRESS.md in the same task: package, version, workspace, phase, purpose, built-in alternative considered.

**After installing** 7. Run `pnpm ls --depth 0 -r` and `make deps-check`. The list must equal the plan. Report any surprising transitive weight. 8. Remove anything unused with `pnpm remove` and delete its ledger row, in the same task. 9. Docker images: multi-stage, production dependencies only (no dev tooling in runtime stages), minimal base, `.dockerignore` present. Report final image sizes. 10. Never install Antigravity plugins, MCP servers or marketplace skills for this project. Rules and skills come only from this repository.
