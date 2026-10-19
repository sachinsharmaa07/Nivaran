# DESIGN: Nivaran

Read before any UI work. Tokens live in exactly one file, `apps/web/src/styles/tokens.css`, created from section 2. No hard-coded colors, sizes, durations or radii outside it.

## 1. Concept: roadworks and wayfinding

Nivaran is about roads, pipes, lights and bins being fixed. The visual language comes from that world: **asphalt** surfaces, **road-paint yellow** for the one action that matters, **signage green** for resolution, plain **wayfinding type**. It should feel like trustworthy public infrastructure: calm, legible outdoors on a phone in sunlight, never playful or startup-generic.

Principles:

1. **One memorable thing: the lane line.** A dashed road centre-line is the signature motif. It is the issue timeline connector, the loader, and the sync progress. Everything else stays quiet.
2. **Legibility over decoration.** Large type, high contrast, 44 px targets. Citizens use this outdoors, often on weak networks.
3. **Show what changed.** Motion answers a user action (a status moves, a queue reorders). It never decorates.
4. **Structure carries information.** Borders, plates and dividers exist because they group or rank content, not for style.
5. **Plain words.** Name things as citizens do. Say what happens next.
6. **Never a dead end.** Every screen has loading, empty, error, offline, forbidden and expired states.
7. **Restraint.** Spend boldness in one place. Cut any element that does not serve a task.

Avoid these generic traits (they read as templated): cream background with serif and terracotta; near-black with one neon accent; identical rounded cards with the same soft shadow; gradient washes; tracked-out all-caps labels above headings; one accented word in a headline; "→" appended to every link; monospace for small labels.

## 2. Tokens

### Color

```css
:root {
  /* Asphalt: neutral, faint green-grey tint */
  --asphalt-0: #ffffff;
  --asphalt-50: #f6f8f7;
  --asphalt-100: #ecefee;
  --asphalt-200: #dce1df;
  --asphalt-300: #c3cac7;
  --asphalt-400: #97a19d;
  --asphalt-500: #6c7772;
  --asphalt-600: #4f5954;
  --asphalt-700: #39423e;
  --asphalt-800: #252c29;
  --asphalt-900: #171b1a;
  --asphalt-950: #0e1110;
  /* Paint yellow: primary call to action, "work in progress" */
  --paint-50: #fff9db;
  --paint-100: #fff0a3;
  --paint-200: #fbe26b;
  --paint-300: #f7d13e;
  --paint-400: #f2c21b;
  --paint-500: #d9a800;
  --paint-600: #a87f00;
  --paint-700: #765900;
  /* Signage green: resolved, success */
  --sign-50: #e8f5ee;
  --sign-100: #c6e6d6;
  --sign-300: #6cc29a;
  --sign-500: #1e9460;
  --sign-600: #167a4e;
  --sign-700: #0f5e3e;
  --sign-800: #0b4a32;
  /* Water blue: information, links, assigned */
  --water-50: #e8f1f8;
  --water-100: #c7ddee;
  --water-300: #7fb2d8;
  --water-500: #2a78b5;
  --water-600: #1d6196;
  --water-700: #154a75;
  /* Kerb red: critical, danger, reopened */
  --kerb-50: #fdecea;
  --kerb-100: #f9cfca;
  --kerb-300: #ee8a82;
  --kerb-500: #d13f34;
  --kerb-600: #b3322a;
  --kerb-700: #8e2620;
  /* Signal orange: high priority, warning */
  --signal-50: #fff1e3;
  --signal-100: #ffd9b3;
  --signal-300: #f5a55c;
  --signal-500: #e8761a;
  --signal-600: #bf5b0a;
  --signal-700: #8f4306;
}
```

Semantic tokens (components use only these, never the raw ramps):

| Token                                            | Light                   | Dark                      |
| ------------------------------------------------ | ----------------------- | ------------------------- |
| `--bg`                                           | asphalt-50              | asphalt-950               |
| `--surface`                                      | asphalt-0               | asphalt-900               |
| `--surface-sunken`                               | asphalt-100             | asphalt-950               |
| `--surface-raised` (overlays)                    | asphalt-0               | asphalt-800               |
| `--text`                                         | asphalt-900             | asphalt-100               |
| `--text-muted`                                   | asphalt-600             | asphalt-300               |
| `--text-subtle`                                  | asphalt-500             | asphalt-400               |
| `--border`                                       | asphalt-200             | asphalt-700               |
| `--border-control` (inputs, 3:1 against surface) | asphalt-500             | asphalt-500               |
| `--primary` / `--on-primary`                     | asphalt-900 / asphalt-0 | asphalt-100 / asphalt-900 |
| `--cta` / `--on-cta`                             | paint-400 / asphalt-900 | paint-400 / asphalt-900   |
| `--link`                                         | water-600               | water-300                 |
| `--focus-inner` / `--focus-outer`                | asphalt-900 / paint-400 | asphalt-100 / paint-400   |

Rules: yellow is only ever a fill with dark text, never text on a light surface. Solid color fills are for buttons and map pins. Chips and banners use **tint background (50 or 100), 700 text, 300 border**; dark mode derives them as ramp-700 at 35 percent over the surface, ramp-100 text, ramp-500 border at 60 percent. Color is never the only carrier of meaning: always an icon or text too.

Issue status chips (icon plus label plus color):

| Status                      | Ramp                   | Icon          |
| --------------------------- | ---------------------- | ------------- |
| submitted                   | asphalt                | circle-dashed |
| triaged, assigned           | water                  | user-check    |
| in_progress                 | paint                  | construction  |
| resolved (awaiting citizen) | sign                   | check         |
| closed                      | asphalt                | circle-check  |
| reopened                    | kerb                   | rotate-ccw    |
| duplicate                   | asphalt, dashed border | copy          |
| rejected                    | asphalt                | ban           |

Priority is shown as a 4-bar meter plus a word (critical kerb, high signal, medium paint, low asphalt). Shape and label differ from status chips, so the two never get confused.

### Typography

- Display and headings: **Barlow Semi Condensed** 600. Wayfinding-sign heritage, compact for narrow phones.
- Body and UI: **Public Sans** 400, 500. Built for civic interfaces, very legible.
- Hindi and Punjabi: **Noto Sans Devanagari** and **Noto Sans Gurmukhi** (Barlow has no Indic glyphs). Stack: `"Public Sans","Noto Sans Devanagari","Noto Sans Gurmukhi",system-ui,sans-serif`. Set the `lang` attribute on every Indic block. Add 0.1 to line-height for Indic text. Budget +40 percent text width for translations.
- Self-host through `@fontsource` packages (offline PWA, no third-party requests). `font-display: swap`. Load only used weights and subsets.
- Scale (size/line-height, px): display 40/44, h1 32/38, h2 24/30, h3 20/26, body 16/24, small 14/20, caption 12/16 (never smaller). Mobile display drops to 32/38.
- Sentence case everywhere. No uppercase transforms. `font-variant-numeric: tabular-nums` for IDs, counts and metrics (no monospace). Max line length 70 characters.

### Space, shape, elevation

- Spacing scale (px): 4, 8, 12, 16, 24, 32, 48, 64. Breakpoints: 360, 640, 1024, 1440. Content max width 1200.
- Radius hierarchy: `--r-sm` 4 (chips, badges), `--r-md` 8 (controls), `--r-lg` 12 (panels), sheets 16 top corners only. Avatars and status dots are circles. Never one radius for everything.
- Surfaces separate by tone and a 1 px `--border`. **No resting shadows.** Elevation exists only for overlays (menus, dialogs, toasts): `--shadow-overlay: 0 8px 24px rgba(14,17,16,.18), 0 2px 6px rgba(14,17,16,.12)`.
- **Sign plate:** the one distinctive container. A panel with a 2 px inset border line (`outline: 2px solid var(--border); outline-offset: -6px`), used only for KPI figures and the report review summary. Ordinary content is flat.
- Focus ring: 2 px `--focus-inner` inside, 4 px `--focus-outer` outside, on every interactive element, visible in both themes.

## 3. Motion

Tokens: `--dur-instant` 80 ms, `--dur-fast` 140, `--dur-base` 220, `--dur-slow` 360, `--dur-draw` 560. Easing: `--ease-out` cubic-bezier(.16,1,.3,1), `--ease-in-out` cubic-bezier(.65,0,.35,1), `--ease-in` cubic-bezier(.7,0,.84,0).

Rules: animate only `transform` and `opacity` (plus SVG `stroke-dashoffset` for the lane line). Single interactions never exceed 560 ms. Non-user-triggered motion is limited to loaders, a one-time KPI count-up, and the critical-pin pulse (3 cycles, then still). No stagger on lists longer than 6. Use `motion` with `MotionConfig reducedMotion="user"` plus a CSS `prefers-reduced-motion` block: with reduced motion, transforms become instant, fades stay under 140 ms, count-up and the lane-line travel are static.

| Trigger                       | Motion                                                                     | Duration            |
| ----------------------------- | -------------------------------------------------------------------------- | ------------------- |
| Button press                  | scale .98, tone shift                                                      | 80 ms               |
| Toast in / out                | translateY 8 px + fade                                                     | 220 / 140 ms        |
| Dialog open                   | scale .98 to 1 + fade, backdrop fade                                       | 220 ms              |
| Mobile bottom sheet           | translateY 100 percent to 0                                                | 220 ms              |
| Route change                  | content fade only, no slide                                                | 140 ms              |
| Queue reorder after rescoring | layout animation, changed row flashes `--paint-100` fading out             | 360 ms, 1.2 s       |
| Status change                 | chip crossfade; timeline segment **paints** (dash draw); node pops .8 to 1 | 220 / 560 / 220 ms  |
| Form error                    | message expands in place. No shake                                         | 140 ms              |
| Citizen confirms fix          | check mark stroke draws                                                    | 400 ms              |
| Report pin placed             | drop 12 px with fade                                                       | 220 ms              |
| KPI first view                | count-up once                                                              | 700 ms              |
| Loading over 300 ms           | lane-line loader: dashes travel left to right                              | 1.2 s loop          |
| Skeleton                      | opacity .6 to 1 pulse; content replaces with fade                          | 1.4 s loop / 140 ms |
| Offline banner                | slides down; sync uses the lane-line progress                              | 220 ms              |

## 4. Effects

Allowed: hairline borders, tonal surfaces, the overlay shadow, the sign plate, the lane line, pressed and focus states, a 4 px **hazard-stripe top edge** (repeating 45 degree paint-400 and asphalt-900) used **only** on SLA-breached banners.
Forbidden: glassmorphism or backdrop blur, gradient washes or mesh backgrounds, glow or neon, parallax, tilt, cursor effects, confetti, text gradients, auto-playing carousels, decorative icons beside every heading, emoji in the UI.

## 5. Components and required states

Build once in `apps/web/src/ui/`, document in the dev-only gallery route `/dev/ui`, reuse everywhere. Radix primitives supply accessibility behaviour; style them with tokens.

AppShell (citizen top bar, staff left rail) · Button (primary asphalt, cta yellow, secondary outline, danger, ghost; loading and disabled) · IconButton (aria-label required) · FormField (label, hint, error) · TextInput, Textarea, Select · PhotoPicker · LocationPicker · StepWizard · StatusChip · PriorityMeter · SlaRing · LaneTimeline · KpiPlate · DataTable (becomes stacked rows under 640 px) · MapView · ExplainPanel (factor bars with weights) · Dialog, ConfirmDialog, BottomSheet · Toast (with undo) · Skeleton · EmptyState · ErrorState · OfflineBanner · LanguageSwitcher · ThemeToggle.

Every component's gallery entry shows: default, hover, focus, active, disabled, loading, error, empty (where relevant), light and dark, long text, and an Indic-script sample.

## 6. Screens and layout

Citizen home, mobile first. The map is the page, a draggable bottom sheet holds actions:

```
+-----------------------------+
| Nivaran  Ludhiana   EN  menu|
+-----------------------------+
|                             |
|    full-bleed map           |
|    pins, clusters, you      |
|                             |
+-----------------------------+  bottom sheet (drag up)
|  ----                       |
|  12 open issues near you    |
|  [ Report an issue ]  (cta) |
|  nearby issue rows          |
+-----------------------------+
```

Report wizard: four steps (Where, What, Photos, Review), a lane-line progress bar, Back always available, draft saved on every step, Review shown on a sign plate.

Staff workbench, desktop: left rail, queue table, right detail panel.

```
+------+--------------------------------------+------------------------+
| rail | filters: dept, ward, status, search  | PRIORITY  78  high     |
| Queue|--------------------------------------| factor bars + weights  |
| Map  | meter | id | category | ward | sla   | override (with reason) |
| Team | rows ... (reorders when rescored)    | lane timeline          |
| Admin|                                      | assign | note | resolve |
+------+--------------------------------------+------------------------+
```

Public dashboard: tenant header, four KPI plates (median resolution, SLA compliance, open now, reopen rate), map with hotspots, department table, methodology link, a visible note where small counts are suppressed.

Citizen issue page: status chip, lane timeline with timestamps, evidence photos, "Confirm fixed" and "Still broken" actions once resolved.

## 7. Content and voice

Sentence case. Active verbs that say what happens: "Report an issue", "Save draft", "Confirm fix". The same action keeps the same name in button, toast and history ("Report sent"). Errors say what happened and how to fix it ("Photo is larger than 8 MB. Choose a smaller photo or take it again."), never apologise vaguely, never blame the user. Empty states invite the next action. Dates `18 Oct 2026`, 24-hour times, IST by default, tenant timezone from config. Numbers use the locale's grouping. No jargon: say "issue", "area", "deadline" rather than "ticket", "geofence", "SLA" (the word SLA appears only on staff screens).

## 8. Fool-proof UX rules (every screen and form)

1. States: loading, empty, error with retry, offline, forbidden (403), not found (404), session expired (sign in again without losing work).
2. Forms: label always visible, inline validation on blur and on submit, error text linked with `aria-describedby`, focus moves to the first error, entered values survive errors and reloads (draft autosave), submit disabled and shows progress while pending, idempotency key on every create.
3. Destructive or irreversible actions use ConfirmDialog stating the consequence. Reversible actions use a toast with Undo for 8 seconds.
4. Constraints are explained before they bite (file type and size, required fields, character limits).
5. Slow network: optimistic UI where safe, skeletons, never a blank screen, retry buttons, timeouts with a plain message.
6. Permissions: hide actions the role cannot use. If a stale link leads to one, show a clear 403 page with a way back.
7. No dead ends: every error or empty state offers a next action.
8. Input safety: trim, normalise and cap lengths on the client and the server. Server validation is authoritative.
9. i18n: no hard-coded strings; every string goes through i18next; layout survives +40 percent text and Indic scripts.
10. Never rely on hover. Touch targets at least 44 by 44 px. Works one-handed on a 360 px phone.

## 9. Accessibility (WCAG 2.2 AA target)

Text contrast 4.5:1, large text and UI borders 3:1 (verify every token pair with axe, do not assume). Full keyboard operation including the map (list view alternative with the same data). Visible focus. Semantic landmarks, one h1 per page. Live regions for toasts and status changes. Dialogs trap and restore focus. Respect `prefers-reduced-motion` and `prefers-color-scheme`. Images need alt text; user photos get "Photo of issue" plus the category. 200 percent zoom without horizontal scroll.

## 10. Map

Leaflet with OpenStreetMap raster tiles for the capstone (visible attribution required; respect the tile usage policy and plan a free-tier tile provider before any public demo). Pins are shaped by category, colored by priority, outlined by status. Cluster beyond zoom 15. Ward boundaries as 1.5 px asphalt-500 lines, no fill. A list view mirrors the map for keyboard and screen-reader users.

## 11. Charts

Recharts. Direct labels over legends. Palette order for series: asphalt-700, water-600, sign-600, signal-500, kerb-600; never rely on color alone (add direct labels or patterns). Every chart has a data-table toggle and a text summary. Axis text 12 px minimum.

## 12. Design QA gate (required before any UI task is reported done)

- axe-core: zero serious or critical violations on every changed screen, light and dark.
- Screenshots at 360 px and 1440 px reviewed, plus a reduced-motion run.
- Keyboard-only walkthrough of the changed flow succeeds.
- Hindi and Punjabi sample strings at +40 percent width do not break layout.
- All states in section 8 exist for new screens and components.
- No hard-coded colors or durations (lint or grep check).
- Self-critique note in the report: what one element carries the design, and what was cut.
