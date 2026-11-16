/**
 * Media Processing Pipeline — C1
 * SPEC §14:
 * - JPEG, PNG, WebP with magic byte validation
 * - Max 5 MB
 * - Strip EXIF
 * - Produce 480, 960, and 1600 px WebP plus 960 px JPEG fallback
 * - SHA-256 deduplication per tenant
 * - Filenames contain the SHA-256 hash
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { detectMimeType } from "../adapters/storage.js";
import { AppError } from "../middleware/error-handler.js";
import { ContentRepo } from "../db/content-repo.js";
import type { IMedia, IMediaVariants } from "../db/models/media.model.js";

const MAX_MEDIA_BYTES = 5 * 1024 * 1024; // 5 MB

const inDocker = Boolean(process.env["IN_DOCKER"]) || fs.existsSync("/.dockerenv");
export const MEDIA_UPLOAD_ROOT =
  process.env["UPLOAD_DIR"] ??
  (inDocker ? "/data/uploads" : path.resolve(process.cwd(), "uploads"));

export async function processAndStoreMedia(
  rawBuffer: Buffer,
  tenantId: string,
  uploaderId: string,
  altText = "",
  caption?: string
): Promise<IMedia> {
  // 1. Size check (5 MB)
  if (rawBuffer.length > MAX_MEDIA_BYTES) {
    throw new AppError(
      "PAYLOAD_TOO_LARGE",
      `Media exceeds 5 MB limit (got ${rawBuffer.length} bytes)`,
      413
    );
  }

  // 2. Magic bytes check
  const mime = detectMimeType(rawBuffer);
  if (!mime) {
    throw new AppError(
      "BAD_MAGIC_BYTES",
      "Invalid image content: magic bytes do not match a valid JPEG, PNG, or WebP file",
      400
    );
  }

  // 3. SHA-256 hash for deduplication
  const sha256 = createHash("sha256").update(rawBuffer).digest("hex");
  const contentRepo = new ContentRepo(tenantId);

  // Check if identical media already exists in this tenant
  const existing = await contentRepo.findMediaBySha256(sha256);
  if (existing) {
    return existing;
  }

  // 4. Verify sharp can decode and read dimensions (and strip EXIF)
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(rawBuffer).metadata();
  } catch (_err) {
    throw new AppError(
      "BAD_MAGIC_BYTES",
      "Invalid or corrupt image content: failed to decode image",
      400
    );
  }

  const origWidth = metadata.width ?? 1200;
  const origHeight = metadata.height ?? 800;

  // 5. Generate variants: 480w, 960w, 1600w WebP + 960w JPEG fallback
  const w480Buffer = await sharp(rawBuffer)
    .rotate()
    .resize({ width: 480, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const w960Buffer = await sharp(rawBuffer)
    .rotate()
    .resize({ width: 960, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const w1600Buffer = await sharp(rawBuffer)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();

  const fallbackJpgBuffer = await sharp(rawBuffer)
    .rotate()
    .resize({ width: 960, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  // 6. Write files to disk
  const mediaDir = path.join(MEDIA_UPLOAD_ROOT, "t", tenantId, "media");
  await fs.promises.mkdir(mediaDir, { recursive: true });

  const fn480 = `${sha256}_480.webp`;
  const fn960 = `${sha256}_960.webp`;
  const fn1600 = `${sha256}_1600.webp`;
  const fnFallback = `${sha256}_960.jpg`;

  await Promise.all([
    fs.promises.writeFile(path.join(mediaDir, fn480), w480Buffer),
    fs.promises.writeFile(path.join(mediaDir, fn960), w960Buffer),
    fs.promises.writeFile(path.join(mediaDir, fn1600), w1600Buffer),
    fs.promises.writeFile(path.join(mediaDir, fnFallback), fallbackJpgBuffer),
  ]);

  const variants: IMediaVariants = {
    w480: `/uploads/t/${tenantId}/media/${fn480}`,
    w960: `/uploads/t/${tenantId}/media/${fn960}`,
    w1600: `/uploads/t/${tenantId}/media/${fn1600}`,
    fallbackJpg: `/uploads/t/${tenantId}/media/${fnFallback}`,
  };

  // 7. Store media document
  return contentRepo.createMedia({
    sha256,
    key: `t/${tenantId}/media/${sha256}`,
    variants,
    altText,
    caption: caption ?? null,
    width: origWidth,
    height: origHeight,
    bytes: rawBuffer.length,
    mime,
    uploaderId,
  });
}

export async function deleteUnreferencedMedia(tenantId: string): Promise<number> {
  const contentRepo = new ContentRepo(tenantId);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const unreferenced = await contentRepo.findUnreferencedMedia(oneDayAgo);

  let deletedCount = 0;
  for (const media of unreferenced) {
    const mediaDir = path.join(MEDIA_UPLOAD_ROOT, "t", tenantId, "media");
    const fn480 = `${media.sha256}_480.webp`;
    const fn960 = `${media.sha256}_960.webp`;
    const fn1600 = `${media.sha256}_1600.webp`;
    const fnFallback = `${media.sha256}_960.jpg`;

    await Promise.all([
      fs.promises.unlink(path.join(mediaDir, fn480)).catch(() => {}),
      fs.promises.unlink(path.join(mediaDir, fn960)).catch(() => {}),
      fs.promises.unlink(path.join(mediaDir, fn1600)).catch(() => {}),
      fs.promises.unlink(path.join(mediaDir, fnFallback)).catch(() => {}),
    ]);

    await contentRepo.deleteMedia(String(media._id));
    deletedCount++;
  }

  return deletedCount;
}
