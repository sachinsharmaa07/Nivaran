/**
 * Dedup evaluation: precision, recall, and F1 across thresholds [0.40, 0.50, 0.55, 0.65, 0.80]
 * for distance-only vs distance+category.
 * Evaluates all 300 seeded synthetic issues from Mongo.
 */
import { generateSyntheticIssues, type SyntheticCluster } from "./synthetic.js";
import { haversineMetres, scoreDuplicate } from "../domain/algorithms.js";
import { connectMongo } from "./mongo.js";
import { Issue, type IIssue } from "./models/issue.model.js";

interface Metric {
  tp: number;
  fp: number;
  fn: number;
}

function prf({ tp, fp, fn }: Metric) {
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1 };
}

const THRESHOLDS = [0.4, 0.5, 0.55, 0.65, 0.8];

async function evalDedup(): Promise<void> {
  await connectMongo();

  // Load all 300 seeded issues from Mongo or generate if not present
  let issues = await Issue.find({ clusterId: { $exists: true } }).lean();
  let clusters: SyntheticCluster[] = [];

  if (issues.length >= 300) {
    const clusterMap = new Map<string, SyntheticCluster>();
    for (const doc of issues) {
      const cId = doc.clusterId!;
      let cluster = clusterMap.get(cId);
      if (!cluster) {
        cluster = {
          clusterId: cId,
          tenantId: doc.tenantId,
          centerLat: doc.location.coordinates[1],
          centerLon: doc.location.coordinates[0],
          categoryCode: doc.category.code ?? "unknown",
          issueIds: [],
          nearMissIds: [],
        };
        clusterMap.set(cId, cluster);
      }
      if (doc.isNearMiss) {
        cluster.nearMissIds.push(doc.publicId);
      } else {
        cluster.issueIds.push(doc.publicId);
      }
    }
    clusters = Array.from(clusterMap.values());
  } else {
    clusters = await generateSyntheticIssues();
    issues = await Issue.find({ clusterId: { $exists: true } }).lean();
  }

  // Pre-index issues by publicId for rapid lookup
  const issueMap = new Map<string, IIssue>();
  for (const doc of issues) {
    issueMap.set(doc.publicId, doc as unknown as IIssue);
  }

  const distMetrics: Record<number, Metric> = {};
  const catMetrics: Record<number, Metric> = {};
  const categoryRecall: Record<string, { tp: number; fn: number }> = {};

  for (const t of THRESHOLDS) {
    distMetrics[t] = { tp: 0, fp: 0, fn: 0 };
    catMetrics[t] = { tp: 0, fp: 0, fn: 0 };
  }

  for (const cluster of clusters) {
    if (cluster.issueIds.length < 2) continue;
    const probeId = cluster.issueIds[0]!;
    const probe = issueMap.get(probeId);
    if (!probe) continue;

    const probeCategory = probe.category.code ?? cluster.categoryCode;
    if (!categoryRecall[probeCategory]) {
      categoryRecall[probeCategory] = { tp: 0, fn: 0 };
    }

    const [probeLon, probeLat] = probe.location.coordinates;
    const dedupRadius = probe.category.dedupRadiusM ?? 25;
    const accuracy = probe.location.accuracyM ?? 15;
    const rEff = dedupRadius + Math.min(accuracy, 30);

    const truePositiveIds = new Set(cluster.issueIds.slice(1));
    const nearMissIds = new Set(cluster.nearMissIds);

    // Candidates are all other issues in this cluster (positives + negatives)
    const candidateIds = [...cluster.issueIds.slice(1), ...cluster.nearMissIds];

    for (const candId of candidateIds) {
      const cand = issueMap.get(candId);
      if (!cand) continue;

      const [candLon, candLat] = cand.location.coordinates;
      const dist = haversineMetres(probeLat, probeLon, candLat, candLon);
      const sameCategory = (cand.category.code ?? "") === probeCategory;

      // Distance-only: assumes same category (spatial-only evaluation)
      const distScore = scoreDuplicate({
        distanceM: dist,
        rEff,
        sameCategory: true,
        compatibleCategory: false,
      }).total;

      // Distance + Category: considers both spatial and exact category match
      const catScore = scoreDuplicate({
        distanceM: dist,
        rEff,
        sameCategory,
        compatibleCategory: false,
      }).total;

      const isTruePos = truePositiveIds.has(candId);
      const isNearMiss = nearMissIds.has(candId);

      for (const t of THRESHOLDS) {
        const distPred = distScore >= t;
        const catPred = catScore >= t;

        if (isTruePos) {
          if (distPred) distMetrics[t]!.tp++;
          else distMetrics[t]!.fn++;

          if (catPred) catMetrics[t]!.tp++;
          else catMetrics[t]!.fn++;

          if (t === 0.55) {
            const catRec = categoryRecall[probeCategory];
            if (catRec) {
              if (catPred) catRec.tp++;
              else catRec.fn++;
            }
          }
        } else if (isNearMiss) {
          if (distPred) distMetrics[t]!.fp++;
          if (catPred) catMetrics[t]!.fp++;
        }
      }
    }
  }

  console.log("\n=== Dedup Evaluation Across Thresholds (300 Seeded Issues) ===");
  console.log("Threshold | Distance-Only (P / R / F1) | Distance+Category (P / R / F1)");
  console.log("----------+----------------------------+-------------------------------");
  for (const t of THRESHOLDS) {
    const d = prf(distMetrics[t]!);
    const c = prf(catMetrics[t]!);
    console.log(
      `${t.toFixed(2).padEnd(9)} | P=${d.precision.toFixed(3)} R=${d.recall.toFixed(3)} F1=${d.f1.toFixed(3)}  | P=${c.precision.toFixed(3)} R=${c.recall.toFixed(3)} F1=${c.f1.toFixed(3)}`
    );
  }

  console.log("\n--- Recall per Category (@0.55 threshold) ---");
  const catEntries = Object.entries(categoryRecall).map(([code, m]) => {
    const rec = m.tp + m.fn > 0 ? (m.tp / (m.tp + m.fn)) * 100 : 0;
    return `${code}: ${rec.toFixed(1)}%`;
  });
  console.log(catEntries.join(" | "));

  console.log("\n--- Limits of this Synthetic Data ---");
  console.log(
    "Limits of this synthetic data: GPS noise is modelled as uniform radial dispersion (0-25m); real urban canyons produce multimodal, non-Gaussian multipath drift. Categorical near-misses are generated synthetically, whereas real citizen reports exhibit semantic ambiguity, multiple simultaneous faults, and inconsistent category labelling."
  );
  console.log("=================================================================\n");
}

evalDedup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("eval-dedup failed:", err);
    process.exit(1);
  });
