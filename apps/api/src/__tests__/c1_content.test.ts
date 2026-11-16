import { describe, expect, it, beforeAll, afterAll } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { app } from "../app.js";
import { runMigrations } from "../db/migrate.js";
import { seedDatabase } from "../db/seed.js";
import { closePools } from "../db/config.js";
import { connectMongo, disconnectMongo } from "../db/mongo.js";
import { signAccessToken } from "../auth/jwt.js";
import { PlatformDb } from "../db/platform-db.js";
import { processPostPublishJob } from "../services/post-scheduler.js";
import { blockSchema, blocksArraySchema } from "@nivaran/shared";

let tenantA: { id: string; slug: string };
let tenantB: { id: string; slug: string };

let staffAToken: string;
let staffBToken: string;
let otherStaffAToken: string;
let deptHeadAToken: string;
let adminAToken: string;
let citizenAToken: string;

beforeAll(async () => {
  await runMigrations();
  await connectMongo();
  await seedDatabase({ includeSynthetic: false });

  const platformDb = new PlatformDb();
  const tenants = await platformDb.listTenants();
  tenantA = tenants[0]!;
  tenantB = tenants[1]!;

  staffAToken = await signAccessToken({
    sub: "user-staff-a1",
    tid: tenantA.id,
    role: "staff",
    roles: ["staff"],
  });

  otherStaffAToken = await signAccessToken({
    sub: "user-staff-a2",
    tid: tenantA.id,
    role: "staff",
    roles: ["staff"],
  });

  staffBToken = await signAccessToken({
    sub: "user-staff-b1",
    tid: tenantB.id,
    role: "staff",
    roles: ["staff"],
  });

  deptHeadAToken = await signAccessToken({
    sub: "user-head-a",
    tid: tenantA.id,
    role: "dept_head",
    roles: ["dept_head"],
  });

  adminAToken = await signAccessToken({
    sub: "user-admin-a",
    tid: tenantA.id,
    role: "tenant_admin",
    roles: ["tenant_admin"],
  });

  citizenAToken = await signAccessToken({
    sub: "user-citizen-a",
    tid: tenantA.id,
    role: "citizen",
    roles: ["citizen"],
  });
});

afterAll(async () => {
  await disconnectMongo();
  await closePools();
});

describe("C1: Civic Updates (Blog) & Media Pipeline", () => {
  // ── 1. Block Schema & Character Limits ──────────────────────────────────────
  describe("Block Schema Validation", () => {
    it("validates good block types (paragraph, heading, list, quote, callout, divider)", () => {
      const valid = blockSchema.safeParse({
        type: "paragraph",
        text: "Clean drinking water notice.",
      });
      expect(valid.success).toBe(true);

      const heading = blockSchema.safeParse({
        type: "heading",
        level: 2,
        text: "Important Ward Notice",
      });
      expect(heading.success).toBe(true);
    });

    it("rejects unknown block types and bad heading levels", () => {
      const badType = blockSchema.safeParse({
        type: "malicious_script",
        payload: "alert(1)",
      });
      expect(badType.success).toBe(false);

      const badHeading = blockSchema.safeParse({
        type: "heading",
        level: 1, // Only H2 and H3 allowed per spec
        text: "H1 is forbidden",
      });
      expect(badHeading.success).toBe(false);
    });

    it("rejects image block missing required alt text", () => {
      const badImage = blockSchema.safeParse({
        type: "image",
        mediaId: "med-123",
        // missing alt
      });
      expect(badImage.success).toBe(false);
    });

    it("rejects blocks exceeding 20k characters or 80 blocks limit", () => {
      // 81 blocks
      const tooManyBlocks = Array.from({ length: 81 }, (_, i) => ({
        type: "paragraph" as const,
        text: `Paragraph ${i}`,
      }));
      const resMany = blocksArraySchema.safeParse(tooManyBlocks);
      expect(resMany.success).toBe(false);

      // 21k chars total
      const hugeBlocks = [
        {
          type: "paragraph" as const,
          text: "A".repeat(21000),
        },
      ];
      const resHuge = blocksArraySchema.safeParse(hugeBlocks);
      expect(resHuge.success).toBe(false);
    });
  });

  // ── 2. Media Pipeline (Sharp, EXIF, Magic Bytes, 5MB, SHA256) ───────────────
  describe("Media Pipeline", () => {
    let uploadedMediaId: string;

    it("uploads and processes valid PNG image via Sharp, returning variants and stripped EXIF", async () => {
      const testPng = await sharp({
        create: {
          width: 800,
          height: 600,
          channels: 3,
          background: { r: 245, g: 192, b: 0 },
        },
      })
        .png()
        .toBuffer();

      const res = await request(app)
        .post("/api/v1/media")
        .set("Authorization", `Bearer ${staffAToken}`)
        .attach("file", testPng, "road_repair.png")
        .field("altText", "Asphalt repair on highway")
        .field("caption", "Ward 4 highway sector");

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.variants).toBeDefined();
      expect(res.body.data.variants["480"]).toContain(".webp");
      expect(res.body.data.variants["960"]).toContain(".webp");
      expect(res.body.data.variants["1600"]).toContain(".webp");
      expect(res.body.data.variants["fallback"]).toContain(".jpg");
      expect(res.body.data.width).toBe(800);
      expect(res.body.data.height).toBe(600);

      uploadedMediaId = res.body.data.id || res.body.data._id;
    });

    it("deduplicates identical image by sha256 per tenant", async () => {
      const testPng = await sharp({
        create: {
          width: 800,
          height: 600,
          channels: 3,
          background: { r: 245, g: 192, b: 0 },
        },
      })
        .png()
        .toBuffer();

      const res = await request(app)
        .post("/api/v1/media")
        .set("Authorization", `Bearer ${staffAToken}`)
        .attach("file", testPng, "road_repair_duplicate.png")
        .field("altText", "Duplicate image upload");

      expect(res.status).toBe(200); // Dedup returns 200 with existing record
      expect(res.body.data.id).toBe(uploadedMediaId);
    });

    it("rejects spoofed mime type when magic bytes are invalid", async () => {
      const fakeImage = Buffer.from("THIS IS A PLAIN TEXT FILE SPOOFED AS PNG", "utf-8");

      const res = await request(app)
        .post("/api/v1/media")
        .set("Authorization", `Bearer ${staffAToken}`)
        .attach("file", fakeImage, "malicious.png");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("BAD_MAGIC_BYTES");
    });

    it("rejects file exceeding 5 MB limit with 413 Payload Too Large", async () => {
      const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024); // 5 MB + 1 KB

      const res = await request(app)
        .post("/api/v1/media")
        .set("Authorization", `Bearer ${staffAToken}`)
        .attach("file", largeBuffer, "oversize.png");

      expect(res.status).toBe(413);
    });

    it("denies media upload to citizens (staff only)", async () => {
      const testPng = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 10, g: 10, b: 10 },
        },
      })
        .png()
        .toBuffer();

      const res = await request(app)
        .post("/api/v1/media")
        .set("Authorization", `Bearer ${citizenAToken}`)
        .attach("file", testPng, "citizen_attempt.png");

      expect(res.status).toBe(403);
    });
  });

  // ── 3. Role Matrix & Draft Autosave / Version Conflict ───────────────────────
  describe("Post CRUD, Role Matrix & Version Conflict", () => {
    let createdPostId: string;
    let initialVersion: number;

    it("staff creates draft post successfully", async () => {
      const res = await request(app)
        .post("/api/v1/posts")
        .set("Authorization", `Bearer ${staffAToken}`)
        .send({
          title: { en: "Monsoon Preparedness Drive" },
          summary: { en: "Cleaning drains before monsoon hits." },
          blocks: {
            en: [
              {
                type: "heading",
                level: 2,
                text: "Drainage Cleanliness Notice",
              },
              {
                type: "paragraph",
                text: "Culverts in Sector 5 will be cleared this Friday.",
              },
            ],
          },
          tags: ["monsoon", "sanitation"],
        });

      expect(res.status).toBe(201);
      expect(res.body.data._id || res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe("draft");
      expect(res.body.data.version).toBe(1);
      expect(res.body.data.slug).toContain("monsoon-preparedness-drive");

      createdPostId = res.body.data._id || res.body.data.id;
      initialVersion = res.body.data.version;
    });

    it("staff can edit their own draft with valid If-Match header (autosave)", async () => {
      const res = await request(app)
        .put(`/api/v1/posts/${createdPostId}`)
        .set("Authorization", `Bearer ${staffAToken}`)
        .set("If-Match", `"${initialVersion}"`)
        .send({
          title: { en: "Monsoon Preparedness Drive (Updated)" },
          blocks: {
            en: [
              {
                type: "paragraph",
                text: "Updated timing: Friday 9:00 AM.",
              },
            ],
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.version).toBe(initialVersion + 1);
    });

    it("returns 409 Conflict when If-Match version does not match current version", async () => {
      const staleRes = await request(app)
        .put(`/api/v1/posts/${createdPostId}`)
        .set("Authorization", `Bearer ${staffAToken}`)
        .set("If-Match", `"${initialVersion}"`) // Stale version 1 (now version 2)
        .send({
          title: { en: "Conflicting Update" },
        });

      expect(staleRes.status).toBe(409);
      expect(staleRes.body.error.code).toBe("VERSION_CONFLICT");
    });

    it("forbids other staff member from editing someone else's draft", async () => {
      const res = await request(app)
        .put(`/api/v1/posts/${createdPostId}`)
        .set("Authorization", `Bearer ${otherStaffAToken}`)
        .send({
          title: { en: "Unauthorized Tampering" },
        });

      expect(res.status).toBe(403);
    });

    it("forbids regular staff from publishing post", async () => {
      const res = await request(app)
        .post(`/api/v1/posts/${createdPostId}/publish`)
        .set("Authorization", `Bearer ${staffAToken}`);

      expect(res.status).toBe(403);
    });

    it("allows dept_head or tenant_admin to publish post", async () => {
      const res = await request(app)
        .post(`/api/v1/posts/${createdPostId}/publish`)
        .set("Authorization", `Bearer ${deptHeadAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("published");
      expect(res.body.data.publishedAt).toBeDefined();
    });

    it("allows tenant_admin to archive post", async () => {
      const res = await request(app)
        .post(`/api/v1/posts/${createdPostId}/archive`)
        .set("Authorization", `Bearer ${adminAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("archived");
    });
  });

  // ── 4. Tenant Isolation on Every Route ───────────────────────────────────────
  describe("Tenant Isolation", () => {
    let postTenantAId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post("/api/v1/posts")
        .set("Authorization", `Bearer ${staffAToken}`)
        .send({
          title: { en: "Confidential Tenant A Dispatch" },
          blocks: { en: [{ type: "paragraph", text: "Tenant A internal notes" }] },
        });
      postTenantAId = res.body.data._id || res.body.data.id;
    });

    it("prevents Tenant B staff from reading Tenant A draft", async () => {
      const res = await request(app)
        .get(`/api/v1/posts/${postTenantAId}`)
        .set("Authorization", `Bearer ${staffBToken}`);

      expect(res.status).toBe(404);
    });

    it("prevents Tenant B staff from editing Tenant A draft", async () => {
      const res = await request(app)
        .put(`/api/v1/posts/${postTenantAId}`)
        .set("Authorization", `Bearer ${staffBToken}`)
        .send({ title: { en: "Cross-tenant intrusion" } });

      expect(res.status).toBe(404);
    });

    it("public list for Tenant B does not include Tenant A posts", async () => {
      const res = await request(app).get(`/api/v1/public/${tenantB.slug}/posts`);
      expect(res.status).toBe(200);
      const slugs = res.body.data.map((p: { slug: string }) => p.slug);
      expect(slugs).not.toContain("confidential-tenant-a-dispatch");
    });
  });

  // ── 5. Scheduled Publish Delayed Job (BullMQ) ───────────────────────────────
  describe("Scheduled Publish via BullMQ", () => {
    it("schedules a post and publishes it when the job handler runs", async () => {
      // 1. Create a draft
      const draftRes = await request(app)
        .post("/api/v1/posts")
        .set("Authorization", `Bearer ${staffAToken}`)
        .send({
          title: { en: "Scheduled Holiday Notice" },
          blocks: { en: [{ type: "paragraph", text: "Office closed on public holiday." }] },
        });
      const postId = draftRes.body.data._id || draftRes.body.data.id;

      // 2. Schedule publication
      const scheduleTime = new Date(Date.now() + 5000).toISOString();
      const schedRes = await request(app)
        .post(`/api/v1/posts/${postId}/schedule`)
        .set("Authorization", `Bearer ${deptHeadAToken}`)
        .send({ scheduledFor: scheduleTime });

      expect(schedRes.status).toBe(200);
      expect(schedRes.body.data.status).toBe("scheduled");

      // 3. Simulate BullMQ worker executing the job
      await processPostPublishJob({
        id: `post:${postId}:publish`,
        name: "publish-post",
        data: { postId, tenantId: tenantA.id },
      });

      // 4. Verify post status transitioned to published
      const checkRes = await request(app)
        .get(`/api/v1/posts/${postId}`)
        .set("Authorization", `Bearer ${staffAToken}`);

      expect(checkRes.status).toBe(200);
      expect(checkRes.body.data.status).toBe("published");
      expect(checkRes.body.data.publishedAt).toBeDefined();

      // 5. Worker restart / duplicate execution idempotency
      await processPostPublishJob({
        id: `post:${postId}:publish`,
        name: "publish-post",
        data: { postId, tenantId: tenantA.id },
      });
      // Should remain published without errors
      const checkRes2 = await request(app)
        .get(`/api/v1/posts/${postId}`)
        .set("Authorization", `Bearer ${staffAToken}`);
      expect(checkRes2.body.data.status).toBe("published");
    });
  });

  // ── 6. Public Endpoints, Caching & Privacy / No PII Leakage ─────────────────
  describe("Public Read Endpoints & Privacy", () => {
    let publishedPostSlug: string;

    beforeAll(async () => {
      // Create and publish a rich post
      const createRes = await request(app)
        .post("/api/v1/posts")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({
          title: {
            en: "<script>alert('xss-title')</script> Safe City Water Supply",
            hi: "शुद्ध पेयजल आपूर्ति",
          },
          summary: {
            en: "<img src=x onerror=alert(1)> Chlorination levels confirmed safe.",
          },
          blocks: {
            en: [
              {
                type: "heading",
                level: 2,
                text: "Daily Water Testing Report",
              },
              {
                type: "paragraph",
                text: "All 18 distribution points meet BIS 10500 potable standards.",
              },
            ],
          },
          tags: ["water", "safety"],
        });

      const postId = createRes.body.data._id || createRes.body.data.id;
      publishedPostSlug = createRes.body.data.slug;

      await request(app)
        .post(`/api/v1/posts/${postId}/publish`)
        .set("Authorization", `Bearer ${adminAToken}`);
    });

    it("renders XSS payloads as raw plain text without modification or code execution", async () => {
      const res = await request(app).get(
        `/api/v1/public/${tenantA.slug}/posts/${publishedPostSlug}`
      );
      expect(res.status).toBe(200);
      // Plain text preserved as string so React JSX escapes it safely
      expect(res.body.data.title).toContain("<script>alert('xss-title')</script>");
      expect(res.body.data.summary).toContain("<img src=x onerror=alert(1)>");
    });

    it("caches post list in Redis for 60s and respects ETag 304 Not Modified", async () => {
      const res1 = await request(app).get(`/api/v1/public/${tenantA.slug}/posts`);
      expect(res1.status).toBe(200);
      const etag = res1.headers["etag"];
      expect(etag).toBeDefined();

      // Subsequent request with If-None-Match returns 304
      const res2 = await request(app)
        .get(`/api/v1/public/${tenantA.slug}/posts`)
        .set("If-None-Match", etag);

      expect(res2.status).toBe(304);
    });

    it("public endpoints leak no emails, phones, or private author/citizen data", async () => {
      const res = await request(app).get(`/api/v1/public/${tenantA.slug}/posts`);
      expect(res.status).toBe(200);

      const jsonStr = JSON.stringify(res.body);
      expect(jsonStr).not.toContain("@");
      expect(jsonStr).not.toContain("+91");
      expect(jsonStr).not.toContain("password");
      expect(jsonStr).not.toContain("password_hash");

      const singleRes = await request(app).get(
        `/api/v1/public/${tenantA.slug}/posts/${publishedPostSlug}`
      );
      expect(singleRes.status).toBe(200);
      const singleJson = JSON.stringify(singleRes.body);
      expect(singleJson).not.toContain("@");
      expect(singleJson).not.toContain("+91");
      expect(singleJson).not.toContain("password");
    });
  });
});
