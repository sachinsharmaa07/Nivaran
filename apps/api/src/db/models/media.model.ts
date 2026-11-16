/**
 * Media Mongoose model — C1
 * Stores uploaded image metadata, sha256 deduplication per tenant, and generated image variants.
 * Tenant-scoped with tenantId-first indexes.
 */
import { Schema, model, type Document } from "mongoose";

export interface IMediaVariants {
  w480: string;
  w960: string;
  w1600: string;
  fallbackJpg: string;
}

export interface IMedia extends Document {
  tenantId: string;
  sha256: string;
  key: string;
  variants: IMediaVariants;
  altText: string;
  caption?: string | null;
  width: number;
  height: number;
  bytes: number;
  mime: string;
  uploaderId: string;
  createdAt: Date;
}

const MediaVariantsSchema = new Schema<IMediaVariants>(
  {
    w480: { type: String, required: true },
    w960: { type: String, required: true },
    w1600: { type: String, required: true },
    fallbackJpg: { type: String, required: true },
  },
  { _id: false }
);

const MediaSchema = new Schema<IMedia>(
  {
    tenantId: { type: String, required: true, index: true },
    sha256: { type: String, required: true },
    key: { type: String, required: true },
    variants: { type: MediaVariantsSchema, required: true },
    altText: { type: String, default: "" },
    caption: { type: String, default: null },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    bytes: { type: Number, required: true },
    mime: { type: String, required: true },
    uploaderId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
    collection: "media",
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        ret["id"] = ret["_id"] ? String(ret["_id"]) : undefined;
        return ret;
      },
    },
  }
);

// Unique SHA-256 deduplication per tenant
MediaSchema.index({ tenantId: 1, sha256: 1 }, { unique: true });
MediaSchema.index({ createdAt: 1 });

export const Media = model<IMedia>("Media", MediaSchema);
