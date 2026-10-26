/**
 * Notifications Router — B4
 * In-app notification records in Mongo with list and mark-read endpoints.
 * Scoped strictly to current user's tenantId (SPEC §4).
 */
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { Notification } from "../db/models/notification.model.js";
import { connectMongo } from "../db/mongo.js";

export const notificationsRouter: Router = Router();

notificationsRouter.use(requireAuth);

/**
 * GET /api/v1/notifications
 * Returns notifications for the logged-in user or their role in this tenant.
 */
notificationsRouter.get("/", async (req: Request, res: Response) => {
  await connectMongo();
  const tenantId = req.user?.tid;
  const userId = req.user?.sub;
  const role = req.user?.role;

  if (!tenantId || !userId) {
    throw new AppError("UNAUTHORIZED", "Missing tenant or user context", 401);
  }

  const query: Record<string, unknown> = {
    tenantId,
    $or: [{ userId }, { role }, { userId: `role:${role}` }],
  };

  const limit = Math.min(Number(req.query["limit"] ?? 50), 100);
  const unreadOnly = req.query["unread"] === "true";
  if (unreadOnly) {
    query["read"] = false;
  }

  const notifications = await Notification.find(query).sort({ createdAt: -1 }).limit(limit).lean();

  const formatted = notifications.map((n) => ({
    id: String(n._id as unknown as string),
    issue_id: n.issueId,
    type: n.type,
    title: n.title,
    body: n.body,
    read: n.read,
    read_at: n.readAt,
    created_at: n.createdAt,
    data: n.data,
  }));

  res.status(200).json({ data: formatted });
});

/**
 * PATCH /api/v1/notifications/:id/read
 * Mark notification as read (tenant-scoped).
 */
notificationsRouter.patch("/:id/read", async (req: Request, res: Response) => {
  await connectMongo();
  const tenantId = req.user?.tid;
  const id = req.params["id"] as string;

  if (!tenantId) {
    throw new AppError("UNAUTHORIZED", "Missing tenant context", 401);
  }
  if (!id) {
    throw new AppError("BAD_REQUEST", "Notification id is required", 400);
  }

  const updated = await Notification.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: { read: true, readAt: new Date() } },
    { new: true }
  );

  if (!updated) {
    throw new AppError("NOT_FOUND", "Notification not found", 404);
  }

  res.status(200).json({
    data: {
      id: String(updated._id),
      read: updated.read,
      read_at: updated.readAt,
    },
  });
});
