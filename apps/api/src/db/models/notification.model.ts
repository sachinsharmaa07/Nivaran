/**
 * In-app Notification Mongoose Model — B4
 * Every notification document has tenantId (SPEC §4).
 */
import { Schema, model, type Document } from "mongoose";

export interface INotification extends Document {
  tenantId: string;
  userId: string;
  role?: string | undefined;
  issueId: string; // publicId
  type: "assign" | "resolve" | "escalation" | "reopen";
  title: string;
  body: string;
  data?: Record<string, unknown> | undefined;
  emailStatus?: "sent" | "failed" | "skipped" | undefined;
  read: boolean;
  readAt?: Date | null | undefined;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    tenantId: { type: String, required: true },
    userId: { type: String, required: true },
    role: { type: String },
    issueId: { type: String, required: true },
    type: {
      type: String,
      enum: ["assign", "resolve", "escalation", "reopen"],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    data: { type: Schema.Types.Mixed },
    emailStatus: {
      type: String,
      enum: ["sent", "failed", "skipped"],
      default: "skipped",
    },
    read: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Indexes start with tenantId per SPEC §4
NotificationSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
NotificationSchema.index({ tenantId: 1, role: 1, createdAt: -1 });
NotificationSchema.index({ tenantId: 1, issueId: 1 });

export const Notification = model<INotification>("Notification", NotificationSchema);
