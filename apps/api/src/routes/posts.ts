/**
 * Staff Posts routes — C1
 * Staff CRUD, autosave conflict detection (409), publish, schedule, and archive.
 */
import { Router, type Request, type Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ContentRepo } from "../db/content-repo.js";
import { AppError } from "../middleware/error-handler.js";
import { createPostSchema, updatePostSchema } from "@nivaran/shared";
import { schedulePostPublish, cancelPostPublish } from "../services/post-scheduler.js";

export const postsRouter: Router = Router();

// Staff, dept_head, tenant_admin, citizen can create drafts
postsRouter.post(
  "/",
  requireAuth,
  requireRole("citizen", "staff", "dept_head", "tenant_admin", "platform_admin"),
  async (req: Request, res: Response) => {
    const tenantId = req.user?.tid;
    const authorId = req.user?.sub;
    const roles = req.user?.roles ?? [];
    if (!tenantId || !authorId) {
      throw new AppError("UNAUTHORIZED", "Missing tenant or user context", 401);
    }

    const input = createPostSchema.parse(req.body);
    const isManager =
      roles.includes("dept_head") ||
      roles.includes("tenant_admin") ||
      roles.includes("platform_admin");

    if (input.scheduledFor && !isManager) {
      throw new AppError("FORBIDDEN", "Only dept_head or tenant_admin may schedule posts", 403);
    }

    const repo = new ContentRepo(tenantId);
    let initialStatus: "draft" | "scheduled" = "draft";
    if (input.scheduledFor && isManager) {
      initialStatus = "scheduled";
    }

    const post = await repo.createPost(input, authorId, initialStatus);

    if (initialStatus === "scheduled" && input.scheduledFor) {
      await schedulePostPublish(tenantId, String(post._id), new Date(input.scheduledFor));
    }

    res.status(201).json({ data: post });
  }
);

// Staff and citizen workbench list (posts in tenant)
postsRouter.get(
  "/",
  requireAuth,
  requireRole("citizen", "staff", "dept_head", "tenant_admin", "platform_admin"),
  async (req: Request, res: Response) => {
    const tenantId = req.user?.tid;
    if (!tenantId) {
      throw new AppError("UNAUTHORIZED", "Missing tenant context", 401);
    }

    const repo = new ContentRepo(tenantId);
    const status = req.query["status"] ? String(req.query["status"]) : undefined;
    const q = req.query["q"] ? String(req.query["q"]) : undefined;
    const limit = req.query["limit"] ? Number(req.query["limit"]) : 20;
    const cursor = req.query["cursor"] ? String(req.query["cursor"]) : undefined;

    const listOpts: { status?: string; q?: string; limit?: number; cursor?: string } = { limit };
    if (status) listOpts.status = status;
    if (q) listOpts.q = q;
    if (cursor) listOpts.cursor = cursor;

    const result = await repo.listStaffPosts(listOpts);
    res.status(200).json({ data: result.posts, nextCursor: result.nextCursor });
  }
);

// Get post by ID
postsRouter.get(
  "/:id",
  requireAuth,
  requireRole("citizen", "staff", "dept_head", "tenant_admin", "platform_admin"),
  async (req: Request, res: Response) => {
    const tenantId = req.user?.tid;
    if (!tenantId) {
      throw new AppError("UNAUTHORIZED", "Missing tenant context", 401);
    }

    const repo = new ContentRepo(tenantId);
    const post = await repo.getPostById(req.params["id"] as string);
    if (!post) {
      throw new AppError("NOT_FOUND", "Post not found", 404);
    }

    res.status(200).json({ data: post });
  }
);

// Update post with autosave version conflict check
postsRouter.put(
  "/:id",
  requireAuth,
  requireRole("citizen", "staff", "dept_head", "tenant_admin", "platform_admin"),
  async (req: Request, res: Response) => {
    const tenantId = req.user?.tid;
    const userId = req.user?.sub;
    const roles = req.user?.roles ?? [];
    if (!tenantId || !userId) {
      throw new AppError("UNAUTHORIZED", "Missing tenant or user context", 401);
    }

    const repo = new ContentRepo(tenantId);
    const post = await repo.getPostById(req.params["id"] as string);
    if (!post) {
      throw new AppError("NOT_FOUND", "Post not found", 404);
    }

    const isManager =
      roles.includes("dept_head") ||
      roles.includes("tenant_admin") ||
      roles.includes("platform_admin");
    if (!isManager) {
      if (post.authorId !== userId) {
        throw new AppError("FORBIDDEN", "Staff may only edit their own draft posts", 403);
      }
      if (post.status !== "draft") {
        throw new AppError("FORBIDDEN", "Staff cannot edit published or archived posts", 403);
      }
    }

    // Version conflict checking (If-Match header or body version)
    const ifMatchHeader = req.headers["if-match"];
    let expectedVersion: number | undefined;
    if (typeof ifMatchHeader === "string") {
      const clean = ifMatchHeader.replace(/^["']|["']$/g, "");
      const num = Number(clean);
      if (!isNaN(num)) expectedVersion = num;
    } else if (typeof req.body.version === "number") {
      expectedVersion = req.body.version;
    }

    const input = updatePostSchema.parse(req.body);
    const updated = await repo.updatePost(req.params["id"] as string, input, expectedVersion);

    if (input.scheduledFor !== undefined) {
      if (input.scheduledFor) {
        await schedulePostPublish(tenantId, String(updated._id), new Date(input.scheduledFor));
      } else {
        await cancelPostPublish(String(updated._id));
      }
    }

    res.status(200).json({ data: updated });
  }
);

// Publish post (dept_head, tenant_admin, or author for blogs/citizen posts)
postsRouter.post(
  "/:id/publish",
  requireAuth,
  requireRole("citizen", "staff", "dept_head", "tenant_admin", "platform_admin"),
  async (req: Request, res: Response) => {
    const tenantId = req.user?.tid;
    const userId = req.user?.sub;
    const roles = req.user?.roles ?? [];
    if (!tenantId || !userId) {
      throw new AppError("UNAUTHORIZED", "Missing tenant or user context", 401);
    }

    const repo = new ContentRepo(tenantId);
    const post = await repo.getPostById(req.params["id"] as string);
    if (!post) {
      throw new AppError("NOT_FOUND", "Post not found", 404);
    }

    const isManager =
      roles.includes("dept_head") ||
      roles.includes("tenant_admin") ||
      roles.includes("platform_admin");
    const isAuthor = post.authorId === userId;
    const isBlog =
      (post.tags || []).includes("blog") ||
      (post.tags || []).includes("community") ||
      req.query["scope"] === "blog" ||
      req.headers["x-post-type"] === "blog";

    if (!isManager && !isAuthor) {
      throw new AppError("FORBIDDEN", "You can only publish your own posts", 403);
    }
    if (!isManager && !isBlog && !roles.includes("citizen")) {
      throw new AppError("FORBIDDEN", "Only dept_head or tenant_admin may publish dispatches", 403);
    }

    await cancelPostPublish(req.params["id"] as string);
    const published = await repo.setPostStatus(req.params["id"] as string, "published", {
      publishedAt: new Date(),
    });

    res.status(200).json({ data: published });
  }
);

// Schedule post (dept_head or tenant_admin only)
postsRouter.post(
  "/:id/schedule",
  requireAuth,
  requireRole("dept_head", "tenant_admin", "platform_admin"),
  async (req: Request, res: Response) => {
    const tenantId = req.user?.tid;
    if (!tenantId) {
      throw new AppError("UNAUTHORIZED", "Missing tenant context", 401);
    }

    const scheduledForRaw = req.body.scheduledFor;
    if (!scheduledForRaw) {
      throw new AppError("BAD_REQUEST", "scheduledFor timestamp is required", 400);
    }

    const scheduledDate = new Date(scheduledForRaw);
    if (isNaN(scheduledDate.getTime())) {
      throw new AppError("BAD_REQUEST", "Invalid scheduledFor date format", 400);
    }

    const repo = new ContentRepo(tenantId);
    const scheduled = await repo.setPostStatus(req.params["id"] as string, "scheduled", {
      scheduledFor: scheduledDate,
    });

    await schedulePostPublish(tenantId, String(scheduled._id), scheduledDate);

    res.status(200).json({ data: scheduled });
  }
);

// Archive post (dept_head or tenant_admin only)
postsRouter.post(
  "/:id/archive",
  requireAuth,
  requireRole("dept_head", "tenant_admin", "platform_admin"),
  async (req: Request, res: Response) => {
    const tenantId = req.user?.tid;
    if (!tenantId) {
      throw new AppError("UNAUTHORIZED", "Missing tenant context", 401);
    }

    const repo = new ContentRepo(tenantId);
    await cancelPostPublish(req.params["id"] as string);
    const archived = await repo.setPostStatus(req.params["id"] as string, "archived");

    res.status(200).json({ data: archived });
  }
);

// Delete post
postsRouter.delete(
  "/:id",
  requireAuth,
  requireRole("citizen", "staff", "dept_head", "tenant_admin", "platform_admin"),
  async (req: Request, res: Response) => {
    const tenantId = req.user?.tid;
    const userId = req.user?.sub;
    const roles = req.user?.roles ?? [];
    if (!tenantId || !userId) {
      throw new AppError("UNAUTHORIZED", "Missing tenant or user context", 401);
    }

    const repo = new ContentRepo(tenantId);
    const post = await repo.getPostById(req.params["id"] as string);
    if (!post) {
      throw new AppError("NOT_FOUND", "Post not found", 404);
    }

    const isManager =
      roles.includes("dept_head") ||
      roles.includes("tenant_admin") ||
      roles.includes("platform_admin");
    if (!isManager && post.authorId !== userId) {
      throw new AppError("FORBIDDEN", "You can only delete your own draft posts", 403);
    }

    await cancelPostPublish(String(post._id));
    await repo.setPostStatus(String(post._id), "archived"); // or delete

    res.status(200).json({ data: { success: true } });
  }
);
