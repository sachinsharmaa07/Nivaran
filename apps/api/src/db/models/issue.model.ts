/**
 * Issue Mongoose model — B2
 * Every document has tenantId. All access goes through IssueRepo (never raw collection).
 * Every index starts with tenantId per SPEC §4.
 */
import { Schema, model, type Document } from "mongoose";

// ── Plain-object interfaces for category/department/SLA snapshots ──────────────

export interface CategorySnapshot {
  code?: string;
  names?: Record<string, string>;
  dedupRadiusM?: number;
  defaultSafetyRisk?: number;
  evidenceRequired?: boolean;
}

export interface DepartmentSnapshot {
  id?: string;
  code?: string;
  name?: string;
}

export interface SlaPolicySnapshot {
  id?: string;
  name?: string;
  respondHours?: number;
  resolveHours?: number;
  escalationLevels?: { at_percent: number; notify_role: string }[];
  respondBy?: Date | null | undefined;
  resolveBy?: Date | null | undefined;
}

export interface EvidenceItem {
  key: string;
  takenAt?: Date;
  blurScore?: number;
}

export interface PriorityFactorDetail {
  raw?: number;
  weight?: number;
  contribution?: number;
}

export interface PriorityBreakdownDoc {
  safety?: PriorityFactorDetail;
  severity?: PriorityFactorDetail;
  facility?: PriorityFactorDetail;
  reporters?: PriorityFactorDetail;
  age?: PriorityFactorDetail;
  slaPressure?: PriorityFactorDetail;
  configVersion?: number;
  confidence?: number;
  score?: number;
  computedAt?: Date;
}

export interface PriorityOverrideDoc {
  score?: number;
  reason: string;
  byUserId?: string;
  at?: Date;
}

export interface ResolutionDoc {
  note?: string;
  evidence?: string[];
  citizenResponse?: "confirmed" | "disputed";
  resolvedAt?: Date;
  closedAt?: Date;
  responseDeadline?: Date;
}

export interface DuplicateLinkDoc {
  primaryId?: string;
  secondaryId?: string;
  mergedAt?: Date;
  mergedByUserId?: string;
}

// ── Main Issue interface ──────────────────────────────────────────────────────

export interface IIssue extends Document {
  tenantId: string;
  publicId: string;
  status: string;
  reporterId: string;
  reporterIds: string[];
  location: {
    type: "Point";
    coordinates: [number, number]; // [lon, lat]
    accuracyM?: number | undefined;
    wardId?: string | undefined;
  };
  landmark?: string | undefined;
  pincode?: string | undefined;
  description: string;
  category: CategorySnapshot;
  department?: DepartmentSnapshot | undefined;
  slaPolicy?: SlaPolicySnapshot | undefined;
  evidence: EvidenceItem[];
  severity: number;
  priority: {
    breakdown?: PriorityBreakdownDoc | undefined;
    override?: PriorityOverrideDoc | undefined;
  };
  duplicateOf?: string | undefined;
  duplicates: DuplicateLinkDoc[];
  resolution?: ResolutionDoc | undefined;
  reopenCount: number;
  version: number;
  clusterId?: string | undefined;
  isNearMiss?: boolean | undefined;
  createdAt: Date;
  updatedAt: Date;
}

// ── Sub-schemas ────────────────────────────────────────────────────────────────

const EvidenceSchema = new Schema<EvidenceItem>(
  { key: { type: String, required: true }, takenAt: Date, blurScore: Number },
  { _id: false }
);

const CategorySnapshotSchema = new Schema<CategorySnapshot>(
  {
    code: String,
    names: { type: Schema.Types.Mixed },
    dedupRadiusM: Number,
    defaultSafetyRisk: Number,
    evidenceRequired: Boolean,
  },
  { _id: false }
);

const DepartmentSnapshotSchema = new Schema<DepartmentSnapshot>(
  { id: String, code: String, name: String },
  { _id: false }
);

const SlaPolicySnapshotSchema = new Schema<SlaPolicySnapshot>(
  {
    id: String,
    name: String,
    respondHours: Number,
    resolveHours: Number,
    escalationLevels: [Schema.Types.Mixed],
    respondBy: Date,
    resolveBy: Date,
  },
  { _id: false }
);

const PriorityFactorSchema = new Schema<PriorityFactorDetail>(
  { raw: Number, weight: Number, contribution: Number },
  { _id: false }
);

const PriorityBreakdownSchema = new Schema<PriorityBreakdownDoc>(
  {
    safety: PriorityFactorSchema,
    severity: PriorityFactorSchema,
    facility: PriorityFactorSchema,
    reporters: PriorityFactorSchema,
    age: PriorityFactorSchema,
    slaPressure: PriorityFactorSchema,
    configVersion: Number,
    confidence: Number,
    score: Number,
    computedAt: Date,
  },
  { _id: false }
);

const PriorityOverrideSchema = new Schema<PriorityOverrideDoc>(
  { score: Number, reason: { type: String, required: true }, byUserId: String, at: Date },
  { _id: false }
);

const ResolutionSchema = new Schema<ResolutionDoc>(
  {
    note: String,
    evidence: [String],
    citizenResponse: { type: String, enum: ["confirmed", "disputed"] },
    resolvedAt: Date,
    closedAt: Date,
    responseDeadline: Date,
  },
  { _id: false }
);

const DuplicateLinkSchema = new Schema<DuplicateLinkDoc>(
  { primaryId: String, secondaryId: String, mergedAt: Date, mergedByUserId: String },
  { _id: false }
);

// ── Main Issue Schema ──────────────────────────────────────────────────────────

const IssueSchema = new Schema<IIssue>(
  {
    tenantId: { type: String, required: true },
    publicId: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: [
        "submitted",
        "triaged",
        "assigned",
        "in_progress",
        "resolved",
        "closed",
        "reopened",
        "duplicate",
        "rejected",
      ],
      default: "submitted",
    },
    reporterId: { type: String, required: true },
    reporterIds: { type: [String], default: [] },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true },
      accuracyM: Number,
      wardId: String,
    },
    landmark: String,
    pincode: String,
    description: { type: String, required: true },
    category: { type: CategorySnapshotSchema, required: true },
    department: DepartmentSnapshotSchema,
    slaPolicy: SlaPolicySnapshotSchema,
    evidence: { type: [EvidenceSchema], default: [] },
    severity: { type: Number, default: 1, min: 1, max: 3 },
    priority: {
      breakdown: PriorityBreakdownSchema,
      override: PriorityOverrideSchema,
    },
    duplicateOf: String,
    duplicates: { type: [DuplicateLinkSchema], default: [] },
    resolution: ResolutionSchema,
    reopenCount: { type: Number, default: 0 },
    version: { type: Number, default: 1 },
    clusterId: { type: String, index: true },
    isNearMiss: { type: Boolean },
  },
  { timestamps: true }
);

// ── Indexes (all start with tenantId per SPEC §4) ─────────────────────────────

IssueSchema.index({ tenantId: 1, location: "2dsphere" });
IssueSchema.index({ tenantId: 1, status: 1, "priority.breakdown.score": -1 });
IssueSchema.index({ tenantId: 1, "category.code": 1, status: 1, createdAt: -1 });
IssueSchema.index(
  { tenantId: 1, "slaPolicy.resolveBy": 1 },
  {
    partialFilterExpression: {
      status: { $in: ["submitted", "triaged", "assigned", "in_progress", "reopened"] },
    },
  }
);
IssueSchema.index({ tenantId: 1, publicId: 1 }, { unique: true });

export const Issue = model<IIssue>("Issue", IssueSchema);
