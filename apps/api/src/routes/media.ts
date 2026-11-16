/**
 * Media routes — C1
 * Staff-only media upload through sharp pipeline with variants and deduplication.
 */
import { Router, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { processAndStoreMedia } from "../services/media-service.js";
import { ContentRepo } from "../db/content-repo.js";
import { AppError } from "../middleware/error-handler.js";

export const mediaRouter: Router = Router();

function extractMultipartBuffer(
  raw: Buffer,
  contentType?: string
): { buffer: Buffer; altText?: string | undefined; caption?: string | undefined } {
  if (!contentType || !contentType.includes("multipart/form-data")) {
    return { buffer: raw };
  }

  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundaryStr = match ? match[1] || match[2] : null;
  if (!boundaryStr) return { buffer: raw };

  const boundary = Buffer.from(`--${boundaryStr}`);
  let start = raw.indexOf(boundary);
  if (start === -1) return { buffer: raw };

  let fileBuffer: Buffer | null = null;
  let altText: string | undefined;
  let caption: string | undefined;

  while (start !== -1) {
    const nextStart = raw.indexOf(boundary, start + boundary.length);
    if (nextStart === -1) break;

    const part = raw.subarray(start + boundary.length, nextStart);
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd !== -1) {
      const headerStr = part.subarray(0, headerEnd).toString("utf-8");
      // Find where payload ends (strip trailing \r\n before next boundary)
      let endIdx = part.length;
      if (part[endIdx - 1] === 0x0a && part[endIdx - 2] === 0x0d) {
        endIdx -= 2;
      }
      const body = part.subarray(headerEnd + 4, endIdx);

      if (headerStr.includes('filename="') || headerStr.includes("Content-Type: image/")) {
        fileBuffer = body;
      } else if (headerStr.includes('name="altText"') || headerStr.includes('name="alt"')) {
        altText = body.toString("utf-8").trim();
      } else if (headerStr.includes('name="caption"')) {
        caption = body.toString("utf-8").trim();
      }
    }
    start = nextStart;
  }

  return { buffer: fileBuffer ?? raw, altText, caption };
}

mediaRouter.post(
  "/",
  requireAuth,
  requireRole("citizen", "staff", "dept_head", "tenant_admin", "platform_admin"),
  async (req: Request, res: Response) => {
    const isCitizenOnly = (req.user?.roles ?? []).every((r) => r === "citizen");
    const purpose = req.query["purpose"] || req.headers["x-purpose"];
    if (isCitizenOnly && purpose !== "blog") {
      throw new AppError("FORBIDDEN", "Citizens may only upload media for blogs", 403);
    }

    let rawBuffer: Buffer;
    let altText = "";
    let caption: string | undefined;

    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      const contentType = req.headers["content-type"];
      const extracted = extractMultipartBuffer(req.body, contentType);
      rawBuffer = extracted.buffer;
      altText = extracted.altText || "";
      caption = extracted.caption;

      if (!altText) {
        const rawAlt = req.headers["x-alt-text"] || req.query["alt"];
        if (typeof rawAlt === "string") {
          try {
            altText = decodeURIComponent(rawAlt);
          } catch {
            altText = rawAlt;
          }
        }
      }
      if (!caption) {
        const rawCaption = req.headers["x-caption"] || req.query["caption"];
        if (typeof rawCaption === "string") {
          try {
            caption = decodeURIComponent(rawCaption);
          } catch {
            caption = rawCaption;
          }
        }
      }
    } else if (req.body && typeof req.body === "object" && req.body.data) {
      const base64Data = String(req.body.data).replace(/^data:image\/\w+;base64,/, "");
      rawBuffer = Buffer.from(base64Data, "base64");
      altText = req.body.altText || req.body.alt || "";
      caption = req.body.caption;
    } else {
      throw new AppError("BAD_REQUEST", "No image data provided in request body", 400);
    }

    const tenantId = req.user?.tid;
    const uploaderId = req.user?.sub;
    if (!tenantId || !uploaderId) {
      throw new AppError("UNAUTHORIZED", "Missing tenant or user context", 401);
    }

    // Check if duplicate before storing
    const sha256 = createHash("sha256").update(rawBuffer).digest("hex");
    const repo = new ContentRepo(tenantId);
    const existing = await repo.findMediaBySha256(sha256);
    const isExisting = Boolean(existing);

    const media = await processAndStoreMedia(rawBuffer, tenantId, uploaderId, altText, caption);

    const variantsObj = {
      w480: media.variants.w480,
      w960: media.variants.w960,
      w1600: media.variants.w1600,
      fallbackJpg: media.variants.fallbackJpg,
      "480": media.variants.w480,
      "960": media.variants.w960,
      "1600": media.variants.w1600,
      fallback: media.variants.fallbackJpg,
    };

    res.status(isExisting ? 200 : 201).json({
      data: {
        id: String(media._id),
        sha256: media.sha256,
        variants: variantsObj,
        altText: media.altText,
        caption: media.caption,
        width: media.width,
        height: media.height,
        bytes: media.bytes,
        mime: media.mime,
        createdAt: media.createdAt,
      },
    });
  }
);

mediaRouter.get("/:id", requireAuth, async (req: Request, res: Response) => {
  const tenantId = req.user?.tid;
  if (!tenantId) {
    throw new AppError("UNAUTHORIZED", "Missing tenant context", 401);
  }

  const repo = new ContentRepo(tenantId);
  const media = await repo.getMediaById(req.params["id"] as string);
  if (!media) {
    throw new AppError("NOT_FOUND", "Media not found", 404);
  }

  const variantsObj = {
    w480: media.variants.w480,
    w960: media.variants.w960,
    w1600: media.variants.w1600,
    fallbackJpg: media.variants.fallbackJpg,
    "480": media.variants.w480,
    "960": media.variants.w960,
    "1600": media.variants.w1600,
    fallback: media.variants.fallbackJpg,
  };

  res.status(200).json({
    data: {
      id: String(media._id),
      sha256: media.sha256,
      variants: variantsObj,
      altText: media.altText,
      caption: media.caption,
      width: media.width,
      height: media.height,
      bytes: media.bytes,
      mime: media.mime,
      createdAt: media.createdAt,
    },
  });
});
