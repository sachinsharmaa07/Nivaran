---
trigger: glob
globs: "**/*.tsx, **/*.css, **/*.module.css"
description: "Nivaran UI rules. Apply whenever creating or editing React components or styles."
---

# UI rules (full detail: @docs/DESIGN.md)

1. Read `docs/DESIGN.md` before touching UI. Tokens live only in `apps/web/src/styles/tokens.css`. No hard-coded colors, font sizes, radii or durations anywhere else.
2. Reuse components from `apps/web/src/ui/`. Do not create a second Button, Input, Dialog or Toast. Extend the existing one.
3. Use only semantic tokens (`--surface`, `--text`, `--cta`), never raw ramps (`--asphalt-500`) inside components.
4. Every screen and form implements the full state list in DESIGN section 8: loading, empty, error with retry, offline, 403, 404, session expired.
5. No resting shadows, gradients, blur, glow, parallax, confetti, emoji, uppercase labels, or "→" suffixes.
6. Motion: only the catalog in DESIGN section 3. Animate `transform` and `opacity` only. Respect reduced motion.
7. Every string goes through i18next. No hard-coded user-facing text.
8. Accessibility is not optional: labels, focus ring, 44 px targets, live regions, keyboard operation.
9. Before reporting done: run the DESIGN section 12 gate (axe, 360 px and 1440 px screenshots, keyboard walkthrough, Indic text, reduced motion) and include the self-critique note.
