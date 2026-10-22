/**
 * Storage adapter interface + local-disk implementation (S3 comes later).
 * SPEC §8: JPEG/PNG/WebP up to 8 MB, check magic bytes, strip metadata with sharp.
 * Files stored on a named Compose volume mounted into the api container.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { AppError } from "../middleware/error-handler.js";

export function detectMimeType(buffer: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)
    return "image/png";
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  )
    return "image/webp";
  return null;
}

export interface ProcessedPhoto {
  key: string;
  blurScore: number;
  mime: string;
  sizeBytes: number;
}

export interface StorageAdapter {
  /** Store a processed photo and return the storage key */
  put(tenantId: string, issueId: string, buffer: Buffer, ext: string): Promise<string>;
  /** Return a URL to access the stored photo */
  url(key: string): string;
}

// ── Local-disk implementation ─────────────────────────────────────────────────

const inDocker = Boolean(process.env["IN_DOCKER"]) || fs.existsSync("/.dockerenv");
const UPLOAD_ROOT =
  process.env["UPLOAD_DIR"] ??
  (inDocker ? "/data/uploads" : path.resolve(process.cwd(), "uploads"));

export class LocalStorageAdapter implements StorageAdapter {
  private readonly root: string;

  constructor(root: string = UPLOAD_ROOT) {
    this.root = root;
  }

  async put(tenantId: string, issueId: string, buffer: Buffer, ext: string): Promise<string> {
    const dir = path.join(this.root, "t", tenantId, "issues", issueId);
    await fs.promises.mkdir(dir, { recursive: true });
    const key = `t/${tenantId}/issues/${issueId}/${randomUUID()}.${ext}`;
    const filePath = path.join(this.root, key);
    await fs.promises.writeFile(filePath, buffer);
    return key;
  }

  url(key: string): string {
    // In local dev: serve through api /uploads/* static route
    const baseUrl = process.env["API_BASE_URL"] ?? "http://localhost:4000";
    return `${baseUrl}/uploads/${key}`;
  }
}

export const storageAdapter: StorageAdapter = new LocalStorageAdapter();

// ── Photo processing ──────────────────────────────────────────────────────────

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Validate, strip metadata and compute blur score.
 * Returns ProcessedPhoto with key stored in the adapter.
 */
export async function processAndStorePhoto(
  rawBuffer: Buffer,
  tenantId: string,
  issueId: string,
  adapter: StorageAdapter = storageAdapter
): Promise<ProcessedPhoto> {
  if (rawBuffer.length > MAX_BYTES) {
    throw new AppError(
      "PAYLOAD_TOO_LARGE",
      `Photo exceeds 8 MB limit (got ${rawBuffer.length} bytes)`,
      413
    );
  }

  const mime = detectMimeType(rawBuffer);
  if (!mime) {
    throw new AppError(
      "BAD_MAGIC_BYTES",
      "Invalid image content: magic bytes do not match a valid JPEG, PNG, or WebP file",
      400
    );
  }

  // Strip EXIF / metadata (default in sharp), re-encode, cap dimensions to 2048 to save space
  let processedBuffer: Buffer;
  let ext: string;
  try {
    const sharpInst = sharp(rawBuffer).resize(2048, 2048, {
      fit: "inside",
      withoutEnlargement: true,
    });

    if (mime === "image/jpeg") {
      processedBuffer = await sharpInst.jpeg({ quality: 80 }).toBuffer();
      ext = "jpg";
    } else if (mime === "image/png") {
      processedBuffer = await sharpInst.png({ compressionLevel: 8 }).toBuffer();
      ext = "png";
    } else {
      processedBuffer = await sharpInst.webp({ quality: 80 }).toBuffer();
      ext = "webp";
    }
  } catch (_err) {
    throw new AppError(
      "BAD_MAGIC_BYTES",
      "Invalid or corrupt image content: failed to decode image",
      400
    );
  }

  // Blur score: variance of a simple Laplacian (SPEC §9 image quality)
  const blurScore = await computeBlurScore(rawBuffer);

  const key = await adapter.put(tenantId, issueId, processedBuffer, ext);

  return {
    key,
    blurScore,
    mime,
    sizeBytes: processedBuffer.length,
  };
}

/**
 * Compute variance of Laplacian as blur score.
 * Higher = sharper. Low score (< 100) suggests blur.
 */
async function computeBlurScore(buffer: Buffer): Promise<number> {
  try {
    // Downsample to 256x256 grayscale for speed
    const { data, info } = await sharp(buffer)
      .resize(256, 256, { fit: "inside" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width;
    const h = info.height;
    let sum = 0;
    let sumSq = 0;
    let count = 0;

    // Laplacian kernel: 0 1 0 / 1 -4 1 / 0 1 0
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const px = y * w + x;
        const lap =
          -4 * (data[px] ?? 0) +
          (data[px - 1] ?? 0) +
          (data[px + 1] ?? 0) +
          (data[px - w] ?? 0) +
          (data[px + w] ?? 0);
        sum += lap;
        sumSq += lap * lap;
        count++;
      }
    }

    if (count === 0) return 0;
    const mean = sum / count;
    return sumSq / count - mean * mean; // variance
  } catch {
    return 0;
  }
}
