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
import { TenantDb } from "./tenant-db.js";
import { computePriority } from "../domain/algorithms.js";

const EARTH_RADIUS_M = 6_371_000;

function addMetreOffset(lat: number, lon: number, dNorthM: number, dEastM: number) {
  const dLat = (dNorthM / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLon = (dEastM / (EARTH_RADIUS_M * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI);
  return { lat: lat + dLat, lon: lon + dLon };
}

function _gaussianNoise(stdM: number): number {
  // Box-Muller transform
  const u = 1 - Math.random();
  const v = Math.random();
  return stdM * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
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
  const issuesPerCluster = opts?.issuesPerCluster ?? 8;
  const clustersPerTenant = opts?.clustersPerTenant ?? 10;
  const nearMissPerCluster = opts?.nearMissPerCluster ?? 2;

  const platformDb = new PlatformDb();
  const tenants = await platformDb.listTenants();
  const clusters: SyntheticCluster[] = [];

  for (const tenant of tenants) {
    const repo = new IssueRepo(tenant.id);
    const tenantDb = new TenantDb(tenant.id);
    const categories = await tenantDb.listCategories();
    if (categories.length === 0) continue;

    const center = tenant.center;

    for (let c = 0; c < clustersPerTenant; c++) {
      // Place cluster within 10-25 km of tenant center
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

      const clusterIssueIds: string[] = [];
      const nearMissIds: string[] = [];

      // Create cluster issues within dedup radius (5-25 m GPS noise)
      for (let i = 0; i < issuesPerCluster; i++) {
        const noiseM = 5 + Math.random() * 20;
        const angle = Math.random() * 2 * Math.PI;
        const pt = addMetreOffset(
          clusterCenter.lat,
          clusterCenter.lon,
          noiseM * Math.sin(angle),
          noiseM * Math.cos(angle)
        );

        // Validate that this point is inside India (skip if not)
        const { isInsideIndia } = await import("@nivaran/shared");
        if (!isInsideIndia(pt.lat, pt.lon)) continue;

        const severity = (Math.floor(Math.random() * 3) + 1) as 1 | 2 | 3;
        const priority = computePriority({
          safetyRisk: category.default_safety_risk,
          severity,
          facilityProximity: 0,
          uniqueReporterCount: 1 + Math.floor(Math.random() * 5),
          daysOpen: Math.floor(Math.random() * 15),
          slaFraction: Math.random() * 0.8,
          confidence: 0.85 + Math.random() * 0.15,
        });

        try {
          const seq = await repo.nextSeq();
          const publicId = `NVR-${tenant.code}-${String(seq).padStart(6, "0")}`;
          const desc = paraphrases[i % paraphrases.length]!;

          const issue = await repo.create({
            publicId,
            status: "submitted",
            reporterId: `synthetic-user-${c}-${i}`,
            reporterIds: [`synthetic-user-${c}-${i}`],
            location: {
              type: "Point",
              coordinates: [pt.lon, pt.lat],
              accuracyM: noiseM,
            },
            description: desc,
            severity,
            category: {
              code: category.code,
              names: category.names,
              dedupRadiusM: category.dedup_radius_m,
              defaultSafetyRisk: category.default_safety_risk,
              evidenceRequired: category.evidence_required,
            },
            priority: { breakdown: priority },
          });

          clusterIssueIds.push(issue.publicId);
        } catch {
          // skip individual failures
        }
      }

      // Create near-miss negatives (10-60 m outside dedup radius)
      for (let n = 0; n < nearMissPerCluster; n++) {
        const dist = category.dedup_radius_m + 10 + Math.random() * 50;
        const angle = Math.random() * 2 * Math.PI;
        const pt = addMetreOffset(
          clusterCenter.lat,
          clusterCenter.lon,
          dist * Math.sin(angle),
          dist * Math.cos(angle)
        );

        const { isInsideIndia } = await import("@nivaran/shared");
        if (!isInsideIndia(pt.lat, pt.lon)) continue;

        try {
          const seq = await repo.nextSeq();
          const publicId = `NVR-${tenant.code}-${String(seq).padStart(6, "0")}`;
          const issue = await repo.create({
            publicId,
            status: "submitted",
            reporterId: `synthetic-nearmiss-${c}-${n}`,
            reporterIds: [`synthetic-nearmiss-${c}-${n}`],
            location: {
              type: "Point",
              coordinates: [pt.lon, pt.lat],
              accuracyM: 5,
            },
            description: paraphrases[n % paraphrases.length]!,
            severity: 1,
            category: {
              code: category.code,
              names: category.names,
              dedupRadiusM: category.dedup_radius_m,
              defaultSafetyRisk: category.default_safety_risk,
              evidenceRequired: category.evidence_required,
            },
            priority: {
              breakdown: computePriority({
                safetyRisk: 0.5,
                severity: 1,
                facilityProximity: 0,
                uniqueReporterCount: 1,
                daysOpen: 0,
                slaFraction: 0,
              }),
            },
          });
          nearMissIds.push(issue.publicId);
        } catch {
          // skip
        }
      }

      clusters.push({
        tenantId: tenant.id,
        centerLat: clusterCenter.lat,
        centerLon: clusterCenter.lon,
        categoryCode,
        issueIds: clusterIssueIds,
        nearMissIds,
      });
    }
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
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Synthetic generation failed:", err);
      process.exit(1);
    });
}
