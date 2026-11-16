/**
 * ContentRepo — tenant-scoped MongoDB repository for civic posts and media.
 * Raw collection access is forbidden; every query injects tenantId.
 * SPEC §14: all indexes start with tenantId.
 */
import mongoose from "mongoose";
import { Post, type IPost } from "./models/post.model.js";
import { Media, type IMedia, type IMediaVariants } from "./models/media.model.js";
import { connectMongo } from "./mongo.js";
import { AppError } from "../middleware/error-handler.js";
import { cacheInvalidateTenantPosts } from "./redis.js";
import type { CreatePostInput, UpdatePostInput, PostStatus } from "@nivaran/shared";

export interface ListPublishedPostsOptions {
  tag?: string | undefined;
  q?: string | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

export class ContentRepo {
  constructor(private readonly tenantId: string) {
    if (!tenantId) throw new Error("ContentRepo requires tenantId");
    void connectMongo();
  }

  // ── Slug Generator ──────────────────────────────────────────────────────────

  private slugify(text: string): string {
    const s = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    return s || "update";
  }

  async generateUniqueSlug(title: string): Promise<string> {
    await connectMongo();
    const base = this.slugify(title);
    let slug = base;
    let counter = 1;

    while (true) {
      const existing = await Post.findOne({ tenantId: this.tenantId, slug }).select("_id").lean();
      if (!existing) return slug;
      counter++;
      slug = `${base}-${counter}`;
    }
  }

  // ── Posts (Staff) ───────────────────────────────────────────────────────────

  async createPost(
    input: CreatePostInput,
    authorId: string,
    initialStatus: PostStatus = "draft"
  ): Promise<IPost> {
    await connectMongo();
    const slug = await this.generateUniqueSlug(input.title["en"] || "civic-update");

    const post = new Post({
      tenantId: this.tenantId,
      slug,
      status: initialStatus,
      authorId,
      title: input.title,
      summary: input.summary ?? {},
      blocks: input.blocks,
      coverMediaId: input.coverMediaId ?? null,
      tags: input.tags ?? [],
      relatedIssueIds: input.relatedIssueIds ?? [],
      commentsEnabled: input.commentsEnabled ?? true,
      commentCount: 0,
      version: 1,
      publishedAt: initialStatus === "published" ? new Date() : null,
      scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
    });

    const saved = await post.save();
    if (initialStatus === "published") {
      await cacheInvalidateTenantPosts(this.tenantId);
    }
    return saved;
  }

  async getPostById(id: string): Promise<IPost | null> {
    await connectMongo();
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return Post.findOne({ tenantId: this.tenantId, _id: id });
  }

  async getPostBySlug(slug: string): Promise<IPost | null> {
    await connectMongo();
    return Post.findOne({ tenantId: this.tenantId, slug });
  }

  async updatePost(id: string, input: UpdatePostInput, expectedVersion?: number): Promise<IPost> {
    await connectMongo();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new AppError("NOT_FOUND", "Post not found", 404);
    }
    const post = await Post.findOne({ tenantId: this.tenantId, _id: id });
    if (!post) {
      throw new AppError("NOT_FOUND", "Post not found", 404);
    }

    if (expectedVersion !== undefined && post.version !== expectedVersion) {
      throw new AppError(
        "VERSION_CONFLICT",
        `Post version conflict: current version is ${post.version}, expected ${expectedVersion}`,
        409
      );
    }

    if (input.title) post.title = input.title;
    if (input.summary !== undefined) post.summary = input.summary;
    if (input.blocks) post.blocks = input.blocks;
    if (input.coverMediaId !== undefined) post.coverMediaId = input.coverMediaId;
    if (input.tags) post.tags = input.tags;
    if (input.relatedIssueIds) post.relatedIssueIds = input.relatedIssueIds;
    if (input.commentsEnabled !== undefined) post.commentsEnabled = input.commentsEnabled;
    if (input.scheduledFor !== undefined) {
      post.scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
    }

    post.version += 1;
    post.updatedAt = new Date();
    const saved = await post.save();
    await cacheInvalidateTenantPosts(this.tenantId);
    return saved;
  }

  async setPostStatus(
    id: string,
    status: PostStatus,
    options: { publishedAt?: Date; scheduledFor?: Date | null } = {}
  ): Promise<IPost> {
    await connectMongo();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new AppError("NOT_FOUND", "Post not found", 404);
    }
    const post = await Post.findOne({ tenantId: this.tenantId, _id: id });
    if (!post) {
      throw new AppError("NOT_FOUND", "Post not found", 404);
    }

    post.status = status;
    if (status === "published") {
      post.publishedAt = options.publishedAt ?? new Date();
      post.scheduledFor = null;
    } else if (status === "scheduled") {
      if (options.scheduledFor !== undefined) {
        post.scheduledFor = options.scheduledFor;
      }
    } else if (status === "archived") {
      // Keep publishedAt for historical reference
    }

    post.version += 1;
    post.updatedAt = new Date();
    const saved = await post.save();
    await cacheInvalidateTenantPosts(this.tenantId);
    return saved;
  }

  async listStaffPosts(
    options: {
      status?: string;
      q?: string;
      limit?: number;
      cursor?: string;
    } = {}
  ): Promise<{ posts: IPost[]; nextCursor: string | null }> {
    await connectMongo();
    const limit = Math.min(Math.max(1, options.limit ?? 20), 50);
    const filter: Record<string, unknown> = { tenantId: this.tenantId };

    if (options.status) {
      filter["status"] = options.status;
    }

    if (options.q?.trim()) {
      filter["$text"] = { $search: options.q.trim() };
    }

    if (options.cursor) {
      filter["_id"] = { $lt: options.cursor };
    }

    const posts = await Post.find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit + 1);

    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore ? String(resultPosts[resultPosts.length - 1]?._id) : null;

    return { posts: resultPosts, nextCursor };
  }

  // ── Posts (Public) ──────────────────────────────────────────────────────────

  async listPublishedPosts(
    options: ListPublishedPostsOptions = {}
  ): Promise<{ posts: IPost[]; nextCursor: string | null }> {
    await connectMongo();
    const limit = Math.min(Math.max(1, options.limit ?? 10), 50);
    const filter: Record<string, unknown> = {
      tenantId: this.tenantId,
      status: "published",
      publishedAt: { $lte: new Date() },
    };

    if (options.tag?.trim()) {
      filter["tags"] = options.tag.trim();
    }

    if (options.q?.trim()) {
      filter["$text"] = { $search: options.q.trim() };
    }

    if (options.cursor) {
      const cursorPost = await Post.findById(options.cursor).select("publishedAt").lean();
      if (cursorPost?.publishedAt) {
        filter["$or"] = [
          { publishedAt: { $lt: cursorPost.publishedAt } },
          { publishedAt: cursorPost.publishedAt, _id: { $lt: options.cursor } },
        ];
      }
    }

    const posts = await Post.find(filter)
      .sort({ publishedAt: -1, _id: -1 })
      .limit(limit + 1);

    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore ? String(resultPosts[resultPosts.length - 1]?._id) : null;

    return { posts: resultPosts, nextCursor };
  }

  // ── Media Operations ────────────────────────────────────────────────────────

  async findMediaBySha256(sha256: string): Promise<IMedia | null> {
    await connectMongo();
    return Media.findOne({ tenantId: this.tenantId, sha256 });
  }

  async getMediaById(id: string): Promise<IMedia | null> {
    await connectMongo();
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return Media.findOne({ tenantId: this.tenantId, _id: id });
  }

  async createMedia(data: {
    sha256: string;
    key: string;
    variants: IMediaVariants;
    altText?: string;
    caption?: string | null;
    width: number;
    height: number;
    bytes: number;
    mime: string;
    uploaderId: string;
  }): Promise<IMedia> {
    await connectMongo();
    const media = new Media({
      tenantId: this.tenantId,
      sha256: data.sha256,
      key: data.key,
      variants: data.variants,
      altText: data.altText ?? "",
      caption: data.caption ?? null,
      width: data.width,
      height: data.height,
      bytes: data.bytes,
      mime: data.mime,
      uploaderId: data.uploaderId,
      createdAt: new Date(),
    });

    return media.save();
  }

  async findUnreferencedMedia(olderThan: Date): Promise<IMedia[]> {
    await connectMongo();
    const candidates = await Media.find({
      tenantId: this.tenantId,
      createdAt: { $lt: olderThan },
    });

    const unreferenced: IMedia[] = [];
    for (const m of candidates) {
      const mediaIdStr = String(m._id);
      const isReferencedCover = await Post.exists({
        tenantId: this.tenantId,
        coverMediaId: mediaIdStr,
      });

      if (isReferencedCover) continue;

      // Check blocks in any locale for this mediaId
      const isReferencedInBlocks = await Post.exists({
        tenantId: this.tenantId,
        $or: [
          { "blocks.en.mediaId": mediaIdStr },
          { "blocks.hi.mediaId": mediaIdStr },
          { "blocks.pa.mediaId": mediaIdStr },
        ],
      });

      if (!isReferencedInBlocks) {
        unreferenced.push(m);
      }
    }

    return unreferenced;
  }

  async deleteMedia(id: string): Promise<boolean> {
    await connectMongo();
    const res = await Media.deleteOne({ tenantId: this.tenantId, _id: id });
    return res.deletedCount > 0;
  }
}
