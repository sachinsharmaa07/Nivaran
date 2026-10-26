/**
 * Rescoring Service — Priority recomputation for civic issues.
 * SPEC §6: Recomputed on new confirmation (+1), status change, and every 15 minutes for open issues.
 * Stored breakdown holds per-factor raw, weight, contribution, confidence, score and computedAt.
 */
import {
  computePriority,
  type PriorityWeights,
  type PriorityBreakdown,
} from "../domain/algorithms.js";
import { Issue, type IIssue } from "../db/models/issue.model.js";
import { connectMongo } from "../db/mongo.js";
import { pino } from "pino";

const log = pino({ level: process.env["LOG_LEVEL"] ?? "info" });

export function recomputePriorityForIssue(
  issue: IIssue,
  customWeights?: Partial<PriorityWeights>
): PriorityBreakdown {
  const safetyRisk = issue.category?.defaultSafetyRisk ?? 0.5;
  const severity = ((issue.severity ?? 1) as 1 | 2 | 3) || 1;
  const facilityProximity = issue.priority?.breakdown?.facility?.raw ?? 0;

  // Unique verified reporters: unique set of reporterIds plus reporterId
  const uniqueReporters = new Set<string>();
  if (issue.reporterId && issue.reporterId !== "anonymous") {
    uniqueReporters.add(issue.reporterId);
  }
  if (Array.isArray(issue.reporterIds)) {
    for (const r of issue.reporterIds) {
      if (r && r !== "anonymous") uniqueReporters.add(r);
    }
  }
  const uniqueReporterCount = Math.max(1, uniqueReporters.size);

  const createdAtMs = issue.createdAt ? new Date(issue.createdAt).getTime() : Date.now();
  const finishTimeMs = issue.resolution?.resolvedAt
    ? new Date(issue.resolution.resolvedAt).getTime()
    : Date.now();

  const daysOpen = Math.max(0, (finishTimeMs - createdAtMs) / 86_400_000);

  let slaFraction: number | null = null;
  if (issue.slaPolicy?.resolveBy && issue.createdAt) {
    const totalSla =
      new Date(issue.slaPolicy.resolveBy).getTime() - new Date(issue.createdAt).getTime();
    if (totalSla > 0) {
      slaFraction = Math.max(0, (finishTimeMs - createdAtMs) / totalSla);
    }
  }

  const confidence =
    issue.priority?.breakdown?.confidence ??
    (issue.evidence && issue.evidence.length > 0 ? 1.0 : 0.9);

  // Preserve existing per-factor weights if stored on issue
  const weights: Partial<PriorityWeights> = {};
  if (customWeights) {
    Object.assign(weights, customWeights);
  } else if (issue.priority?.breakdown) {
    const b = issue.priority.breakdown;
    if (b.safety?.weight !== undefined) weights.safety = b.safety.weight;
    if (b.severity?.weight !== undefined) weights.severity = b.severity.weight;
    if (b.facility?.weight !== undefined) weights.facility = b.facility.weight;
    if (b.reporters?.weight !== undefined) weights.reporters = b.reporters.weight;
    if (b.age?.weight !== undefined) weights.age = b.age.weight;
    if (b.slaPressure?.weight !== undefined) weights.slaPressure = b.slaPressure.weight;
  }

  return computePriority({
    safetyRisk,
    severity,
    facilityProximity,
    uniqueReporterCount,
    daysOpen,
    slaFraction,
    confidence,
    weights,
  });
}

/**
 * 15-minute rescoring job:
 * Recomputes priority breakdown for all open issues (submitted, triaged, assigned, in_progress, reopened).
 */
export async function rescoreOpenIssues(tenantId?: string): Promise<{ rescored: number }> {
  await connectMongo();
  const query: Record<string, unknown> = {
    status: { $in: ["submitted", "triaged", "assigned", "in_progress", "reopened"] },
  };
  if (tenantId) {
    query["tenantId"] = tenantId;
  }

  const openIssues = await Issue.find(query);
  let count = 0;

  for (const issue of openIssues) {
    try {
      const breakdown = recomputePriorityForIssue(issue);
      await Issue.updateOne(
        { tenantId: issue.tenantId, publicId: issue.publicId },
        {
          $set: { "priority.breakdown": breakdown },
          $inc: { version: 1 },
        }
      );
      count++;
    } catch (err) {
      log.warn({ err, publicId: issue.publicId }, "Failed to rescore open issue");
    }
  }

  return { rescored: count };
}
