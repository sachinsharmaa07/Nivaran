/**
 * Haversine distance (metres) between two GPS points.
 * Own implementation, unit-tested against known distances (SPEC §6).
 */
export function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000; // Earth radius in metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Duplicate scoring (SPEC §6) ────────────────────────────────────────────────

export interface DuplicateScoreInput {
  distanceM: number;
  rEff: number; // effective radius = category.dedupRadiusM + min(gpsAccuracy, 30)
  sameCategory: boolean;
  compatibleCategory: boolean; // configurable map
}

export interface DuplicateScore {
  spatial: number;
  category: number;
  total: number;
  suggestion: boolean; // >= 0.55
  highlight: boolean; // >= 0.80
}

export function scoreDuplicate(input: DuplicateScoreInput): DuplicateScore {
  const spatial = Math.max(0, 1 - input.distanceM / input.rEff);
  const category = input.sameCategory ? 1 : input.compatibleCategory ? 0.5 : 0;
  // Without text: 0.75 spatial + 0.25 category
  const total = 0.75 * spatial + 0.25 * category;
  return {
    spatial,
    category,
    total,
    suggestion: total >= 0.55,
    highlight: total >= 0.8,
  };
}

// ── Priority scoring (SPEC §6) ─────────────────────────────────────────────────

export interface PriorityWeights {
  safety: number;
  severity: number;
  facility: number;
  reporters: number;
  age: number;
  slaPressure: number;
}

export const DEFAULT_WEIGHTS: PriorityWeights = {
  safety: 0.25,
  severity: 0.15,
  facility: 0.15,
  reporters: 0.1,
  age: 0.1,
  slaPressure: 0.25,
};

export interface PriorityInput {
  /** category.default_safety_risk in [0,1] */
  safetyRisk: number;
  /** citizen-chosen 1-3 */
  severity: number;
  /** max facility proximity score in [0,1] */
  facilityProximity: number;
  /** count of unique verified reporters */
  uniqueReporterCount: number;
  /** days since issue was created */
  daysOpen: number;
  /** seconds elapsed / total SLA seconds (null if no SLA) */
  slaFraction: number | null;
  /** confidence multiplier [0.8, 1.0] based on photo quality */
  confidence?: number;
  weights?: Partial<PriorityWeights>;
}

export interface PriorityBreakdown {
  safety: { raw: number; weight: number; contribution: number };
  severity: { raw: number; weight: number; contribution: number };
  facility: { raw: number; weight: number; contribution: number };
  reporters: { raw: number; weight: number; contribution: number };
  age: { raw: number; weight: number; contribution: number };
  slaPressure: { raw: number; weight: number; contribution: number };
  confidence: number;
  score: number;
  computedAt: Date;
}

export function computePriority(input: PriorityInput): PriorityBreakdown {
  const w = { ...DEFAULT_WEIGHTS, ...input.weights };

  // Factor computations
  const safetyRaw = Math.min(1, input.safetyRisk);
  const severityRaw = (input.severity - 1) / 2; // 1->0, 2->0.5, 3->1
  const facilityRaw = Math.min(1, Math.max(0, input.facilityProximity));
  // reporters: 1 - exp(-(n_unique - 1) / 3)
  const n = Math.max(0, input.uniqueReporterCount - 1);
  const reportersRaw = Math.min(1, 1 - Math.exp(-n / 3));
  const ageRaw = Math.min(1, input.daysOpen / 30);
  let slaPressureRaw = 0;
  if (input.slaFraction !== null) {
    const f = input.slaFraction;
    slaPressureRaw = f <= 0.5 ? 0 : Math.min(1, (f - 0.5) / 0.5);
  }

  const confidence = Math.min(1, Math.max(0.8, input.confidence ?? 1.0));

  const factors = {
    safety: safetyRaw,
    severity: severityRaw,
    facility: facilityRaw,
    reporters: reportersRaw,
    age: ageRaw,
    slaPressure: slaPressureRaw,
  };

  const weightedSum = (Object.keys(factors) as (keyof typeof factors)[]).reduce(
    (sum, k) => sum + w[k] * factors[k],
    0
  );

  const score = Math.round(100 * weightedSum * confidence * 100) / 100;

  return {
    safety: { raw: safetyRaw, weight: w.safety, contribution: w.safety * safetyRaw },
    severity: { raw: severityRaw, weight: w.severity, contribution: w.severity * severityRaw },
    facility: { raw: facilityRaw, weight: w.facility, contribution: w.facility * facilityRaw },
    reporters: { raw: reportersRaw, weight: w.reporters, contribution: w.reporters * reportersRaw },
    age: { raw: ageRaw, weight: w.age, contribution: w.age * ageRaw },
    slaPressure: {
      raw: slaPressureRaw,
      weight: w.slaPressure,
      contribution: w.slaPressure * slaPressureRaw,
    },
    confidence,
    score,
    computedAt: new Date(),
  };
}

// ── State machine (SPEC §5) ────────────────────────────────────────────────────

export type IssueStatus =
  | "submitted"
  | "triaged"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "closed"
  | "reopened"
  | "duplicate"
  | "rejected";

// [fromStatus, toStatus] → minimum role required
export const TRANSITIONS: Record<string, Record<string, string>> = {
  submitted: {
    triaged: "staff",
    duplicate: "dept_head",
    rejected: "dept_head",
  },
  triaged: {
    assigned: "staff",
    rejected: "dept_head",
    duplicate: "dept_head",
  },
  assigned: {
    in_progress: "staff",
    rejected: "dept_head",
    duplicate: "dept_head",
    reopened: "citizen",
  },
  in_progress: {
    resolved: "staff",
    rejected: "dept_head",
    duplicate: "dept_head",
  },
  resolved: {
    closed: "citizen",
    reopened: "citizen",
    // auto-close by system after 7 days: handled as status="system"
  },
  closed: {
    reopened: "citizen",
  },
  reopened: {
    assigned: "staff",
    in_progress: "staff",
    rejected: "dept_head",
  },
  duplicate: {
    submitted: "dept_head", // unmerge restores
  },
  rejected: {}, // terminal
};

export const ROLE_RANKS: Record<string, number> = {
  citizen: 1,
  staff: 2,
  dept_head: 3,
  tenant_admin: 4,
  platform_admin: 5,
  system: 99,
};

export function canTransition(
  from: string,
  to: string,
  role: string
): { allowed: boolean; reason?: string } {
  const allowedTransitions = TRANSITIONS[from];
  if (!allowedTransitions) {
    return { allowed: false, reason: `Unknown source status: ${from}` };
  }
  const minRole = allowedTransitions[to];
  if (minRole === undefined) {
    return {
      allowed: false,
      reason: `Transition ${from} → ${to} is not allowed`,
    };
  }
  const actorRank = ROLE_RANKS[role] ?? 0;
  const requiredRank = ROLE_RANKS[minRole] ?? 99;
  if (actorRank < requiredRank) {
    return {
      allowed: false,
      reason: `Role '${role}' cannot perform this transition (requires '${minRole}')`,
    };
  }
  return { allowed: true };
}
