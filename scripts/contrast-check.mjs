#!/usr/bin/env node
/**
 * scripts/contrast-check.mjs
 * WCAG 2.2 AA Contrast Checker for Nivaran Semantic Tokens
 * Uses Node built-ins only.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tokensPath = path.resolve(__dirname, "../apps/web/src/styles/tokens.css");

// ── Color Utilities ──────────────────────────────────────────────────────────

function parseHex(hex) {
  const clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return { r, g, b };
  }
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return { r, g, b };
}

function sRgbToLinear(c) {
  const norm = c / 255;
  return norm <= 0.04045 ? norm / 12.92 : Math.pow((norm + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex) {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * sRgbToLinear(r) + 0.7152 * sRgbToLinear(g) + 0.0722 * sRgbToLinear(b);
}

function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function mixColors(hex1, hex2, p1 = 0.35) {
  const c1 = parseHex(hex1);
  const c2 = parseHex(hex2);
  const r = Math.round(c1.r * p1 + c2.r * (1 - p1))
    .toString(16)
    .padStart(2, "0");
  const g = Math.round(c1.g * p1 + c2.g * (1 - p1))
    .toString(16)
    .padStart(2, "0");
  const b = Math.round(c1.b * p1 + c2.b * (1 - p1))
    .toString(16)
    .padStart(2, "0");
  return `#${r}${g}${b}`;
}

// ── Read Base Palette from tokens.css ────────────────────────────────────────

const css = fs.readFileSync(tokensPath, "utf-8");
const hexMatchRegex = /--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6});/g;
const palette = {};
let match;
while ((match = hexMatchRegex.exec(css)) !== null) {
  palette[match[1]] = match[2];
}

// Ensure base asphalt & paint palette defaults
palette["asphalt-0"] = palette["asphalt-0"] || "#ffffff";
palette["asphalt-50"] = palette["asphalt-50"] || "#f6f8f7";
palette["asphalt-100"] = palette["asphalt-100"] || "#ecefee";
palette["asphalt-200"] = palette["asphalt-200"] || "#dce1df";
palette["asphalt-300"] = palette["asphalt-300"] || "#c3cac7";
palette["asphalt-400"] = palette["asphalt-400"] || "#97a19d";
palette["asphalt-500"] = palette["asphalt-500"] || "#6c7772";
palette["asphalt-600"] = palette["asphalt-600"] || "#4f5954";
palette["asphalt-700"] = palette["asphalt-700"] || "#39423e";
palette["asphalt-800"] = palette["asphalt-800"] || "#252c29";
palette["asphalt-900"] = palette["asphalt-900"] || "#171b1a";
palette["asphalt-950"] = palette["asphalt-950"] || "#0e1110";

palette["paint-100"] = palette["paint-100"] || "#fff0a3";
palette["paint-400"] = palette["paint-400"] || "#f2c21b";
palette["paint-700"] = palette["paint-700"] || "#765900";

palette["water-100"] = palette["water-100"] || "#c7ddee";
palette["water-300"] = palette["water-300"] || "#7fb2d8";
palette["water-600"] = palette["water-600"] || "#1d6196";
palette["water-700"] = palette["water-700"] || "#154a75";

palette["sign-100"] = palette["sign-100"] || "#c6e6d6";
palette["sign-300"] = palette["sign-300"] || "#6cc29a";
palette["sign-700"] = palette["sign-700"] || "#0f5e3e";

palette["kerb-100"] = palette["kerb-100"] || "#f9cfca";
palette["kerb-300"] = palette["kerb-300"] || "#ee8a82";
palette["kerb-700"] = palette["kerb-700"] || "#8e2620";

palette["signal-100"] = palette["signal-100"] || "#ffd9b3";
palette["signal-300"] = palette["signal-300"] || "#f5a55c";
palette["signal-700"] = palette["signal-700"] || "#8f4306";

// ── Test Definitions ─────────────────────────────────────────────────────────

const tests = [
  // LIGHT MODE: Text & Backgrounds (target 4.5:1 for normal text)
  {
    mode: "light",
    desc: "Text on Page Background",
    fg: palette["asphalt-900"],
    bg: palette["asphalt-50"],
    min: 4.5,
  },
  {
    mode: "light",
    desc: "Text on Surface",
    fg: palette["asphalt-900"],
    bg: palette["asphalt-0"],
    min: 4.5,
  },
  {
    mode: "light",
    desc: "Text on Sunken Surface",
    fg: palette["asphalt-900"],
    bg: palette["asphalt-100"],
    min: 4.5,
  },
  {
    mode: "light",
    desc: "Text on Raised Surface",
    fg: palette["asphalt-900"],
    bg: palette["asphalt-0"],
    min: 4.5,
  },
  {
    mode: "light",
    desc: "Muted Text on Surface",
    fg: palette["asphalt-600"],
    bg: palette["asphalt-0"],
    min: 4.5,
  },
  {
    mode: "light",
    desc: "Muted Text on Page Background",
    fg: palette["asphalt-600"],
    bg: palette["asphalt-50"],
    min: 4.5,
  },
  {
    mode: "light",
    desc: "Subtle Text on Surface",
    fg: palette["asphalt-500"],
    bg: palette["asphalt-0"],
    min: 4.5,
  },
  {
    mode: "light",
    desc: "Link on Surface",
    fg: palette["water-600"],
    bg: palette["asphalt-0"],
    min: 4.5,
  },
  {
    mode: "light",
    desc: "Link on Page Background",
    fg: palette["water-600"],
    bg: palette["asphalt-50"],
    min: 4.5,
  },
  {
    mode: "light",
    desc: "On-CTA (Dark) on CTA (Paint Yellow)",
    fg: palette["asphalt-900"],
    bg: palette["paint-400"],
    min: 4.5,
  },
  {
    mode: "light",
    desc: "On-Primary on Primary",
    fg: palette["asphalt-0"],
    bg: palette["asphalt-900"],
    min: 4.5,
  },
  {
    mode: "light",
    desc: "Band Text on Asphalt Band Header",
    fg: palette["asphalt-0"],
    bg: palette["asphalt-900"],
    min: 4.5,
  },
  {
    mode: "light",
    desc: "Band Muted Text on Asphalt Band Header",
    fg: palette["asphalt-400"],
    bg: palette["asphalt-900"],
    min: 4.5,
  },

  // LIGHT MODE: Chip Tints (text on tint background)
  {
    mode: "light",
    desc: "Chip Asphalt (700 text on 100 bg)",
    fg: palette["asphalt-700"],
    bg: palette["asphalt-100"],
    min: 4.5,
  },
  {
    mode: "light",
    desc: "Chip Water (700 text on 100 bg)",
    fg: palette["water-700"],
    bg: palette["water-100"],
    min: 4.5,
  },
  {
    mode: "light",
    desc: "Chip Paint (700 text on 100 bg)",
    fg: palette["paint-700"],
    bg: palette["paint-100"],
    min: 4.5,
  },
  {
    mode: "light",
    desc: "Chip Sign (700 text on 100 bg)",
    fg: palette["sign-700"],
    bg: palette["sign-100"],
    min: 4.5,
  },
  {
    mode: "light",
    desc: "Chip Kerb (700 text on 100 bg)",
    fg: palette["kerb-700"],
    bg: palette["kerb-100"],
    min: 4.5,
  },
  {
    mode: "light",
    desc: "Chip Signal (700 text on 100 bg)",
    fg: palette["signal-700"],
    bg: palette["signal-100"],
    min: 4.5,
  },

  // LIGHT MODE: Interactive Controls & Border Pairs (target 3.0:1)
  {
    mode: "light",
    desc: "Control Border on Surface",
    fg: palette["asphalt-500"],
    bg: palette["asphalt-0"],
    min: 3.0,
  },
  {
    mode: "light",
    desc: "Control Border on Page Background",
    fg: palette["asphalt-500"],
    bg: palette["asphalt-50"],
    min: 3.0,
  },
  {
    mode: "light",
    desc: "Control Border on Sunken Surface",
    fg: palette["asphalt-500"],
    bg: palette["asphalt-100"],
    min: 3.0,
  },

  // DARK MODE: Text & Backgrounds (target 4.5:1 for normal text)
  {
    mode: "dark",
    desc: "Text on Dark Page Background",
    fg: palette["asphalt-100"],
    bg: palette["asphalt-950"],
    min: 4.5,
  },
  {
    mode: "dark",
    desc: "Text on Dark Surface",
    fg: palette["asphalt-100"],
    bg: palette["asphalt-900"],
    min: 4.5,
  },
  {
    mode: "dark",
    desc: "Text on Dark Raised Surface",
    fg: palette["asphalt-100"],
    bg: palette["asphalt-800"],
    min: 4.5,
  },
  {
    mode: "dark",
    desc: "Muted Text on Dark Surface",
    fg: palette["asphalt-300"],
    bg: palette["asphalt-900"],
    min: 4.5,
  },
  {
    mode: "dark",
    desc: "Muted Text on Dark Page Background",
    fg: palette["asphalt-300"],
    bg: palette["asphalt-950"],
    min: 4.5,
  },
  {
    mode: "dark",
    desc: "Subtle Text on Dark Surface",
    fg: palette["asphalt-400"],
    bg: palette["asphalt-900"],
    min: 4.5,
  },
  {
    mode: "dark",
    desc: "Link on Dark Surface",
    fg: palette["water-300"],
    bg: palette["asphalt-900"],
    min: 4.5,
  },
  {
    mode: "dark",
    desc: "Link on Dark Page Background",
    fg: palette["water-300"],
    bg: palette["asphalt-950"],
    min: 4.5,
  },
  {
    mode: "dark",
    desc: "On-CTA on CTA (Paint Yellow)",
    fg: palette["asphalt-900"],
    bg: palette["paint-400"],
    min: 4.5,
  },
  {
    mode: "dark",
    desc: "On-Primary on Primary (Dark)",
    fg: palette["asphalt-900"],
    bg: palette["asphalt-100"],
    min: 4.5,
  },
  {
    mode: "dark",
    desc: "Band Text on Band (Dark)",
    fg: palette["asphalt-100"],
    bg: palette["asphalt-950"],
    min: 4.5,
  },
  {
    mode: "dark",
    desc: "Band Muted Text on Band (Dark)",
    fg: palette["asphalt-400"],
    bg: palette["asphalt-950"],
    min: 4.5,
  },

  // DARK MODE: Chip Tints (ramp-100 text on color-mix 35% ramp-700 over surface)
  {
    mode: "dark",
    desc: "Chip Asphalt Dark (100 text on 35% 700)",
    fg: palette["asphalt-100"],
    bg: mixColors(palette["asphalt-700"], palette["asphalt-900"], 0.35),
    min: 4.5,
  },
  {
    mode: "dark",
    desc: "Chip Water Dark (100 text on 35% 700)",
    fg: palette["water-100"],
    bg: mixColors(palette["water-700"], palette["asphalt-900"], 0.35),
    min: 4.5,
  },
  {
    mode: "dark",
    desc: "Chip Paint Dark (100 text on 35% 700)",
    fg: palette["paint-100"],
    bg: mixColors(palette["paint-700"], palette["asphalt-900"], 0.35),
    min: 4.5,
  },
  {
    mode: "dark",
    desc: "Chip Sign Dark (100 text on 35% 700)",
    fg: palette["sign-100"],
    bg: mixColors(palette["sign-700"], palette["asphalt-900"], 0.35),
    min: 4.5,
  },
  {
    mode: "dark",
    desc: "Chip Kerb Dark (100 text on 35% 700)",
    fg: palette["kerb-100"],
    bg: mixColors(palette["kerb-700"], palette["asphalt-900"], 0.35),
    min: 4.5,
  },
  {
    mode: "dark",
    desc: "Chip Signal Dark (100 text on 35% 700)",
    fg: palette["signal-100"],
    bg: mixColors(palette["signal-700"], palette["asphalt-900"], 0.35),
    min: 4.5,
  },

  // DARK MODE: Interactive Controls & Border Pairs (target 3.0:1)
  {
    mode: "dark",
    desc: "Control Border on Dark Surface",
    fg: palette["asphalt-500"],
    bg: palette["asphalt-900"],
    min: 3.0,
  },
  {
    mode: "dark",
    desc: "Control Border on Dark Page Background",
    fg: palette["asphalt-500"],
    bg: palette["asphalt-950"],
    min: 3.0,
  },
];

// ── Run Tests ────────────────────────────────────────────────────────────────

console.log("==> Running WCAG 2.2 AA Contrast Checks for Nivaran Tokens...\n");

let failures = 0;
let passed = 0;

for (const t of tests) {
  const ratio = contrastRatio(t.fg, t.bg);
  const ok = ratio >= t.min;
  const tag = ok ? "PASS" : "FAIL";
  const statusColor = ok ? "\x1b[32m" : "\x1b[31m";
  const reset = "\x1b[0m";

  console.log(
    `[${t.mode.toUpperCase()}] ${statusColor}${tag}${reset} ${t.desc.padEnd(45)} ` +
      `${ratio.toFixed(2)}:1 (min ${t.min}:1) [fg: ${t.fg}, bg: ${t.bg}]`
  );

  if (ok) {
    passed++;
  } else {
    failures++;
  }
}

console.log(`\nResults: ${passed} passed, ${failures} failed.`);

if (failures > 0) {
  console.error(
    `\x1b[31mError: ${failures} token pair(s) failed WCAG 2.2 AA contrast requirements.\x1b[0m`
  );
  process.exit(1);
} else {
  console.log("\x1b[32mAll token pairs pass WCAG 2.2 AA contrast requirements.\x1b[0m");
  process.exit(0);
}
