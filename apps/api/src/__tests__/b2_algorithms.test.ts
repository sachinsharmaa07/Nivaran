/**
 * B2 core algorithm tests:
 * - Haversine against known distances
 * - Priority score: bounds, monotonicity, deterministic tie-break
 * - State machine: every allowed and forbidden transition
 */
import { describe, it, expect } from "vitest";
import {
  haversineMetres,
  scoreDuplicate,
  computePriority,
  canTransition,
  TRANSITIONS,
} from "../domain/algorithms.js";

// ── Haversine ─────────────────────────────────────────────────────────────────

describe("haversineMetres", () => {
  it("returns 0 for identical points", () => {
    expect(haversineMetres(28.6139, 77.209, 28.6139, 77.209)).toBe(0);
  });

  it("computes Delhi → Mumbai ≈ 1153 km", () => {
    const d = haversineMetres(28.6139, 77.209, 19.076, 72.8777);
    expect(d).toBeGreaterThan(1_100_000);
    expect(d).toBeLessThan(1_200_000);
  });

  it("computes Delhi → Connaught Place ≈ 0 m (same point)", () => {
    const d = haversineMetres(28.6329, 77.2195, 28.6329, 77.2195);
    expect(d).toBe(0);
  });

  it("computes ~111 km per degree latitude", () => {
    // 1 degree latitude ≈ 111,195 m
    const d = haversineMetres(28.0, 77.0, 29.0, 77.0);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it("computes Chennai → Bangalore ≈ 290 km", () => {
    const d = haversineMetres(13.0827, 80.2707, 12.9716, 77.5946);
    expect(d).toBeGreaterThan(280_000);
    expect(d).toBeLessThan(310_000);
  });

  it("is symmetric", () => {
    const d1 = haversineMetres(19.076, 72.8777, 28.6139, 77.209);
    const d2 = haversineMetres(28.6139, 77.209, 19.076, 72.8777);
    expect(Math.abs(d1 - d2)).toBeLessThan(0.001);
  });
});

// ── Duplicate scoring ─────────────────────────────────────────────────────────

describe("scoreDuplicate", () => {
  it("scores 1.0 spatial when distance is 0", () => {
    const s = scoreDuplicate({
      distanceM: 0,
      rEff: 25,
      sameCategory: true,
      compatibleCategory: false,
    });
    expect(s.spatial).toBe(1);
    expect(s.total).toBe(1);
    expect(s.highlight).toBe(true);
  });

  it("scores 0 spatial when distance equals rEff", () => {
    const s = scoreDuplicate({
      distanceM: 25,
      rEff: 25,
      sameCategory: true,
      compatibleCategory: false,
    });
    expect(s.spatial).toBe(0);
  });

  it("suggestion threshold >= 0.55", () => {
    const s = scoreDuplicate({
      distanceM: 5,
      rEff: 25,
      sameCategory: true,
      compatibleCategory: false,
    });
    expect(s.suggestion).toBe(true);
    const noSuggest = scoreDuplicate({
      distanceM: 24,
      rEff: 25,
      sameCategory: false,
      compatibleCategory: false,
    });
    expect(noSuggest.suggestion).toBe(false);
  });
});

// ── Priority score ────────────────────────────────────────────────────────────

describe("computePriority", () => {
  const baseInput = {
    safetyRisk: 0.7,
    severity: 2,
    facilityProximity: 0,
    uniqueReporterCount: 1,
    daysOpen: 0,
    slaFraction: 0,
    confidence: 1.0,
  };

  it("score is in [0, 100]", () => {
    const p = computePriority(baseInput);
    expect(p.score).toBeGreaterThanOrEqual(0);
    expect(p.score).toBeLessThanOrEqual(100);
  });

  it("score increases with more reporters (monotonic)", () => {
    const p1 = computePriority({ ...baseInput, uniqueReporterCount: 1 });
    const p5 = computePriority({ ...baseInput, uniqueReporterCount: 5 });
    const p20 = computePriority({ ...baseInput, uniqueReporterCount: 20 });
    expect(p5.score).toBeGreaterThan(p1.score);
    expect(p20.score).toBeGreaterThan(p5.score);
  });

  it("score increases with more days open (age factor monotonic)", () => {
    const p0 = computePriority({ ...baseInput, daysOpen: 0 });
    const p15 = computePriority({ ...baseInput, daysOpen: 15 });
    const p30 = computePriority({ ...baseInput, daysOpen: 30 });
    expect(p15.score).toBeGreaterThan(p0.score);
    expect(p30.score).toBeGreaterThan(p15.score);
  });

  it("is deterministic — same input always returns same score", () => {
    const a = computePriority(baseInput);
    const b = computePriority(baseInput);
    expect(a.score).toBe(b.score);
  });

  it("confidence below 1 reduces score", () => {
    const high = computePriority({ ...baseInput, confidence: 1.0 });
    const low = computePriority({ ...baseInput, confidence: 0.8 });
    expect(low.score).toBeLessThan(high.score);
  });

  it("weights sum is preserved in contributions", () => {
    const p = computePriority({
      ...baseInput,
      safetyRisk: 1,
      severity: 3,
      facilityProximity: 1,
      uniqueReporterCount: 10,
      daysOpen: 30,
      slaFraction: 1,
    });
    const contributions =
      p.safety.contribution +
      p.severity.contribution +
      p.facility.contribution +
      p.reporters.contribution +
      p.age.contribution +
      p.slaPressure.contribution;
    expect(contributions).toBeCloseTo(1.0, 2);
  });

  it("max score with all factors at 1 and confidence 1 = 100", () => {
    const p = computePriority({
      safetyRisk: 1,
      severity: 3,
      facilityProximity: 1,
      uniqueReporterCount: 100,
      daysOpen: 30,
      slaFraction: 1,
      confidence: 1.0,
    });
    expect(p.score).toBeCloseTo(100, 0);
  });
});

// ── State machine ─────────────────────────────────────────────────────────────

describe("canTransition — state machine", () => {
  // Allowed transitions
  const allowedCases: [string, string, string][] = [
    ["submitted", "triaged", "staff"],
    ["submitted", "duplicate", "dept_head"],
    ["submitted", "rejected", "dept_head"],
    ["triaged", "assigned", "staff"],
    ["assigned", "in_progress", "staff"],
    ["in_progress", "resolved", "staff"],
    ["resolved", "closed", "citizen"],
    ["resolved", "reopened", "citizen"],
    ["closed", "reopened", "citizen"],
    ["reopened", "assigned", "staff"],
  ];

  it.each(allowedCases)("allows %s → %s for %s", (from, to, role) => {
    expect(canTransition(from, to, role).allowed).toBe(true);
  });

  // Insufficient role cases
  const roleBlockedCases: [string, string, string][] = [
    ["submitted", "triaged", "citizen"],
    ["submitted", "rejected", "staff"],
    ["submitted", "duplicate", "citizen"],
    ["in_progress", "resolved", "citizen"],
  ];

  it.each(roleBlockedCases)("blocks %s → %s for insufficient role %s", (from, to, role) => {
    expect(canTransition(from, to, role).allowed).toBe(false);
  });

  // Forbidden moves (not in transition table)
  const forbiddenCases: [string, string, string][] = [
    ["submitted", "in_progress", "staff"],
    ["submitted", "closed", "tenant_admin"],
    ["rejected", "submitted", "tenant_admin"],
    ["closed", "submitted", "tenant_admin"],
  ];

  it.each(forbiddenCases)("forbids %s → %s (not in table) for %s", (from, to, role) => {
    expect(canTransition(from, to, role).allowed).toBe(false);
  });

  it("every transition in table is allowed for the minimum role", () => {
    for (const [from, targets] of Object.entries(TRANSITIONS)) {
      for (const [to, minRole] of Object.entries(targets)) {
        const result = canTransition(from, to, minRole);
        expect(result.allowed, `${from} → ${to} for ${minRole}`).toBe(true);
      }
    }
  });
});
