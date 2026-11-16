import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useSearchParams } from "react-router";
import type { TenantInfo } from "../components/CityPicker.js";
import { useAuth } from "../utils/authContext.js";
import { useToast } from "../ui/Toast.js";
import {
  Button,
  TextInput,
  Textarea,
  LaneLine,
  LaneLineLoader,
  Dialog,
  StatusChip,
  SignPlate,
  EmptyState,
  ErrorState,
} from "../ui/index.js";
import { BlocksRenderer, type RenderableBlock } from "../components/BlocksRenderer.js";
import type { Block } from "@nivaran/shared";
import {
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Upload,
  Eye,
  Archive,
  Send,
  Clock,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

interface MediaRecord {
  id: string;
  variants: Record<string, string>;
  altText: string;
  caption?: string | null;
  width: number;
  height: number;
}

interface PostDoc {
  _id: string;
  tenantId: string;
  slug: string;
  status: "draft" | "published" | "scheduled" | "archived";
  authorId: string;
  coverMediaId?: string;
  coverMedia?: MediaRecord | null;
  title: Record<string, string>;
  summary: Record<string, string>;
  blocks: Record<string, Block[]>;
  tags: string[];
  publishedAt?: string | null;
  scheduledFor?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface StaffUpdatesPageProps {
  tenant: TenantInfo;
  onOpenAuth?: () => void;
  isBlogMode?: boolean;
}

export function StaffUpdatesPage({
  tenant,
  onOpenAuth,
  isBlogMode = false,
}: StaffUpdatesPageProps): React.JSX.Element {
  const { user, authFetch } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const editingPostId = searchParams.get("edit");
  const isCreating = searchParams.get("new") === "true";

  const [posts, setPosts] = useState<PostDoc[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Editor states
  const [currentPost, setCurrentPost] = useState<PostDoc | null>(null);
  const [activeLocale, setActiveLocale] = useState<string>(tenant.default_locale || "en");
  const [editorTab, setEditorTab] = useState<"edit" | "preview">("edit");
  const [autosaveState, setAutosaveState] = useState<"idle" | "saving" | "saved" | "conflict">(
    "idle"
  );
  const [conflictMsg, setConflictMsg] = useState<string>("");

  // Editable fields per locale
  const [titleMap, setTitleMap] = useState<Record<string, string>>({});
  const [summaryMap, setSummaryMap] = useState<Record<string, string>>({});
  const [blocksMap, setBlocksMap] = useState<Record<string, Block[]>>({});
  const [tagsStr, setTagsStr] = useState<string>("");
  const [coverMediaId, setCoverMediaId] = useState<string>("");
  const [_coverMediaObj, setCoverMediaObj] = useState<MediaRecord | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState<boolean>(false);

  // Dialogs
  const [publishDialogOpen, setPublishDialogOpen] = useState<boolean>(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState<boolean>(false);
  const [scheduleDateTime, setScheduleDateTime] = useState<string>("");
  const [actionInProgress, setActionInProgress] = useState<boolean>(false);

  const isHeadOrAdmin =
    user?.role === "dept_head" ||
    user?.role === "tenant_admin" ||
    user?.role === "platform_admin" ||
    user?.roles?.includes("tenant_admin") ||
    user?.roles?.includes("platform_admin") ||
    user?.roles?.includes("dept_head");

  const canPublish =
    isHeadOrAdmin ||
    (currentPost &&
      (currentPost.authorId === user?.id || (currentPost.tags || []).includes("blog")));

  const loadPosts = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg("");
      const q = statusFilter ? `?status=${statusFilter}` : "";
      const res = await authFetch(`/api/v1/posts${q}`);
      if (!res.ok) {
        throw new Error(`Failed to load posts (status ${res.status})`);
      }
      const data = await res.json();
      setPosts(Array.isArray(data.data) ? data.data : data.data?.items || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load posts");
    } finally {
      setLoading(false);
    }
  }, [authFetch, statusFilter]);

  useEffect(() => {
    if (!editingPostId && !isCreating) {
      void loadPosts();
    }
  }, [editingPostId, isCreating, loadPosts]);

  // Load single post for editing
  useEffect(() => {
    if (!editingPostId) return;
    let cancelled = false;

    authFetch(`/api/v1/posts/${editingPostId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load post");
        return res.json();
      })
      .then((data: { data?: PostDoc }) => {
        if (cancelled || !data.data) return;
        const p = data.data;
        setCurrentPost(p);
        setTitleMap(p.title || {});
        setSummaryMap(p.summary || {});
        setBlocksMap(p.blocks || {});
        setTagsStr((p.tags || []).join(", "));
        setCoverMediaId(p.coverMediaId || "");
        setCoverMediaObj(p.coverMedia || null);
        setAutosaveState("saved");
      })
      .catch((err) => {
        if (!cancelled) {
          showToast({ message: err.message, variant: "error" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [editingPostId, authFetch, showToast]);

  // Create new draft
  const handleCreateDraft = async () => {
    try {
      setActionInProgress(true);
      const res = await authFetch("/api/v1/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: { [activeLocale]: isBlogMode ? "My Civic Blog Post" : "Untitled Civic Dispatch" },
          summary: {},
          blocks: {
            [activeLocale]: [
              {
                type: "paragraph",
                text: isBlogMode
                  ? "Write your community story, thoughts, and updates here..."
                  : "Add municipal updates and information here.",
              },
            ],
          },
          tags: isBlogMode ? ["blog", "community"] : ["announcement"],
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create draft");
      }

      const created = await res.json();
      showToast({ message: isBlogMode ? "Blog draft created" : "Draft created", type: "success" });
      const next = new URLSearchParams();
      next.set("edit", created.data.id || created.data._id);
      setSearchParams(next);
    } catch (err: unknown) {
      showToast({
        message: err instanceof Error ? err.message : "Error creating draft",
        type: "error",
      });
    } finally {
      setActionInProgress(false);
    }
  };

  // Automatically start draft if entering in blog creation mode
  useEffect(() => {
    if ((isBlogMode || isCreating) && !editingPostId && !currentPost && !actionInProgress && user) {
      void handleCreateDraft();
    }
  }, [isBlogMode, isCreating, editingPostId, currentPost, actionInProgress, user]);

  // Autosave debounced
  const isDirtyRef = useRef(false);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const savePost = useCallback(async () => {
    if (!currentPost || !isDirtyRef.current) return;
    try {
      setAutosaveState("saving");
      const tagsArray = tagsStr
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      const payload: Record<string, unknown> = {
        title: titleMap,
        summary: summaryMap,
        blocks: blocksMap,
        tags: tagsArray,
      };
      if (coverMediaId) {
        payload["coverMediaId"] = coverMediaId;
      }

      const res = await authFetch(`/api/v1/posts/${currentPost._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "If-Match": `"${currentPost.version}"`,
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 409) {
        setAutosaveState("conflict");
        setConflictMsg("Conflict! Another user edited this post. Please refresh.");
        showToast({ message: "Conflict: post updated elsewhere (409)", type: "error" });
        return;
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Save failed");
      }

      const updated = await res.json();
      setCurrentPost(updated.data);
      isDirtyRef.current = false;
      setAutosaveState("saved");
    } catch (err: unknown) {
      setAutosaveState("conflict");
      setConflictMsg(err instanceof Error ? err.message : "Autosave failed");
    }
  }, [currentPost, titleMap, summaryMap, blocksMap, tagsStr, coverMediaId, authFetch, showToast]);

  // Trigger autosave on change
  const markDirty = () => {
    isDirtyRef.current = true;
    setAutosaveState("idle");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void savePost();
    }, 1500);
  };

  // Media upload handler
  const handleMediaUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    forBlockIdx?: number
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast({ message: "File exceeds maximum size of 5 MB", type: "error" });
      return;
    }

    try {
      setUploadingMedia(true);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("altText", "Civic dispatch media");

      const res = await authFetch("/api/v1/media?purpose=blog", {
        method: "POST",
        headers: { "X-Purpose": "blog" },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Media upload failed");
      }

      const json = await res.json();
      const media = json.data;

      if (forBlockIdx !== undefined) {
        // Update specific block
        const blocks = [...(blocksMap[activeLocale] || [])];
        const target = blocks[forBlockIdx];
        if (target && target.type === "image") {
          blocks[forBlockIdx] = {
            ...target,
            mediaId: media.id,
            alt: target.alt || file.name,
          };
          setBlocksMap({ ...blocksMap, [activeLocale]: blocks });
          markDirty();
        }
      } else {
        // Set cover media
        setCoverMediaId(media.id);
        setCoverMediaObj(media);
        markDirty();
      }

      showToast({ message: "Image uploaded and processed", type: "success" });
    } catch (err: unknown) {
      showToast({
        message: err instanceof Error ? err.message : "Image upload failed",
        type: "error",
      });
    } finally {
      setUploadingMedia(false);
      e.target.value = "";
    }
  };

  // Block manipulations
  const currentBlocks = blocksMap[activeLocale] || [];

  const addBlock = (type: Block["type"]) => {
    let newBlock: Block;
    switch (type) {
      case "paragraph":
        newBlock = { type: "paragraph", text: "" };
        break;
      case "heading":
        newBlock = { type: "heading", level: 2, text: "" };
        break;
      case "image":
        newBlock = { type: "image", mediaId: "", alt: "Image description", caption: "" };
        break;
      case "list":
        newBlock = { type: "list", ordered: false, items: [""] };
        break;
      case "quote":
        newBlock = { type: "quote", text: "", citation: "" };
        break;
      case "callout":
        newBlock = { type: "callout", variant: "info", text: "" };
        break;
      case "issueLink":
        newBlock = { type: "issueLink", publicId: "" };
        break;
      case "divider":
        newBlock = { type: "divider" };
        break;
    }

    setBlocksMap({
      ...blocksMap,
      [activeLocale]: [...currentBlocks, newBlock],
    });
    markDirty();
  };

  const updateBlock = (idx: number, updated: Block) => {
    const list = [...currentBlocks];
    list[idx] = updated;
    setBlocksMap({ ...blocksMap, [activeLocale]: list });
    markDirty();
  };

  const moveBlock = (idx: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= currentBlocks.length) return;
    const list = [...currentBlocks];
    const temp = list[idx]!;
    list[idx] = list[targetIdx]!;
    list[targetIdx] = temp;
    setBlocksMap({ ...blocksMap, [activeLocale]: list });
    markDirty();
  };

  const deleteBlock = (idx: number) => {
    const list = currentBlocks.filter((_, i) => i !== idx);
    setBlocksMap({ ...blocksMap, [activeLocale]: list });
    markDirty();
  };

  // Publish / Schedule / Archive Actions
  const handlePublishNow = async () => {
    if (!currentPost) return;
    try {
      setActionInProgress(true);
      await savePost();
      const res = await authFetch(`/api/v1/posts/${currentPost._id}/publish`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Publish failed");
      }
      const data = await res.json();
      setCurrentPost(data.data);
      setPublishDialogOpen(false);
      showToast({ message: "Dispatch published successfully!", type: "success" });
    } catch (err: unknown) {
      showToast({
        message: err instanceof Error ? err.message : "Publish failed",
        type: "error",
      });
    } finally {
      setActionInProgress(false);
    }
  };

  const handleSchedulePublish = async () => {
    if (!currentPost || !scheduleDateTime) return;
    try {
      setActionInProgress(true);
      await savePost();
      const res = await authFetch(`/api/v1/posts/${currentPost._id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledFor: new Date(scheduleDateTime).toISOString() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Scheduling failed");
      }
      const data = await res.json();
      setCurrentPost(data.data);
      setScheduleDialogOpen(false);
      showToast({ message: "Dispatch scheduled successfully!", type: "success" });
    } catch (err: unknown) {
      showToast({
        message: err instanceof Error ? err.message : "Scheduling failed",
        type: "error",
      });
    } finally {
      setActionInProgress(false);
    }
  };

  const handleArchive = async () => {
    if (!currentPost) return;
    try {
      setActionInProgress(true);
      const res = await authFetch(`/api/v1/posts/${currentPost._id}/archive`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Archive failed");
      }
      const data = await res.json();
      setCurrentPost(data.data);
      showToast({ message: "Dispatch archived", type: "info" });
    } catch (err: unknown) {
      showToast({
        message: err instanceof Error ? err.message : "Archive failed",
        type: "error",
      });
    } finally {
      setActionInProgress(false);
    }
  };

  // ── Render: Auth Guard ─────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div
        style={{
          maxWidth: "600px",
          margin: "4rem auto",
          textAlign: "center",
          padding: "2.5rem 2rem",
          backgroundColor: "var(--surface)",
          borderRadius: "var(--r-lg)",
          border: "1px solid var(--border)",
        }}
      >
        <SignPlate label="CIVIC BLOGS">SIGN IN REQUIRED</SignPlate>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "2rem",
            marginTop: "1.25rem",
            color: "var(--text)",
          }}
        >
          Write and Publish Blogs
        </h2>
        <p
          style={{
            color: "var(--text-muted)",
            margin: "1rem 0 2rem",
            lineHeight: 1.6,
            fontSize: "1rem",
          }}
        >
          Everyone in {tenant.name} can write blogs with images and publish them so everyone can
          see! Please sign in to start writing.
        </p>
        <Button
          variant="primary"
          onClick={() => {
            if (onOpenAuth) onOpenAuth();
            else window.location.href = "/";
          }}
          style={{ padding: "0.625rem 1.5rem", fontWeight: 600 }}
        >
          Sign In to Write Blog
        </Button>
      </div>
    );
  }

  // ── Render: Posts Table View ──────────────────────────────────────────────────
  if (!editingPostId && !isCreating) {
    return (
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "1.5rem 1rem 4rem 1rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            marginBottom: "1.5rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <SignPlate label="WORKBENCH">{`${tenant.code || "NVR"} • CIVIC DISPATCHES`}</SignPlate>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(1.75rem, 1.5rem + 1.5vw, 2.75rem)",
                fontWeight: 700,
                color: "var(--text)",
                margin: "0.5rem 0 0.25rem 0",
              }}
            >
              Civic Updates & Dispatches
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9375rem", margin: 0 }}>
              Draft, schedule, publish, and manage official municipal updates with multi-language
              blocks.
            </p>
          </div>

          <Button
            variant="primary"
            onClick={handleCreateDraft}
            disabled={actionInProgress}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}
          >
            <Plus size={16} aria-hidden="true" />
            Create New Dispatch
          </Button>
        </div>

        {/* Filter bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            marginBottom: "1.5rem",
            padding: "0.75rem 1rem",
            backgroundColor: "var(--surface)",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--border)",
          }}
        >
          <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", fontWeight: 600 }}>
            Filter Status:
          </span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: "0.375rem 0.625rem",
              borderRadius: "var(--r-sm)",
              border: "1px solid var(--border)",
              backgroundColor: "var(--surface-sunken)",
              color: "var(--text)",
              fontSize: "0.875rem",
            }}
          >
            <option value="">All statuses</option>
            <option value="draft">Drafts</option>
            <option value="published">Published</option>
            <option value="scheduled">Scheduled</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {/* Posts Table */}
        {loading && (
          <div style={{ padding: "4rem 1rem", textAlign: "center" }}>
            <LaneLineLoader width="140px" />
            <p style={{ marginTop: "1rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
              Loading posts...
            </p>
          </div>
        )}

        {!loading && errorMsg && (
          <ErrorState title="Error Loading Dispatches" message={errorMsg} onRetry={loadPosts} />
        )}

        {!loading && !errorMsg && posts.length === 0 && (
          <EmptyState
            title="No dispatches found"
            message="No posts match your filters. Click 'Create New Dispatch' to start drafting."
          />
        )}

        {!loading && !errorMsg && posts.length > 0 && (
          <div
            style={{
              backgroundColor: "var(--surface)",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border)",
              overflow: "hidden",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  textAlign: "left",
                  fontSize: "0.875rem",
                }}
              >
                <thead>
                  <tr
                    style={{
                      backgroundColor: "var(--surface-sunken)",
                      borderBottom: "2px solid var(--border)",
                    }}
                  >
                    <th style={{ padding: "0.75rem 1rem", fontWeight: 700, color: "var(--text)" }}>
                      Title & Slug
                    </th>
                    <th style={{ padding: "0.75rem 1rem", fontWeight: 700, color: "var(--text)" }}>
                      Status
                    </th>
                    <th style={{ padding: "0.75rem 1rem", fontWeight: 700, color: "var(--text)" }}>
                      Version
                    </th>
                    <th style={{ padding: "0.75rem 1rem", fontWeight: 700, color: "var(--text)" }}>
                      Published / Scheduled
                    </th>
                    <th
                      style={{
                        padding: "0.75rem 1rem",
                        fontWeight: 700,
                        color: "var(--text)",
                        textAlign: "right",
                      }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((p) => {
                    const postTitle =
                      p.title?.[tenant.default_locale] ||
                      p.title?.["en"] ||
                      Object.values(p.title || {})[0] ||
                      "Untitled";
                    return (
                      <tr key={p._id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          <div
                            style={{
                              fontWeight: 600,
                              color: "var(--text)",
                              marginBottom: "0.25rem",
                            }}
                          >
                            {postTitle}
                          </div>
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--text-muted)",
                              fontFamily: "monospace",
                            }}
                          >
                            /{p.slug}
                          </div>
                        </td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          <StatusChip status={p.status} />
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 1rem",
                            fontFamily: "var(--font-display)",
                            fontWeight: 700,
                          }}
                        >
                          v{p.version}
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 1rem",
                            color: "var(--text-muted)",
                            fontSize: "0.8125rem",
                          }}
                        >
                          {p.status === "published" && p.publishedAt
                            ? new Date(p.publishedAt).toLocaleDateString()
                            : p.status === "scheduled" && p.scheduledFor
                              ? `Scheduled: ${new Date(p.scheduledFor).toLocaleString()}`
                              : "—"}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                const next = new URLSearchParams();
                                next.set("edit", p._id);
                                setSearchParams(next);
                              }}
                            >
                              Edit
                            </Button>
                            {p.status === "published" && (
                              <Link to={`/updates/${encodeURIComponent(p.slug)}`} target="_blank">
                                <Button variant="outline" size="sm">
                                  View
                                </Button>
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Render: Post Editor View ──────────────────────────────────────────────────
  const activeTitle = titleMap[activeLocale] || "";
  const activeSummary = summaryMap[activeLocale] || "";

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "1.5rem 1rem 4rem 1rem" }}>
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (isBlogMode) {
                window.location.href = "/blogs";
              } else {
                setSearchParams(new URLSearchParams());
              }
            }}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            {isBlogMode ? "Back to blogs" : "Back to posts"}
          </Button>

          <SignPlate label="STATUS">{currentPost?.status.toUpperCase() || "DRAFT"}</SignPlate>

          {/* Autosave Indicator */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              fontSize: "0.8125rem",
            }}
          >
            {autosaveState === "saving" && (
              <span style={{ color: "var(--text-muted)" }}>Saving changes...</span>
            )}
            {autosaveState === "saved" && currentPost && (
              <span
                style={{
                  color: "var(--paint-600)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                }}
              >
                <CheckCircle size={14} />
                Autosaved (v{currentPost.version})
              </span>
            )}
            {autosaveState === "conflict" && (
              <span
                style={{
                  color: "var(--kerb-600)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  fontWeight: 700,
                }}
              >
                <AlertCircle size={14} />
                {conflictMsg}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          {canPublish && currentPost?.status !== "published" && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setPublishDialogOpen(true)}
              disabled={actionInProgress}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}
            >
              <Send size={14} aria-hidden="true" />
              {isBlogMode ? "Publish Blog" : "Publish"}
            </Button>
          )}

          {isHeadOrAdmin && currentPost?.status !== "published" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setScheduleDialogOpen(true)}
              disabled={actionInProgress}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}
            >
              <Clock size={14} aria-hidden="true" />
              Schedule
            </Button>
          )}

          {isHeadOrAdmin && currentPost?.status === "published" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleArchive}
              disabled={actionInProgress}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}
            >
              <Archive size={14} aria-hidden="true" />
              Archive
            </Button>
          )}

          {currentPost?.slug && (
            <Link to={`/updates/${encodeURIComponent(currentPost.slug)}`} target="_blank">
              <Button
                variant="outline"
                size="sm"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
              >
                <Eye size={14} aria-hidden="true" />
                Live view
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Locale Tabs & Editor/Preview Toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          marginBottom: "1.5rem",
          borderBottom: "2px solid var(--border)",
          paddingBottom: "0.5rem",
          flexWrap: "wrap",
        }}
      >
        {/* Locale tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", fontWeight: 600 }}>
            Language:
          </span>
          {(tenant.enabled_locales || ["en", "hi", "pa"]).map((loc) => (
            <button
              key={loc}
              type="button"
              onClick={() => setActiveLocale(loc)}
              style={{
                padding: "0.375rem 0.75rem",
                borderRadius: "var(--r-sm)",
                border: "1px solid var(--border)",
                backgroundColor: activeLocale === loc ? "var(--asphalt-900)" : "var(--surface)",
                color: activeLocale === loc ? "var(--paint-400)" : "var(--text)",
                fontWeight: activeLocale === loc ? 700 : 500,
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              {loc.toUpperCase()} {tenant.default_locale === loc ? "(Default)" : ""}
            </button>
          ))}
        </div>

        {/* Tab toggle: Edit vs Live Preview */}
        <div
          style={{
            display: "flex",
            gap: "0.25rem",
            backgroundColor: "var(--surface-sunken)",
            padding: "0.25rem",
            borderRadius: "var(--r-sm)",
          }}
        >
          <button
            type="button"
            onClick={() => setEditorTab("edit")}
            style={{
              padding: "0.25rem 0.75rem",
              borderRadius: "var(--r-sm)",
              border: "none",
              backgroundColor: editorTab === "edit" ? "var(--surface)" : "transparent",
              color: "var(--text)",
              fontWeight: editorTab === "edit" ? 700 : 500,
              cursor: "pointer",
              fontSize: "0.8125rem",
            }}
          >
            Editor
          </button>
          <button
            type="button"
            onClick={() => setEditorTab("preview")}
            style={{
              padding: "0.25rem 0.75rem",
              borderRadius: "var(--r-sm)",
              border: "none",
              backgroundColor: editorTab === "preview" ? "var(--surface)" : "transparent",
              color: "var(--text)",
              fontWeight: editorTab === "preview" ? 700 : 500,
              cursor: "pointer",
              fontSize: "0.8125rem",
            }}
          >
            Live Preview
          </button>
        </div>
      </div>

      {editorTab === "preview" ? (
        /* Preview tab */
        <div
          style={{
            backgroundColor: "var(--surface)",
            padding: "2rem",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--border)",
          }}
        >
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "2.5rem",
              fontWeight: 700,
              marginBottom: "0.5rem",
            }}
          >
            {activeTitle || "Untitled Dispatch"}
          </h1>
          {activeSummary && (
            <p style={{ fontSize: "1.125rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
              {activeSummary}
            </p>
          )}
          <LaneLine width="100%" />
          <div style={{ marginTop: "1.5rem" }}>
            <BlocksRenderer blocks={currentBlocks as RenderableBlock[]} />
          </div>
        </div>
      ) : (
        /* Editor tab */
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Post Metadata Card */}
          <div
            style={{
              backgroundColor: "var(--surface)",
              padding: "1.5rem",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border)",
            }}
          >
            <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "1rem" }}>
              Dispatch Details ({activeLocale.toUpperCase()})
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    marginBottom: "0.375rem",
                  }}
                >
                  Title ({activeLocale})
                </label>
                <TextInput
                  value={activeTitle}
                  onChange={(e) => {
                    setTitleMap({ ...titleMap, [activeLocale]: e.target.value });
                    markDirty();
                  }}
                  placeholder="e.g. Ward 12 Main Pipeline Repair Schedule"
                  style={{ width: "100%", fontSize: "1.125rem", fontWeight: 600 }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    marginBottom: "0.375rem",
                  }}
                >
                  Summary / Dek ({activeLocale})
                </label>
                <Textarea
                  value={activeSummary}
                  onChange={(e) => {
                    setSummaryMap({ ...summaryMap, [activeLocale]: e.target.value });
                    markDirty();
                  }}
                  rows={2}
                  placeholder="Short introductory summary for cards and search snippets..."
                  style={{ width: "100%" }}
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: "1rem",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      marginBottom: "0.375rem",
                    }}
                  >
                    Tags (comma-separated)
                  </label>
                  <TextInput
                    value={tagsStr}
                    onChange={(e) => {
                      setTagsStr(e.target.value);
                      markDirty();
                    }}
                    placeholder="water, roads, notice"
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      marginBottom: "0.375rem",
                    }}
                  >
                    Cover Image
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <label style={{ cursor: "pointer" }}>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => void handleMediaUpload(e)}
                        style={{ display: "none" }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={uploadingMedia}
                        style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}
                      >
                        <Upload size={14} aria-hidden="true" />
                        {uploadingMedia ? "Processing..." : "Upload Cover (Max 5MB)"}
                      </Button>
                    </label>
                    {coverMediaId && (
                      <span
                        style={{ fontSize: "0.75rem", color: "var(--paint-600)", fontWeight: 600 }}
                      >
                        ✓ Cover uploaded
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Block Editor Section */}
          <div
            style={{
              backgroundColor: "var(--surface)",
              padding: "1.5rem",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "1rem",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>
                Content Blocks ({currentBlocks.length} / 80)
              </h2>

              {/* Add block action buttons */}
              <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
                <Button size="sm" variant="outline" onClick={() => addBlock("paragraph")}>
                  + Paragraph
                </Button>
                <Button size="sm" variant="outline" onClick={() => addBlock("heading")}>
                  + Heading
                </Button>
                <Button size="sm" variant="outline" onClick={() => addBlock("image")}>
                  + Image
                </Button>
                <Button size="sm" variant="outline" onClick={() => addBlock("list")}>
                  + List
                </Button>
                <Button size="sm" variant="outline" onClick={() => addBlock("quote")}>
                  + Quote
                </Button>
                <Button size="sm" variant="outline" onClick={() => addBlock("callout")}>
                  + Callout
                </Button>
                <Button size="sm" variant="outline" onClick={() => addBlock("issueLink")}>
                  + Issue Card
                </Button>
                <Button size="sm" variant="outline" onClick={() => addBlock("divider")}>
                  + Divider
                </Button>
              </div>
            </div>

            {/* List of blocks */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {currentBlocks.map((b, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "1rem",
                    borderRadius: "var(--r-sm)",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--surface-sunken)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                  }}
                >
                  {/* Block top bar with type, move and delete */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.5rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        color: "var(--text-muted)",
                      }}
                    >
                      Block #{idx + 1} — {b.type}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <button
                        type="button"
                        onClick={() => moveBlock(idx, "up")}
                        disabled={idx === 0}
                        style={{
                          padding: "0.25rem",
                          cursor: idx === 0 ? "not-allowed" : "pointer",
                        }}
                        title="Move Up"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveBlock(idx, "down")}
                        disabled={idx === currentBlocks.length - 1}
                        style={{
                          padding: "0.25rem",
                          cursor: idx === currentBlocks.length - 1 ? "not-allowed" : "pointer",
                        }}
                        title="Move Down"
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteBlock(idx)}
                        style={{ padding: "0.25rem", color: "var(--kerb-600)", cursor: "pointer" }}
                        title="Delete Block"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Block specific form inputs */}
                  {b.type === "paragraph" && (
                    <Textarea
                      value={b.text}
                      onChange={(e) => updateBlock(idx, { ...b, text: e.target.value })}
                      placeholder="Write paragraph text..."
                      rows={3}
                      style={{ width: "100%" }}
                    />
                  )}

                  {b.type === "heading" && (
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <select
                        value={b.level}
                        onChange={(e) =>
                          updateBlock(idx, { ...b, level: Number(e.target.value) as 2 | 3 })
                        }
                        style={{
                          padding: "0.5rem",
                          borderRadius: "var(--r-sm)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        <option value={2}>H2</option>
                        <option value={3}>H3</option>
                      </select>
                      <TextInput
                        value={b.text}
                        onChange={(e) => updateBlock(idx, { ...b, text: e.target.value })}
                        placeholder="Heading text..."
                        style={{ flex: 1 }}
                      />
                    </div>
                  )}

                  {b.type === "image" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <label style={{ cursor: "pointer" }}>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) => void handleMediaUpload(e, idx)}
                            style={{ display: "none" }}
                          />
                          <Button type="button" variant="outline" size="sm">
                            <Upload size={14} style={{ marginRight: "0.25rem" }} />
                            {b.mediaId ? "Replace Image" : "Upload Image"}
                          </Button>
                        </label>
                        {b.mediaId ? (
                          <span
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--paint-600)",
                              fontWeight: 600,
                            }}
                          >
                            Image uploaded (mediaId: {b.mediaId})
                          </span>
                        ) : (
                          <span style={{ fontSize: "0.75rem", color: "var(--kerb-600)" }}>
                            * Upload required
                          </span>
                        )}
                      </div>
                      <TextInput
                        value={b.alt}
                        onChange={(e) => updateBlock(idx, { ...b, alt: e.target.value })}
                        placeholder="Alt text (mandatory for accessibility)"
                        style={{ width: "100%" }}
                      />
                      <TextInput
                        value={b.caption || ""}
                        onChange={(e) => updateBlock(idx, { ...b, caption: e.target.value })}
                        placeholder="Optional image caption"
                        style={{ width: "100%" }}
                      />
                    </div>
                  )}

                  {b.type === "list" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          fontSize: "0.8125rem",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={b.ordered}
                          onChange={(e) => updateBlock(idx, { ...b, ordered: e.target.checked })}
                        />
                        Numbered list
                      </label>
                      {b.items.map((item, itemIdx) => (
                        <div key={itemIdx} style={{ display: "flex", gap: "0.375rem" }}>
                          <TextInput
                            value={item}
                            onChange={(e) => {
                              const newItems = [...b.items];
                              newItems[itemIdx] = e.target.value;
                              updateBlock(idx, { ...b, items: newItems });
                            }}
                            placeholder={`Item ${itemIdx + 1}`}
                            style={{ flex: 1 }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const newItems = b.items.filter((_, i) => i !== itemIdx);
                              updateBlock(idx, { ...b, items: newItems.length ? newItems : [""] });
                            }}
                            style={{ padding: "0.25rem 0.5rem" }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => updateBlock(idx, { ...b, items: [...b.items, ""] })}
                        style={{ alignSelf: "flex-start" }}
                      >
                        + Add item
                      </Button>
                    </div>
                  )}

                  {b.type === "quote" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <Textarea
                        value={b.text}
                        onChange={(e) => updateBlock(idx, { ...b, text: e.target.value })}
                        placeholder="Quote text..."
                        rows={2}
                        style={{ width: "100%" }}
                      />
                      <TextInput
                        value={b.citation || ""}
                        onChange={(e) => updateBlock(idx, { ...b, citation: e.target.value })}
                        placeholder="Attribution / Citation"
                        style={{ width: "100%" }}
                      />
                    </div>
                  )}

                  {b.type === "callout" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <select
                        value={b.variant}
                        onChange={(e) =>
                          updateBlock(idx, { ...b, variant: e.target.value as "info" | "warning" })
                        }
                        style={{
                          padding: "0.375rem",
                          borderRadius: "var(--r-sm)",
                          border: "1px solid var(--border)",
                          width: "120px",
                        }}
                      >
                        <option value="info">Info</option>
                        <option value="warning">Warning</option>
                      </select>
                      <Textarea
                        value={b.text}
                        onChange={(e) => updateBlock(idx, { ...b, text: e.target.value })}
                        placeholder="Callout announcement text..."
                        rows={2}
                        style={{ width: "100%" }}
                      />
                    </div>
                  )}

                  {b.type === "issueLink" && (
                    <div>
                      <TextInput
                        value={b.publicId}
                        onChange={(e) =>
                          updateBlock(idx, { ...b, publicId: e.target.value.trim().toUpperCase() })
                        }
                        placeholder="Public Issue ID (e.g. NVR-DEMO-000101)"
                        style={{ width: "100%" }}
                      />
                    </div>
                  )}

                  {b.type === "divider" && (
                    <div
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "0.8125rem",
                        fontStyle: "italic",
                      }}
                    >
                      Milestone lane-line divider
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Publish Dialog */}
      <Dialog
        isOpen={publishDialogOpen}
        onClose={() => setPublishDialogOpen(false)}
        title={isBlogMode ? "Publish Community Blog" : "Publish Civic Dispatch"}
      >
        <p style={{ fontSize: "0.9375rem", color: "var(--text)", marginBottom: "1.5rem" }}>
          Publishing will immediately make this post public for all citizens on the
          {isBlogMode ? " /blogs " : " /updates "} portal, purge cached pages, and push notices.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <Button variant="outline" onClick={() => setPublishDialogOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handlePublishNow} disabled={actionInProgress}>
            {actionInProgress ? "Publishing..." : "Confirm Publish"}
          </Button>
        </div>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog
        isOpen={scheduleDialogOpen}
        onClose={() => setScheduleDialogOpen(false)}
        title="Schedule Dispatch Publication"
      >
        <div
          style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}
        >
          <p style={{ fontSize: "0.9375rem", color: "var(--text)" }}>
            Select the date and time for automated publication via BullMQ queue.
          </p>
          <input
            type="datetime-local"
            value={scheduleDateTime}
            onChange={(e) => setScheduleDateTime(e.target.value)}
            style={{
              padding: "0.5rem",
              borderRadius: "var(--r-sm)",
              border: "1px solid var(--border)",
              backgroundColor: "var(--surface)",
              color: "var(--text)",
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSchedulePublish}
            disabled={!scheduleDateTime || actionInProgress}
          >
            {actionInProgress ? "Scheduling..." : "Schedule Dispatch"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
