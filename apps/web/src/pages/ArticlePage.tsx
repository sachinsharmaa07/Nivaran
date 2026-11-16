import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router";
import type { TenantInfo } from "../components/CityPicker.js";
import { useTranslation } from "../utils/i18n.js";
import { useToast } from "../ui/Toast.js";
import { Button, LaneLine, LaneLineLoader, ErrorState, SignPlate } from "../ui/index.js";
import { BlocksRenderer, type RenderableBlock } from "../components/BlocksRenderer.js";
import { Calendar, Clock, Share2, ArrowLeft, Check, Copy } from "lucide-react";

export interface PublicPostDetail {
  id: string;
  slug: string;
  title: string;
  summary?: string;
  blocks: RenderableBlock[];
  coverMedia?: {
    id?: string;
    variants?: Record<string, string>;
    altText?: string;
    caption?: string | null;
    width?: number;
    height?: number;
  } | null;
  tags: string[];
  publishedAt: string | null;
  readingTimeMinutes: number;
  commentsEnabled?: boolean;
  commentCount?: number;
  version: number;
}

export function ArticlePage({ tenant }: { tenant: TenantInfo }): React.JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const { locale } = useTranslation();
  const { showToast } = useToast();

  const [post, setPost] = useState<PublicPostDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    setErrorMsg("");

    fetch(`/api/v1/public/${tenant.slug}/posts/${encodeURIComponent(slug)}?locale=${locale}`)
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("This civic update was not found or is no longer published.");
          }
          throw new Error(`Failed to load article (status ${res.status})`);
        }
        return res.json();
      })
      .then((data: { data?: PublicPostDetail }) => {
        if (cancelled) return;
        setPost(data.data || null);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setErrorMsg(err.message || "Failed to load civic update");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tenant.slug, slug, locale]);

  const handleShare = async () => {
    const url = window.location.href;
    const shareData = {
      title: post?.title || "Civic Update",
      text: post?.summary || `Civic update from ${tenant.name}`,
      url,
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (_err) {
        // Fallback to clipboard if share was cancelled/failed
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      showToast({ message: "Article link copied to clipboard!", variant: "info" });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      showToast({ message: "Unable to copy link", type: "error" });
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "6rem 1rem", textAlign: "center" }}>
        <LaneLineLoader width="160px" />
        <p style={{ marginTop: "1rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
          Loading dispatch...
        </p>
      </div>
    );
  }

  if (errorMsg || !post) {
    return (
      <div style={{ maxWidth: "800px", margin: "2rem auto", padding: "0 1rem" }}>
        <Link
          to="/updates"
          style={{
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.375rem",
            color: "var(--text-muted)",
            fontSize: "0.875rem",
            marginBottom: "1.5rem",
          }}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to all updates
        </Link>
        <ErrorState
          title="Dispatch Not Found"
          message={errorMsg || "The requested dispatch could not be loaded."}
        />
      </div>
    );
  }

  const cover = post.coverMedia;
  const coverAspect = cover?.width && cover?.height ? `${cover.width} / ${cover.height}` : "16 / 9";

  return (
    <article style={{ minHeight: "80vh", backgroundColor: "var(--bg)" }}>
      {/* Asphalt Header Band per Milestone Spec */}
      <header
        style={{
          backgroundColor: "var(--asphalt-900)",
          color: "var(--asphalt-50)",
          padding: "clamp(2rem, 1.5rem + 2vw, 3.5rem) 1rem 2.5rem 1rem",
          borderBottom: "4px solid var(--paint-500)",
        }}
      >
        <div style={{ maxWidth: "860px", margin: "0 auto" }}>
          {/* Back link & breadcrumb */}
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
            <Link
              to="/updates"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                color: "var(--asphalt-300)",
                fontSize: "0.875rem",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              All Civic Updates
            </Link>

            <SignPlate label="DISPATCH">{tenant.code || "NVR"}</SignPlate>
          </div>

          {/* Metadata badges */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1.25rem",
              fontSize: "0.875rem",
              color: "var(--asphalt-300)",
              marginBottom: "1rem",
              flexWrap: "wrap",
            }}
          >
            {post.publishedAt && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
                <Calendar size={14} style={{ color: "var(--paint-400)" }} aria-hidden="true" />
                {new Date(post.publishedAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            )}
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
              <Clock size={14} style={{ color: "var(--paint-400)" }} aria-hidden="true" />
              {post.readingTimeMinutes} min read
            </span>
            {post.tags && post.tags.length > 0 && (
              <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      backgroundColor: "var(--asphalt-800)",
                      color: "var(--paint-400)",
                      padding: "0.125rem 0.5rem",
                      borderRadius: "var(--r-sm)",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                    }}
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Headline in Barlow Semi Condensed Display */}
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(2rem, 1.5rem + 2vw, 3.25rem)",
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              color: "#ffffff",
              margin: "0 0 1rem 0",
            }}
          >
            {post.title}
          </h1>

          {/* Summary / Dek */}
          {post.summary && (
            <p
              style={{
                fontSize: "1.25rem",
                lineHeight: 1.5,
                color: "var(--asphalt-200)",
                margin: 0,
                maxWidth: "760px",
              }}
            >
              {post.summary}
            </p>
          )}

          {/* Share Button */}
          <div
            style={{ marginTop: "1.5rem", display: "flex", alignItems: "center", gap: "0.75rem" }}
          >
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleShare}
              style={{
                backgroundColor: "var(--asphalt-800)",
                color: "#ffffff",
                borderColor: "var(--asphalt-600)",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
              }}
            >
              {copied ? (
                <Check size={14} style={{ color: "var(--paint-400)" }} />
              ) : (
                <Share2 size={14} />
              )}
              {copied ? "Link Copied" : "Share Dispatch"}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Body Content */}
      <main style={{ maxWidth: "860px", margin: "0 auto", padding: "2rem 1rem 5rem 1rem" }}>
        {/* Cover Image with reserved aspect ratio */}
        {cover?.variants && (
          <figure
            style={{
              margin: "0 0 2.5rem 0",
              borderRadius: "var(--r-lg)",
              overflow: "hidden",
              border: "1px solid var(--border)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: coverAspect,
                backgroundColor: "var(--surface-sunken)",
              }}
            >
              <img
                src={
                  cover.variants["1600"] ||
                  cover.variants["960"] ||
                  cover.variants["480"] ||
                  "/placeholder-image.webp"
                }
                srcSet={
                  [
                    cover.variants["480"] ? `${cover.variants["480"]} 480w` : null,
                    cover.variants["960"] ? `${cover.variants["960"]} 960w` : null,
                    cover.variants["1600"] ? `${cover.variants["1600"]} 1600w` : null,
                  ]
                    .filter(Boolean)
                    .join(", ") || undefined
                }
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 800px, 860px"
                alt={cover.altText || post.title}
                loading="lazy"
                decoding="async"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            </div>
            {cover.caption && (
              <figcaption
                style={{
                  padding: "0.5rem 1rem",
                  fontSize: "0.8125rem",
                  color: "var(--text-muted)",
                  backgroundColor: "var(--surface)",
                  borderTop: "1px solid var(--border)",
                  fontStyle: "italic",
                }}
              >
                {cover.caption}
              </figcaption>
            )}
          </figure>
        )}

        {/* Blocks Body without dangerouslySetInnerHTML */}
        <BlocksRenderer blocks={post.blocks} />

        {/* Footer separator and share button */}
        <div style={{ marginTop: "3rem" }}>
          <LaneLine width="100%" />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: "1.5rem",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
              Published by {tenant.name} Civic Information Desk
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleShare}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}
            >
              <Copy size={14} aria-hidden="true" />
              Copy Article Link
            </Button>
          </div>
        </div>
      </main>
    </article>
  );
}
