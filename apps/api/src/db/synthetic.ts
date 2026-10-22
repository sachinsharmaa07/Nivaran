/**
 * Synthetic issue generator — 300 issues in clusters across seeded tenants.
 * Loaded by `make seed`. Used by `make eval-dedup` for precision/recall evaluation.
 *
 * Cluster structure:
 * - 10 clusters per tenant (30 issues per cluster = 300 total across 3 tenants ≈ 10 per cluster)
 * - Each cluster has 5-8 issues within dedupRadius, 2 near-miss negatives 10-60 m away
 * - GPS noise: 5-25 m (simulates real device accuracy)
 */
import { PlatformDb } from "./platform-db.js";
import { IssueRepo } from "./issue-repo.js";
import { TenantDb, type CategoryRow } from "./tenant-db.js";
import { computePriority } from "../domain/algorithms.js";
import { isInsideIndia } from "@nivaran/shared";
import { disconnectMongo } from "./mongo.js";
import { closePools } from "./config.js";

const EARTH_RADIUS_M = 6_371_000;

function addMetreOffset(lat: number, lon: number, dNorthM: number, dEastM: number) {
  const dLat = (dNorthM / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLon = (dEastM / (EARTH_RADIUS_M * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI);
  return { lat: lat + dLat, lon: lon + dLon };
}

const PARAPHRASES: Record<string, string[]> = {
  pothole: [
    "Large dangerous pothole on road",
    "Deep pothole blocking traffic",
    "Pothole causing accidents on main road",
    "Road has a big pothole near junction",
    "Dangerous pit on road surface",
  ],
  garbage: [
    "Garbage dump on footpath",
    "Uncollected waste near park",
    "Garbage pile blocking drain",
    "Overflowing dustbin on street",
    "Illegal garbage dumping near colony",
  ],
  streetlight: [
    "Streetlight not working at night",
    "Broken street lamp creating dark area",
    "Light pole damaged after storm",
    "No lighting on road for 2 weeks",
    "Faulty streetlight flickering",
  ],
  drainage: [
    "Sewage overflow on road",
    "Blocked drain causing flooding",
    "Drainage pipe broken on main road",
    "Sewerage smell and water logging",
    "Drain overflowing near market",
  ],
  water_leakage: [
    "Water pipeline leaking on road",
    "Burst pipe wasting water",
    "Water supply pipe broken underground",
    "Leaking water main near junction",
    "Pipeline leak causing road damage",
  ],
  road_damage: [
    "Road badly damaged after monsoon",
    "Broken road surface near colony",
    "Road collapsed near bridge",
    "Damaged road surface causing accidents",
    "Road broken with gravel exposed",
  ],
};

const CATEGORIES = [
  "pothole",
  "garbage",
  "streetlight",
  "drainage",
  "water_leakage",
  "road_damage",
];

export interface SyntheticCluster {
  clusterId: string;
  tenantId: string;
  centerLat: number;
  centerLon: number;
  categoryCode: string;
  issueIds: string[]; // publicIds of issues in this cluster
  nearMissIds: string[]; // publicIds of near-miss negatives
}

export async function generateSyntheticIssues(opts?: {
  issuesPerCluster?: number;
  clustersPerTenant?: number;
  nearMissPerCluster?: number;
}): Promise<SyntheticCluster[]> {
  const issuesPerCluster = opts?.issuesPerCluster ?? 7;
  const clustersPerTenant = opts?.clustersPerTenant ?? 10;
  const nearMissPerCluster = opts?.nearMissPerCluster ?? 3;

  const platformDb = new PlatformDb();
  const tenants = await platformDb.listTenants();
  const clusters: SyntheticCluster[] = [];

  for (const tenant of tenants) {
    const repo = new IssueRepo(tenant.id);
    const tenantDb = new TenantDb(tenant.id);
    const categories = await tenantDb.listCategories();
    if (categories.length === 0) continue;

    const center = tenant.center;

    // Collect all issue specifications for this tenant to batch-create
    interface PendingIssue {
      clusterIndex: number;
      isNearMiss: boolean;
      pt: { lat: number; lon: number };
      noiseM: number;
      category: CategoryRow;
      severity: 1 | 2 | 3;
      desc: string;
      reporterId: string;
    }

    const pendingIssues: PendingIssue[] = [];
    const tenantClusters: SyntheticCluster[] = [];

    for (let c = 0; c < clustersPerTenant; c++) {
      const clusterDist = 2000 + Math.random() * 8000;
      const clusterAngle = Math.random() * 2 * Math.PI;
      const clusterCenter = addMetreOffset(
        center.lat,
        center.lon,
        clusterDist * Math.sin(clusterAngle),
        clusterDist * Math.cos(clusterAngle)
      );

      const categoryCode = CATEGORIES[c % CATEGORIES.length]!;
      const category = categories.find((cat) => cat.code === categoryCode) ?? categories[0]!;
      const paraphrases = PARAPHRASES[categoryCode] ?? PARAPHRASES["pothole"]!;
      const clusterId = `cluster-${tenant.code}-${c}`;

      tenantClusters.push({
        clusterId,
        tenantId: tenant.id,
        centerLat: clusterCenter.lat,
        centerLon: clusterCenter.lon,
        categoryCode,
        issueIds: [],
        nearMissIds: [],
      });

      // 1. True duplicates within cluster: GPS noise up to 25m
      for (let i = 0; i < issuesPerCluster; i++) {
        const noiseM = Math.random() * 25;
        const angle = Math.random() * 2 * Math.PI;
        const pt = addMetreOffset(
          clusterCenter.lat,
          clusterCenter.lon,
          noiseM * Math.sin(angle),
          noiseM * Math.cos(angle)
        );

        if (!isInsideIndia(pt.lat, pt.lon)) continue;

        const severity = (Math.floor(Math.random() * 3) + 1) as 1 | 2 | 3;
        const desc = paraphrases[i % paraphrases.length]!;
        pendingIssues.push({
          clusterIndex: c,
          isNearMiss: false,
          pt,
          noiseM: Math.max(1, Math.round(noiseM)),
          category,
          severity,
          desc,
          reporterId: `synthetic-user-${c}-${i}`,
        });
      }

      // 2. Near-miss negatives at the SAME SPOT but DIFFERENT category
      const diffCategories = categories.filter((cat) => cat.code !== categoryCode);
      const sameSpotCount = Math.min(2, nearMissPerCluster);
      for (let s = 0; s < sameSpotCount; s++) {
        const diffCat = diffCategories[s % diffCategories.length] ?? category;
        const diffParaphrases = PARAPHRASES[diffCat.code] ?? PARAPHRASES["garbage"]!;
        const noiseM = Math.random() * 15;
        const angle = Math.random() * 2 * Math.PI;
        const pt = addMetreOffset(
          clusterCenter.lat,
          clusterCenter.lon,
          noiseM * Math.sin(angle),
          noiseM * Math.cos(angle)
        );

        if (!isInsideIndia(pt.lat, pt.lon)) continue;

        pendingIssues.push({
          clusterIndex: c,
          isNearMiss: true,
          pt,
          noiseM: Math.max(1, Math.round(noiseM)),
          category: diffCat,
          severity: 1,
          desc: diffParaphrases[s % diffParaphrases.length]!,
          reporterId: `synthetic-diffcat-${c}-${s}`,
        });
      }

      // 3. Near-miss negatives in same category but outside dedup radius
      const distantCount = Math.max(0, nearMissPerCluster - sameSpotCount);
      for (let n = 0; n < distantCount; n++) {
        const dist = category.dedup_radius_m + 15 + Math.random() * 35;
        const angle = Math.random() * 2 * Math.PI;
        const pt = addMetreOffset(
          clusterCenter.lat,
          clusterCenter.lon,
          dist * Math.sin(angle),
          dist * Math.cos(angle)
        );

        if (!isInsideIndia(pt.lat, pt.lon)) continue;

        pendingIssues.push({
          clusterIndex: c,
          isNearMiss: true,
          pt,
          noiseM: 10,
          category,
          severity: 1,
          desc: paraphrases[(paraphrases.length - 1 - n) % paraphrases.length]!,
          reporterId: `synthetic-distant-${c}-${n}`,
        });
      }
    }

    if (pendingIssues.length === 0) continue;

    // Allocate seq numbers in a single atomic update
    const startSeq = await repo.nextSeqBatch(pendingIssues.length);

    const docsToCreate = pendingIssues.map((p, idx) => {
      const seq = startSeq + idx;
      const publicId = `NVR-${tenant.code}-${String(seq).padStart(6, "0")}`;

      const priority = computePriority({
        safetyRisk: p.category.default_safety_risk,
        severity: p.severity,
        facilityProximity: 0,
        uniqueReporterCount: 1 + Math.floor(Math.random() * 5),
        daysOpen: Math.floor(Math.random() * 15),
        slaFraction: Math.random() * 0.8,
        confidence: 0.85 + Math.random() * 0.15,
      });

      return {
        publicId,
        clusterId: `cluster-${tenant.code}-${p.clusterIndex}`,
        isNearMiss: p.isNearMiss,
        status: "submitted",
        reporterId: p.reporterId,
        reporterIds: [p.reporterId],
        location: {
          type: "Point" as const,
          coordinates: [p.pt.lon, p.pt.lat] as [number, number],
          accuracyM: p.noiseM,
        },
        description: p.desc,
        severity: p.severity,
        category: {
          code: p.category.code,
          names: p.category.names,
          dedupRadiusM: p.category.dedup_radius_m,
          defaultSafetyRisk: p.category.default_safety_risk,
          evidenceRequired: p.category.evidence_required,
        },
        priority: { breakdown: priority },
      };
    });

    const createdDocs = await repo.createMany(docsToCreate);

    for (let i = 0; i < pendingIssues.length; i++) {
      const p = pendingIssues[i]!;
      const doc = createdDocs[i]!;
      const cluster = tenantClusters[p.clusterIndex];
      if (cluster) {
        if (p.isNearMiss) {
          cluster.nearMissIds.push(doc.publicId);
        } else {
          cluster.issueIds.push(doc.publicId);
        }
      }
    }

    clusters.push(...tenantClusters);
  }

  console.log(
    `Synthetic generator: ${clusters.length} clusters, ` +
      `${clusters.reduce((s, c) => s + c.issueIds.length, 0)} cluster issues, ` +
      `${clusters.reduce((s, c) => s + c.nearMissIds.length, 0)} near-miss negatives`
  );

  return clusters;
}

// ── make seed entrypoint ───────────────────────────────────────────────────────

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("synthetic.ts") || process.argv[1].endsWith("synthetic.js"));

if (isDirectRun) {
  generateSyntheticIssues()
    .then(async () => {
      await disconnectMongo();
      await closePools();
      process.exit(0);
    })
    .catch((err) => {
      console.error("Synthetic generation failed:", err);
      process.exit(1);
    });
}
