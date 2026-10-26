/**
 * Synthetic issue generator — at least 300 issues in clusters across seeded tenants.
 * Loaded by `make seed`. Used by `make eval-dedup` for precision/recall evaluation.
 *
 * Requirements:
 * - Spread over the last 60 days
 * - Realistic mix: ~55% closed, 15% resolved, 20% assigned or in progress, 10% submitted or reopened
 * - Realistic resolution times, some SLA breaches and some reopens
 * - Audit events for each issue
 * - Written through normal repo/tenantDb so priority breakdowns and metrics exist
 * - Idempotent: running seed twice must not duplicate
 */
import { PlatformDb } from "./platform-db.js";
import { IssueRepo } from "./issue-repo.js";
import { TenantDb, type CategoryRow } from "./tenant-db.js";
import { computePriority } from "../domain/algorithms.js";
import { isInsideIndia } from "@nivaran/shared";
import { connectMongo, disconnectMongo } from "./mongo.js";
import { closePools } from "./config.js";
import { Issue } from "./models/issue.model.js";
import { AuditEvent } from "./models/audit-event.model.js";
import { Counter } from "./models/counter.model.js";

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

const CAT_TO_DEPT: Record<string, string> = {
  pothole: "roads",
  road_damage: "roads",
  garbage: "sanitation",
  streetlight: "electrical",
  water_leakage: "water",
  drainage: "water",
};

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
  await connectMongo();

  const issuesPerCluster = opts?.issuesPerCluster ?? 8;
  const clustersPerTenant = opts?.clustersPerTenant ?? 10;
  const nearMissPerCluster = opts?.nearMissPerCluster ?? 3;

  const platformDb = new PlatformDb();
  const tenants = await platformDb.listTenants();
  const clusters: SyntheticCluster[] = [];

  for (const tenant of tenants) {
    // ── Idempotency Check: skip if tenant already has synthetic issues ─────────
    const existingCount = await Issue.countDocuments({ tenantId: tenant.id });
    if (existingCount >= 100) {
      console.log(
        `Tenant ${tenant.name} already has ${existingCount} issues; skipping synthetic seed to prevent duplication.`
      );
      // Reconstruct clusters from existing documents for callers (e.g. eval-dedup)
      const existingDocs = await Issue.find({
        tenantId: tenant.id,
        clusterId: { $exists: true },
      }).lean();
      const clusterMap = new Map<string, SyntheticCluster>();
      for (const doc of existingDocs) {
        let cl = clusterMap.get(doc.clusterId!);
        if (!cl) {
          cl = {
            clusterId: doc.clusterId!,
            tenantId: tenant.id,
            centerLat: doc.location.coordinates[1],
            centerLon: doc.location.coordinates[0],
            categoryCode: doc.category?.code ?? "pothole",
            issueIds: [],
            nearMissIds: [],
          };
          clusterMap.set(doc.clusterId!, cl);
        }
        if (doc.isNearMiss) {
          cl.nearMissIds.push(doc.publicId);
        } else {
          cl.issueIds.push(doc.publicId);
        }
      }
      clusters.push(...clusterMap.values());
      continue;
    }

    const repo = new IssueRepo(tenant.id);
    const tenantDb = new TenantDb(tenant.id);
    const [categories, departments, wards] = await Promise.all([
      tenantDb.listCategories(),
      tenantDb.listDepartments(),
      tenantDb.listWards(),
    ]);

    if (categories.length === 0) continue;

    const center = tenant.center;

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
          reporterId: `synthetic-user-${tenant.code}-${c}-${i}`,
        });
      }

      // 2. Near-miss negatives at same location but different category
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
          reporterId: `synthetic-diffcat-${tenant.code}-${c}-${s}`,
        });
      }

      // 3. Near-miss negatives in same category outside dedup radius
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
          reporterId: `synthetic-distant-${tenant.code}-${c}-${n}`,
        });
      }
    }

    if (pendingIssues.length === 0) continue;

    // Allocate seq numbers in a single atomic update
    const startSeq = await repo.nextSeqBatch(pendingIssues.length);
    const totalCount = pendingIssues.length;

    // Realistic mix:
    // ~55% closed: [0, Math.floor(totalCount * 0.55))
    // ~15% resolved: [Math.floor(totalCount * 0.55), Math.floor(totalCount * 0.70))
    // ~12% assigned: [Math.floor(totalCount * 0.70), Math.floor(totalCount * 0.82))
    // ~8% in_progress: [Math.floor(totalCount * 0.82), Math.floor(totalCount * 0.90)) (assigned + in_progress = 20%)
    // ~6% submitted: [Math.floor(totalCount * 0.90), Math.floor(totalCount * 0.96))
    // ~4% reopened: [Math.floor(totalCount * 0.96), totalCount) (submitted + reopened = 10%)
    const closedCutoff = Math.floor(totalCount * 0.55);
    const resolvedCutoff = Math.floor(totalCount * 0.7);
    const assignedCutoff = Math.floor(totalCount * 0.82);
    const inProgressCutoff = Math.floor(totalCount * 0.9);
    const submittedCutoff = Math.floor(totalCount * 0.96);

    const now = Date.now();
    const docsToCreate = [];
    const auditEventsToCreate = [];
    const metricsToRecord = [];

    // Get safe audit sequence counter start
    const lastAudit = await AuditEvent.findOne({ tenantId: tenant.id }).sort({ seq: -1 }).lean();
    const existingCounter = await Counter.findOne({ tenantId: `audit_${tenant.id}` }).lean();
    let auditSeq = Math.max(lastAudit?.seq ?? 0, existingCounter?.seq ?? 0) + 1;

    for (let idx = 0; idx < totalCount; idx++) {
      const p = pendingIssues[idx]!;
      const seq = startSeq + idx;
      const publicId = `NVR-${tenant.code}-${String(seq).padStart(6, "0")}`;

      // Spread over the last 60 days
      const ageDays = (idx / totalCount) * 58 + Math.random() * 1.9 + 0.1;
      const createdAt = new Date(now - ageDays * 86_400_000);

      // Ward and Department selection
      const deptCode = CAT_TO_DEPT[p.category.code] ?? "roads";
      const dept = departments.find((d) => d.code === deptCode) ?? departments[0];
      const ward = wards.length > 0 ? wards[idx % wards.length] : undefined;

      // Status resolution
      let status: "closed" | "resolved" | "assigned" | "in_progress" | "submitted" | "reopened";
      let resolutionTimeHours: number | null = null;
      let resolvedAt: Date | null = null;
      let closedAt: Date | null = null;
      let slaBreached = false;
      let reopenCount = 0;
      let resolutionData: Record<string, unknown> | undefined;

      if (idx < closedCutoff) {
        status = "closed";
        // ~15% SLA breaches (75h+), others resolve in 6h - 55h
        if (idx % 7 === 0) {
          slaBreached = true;
          resolutionTimeHours = Math.round((75 + Math.random() * 35) * 10) / 10;
        } else {
          slaBreached = false;
          resolutionTimeHours = Math.round((6 + Math.random() * 45) * 10) / 10;
        }
        resolvedAt = new Date(createdAt.getTime() + resolutionTimeHours * 3_600_000);
        if (resolvedAt.getTime() > now) {
          resolvedAt = new Date(now - 120_000);
          resolutionTimeHours = Math.max(
            0.5,
            Math.round(((resolvedAt.getTime() - createdAt.getTime()) / 3_600_000) * 10) / 10
          );
        }
        closedAt = new Date(resolvedAt.getTime() + (Math.random() * 12 + 2) * 3_600_000);
        if (closedAt.getTime() > now) closedAt = new Date(now - 30_000);

        reopenCount = idx % 15 === 0 ? 1 : 0;
        resolutionData = {
          note: "Civic fault rectified and verified on site",
          evidence: ["demo-res-photo.jpg"],
          citizenResponse: "confirmed",
          resolvedAt,
          closedAt,
        };
      } else if (idx < resolvedCutoff) {
        status = "resolved";
        if (idx % 7 === 0) {
          slaBreached = true;
          resolutionTimeHours = Math.round((75 + Math.random() * 35) * 10) / 10;
        } else {
          slaBreached = false;
          resolutionTimeHours = Math.round((6 + Math.random() * 45) * 10) / 10;
        }
        resolvedAt = new Date(createdAt.getTime() + resolutionTimeHours * 3_600_000);
        if (resolvedAt.getTime() > now) {
          resolvedAt = new Date(now - 120_000);
          resolutionTimeHours = Math.max(
            0.5,
            Math.round(((resolvedAt.getTime() - createdAt.getTime()) / 3_600_000) * 10) / 10
          );
        }
        resolutionData = {
          note: "Work completed by field team; awaiting citizen confirmation",
          evidence: ["demo-res-photo.jpg"],
          resolvedAt,
          responseDeadline: new Date(resolvedAt.getTime() + 7 * 86_400_000),
        };
      } else if (idx < assignedCutoff) {
        status = "assigned";
        slaBreached = now - createdAt.getTime() > 72 * 3_600_000;
      } else if (idx < inProgressCutoff) {
        status = "in_progress";
        slaBreached = now - createdAt.getTime() > 72 * 3_600_000;
      } else if (idx < submittedCutoff) {
        status = "submitted";
        slaBreached = now - createdAt.getTime() > 72 * 3_600_000;
      } else {
        status = "reopened";
        reopenCount = 1;
        slaBreached = now - createdAt.getTime() > 72 * 3_600_000;
        resolutionData = {
          citizenResponse: "disputed",
          note: "Issue recurred after initial remediation",
        };
      }

      // 1 to 4 unique reporters
      const reporterCount = 1 + (idx % 4);
      const reporterIds = [p.reporterId];
      for (let r = 1; r < reporterCount; r++) {
        reporterIds.push(`synthetic-user-${tenant.code}-${p.clusterIndex}-${r}`);
      }

      const daysOpen = resolvedAt
        ? (resolvedAt.getTime() - createdAt.getTime()) / 86_400_000
        : (now - createdAt.getTime()) / 86_400_000;
      const slaFraction =
        (resolvedAt ? resolvedAt.getTime() - createdAt.getTime() : now - createdAt.getTime()) /
        (72 * 3_600_000);

      const priority = computePriority({
        safetyRisk: p.category.default_safety_risk,
        severity: p.severity,
        facilityProximity: 0,
        uniqueReporterCount: reporterCount,
        daysOpen,
        slaFraction,
        confidence: 0.85 + Math.random() * 0.15,
      });

      docsToCreate.push({
        publicId,
        clusterId: `cluster-${tenant.code}-${p.clusterIndex}`,
        isNearMiss: p.isNearMiss,
        status,
        reporterId: p.reporterId,
        reporterIds,
        location: {
          type: "Point" as const,
          coordinates: [p.pt.lon, p.pt.lat] as [number, number],
          accuracyM: p.noiseM,
          ...(ward && { wardId: ward.id }),
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
        ...(dept && {
          department: {
            id: dept.id,
            code: dept.code,
            name: dept.name,
          },
        }),
        slaPolicy: {
          resolveHours: 72,
          respondHours: 24,
          resolveBy: new Date(createdAt.getTime() + 72 * 3_600_000),
          respondBy: new Date(createdAt.getTime() + 24 * 3_600_000),
        },
        ...(resolutionData && { resolution: resolutionData }),
        reopenCount,
        priority: { breakdown: priority },
        createdAt,
        updatedAt: closedAt ?? resolvedAt ?? createdAt,
      });

      // Audit trail events
      auditEventsToCreate.push({
        tenantId: tenant.id,
        seq: auditSeq++,
        issueId: publicId,
        actor: { userId: p.reporterId, role: "citizen" },
        event: "CREATED",
        payload: { categoryCode: p.category.code, status: "submitted" },
        createdAt,
      });

      if (["assigned", "in_progress", "resolved", "closed"].includes(status)) {
        auditEventsToCreate.push({
          tenantId: tenant.id,
          seq: auditSeq++,
          issueId: publicId,
          actor: { userId: "system", role: "system" },
          event: "DEPARTMENT_ROUTED",
          payload: { departmentCode: deptCode },
          createdAt: new Date(createdAt.getTime() + 300_000),
        });
        auditEventsToCreate.push({
          tenantId: tenant.id,
          seq: auditSeq++,
          issueId: publicId,
          actor: { userId: `staff@${tenant.code.toLowerCase()}.local`, role: "staff" },
          event: "STATUS_CHANGED",
          payload: { from: "submitted", to: "assigned" },
          createdAt: new Date(createdAt.getTime() + 1_800_000),
        });
      }

      if (["in_progress", "resolved", "closed"].includes(status)) {
        auditEventsToCreate.push({
          tenantId: tenant.id,
          seq: auditSeq++,
          issueId: publicId,
          actor: { userId: `staff@${tenant.code.toLowerCase()}.local`, role: "staff" },
          event: "STATUS_CHANGED",
          payload: { from: "assigned", to: "in_progress" },
          createdAt: new Date(createdAt.getTime() + 3_600_000),
        });
      }

      if (["resolved", "closed"].includes(status) && resolvedAt) {
        auditEventsToCreate.push({
          tenantId: tenant.id,
          seq: auditSeq++,
          issueId: publicId,
          actor: { userId: `staff@${tenant.code.toLowerCase()}.local`, role: "staff" },
          event: "STATUS_CHANGED",
          payload: { from: "in_progress", to: "resolved" },
          createdAt: resolvedAt,
        });
      }

      if (status === "closed" && closedAt) {
        auditEventsToCreate.push({
          tenantId: tenant.id,
          seq: auditSeq++,
          issueId: publicId,
          actor: { userId: p.reporterId, role: "citizen" },
          event: "STATUS_CHANGED",
          payload: { from: "resolved", to: "closed", confirmed: true },
          createdAt: closedAt,
        });
      }

      if (status === "reopened") {
        auditEventsToCreate.push({
          tenantId: tenant.id,
          seq: auditSeq++,
          issueId: publicId,
          actor: { userId: p.reporterId, role: "citizen" },
          event: "STATUS_CHANGED",
          payload: { from: "resolved", to: "reopened", disputed: true },
          createdAt: new Date(createdAt.getTime() + 25_000_000),
        });
      }

      // Postgres issue_metrics_fact item
      metricsToRecord.push({
        issue_id: publicId,
        status,
        category_code: p.category.code,
        department_id: dept?.id,
        ward_id: ward?.id,
        sla_breached: slaBreached,
        resolution_time_hours: resolutionTimeHours ?? undefined,
        lat: p.pt.lat,
        lon: p.pt.lon,
        created_at: createdAt,
        resolved_at: resolvedAt ?? undefined,
      });
    }

    // Write issues to Mongo
    const createdDocs = await repo.createMany(docsToCreate);

    // Write audit events to Mongo
    if (auditEventsToCreate.length > 0) {
      await AuditEvent.insertMany(auditEventsToCreate);
      await Counter.findOneAndUpdate(
        { tenantId: `audit_${tenant.id}` },
        { $set: { seq: auditSeq - 1 } },
        { upsert: true }
      );
    }

    // Write metrics to Postgres issue_metrics_fact table
    await tenantDb.recordIssueMetricsBatch(metricsToRecord);

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
