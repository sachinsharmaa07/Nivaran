/**
 * AuditEvent Mongoose model — append-only, per-tenant seq, no delete.
 * SPEC §4: every index starts with tenantId.
 */
import { Schema, model, type Document } from "mongoose";

export interface IAuditEvent extends Document {
  tenantId: string;
  seq: number;
  issueId: string; // publicId
  actor: { userId: string; role: string };
  event: string;
  payload: unknown;
  createdAt: Date;
}

const AuditEventSchema = new Schema<IAuditEvent>(
  {
    tenantId: { type: String, required: true },
    seq: { type: Number, required: true },
    issueId: { type: String, required: true },
    actor: {
      userId: { type: String, required: true },
      role: { type: String, required: true },
    },
    event: { type: String, required: true },
    payload: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditEventSchema.index({ tenantId: 1, seq: 1 }, { unique: true });
AuditEventSchema.index({ tenantId: 1, issueId: 1, createdAt: -1 });

export const AuditEvent = model<IAuditEvent>("AuditEvent", AuditEventSchema);
