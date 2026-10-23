/**
 * IssueRepo — tenant-scoped MongoDB repository for issues.
 * Raw collection access forbidden; every query injects tenantId.
 * SPEC §4: all indexes start with tenantId.
 */
import type { PipelineStage, ClientSession } from "mongoose";
import { Issue, type IIssue } from "./models/issue.model.js";
import { AuditEvent, type IAuditEvent } from "./models/audit-event.model.js";
import { Counter } from "./models/counter.model.js";
import { connectMongo } from "./mongo.js";

export interface DuplicateCandidate {
  issue: IIssue;
  distanceM: number;
}

type Sess = ClientSession | null | undefined;

function sess(s: Sess): { session: ClientSession | null } {
  return { session: s ?? null };
}

export class IssueRepo {
  constructor(private readonly tenantId: string) {
    if (!tenantId) throw new Error("IssueRepo requires tenantId");
    void connectMongo();
  }

  // ── Atomic counter for publicId ─────────────────────────────────────────────

  async nextSeq(): Promise<number> {
    await connectMongo();
    const doc = await Counter.findOneAndUpdate(
      { tenantId: this.tenantId },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    return doc.seq;
  }

  async nextSeqBatch(count: number): Promise<number> {
    await connectMongo();
    const doc = await Counter.findOneAndUpdate(
      { tenantId: this.tenantId },
      { $inc: { seq: count } },
      { upsert: true, new: true }
    );
    return doc.seq - count + 1;
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async create(data: Omit<Partial<IIssue>, "tenantId">): Promise<IIssue> {
    await connectMongo();
    const doc = new Issue({ ...data, tenantId: this.tenantId });
    return doc.save();
  }

  async createMany(items: Omit<Partial<IIssue>, "tenantId">[]): Promise<IIssue[]> {
    await connectMongo();
    const docs = items.map((data) => ({ ...data, tenantId: this.tenantId }));
    return (await Issue.insertMany(docs)) as unknown as IIssue[];
  }

  async findByPublicId(publicId: string): Promise<IIssue | null> {
    return Issue.findOne({ tenantId: this.tenantId, publicId });
  }

  async findById(id: string): Promise<IIssue | null> {
    return Issue.findOne({ tenantId: this.tenantId, _id: id });
  }

  async list(filters: {
    status?: string | string[] | undefined;
    departmentId?: string | undefined;
    wardId?: string | undefined;
    reporterId?: string | undefined;
    search?: string | undefined;
    limit?: number | undefined;
    skip?: number | undefined;
  }): Promise<IIssue[]> {
    await connectMongo();
    const query: Record<string, unknown> = { tenantId: this.tenantId };
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        query["status"] = { $in: filters.status };
      } else {
        query["status"] = filters.status;
      }
    }
    if (filters.departmentId) {
      query["department.id"] = filters.departmentId;
    }
    if (filters.wardId) {
      query["location.wardId"] = filters.wardId;
    }
    if (filters.reporterId) {
      query["$or"] = [{ reporterId: filters.reporterId }, { reporterIds: filters.reporterId }];
    }
    if (filters.search) {
      const s = filters.search.trim();
      const regex = new RegExp(s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&"), "i");
      query["$or"] = [
        { publicId: regex },
        { description: regex },
        { landmark: regex },
        { "category.code": regex },
      ];
    }
    return (await Issue.find(query)
      .sort({ "priority.override.score": -1, "priority.breakdown.score": -1, createdAt: -1 })
      .skip(filters.skip ?? 0)
      .limit(filters.limit ?? 100)
      .lean()) as unknown as IIssue[];
  }

  async update(publicId: string, update: Partial<IIssue>, session?: Sess): Promise<IIssue | null> {
    return Issue.findOneAndUpdate(
      { tenantId: this.tenantId, publicId },
      { $set: { ...update }, $inc: { version: 1 } },
      { new: true, ...sess(session) }
    ).exec();
  }

  // ── Duplicate detection via $geoNear ────────────────────────────────────────

  async findGeoNearCandidates(
    lon: number,
    lat: number,
    maxDistanceM: number,
    excludePublicId?: string
  ): Promise<DuplicateCandidate[]> {
    const pipeline: PipelineStage[] = [
      {
        $geoNear: {
          near: { type: "Point", coordinates: [lon, lat] },
          distanceField: "_dist",
          maxDistance: maxDistanceM,
          spherical: true,
          query: {
            tenantId: this.tenantId,
            status: { $in: ["submitted", "triaged", "assigned", "in_progress", "reopened"] },
            ...(excludePublicId ? { publicId: { $ne: excludePublicId } } : {}),
          },
        },
      },
      { $limit: 20 },
    ];

    const results = await Issue.aggregate<IIssue & { _dist: number }>(pipeline);
    return results.map((r) => ({ issue: r, distanceM: r._dist }));
  }

  // ── Reporter management ──────────────────────────────────────────────────────

  async addReporter(publicId: string, userId: string, session?: Sess): Promise<IIssue | null> {
    return Issue.findOneAndUpdate(
      { tenantId: this.tenantId, publicId, reporterIds: { $ne: userId } },
      { $addToSet: { reporterIds: userId }, $inc: { version: 1 } },
      { new: true, ...sess(session) }
    ).exec();
  }

  // ── Status transition ────────────────────────────────────────────────────────

  async transition(
    publicId: string,
    newStatus: string,
    extra: Partial<IIssue> = {},
    session?: Sess
  ): Promise<IIssue | null> {
    const inc: Record<string, number> = { version: 1 };
    if (newStatus === "reopened") {
      inc["reopenCount"] = 1;
    }
    return Issue.findOneAndUpdate(
      { tenantId: this.tenantId, publicId },
      { $set: { status: newStatus, ...extra }, $inc: inc },
      { new: true, ...sess(session) }
    ).exec();
  }

  async routeDepartment(
    publicId: string,
    department: { id?: string; code?: string; name?: string },
    session?: Sess
  ): Promise<IIssue | null> {
    return Issue.findOneAndUpdate(
      { tenantId: this.tenantId, publicId },
      { $set: { department }, $inc: { version: 1 } },
      { new: true, ...sess(session) }
    ).exec();
  }

  // ── Merge / unmerge ──────────────────────────────────────────────────────────

  async mergeDuplicate(
    secondaryPublicId: string,
    primaryPublicId: string,
    mergedByUserId: string,
    session?: Sess
  ): Promise<void> {
    const now = new Date();
    await Issue.findOneAndUpdate(
      { tenantId: this.tenantId, publicId: secondaryPublicId },
      { $set: { status: "duplicate", duplicateOf: primaryPublicId }, $inc: { version: 1 } },
      sess(session)
    ).exec();

    const secondary = await Issue.findOne({
      tenantId: this.tenantId,
      publicId: secondaryPublicId,
    }).session(session ?? null);

    if (secondary) {
      await Issue.findOneAndUpdate(
        { tenantId: this.tenantId, publicId: primaryPublicId },
        {
          $addToSet: { reporterIds: { $each: secondary.reporterIds } },
          $push: {
            duplicates: {
              primaryId: primaryPublicId,
              secondaryId: secondaryPublicId,
              mergedAt: now,
              mergedByUserId,
            },
          },
          $inc: { version: 1 },
        },
        sess(session)
      ).exec();
    }
  }

  async unmergeDuplicate(
    secondaryPublicId: string,
    primaryPublicId: string,
    session?: Sess
  ): Promise<void> {
    await Issue.findOneAndUpdate(
      { tenantId: this.tenantId, publicId: secondaryPublicId },
      { $set: { status: "submitted" }, $unset: { duplicateOf: 1 }, $inc: { version: 1 } },
      sess(session)
    ).exec();

    await Issue.findOneAndUpdate(
      { tenantId: this.tenantId, publicId: primaryPublicId },
      { $pull: { duplicates: { secondaryId: secondaryPublicId } }, $inc: { version: 1 } },
      sess(session)
    ).exec();
  }

  // ── Audit trail ─────────────────────────────────────────────────────────────

  async appendAuditEvent(data: {
    issueId: string;
    actor: { userId: string; role: string };
    event: string;
    payload?: unknown;
    session?: Sess;
  }): Promise<void> {
    const seqDoc = await Counter.findOneAndUpdate(
      { tenantId: `audit_${this.tenantId}` },
      { $inc: { seq: 1 } },
      { upsert: true, new: true, ...sess(data.session) }
    );
    await AuditEvent.create(
      [
        {
          tenantId: this.tenantId,
          seq: seqDoc.seq,
          issueId: data.issueId,
          actor: data.actor,
          event: data.event,
          payload: data.payload ?? {},
        },
      ],
      { session: data.session ?? null }
    );
  }

  async listAuditEvents(publicId: string): Promise<IAuditEvent[]> {
    return AuditEvent.find({ tenantId: this.tenantId, issueId: publicId }).sort({ seq: 1 });
  }

  // ── Priority override ────────────────────────────────────────────────────────

  async setOverride(
    publicId: string,
    override: { score: number; reason: string; byUserId: string },
    session?: Sess
  ): Promise<IIssue | null> {
    return Issue.findOneAndUpdate(
      { tenantId: this.tenantId, publicId },
      { $set: { "priority.override": { ...override, at: new Date() } }, $inc: { version: 1 } },
      { new: true, ...sess(session) }
    ).exec();
  }
}
