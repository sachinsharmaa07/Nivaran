import { Router, type Request, type Response } from "express";
import { resolveLocale, type Block } from "@nivaran/shared";
import { PlatformDb } from "../db/platform-db.js";
import { TenantDb } from "../db/tenant-db.js";
import { AppError } from "../middleware/error-handler.js";
import { connectMongo } from "../db/mongo.js";
import { Issue } from "../db/models/issue.model.js";
import { computeCellMetrics, computeHotspots, type IssueMetricRecord } from "../domain/metrics.js";
import { ContentRepo } from "../db/content-repo.js";
import { cacheGet, cacheSet } from "../db/redis.js";
import { IssueRepo } from "../db/issue-repo.js";
import { createHash } from "node:crypto";
import { z } from "zod";

export const publicRouter: Router = Router();
const platformDb = new PlatformDb();

function getParam(req: Request, key: string): string {
  const val = req.params[key];
  return Array.isArray(val) ? (val[0] ?? "") : (val ?? "");
}

// ── India Additions: Public State & Tenant Directory ─────────────────────────

publicRouter.get("/states", async (_req: Request, res: Response) => {
  const states = await platformDb.listStates();
  res.status(200).json({ data: states });
});

publicRouter.get("/tenants", async (req: Request, res: Response) => {
  const stateCode = req.query["state_code"] as string | undefined;
  const tenants = await platformDb.listTenants(stateCode);
  res.status(200).json({ data: tenants });
});

/**
 * Public state summary returning per-ULB open count, SLA compliance and median resolution.
 * Public data only, hiding any cell under 10 issues for privacy.
 */
publicRouter.get("/states/:code/summary", async (req: Request, res: Response) => {
  const code = getParam(req, "code").toUpperCase();
  const summary = await platformDb.getStateSummary(code);
  res.status(200).json({
    data: {
      state_code: code,
      ulbs: summary,
    },
  });
});

publicRouter.get("/:tenantSlug/info", async (req: Request, res: Response) => {
  const slug = getParam(req, "tenantSlug");
  const tenant = await platformDb.getTenantBySlug(slug);
  if (!tenant) {
    throw new AppError("TENANT_NOT_FOUND", "Tenant not found", 404);
  }
  res.status(200).json({ data: tenant });
});

publicRouter.get("/:tenantSlug/categories", async (req: Request, res: Response) => {
  const slug = getParam(req, "tenantSlug");
  const tenant = await platformDb.getTenantBySlug(slug);
  if (!tenant) {
    throw new AppError("TENANT_NOT_FOUND", "Tenant not found", 404);
  }

  const tenantDb = new TenantDb(tenant.id);
  const categories = await tenantDb.listCategories();

  // Resolve requested locale using fallback chain
  const requestedLocale =
    (req.query["locale"] as string) || req.headers["accept-language"]?.split(",")[0]?.trim();

  const activeLocale = resolveLocale(
    requestedLocale,
    tenant.enabled_locales,
    tenant.default_locale
  );

  const localizedCategories = categories
    .filter((c) => c.active)
    .map((c) => {
      const names = c.names;
      const localizedName =
        names[activeLocale] || names[tenant.default_locale] || names["en"] || c.code;

      return {
        id: c.id,
        code: c.code,
        name: localizedName,
        locale: activeLocale,
        names: c.names,
        dedup_radius_m: c.dedup_radius_m,
        default_safety_risk: c.default_safety_risk,
        evidence_required: c.evidence_required,
      };
    });

  res.status(200).json({
    data: {
      tenantSlug: tenant.slug,
      resolvedLocale: activeLocale,
      categories: localizedCategories,
    },
  });
});

// ── B4: Public Metrics & Hotspots Endpoints (Anonymous, Nearest-Rank, <10 Masked) ──

async function getTenantMetricRecords(tenantId: string): Promise<IssueMetricRecord[]> {
  await connectMongo();
  const mongoIssues = await Issue.find({ tenantId }).lean();

  const tenantDb = new TenantDb(tenantId);
  let pgFacts: Awaited<ReturnType<typeof tenantDb.getIssueMetricsFact>> = [];

  try {
    pgFacts = await tenantDb.getIssueMetricsFact();
  } catch {
    // ignore
  }

  const pgMap = new Map(pgFacts.map((f) => [f.issue_id, f]));
  const records: IssueMetricRecord[] = [];
  const processed = new Set<string>();

  for (const doc of mongoIssues) {
    processed.add(doc.publicId);
    const pg = pgMap.get(doc.publicId);

    const status = pg?.status ?? doc.status;
    const catCode = pg?.category_code ?? doc.category?.code;
    const deptId = pg?.department_id ?? doc.department?.id;
    const wardId = pg?.ward_id ?? doc.location?.wardId;

    let resHours = pg?.resolution_time_hours;
    if (resHours == null && doc.resolution?.resolvedAt && doc.createdAt) {
      resHours = Math.max(
        0.1,
        Number(
          (
            (new Date(doc.resolution.resolvedAt).getTime() - new Date(doc.createdAt).getTime()) /
            3_600_000
          ).toFixed(2)
        )
      );
    }

    let slaBreached = pg?.sla_breached;
    if (slaBreached == null && doc.slaPolicy?.resolveBy) {
      const finishTime = doc.resolution?.resolvedAt
        ? new Date(doc.resolution.resolvedAt).getTime()
        : Date.now();
      slaBreached = finishTime > new Date(doc.slaPolicy.resolveBy).getTime();
    }

    const lat = pg?.lat ?? doc.location?.coordinates?.[1];
    const lon = pg?.lon ?? doc.location?.coordinates?.[0];

    records.push({
      issue_id: doc.publicId,
      status,
      category_code: catCode,
      department_id: deptId,
      ward_id: wardId,
      sla_breached: slaBreached ?? false,
      resolution_time_hours: resHours ?? null,
      reopen_count: doc.reopenCount ?? 0,
      lat,
      lon,
      created_at: doc.createdAt,
      resolved_at: doc.resolution?.resolvedAt ?? pg?.resolved_at,
    });
  }

  for (const fact of pgFacts) {
    if (!processed.has(fact.issue_id)) {
      records.push({
        issue_id: fact.issue_id,
        status: fact.status,
        category_code: fact.category_code,
        department_id: fact.department_id,
        ward_id: fact.ward_id,
        sla_breached: fact.sla_breached,
        resolution_time_hours: fact.resolution_time_hours,
        lat: fact.lat,
        lon: fact.lon,
        created_at: fact.created_at,
        resolved_at: fact.resolved_at,
      });
    }
  }

  return records;
}

/**
 * GET /api/v1/public/:tenantSlug/metrics
 * Returns median, p90 (nearest-rank), SLA compliance, reopen rate, open count
 * by department and ward. Cells with < 10 issues return "insufficient".
 */
publicRouter.get("/:tenantSlug/metrics", async (req: Request, res: Response) => {
  const slug = getParam(req, "tenantSlug");
  const tenant = await platformDb.getTenantBySlug(slug);
  if (!tenant) {
    throw new AppError("TENANT_NOT_FOUND", "Tenant not found", 404);
  }

  const tenantDb = new TenantDb(tenant.id);
  const [departments, wards, records] = await Promise.all([
    tenantDb.listDepartments(),
    tenantDb.listWards(),
    getTenantMetricRecords(tenant.id),
  ]);

  const overall = computeCellMetrics(records);

  const byDepartment = departments.map((dept) => {
    const deptIssues = records.filter(
      (r) => r.department_id === dept.id || r.department_id === dept.code
    );
    return {
      department_id: dept.id,
      department_code: dept.code,
      department_name: dept.name,
      metrics: computeCellMetrics(deptIssues),
    };
  });

  const byWard = wards.map((w) => {
    const wardIssues = records.filter((r) => r.ward_id === w.id);
    return {
      ward_id: w.id,
      ward_number: w.ward_number,
      ward_name: w.name,
      metrics: computeCellMetrics(wardIssues),
    };
  });

  res.status(200).json({
    data: {
      tenant_slug: tenant.slug,
      tenant_name: tenant.name,
      overall,
      by_department: byDepartment,
      by_ward: byWard,
    },
  });
});

/**
 * GET /api/v1/public/:tenantSlug/hotspots
 * Returns ~500m spatial grid counts.
 * Anonymous: no personal data, no user IDs, no photos.
 */
publicRouter.get("/:tenantSlug/hotspots", async (req: Request, res: Response) => {
  const slug = getParam(req, "tenantSlug");
  const tenant = await platformDb.getTenantBySlug(slug);
  if (!tenant) {
    throw new AppError("TENANT_NOT_FOUND", "Tenant not found", 404);
  }

  const records = await getTenantMetricRecords(tenant.id);
  const hotspots = computeHotspots(records);

  res.status(200).json({
    data: {
      tenant_slug: tenant.slug,
      cell_size_meters: 500,
      hotspots,
    },
  });
});

// ── Public Civic Updates (Posts) ─────────────────────────────────────────────

interface PublicPostItem {
  id: string;
  slug: string;
  title: string;
  summary: string;
  coverMedia: {
    variants: Record<string, string>;
    altText: string;
  } | null;
  tags: string[];
  publishedAt: Date | null;
  readingTimeMinutes: number;
  commentsEnabled: boolean;
  commentCount: number;
}

function resolveText(
  map: Map<string, string> | Record<string, string> | undefined,
  locale: string,
  defaultLocale: string
): string {
  if (!map) return "";
  if (map instanceof Map) {
    return map.get(locale) || map.get(defaultLocale) || map.get("en") || "";
  }
  return map[locale] || map[defaultLocale] || map["en"] || "";
}

function resolveBlocks(
  blocksMap: Map<string, unknown[]> | Record<string, unknown[]> | undefined,
  locale: string,
  defaultLocale: string
): Block[] {
  if (!blocksMap) return [];
  let list: unknown[] | undefined;
  if (blocksMap instanceof Map) {
    list = blocksMap.get(locale) || blocksMap.get(defaultLocale) || blocksMap.get("en");
  } else {
    list = blocksMap[locale] || blocksMap[defaultLocale] || blocksMap["en"];
  }
  return (list as Block[]) ?? [];
}

function calculateReadingTime(blocks: Block[]): number {
  let charCount = 0;
  for (const b of blocks) {
    if ("text" in b && typeof b.text === "string") charCount += b.text.length;
    if ("items" in b && Array.isArray(b.items)) {
      for (const item of b.items) charCount += item.length;
    }
  }
  // Average ~1000 characters per minute
  return Math.max(1, Math.ceil(charCount / 1000));
}

/**
 * GET /api/v1/public/:tenantSlug/posts
 * Public list of published civic updates.
 * Cached in Redis for 60s per tenant, locale, and filter.
 */
publicRouter.get("/:tenantSlug/posts", async (req: Request, res: Response) => {
  const tenantSlug = getParam(req, "tenantSlug");
  const tenant = await platformDb.getTenantBySlug(tenantSlug);
  if (!tenant) {
    throw new AppError("TENANT_NOT_FOUND", "Tenant not found", 404);
  }

  const requestedLocale = req.query["locale"] as string | undefined;
  const locale = resolveLocale(requestedLocale, tenant.enabled_locales, tenant.default_locale);

  const tag = req.query["tag"] ? String(req.query["tag"]).trim() : "";
  const q = req.query["q"] ? String(req.query["q"]).trim() : "";
  const cursor = req.query["cursor"] ? String(req.query["cursor"]) : "";
  const limit = Math.min(Math.max(1, req.query["limit"] ? Number(req.query["limit"]) : 10), 50);

  // Redis cache check
  const cacheKey = `cache:posts:${tenant.id}:${locale}:${tag}:${q}:${cursor}:${limit}`;
  const cached = await cacheGet<{
    items: PublicPostItem[];
    nextCursor: string | null;
    etag: string;
  }>(cacheKey);

  if (cached) {
    if (req.headers["if-none-match"] === cached.etag) {
      res.status(304).end();
      return;
    }
    res.setHeader("ETag", cached.etag);
    res.setHeader("Cache-Control", "public, max-age=60");
    res.status(200).json({ data: cached.items, nextCursor: cached.nextCursor });
    return;
  }

  const contentRepo = new ContentRepo(tenant.id);
  const listOpts: Parameters<typeof contentRepo.listPublishedPosts>[0] = { limit };
  if (tag) listOpts.tag = tag;
  if (q) listOpts.q = q;
  if (cursor) listOpts.cursor = cursor;
  const { posts, nextCursor } = await contentRepo.listPublishedPosts(listOpts);

  const items: PublicPostItem[] = [];
  for (const p of posts) {
    let coverMedia: PublicPostItem["coverMedia"] = null;
    if (p.coverMediaId) {
      const media = await contentRepo.getMediaById(p.coverMediaId);
      if (media) {
        coverMedia = {
          variants: media.variants as unknown as Record<string, string>,
          altText: media.altText || "",
        };
      }
    }

    const title = resolveText(p.title, locale, tenant.default_locale);
    const summary = resolveText(p.summary, locale, tenant.default_locale);
    const blocks = resolveBlocks(p.blocks, locale, tenant.default_locale);
    const readingTimeMinutes = calculateReadingTime(blocks);

    items.push({
      id: String(p._id),
      slug: p.slug,
      title: title || p.slug,
      summary,
      coverMedia,
      tags: p.tags,
      publishedAt: p.publishedAt ?? null,
      readingTimeMinutes,
      commentsEnabled: p.commentsEnabled,
      commentCount: p.commentCount,
    });
  }

  const etag = `"${createHash("md5").update(JSON.stringify(items)).digest("hex")}"`;

  // Store in cache
  await cacheSet(cacheKey, { items, nextCursor, etag }, 60);

  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }

  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "public, max-age=60");
  res.status(200).json({ data: items, nextCursor });
});

/**
 * GET /api/v1/public/:tenantSlug/posts/:slug
 * Public read single published civic update article.
 * Resolves localized blocks, expands cover media and public issue cards.
 */
publicRouter.get("/:tenantSlug/posts/:slug", async (req: Request, res: Response) => {
  const tenantSlug = getParam(req, "tenantSlug");
  const postSlug = getParam(req, "slug");

  const tenant = await platformDb.getTenantBySlug(tenantSlug);
  if (!tenant) {
    throw new AppError("TENANT_NOT_FOUND", "Tenant not found", 404);
  }

  const contentRepo = new ContentRepo(tenant.id);
  const post = await contentRepo.getPostBySlug(postSlug);

  if (!post || post.status !== "published" || !post.publishedAt || post.publishedAt > new Date()) {
    throw new AppError("NOT_FOUND", "Post not found or not published", 404);
  }

  const requestedLocale = req.query["locale"] as string | undefined;
  const locale = resolveLocale(requestedLocale, tenant.enabled_locales, tenant.default_locale);

  const etag = `W/"${post.version}-${new Date(post.updatedAt).getTime()}"`;
  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }

  let coverMedia = null;
  if (post.coverMediaId) {
    const media = await contentRepo.getMediaById(post.coverMediaId);
    if (media) {
      coverMedia = {
        id: String(media._id),
        variants: media.variants,
        altText: media.altText,
        caption: media.caption,
        width: media.width,
        height: media.height,
      };
    }
  }

  const title = resolveText(post.title, locale, tenant.default_locale);
  const summary = resolveText(post.summary, locale, tenant.default_locale);
  const rawBlocks = resolveBlocks(post.blocks, locale, tenant.default_locale);
  const readingTimeMinutes = calculateReadingTime(rawBlocks);

  // Expand blocks: images with variants and issueLink with public safe data
  const expandedBlocks: unknown[] = [];
  const issueRepo = new IssueRepo(tenant.id);

  for (const b of rawBlocks) {
    if (b.type === "image") {
      const media = await contentRepo.getMediaById(b.mediaId);
      expandedBlocks.push({
        ...b,
        media: media
          ? {
              variants: media.variants,
              altText: b.alt || media.altText,
              caption: b.caption || media.caption,
              width: media.width,
              height: media.height,
            }
          : null,
      });
    } else if (b.type === "issueLink") {
      const issue = await issueRepo.findByPublicId(b.publicId);
      expandedBlocks.push({
        ...b,
        issue: issue
          ? {
              publicId: issue.publicId,
              status: issue.status,
              categoryName:
                issue.category?.names?.[locale] || issue.category?.names?.["en"] || "Civic Issue",
              createdAt: issue.createdAt,
              locationHint: issue.landmark || null,
            }
          : null,
      });
    } else {
      expandedBlocks.push(b);
    }
  }

  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "public, max-age=60");
  res.status(200).json({
    data: {
      id: String(post._id),
      slug: post.slug,
      title: title || post.slug,
      summary,
      blocks: expandedBlocks,
      coverMedia,
      tags: post.tags,
      relatedIssueIds: post.relatedIssueIds,
      publishedAt: post.publishedAt,
      readingTimeMinutes,
      commentsEnabled: post.commentsEnabled,
      commentCount: post.commentCount,
      version: post.version,
    },
  });
});

// ── Gemini Civic AI & Awareness Assistant ───────────────────────────────────

function generateLocalCivicKnowledge(
  query: string,
  mode?: "tips" | "awareness" | "general"
): string {
  const q = query.toLowerCase();

  if (
    mode === "tips" ||
    q.includes("tip") ||
    q.includes("trick") ||
    q.includes("advice") ||
    q.includes("how to report")
  ) {
    return (
      "💡 **Top Civic Reporting Tips for Maximum Impact:**\n\n" +
      "1. **Dual-Angle Evidence:** Capture 1 close-up showing depth (e.g., place a pen or water bottle near the pothole for scale) and 1 wide-angle shot showing street landmarks.\n" +
      "2. **Precise GPS Placement:** Ensure your location services are set to high accuracy (under 10m). On the report map, drag the pin directly onto the problem spot.\n" +
      "3. **Upvote Nearby Issues (+1):** If a neighbour has already reported the issue, tap '+1' instead of filing a duplicate. Multiple reporters directly boost the explainable priority score without splitting triage queues!\n" +
      "4. **Landmark Context:** Mention shop names, electricity pole numbers, or junction names in the landmark field for faster crew dispatch."
    );
  }

  if (
    mode === "awareness" ||
    q.includes("right") ||
    q.includes("law") ||
    q.includes("act") ||
    q.includes("rti") ||
    q.includes("amendment") ||
    q.includes("charter")
  ) {
    return (
      "📜 **Citizen Rights & Municipal Governance Awareness:**\n\n" +
      "• **74th Constitutional Amendment (Nagarpalika Act):** Guarantees citizen participation in urban governance through Ward Committees (Ward Sabhas) for budget oversight and local civic audits.\n" +
      "• **Public Citizen Charter:** Every municipal corporation is bound by guaranteed timelines (Right to Public Service). Potholes and garbage must be attended within 24–72 hours.\n" +
      "• **Automated SLA Escalation:** When an issue reaches 50% elapsed time without triage, it automatically flags the Field Inspector; at 100% breach, it alerts the Department Head.\n" +
      "• **RTI Section 4 Disclosure:** Citizens have the legal right to inspect municipal maintenance contracts, contractor defect liability periods (DLP), and road resurfacing warranties."
    );
  }

  if (
    q.includes("waste") ||
    q.includes("garbage") ||
    q.includes("plastic") ||
    q.includes("swachh")
  ) {
    return (
      "♻️ **Solid Waste Management & Cleanliness Protocols (SWM Rules 2016):**\n\n" +
      "• **3-Stream Source Segregation:**\n" +
      "  - 🟢 **Green Bin (Wet Waste):** Kitchen leftovers, vegetable peels, fruit skins, tea bags.\n" +
      "  - 🔵 **Blue Bin (Dry Waste):** Clean cardboard, paper, rinsed plastic containers, glass, metals.\n" +
      "  - 🔴 **Red Bin (Sanitary/Hazardous):** Diapers, sanitary napkins (wrapped in paper), batteries, medicines.\n" +
      "• **Single-Use Plastic Ban:** Nationwide ban applies to non-woven polybags, plastic cutlery, stirrers, and banners under 100 microns.\n" +
      "• **Bulk Waste Generators:** Gated communities generating >100kg/day are mandated by law to process wet waste on-site."
    );
  }

  if (q.includes("road") || q.includes("pothole") || q.includes("tar") || q.includes("asphalt")) {
    return (
      "🚸 **Road Safety & Repair Quality Standards (IRC SP-20):**\n\n" +
      "• **Cold-Mix vs Hot-Mix Repairs:** During monsoon, municipalities must deploy approved cold-mix bituminous compounds; dry seasons require hot-mix asphalt with mechanical compaction.\n" +
      "• **Defect Liability Period (DLP):** Paved municipal roads have a mandatory 1 to 3-year warranty. If potholes reappear in this window, the contractor must re-pave at zero cost to taxpayers.\n" +
      "• **Critical Hazard Barricading:** Open excavations or cave-ins must have reflective retro-reflective barricades within 4 hours."
    );
  }

  return (
    "✨ **CivicPulse Gemini Civic AI:**\n\n" +
    "I am trained on municipal governance acts, citizen charters, and effective reporting practices across India. You can ask me about:\n\n" +
    "• 💡 **Reporting Tips & High-Impact Photos**\n" +
    "• 📜 **Citizen Rights, Ward Sabhas & RTI Rules**\n" +
    "• ♻️ **Waste Segregation & Swachh Bharat Standards**\n" +
    "• 🚸 **Road Repair Standards & Contractor DLP Warranties**\n" +
    "• ⏱️ **Municipal SLAs & Auto-Escalation Paths**"
  );
}

const aiChatSchema = z.object({
  message: z.string().min(1, "Message cannot be empty").max(2000),
  history: z
    .array(
      z.object({
        sender: z.enum(["user", "bot"]),
        text: z.string(),
      })
    )
    .optional(),
  tenantSlug: z.string().optional(),
  mode: z.enum(["tips", "awareness", "general"]).optional(),
});

publicRouter.post("/ai/chat", async (req: Request, res: Response) => {
  const input = aiChatSchema.parse(req.body);
  const userMsg = input.message.trim();
  const apiKey = process.env["GEMINI_API_KEY"];
  const model = process.env["LLM_MODEL"] || "gemini-1.5-flash";

  let aiReply = "";

  if (apiKey) {
    try {
      const contents = [
        {
          role: "user",
          parts: [
            {
              text: `You are CivicPulse Gemini Civic AI, an expert municipal advisor for Indian citizens. You offer actionable civic tips, awareness of citizen rights (RTI, 74th Amendment, SLA limits), Swachh Bharat cleanliness protocols, and road safety guidelines. Respond concisely with markdown formatting, emoji bullet points, and helpful next steps.\n\nUser Question: ${userMsg}`,
            },
          ],
        },
      ];

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
      });

      if (response.ok) {
        const json = (await response.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        aiReply = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
      }
    } catch {
      // Fallback to intelligent local civic knowledge engine
    }
  }

  if (!aiReply) {
    aiReply = generateLocalCivicKnowledge(userMsg, input.mode);
  }

  res.status(200).json({
    data: {
      reply: aiReply,
      source: apiKey ? "gemini" : "civic_knowledge_engine",
    },
  });
});
