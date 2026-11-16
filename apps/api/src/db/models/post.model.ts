/**
 * Post Mongoose model — C1
 * Stores structured block JSON civic updates with multi-locale support.
 * Tenant-scoped with tenantId-first indexes.
 */
import { Schema, model, type Document } from "mongoose";
import type { Block, PostStatus } from "@nivaran/shared";

export interface IPost extends Document {
  tenantId: string;
  slug: string;
  status: PostStatus;
  authorId: string;
  title: Record<string, string>;
  summary?: Record<string, string>;
  blocks: Record<string, Block[]>;
  coverMediaId?: string | null;
  tags: string[];
  relatedIssueIds: string[];
  publishedAt?: Date | null;
  scheduledFor?: Date | null;
  commentsEnabled: boolean;
  commentCount: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const PostSchema = new Schema<IPost>(
  {
    tenantId: { type: String, required: true, index: true },
    slug: { type: String, required: true },
    status: {
      type: String,
      enum: ["draft", "scheduled", "published", "archived"],
      default: "draft",
      required: true,
      index: true,
    },
    authorId: { type: String, required: true },
    title: { type: Map, of: String, required: true },
    summary: { type: Map, of: String, default: {} },
    blocks: { type: Map, of: [Schema.Types.Mixed], required: true },
    coverMediaId: { type: String, default: null },
    tags: { type: [String], default: [] },
    relatedIssueIds: { type: [String], default: [] },
    publishedAt: { type: Date, default: null },
    scheduledFor: { type: Date, default: null },
    commentsEnabled: { type: Boolean, default: true },
    commentCount: { type: Number, default: 0 },
    version: { type: Number, default: 1 },
  },
  {
    timestamps: true,
    collection: "posts",
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        ret["id"] = ret["_id"] ? String(ret["_id"]) : undefined;
        return ret;
      },
    },
  }
);

// Indexes
PostSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
PostSchema.index({ tenantId: 1, status: 1, publishedAt: -1 });
PostSchema.index({ tenantId: 1, tags: 1 });
PostSchema.index(
  {
    "title.en": "text",
    "title.hi": "text",
    "title.pa": "text",
    "summary.en": "text",
    "summary.hi": "text",
    "summary.pa": "text",
    tags: "text",
  },
  { default_language: "none" }
);

export const Post = model<IPost>("Post", PostSchema);
