import React, { useState, useEffect } from "react";
import { Link, useSearchParams, useLocation } from "react-router";
import type { TenantInfo } from "../components/CityPicker.js";
import { useTranslation } from "../utils/i18n.js";
import {
  Button,
  TextInput,
  LaneLine,
  LaneLineLoader,
  EmptyState,
  ErrorState,
  SignPlate,
} from "../ui/index.js";
import { Search, Calendar, Clock, ArrowRight, Tag as TagIcon, PenSquare } from "lucide-react";

export interface PublicPostSummary {
  id: string;
  slug: string;
  title: string;
  summary?: string;
  coverMedia?: {
    variants?: Record<string, string>;
    altText?: string;
  } | null;
  tags: string[];
  publishedAt: string | null;
  readingTimeMinutes: number;
  commentsEnabled?: boolean;
  commentCount?: number;
}

export function UpdatesListPage({ tenant }: { tenant: TenantInfo }): React.JSX.Element {
  const { locale } = useTranslation();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const basePath = location.pathname.includes("/blogs") ? "/blogs" : "/updates";
  const selectedTag = searchParams.get("tag") || "";
  const queryParam = searchParams.get("q") || "";

  const [searchInput, setSearchInput] = useState<string>(queryParam);
  const [posts, setPosts] = useState<PublicPostSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  useEffect(() => {
    setSearchInput(queryParam);
  }, [queryParam]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg("");

    const params = new URLSearchParams();
    params.set("locale", locale);
    if (selectedTag) params.set("tag", selectedTag);
    if (queryParam) params.set("q", queryParam);

    fetch(`/api/v1/public/${tenant.slug}/posts?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load civic updates (status ${res.status})`);
        }
        return res.json();
      })
      .then((data: { data?: PublicPostSummary[] }) => {
        if (cancelled) return;
        const items = data.data || [];
        setPosts(items);

        // Collect unique tags
        const tagSet = new Set<string>();
        for (const item of items) {
          for (const t of item.tags || []) {
            tagSet.add(t);
          }
        }
        setAvailableTags(Array.from(tagSet));
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setErrorMsg(err.message || "Failed to load civic updates");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tenant.slug, locale, selectedTag, queryParam]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (searchInput.trim()) {
      next.set("q", searchInput.trim());
    } else {
      next.delete("q");
    }
    setSearchParams(next);
  };

  const handleTagClick = (tag: string) => {
    const next = new URLSearchParams(searchParams);
    if (selectedTag === tag) {
      next.delete("tag");
    } else {
      next.set("tag", tag);
    }
    setSearchParams(next);
  };

  const featured = posts.length > 0 ? posts[0] : null;
  const denseList = posts.length > 1 ? posts.slice(1) : [];

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "1.5rem 1rem 4rem 1rem" }}>
      {/* SignPlate Breadcrumb */}
      <div style={{ marginBottom: "1rem" }}>
        <SignPlate label="MUNICIPALITY">{`${tenant.name.toUpperCase()} • CIVIC DISPATCH`}</SignPlate>
      </div>

      {/* Large Headline per Milestone spec */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1.5rem",
          marginBottom: "2rem",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(2.25rem, 1.75rem + 2.5vw, 3.75rem)",
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: "var(--text)",
              margin: "0 0 0.5rem 0",
            }}
          >
            Civic Blogs & Dispatches
          </h1>
          <p
            style={{
              fontSize: "1.125rem",
              color: "var(--text-muted)",
              maxWidth: "680px",
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            Community blogs, citizen stories, ongoing municipal infrastructure projects, and updates
            from {tenant.name}.
          </p>
        </div>

        <Link to="/blogs/new" style={{ textDecoration: "none" }}>
          <Button
            variant="primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.625rem 1.25rem",
              fontWeight: 600,
              boxShadow: "0 4px 14px rgba(245, 192, 0, 0.25)",
            }}
          >
            <PenSquare size={16} aria-hidden={true} />
            Write a Blog
          </Button>
        </Link>
      </div>

      {/* Search and Tag Filters */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          marginBottom: "2rem",
          backgroundColor: "var(--surface)",
          padding: "1rem",
          borderRadius: "var(--r-md)",
          border: "1px solid var(--border)",
        }}
      >
        <form
          onSubmit={handleSearchSubmit}
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
          }}
        >
          <div style={{ flex: 1, position: "relative" }}>
            <TextInput
              placeholder="Search dispatches, road repairs, alerts..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{ width: "100%", paddingLeft: "2.25rem" }}
            />
            <Search
              size={16}
              style={{
                position: "absolute",
                left: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
              aria-hidden="true"
            />
          </div>
          <Button type="submit" variant="primary">
            Search
          </Button>
          {(queryParam || selectedTag) && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setSearchInput("");
                setSearchParams(new URLSearchParams());
              }}
            >
              Reset
            </Button>
          )}
        </form>

        {/* Tag chips */}
        {availableTags.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: "0.8125rem",
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
              }}
            >
              <TagIcon size={13} aria-hidden="true" />
              Tags:
            </span>
            <button
              type="button"
              onClick={() => handleTagClick("")}
              className="touch-target"
              style={{
                padding: "0.25rem 0.625rem",
                borderRadius: "var(--r-sm)",
                fontSize: "0.8125rem",
                fontWeight: selectedTag === "" ? 700 : 500,
                border: "1px solid var(--border)",
                backgroundColor:
                  selectedTag === "" ? "var(--asphalt-900)" : "var(--surface-sunken)",
                color: selectedTag === "" ? "var(--paint-400)" : "var(--text)",
                cursor: "pointer",
              }}
            >
              All
            </button>
            {availableTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleTagClick(tag)}
                className="touch-target"
                style={{
                  padding: "0.25rem 0.625rem",
                  borderRadius: "var(--r-sm)",
                  fontSize: "0.8125rem",
                  fontWeight: selectedTag === tag ? 700 : 500,
                  border: "1px solid var(--border)",
                  backgroundColor:
                    selectedTag === tag ? "var(--asphalt-900)" : "var(--surface-sunken)",
                  color: selectedTag === tag ? "var(--paint-400)" : "var(--text)",
                  cursor: "pointer",
                }}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ padding: "4rem 1rem", textAlign: "center" }}>
          <LaneLineLoader width="140px" />
          <p style={{ marginTop: "1rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Fetching civic dispatches...
          </p>
        </div>
      )}

      {/* Error state */}
      {!loading && errorMsg && (
        <ErrorState
          title="Could not load dispatches"
          message={errorMsg}
          onRetry={() => setSearchParams(new URLSearchParams(searchParams))}
        />
      )}

      {/* Empty state */}
      {!loading && !errorMsg && posts.length === 0 && (
        <EmptyState
          title="No updates found"
          message={
            queryParam || selectedTag
              ? "No dispatches match the selected search query or tag."
              : "No civic updates have been published for this municipality yet."
          }
        />
      )}

      {/* Content */}
      {!loading && !errorMsg && posts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {/* Featured Post Card */}
          {featured && (
            <article
              style={{
                backgroundColor: "var(--surface)",
                borderRadius: "var(--r-lg)",
                border: "2px solid var(--border)",
                overflow: "hidden",
                boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                display: "grid",
                gridTemplateColumns: featured.coverMedia?.variants
                  ? "repeat(auto-fit, minmax(320px, 1fr))"
                  : "1fr",
                alignItems: "stretch",
              }}
            >
              {featured.coverMedia?.variants && (
                <div
                  style={{
                    position: "relative",
                    minHeight: "260px",
                    backgroundColor: "var(--surface-sunken)",
                    overflow: "hidden",
                  }}
                >
                  <img
                    src={
                      featured.coverMedia.variants["960"] ||
                      featured.coverMedia.variants["1600"] ||
                      featured.coverMedia.variants["480"] ||
                      "/placeholder-image.webp"
                    }
                    alt={featured.coverMedia.altText || featured.title}
                    loading="lazy"
                    decoding="async"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "1rem",
                      left: "1rem",
                      backgroundColor: "var(--paint-500)",
                      color: "var(--asphalt-950)",
                      fontWeight: 700,
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "0.25rem 0.5rem",
                      borderRadius: "var(--r-sm)",
                    }}
                  >
                    Featured
                  </div>
                </div>
              )}

              <div
                style={{
                  padding: "clamp(1.25rem, 1rem + 1vw, 2rem)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "1rem",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "1rem",
                      fontSize: "0.8125rem",
                      color: "var(--text-muted)",
                      marginBottom: "0.75rem",
                      flexWrap: "wrap",
                    }}
                  >
                    {featured.publishedAt && (
                      <span
                        style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}
                      >
                        <Calendar size={13} aria-hidden="true" />
                        {new Date(featured.publishedAt).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    )}
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
                      <Clock size={13} aria-hidden="true" />
                      {featured.readingTimeMinutes} min read
                    </span>
                    {featured.tags && featured.tags.length > 0 && (
                      <span style={{ color: "var(--paint-600)", fontWeight: 600 }}>
                        #{featured.tags.join(" #")}
                      </span>
                    )}
                  </div>

                  <h2
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "clamp(1.5rem, 1.25rem + 1vw, 2.25rem)",
                      fontWeight: 700,
                      lineHeight: 1.15,
                      letterSpacing: "-0.01em",
                      color: "var(--text)",
                      margin: "0 0 0.75rem 0",
                    }}
                  >
                    <Link
                      to={`${basePath}/${encodeURIComponent(featured.slug)}`}
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      {featured.title}
                    </Link>
                  </h2>

                  {featured.summary && (
                    <p
                      style={{
                        fontSize: "1rem",
                        color: "var(--text-muted)",
                        lineHeight: 1.6,
                        margin: 0,
                      }}
                    >
                      {featured.summary}
                    </p>
                  )}
                </div>

                <div style={{ paddingTop: "0.5rem" }}>
                  <Link
                    to={`${basePath}/${encodeURIComponent(featured.slug)}`}
                    style={{ textDecoration: "none" }}
                  >
                    <Button
                      variant="primary"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
                    >
                      Read dispatch
                      <ArrowRight size={16} aria-hidden="true" />
                    </Button>
                  </Link>
                </div>
              </div>
            </article>
          )}

          {/* Divider between featured and dense list */}
          {denseList.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", margin: "1rem 0" }}>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "1.25rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--text-muted)",
                  }}
                >
                  Recent Dispatches
                </span>
                <LaneLine style={{ flex: 1 }} />
              </div>

              {/* Dense List */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  gap: "0.75rem",
                }}
              >
                {denseList.map((post) => (
                  <article
                    key={post.id}
                    style={{
                      backgroundColor: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--r-md)",
                      padding: "1rem 1.25rem",
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "1rem",
                      transition: "border-color 0.15s ease, transform 0.15s ease",
                    }}
                  >
                    {post.coverMedia?.variants && (
                      <div
                        style={{
                          width: "80px",
                          height: "64px",
                          borderRadius: "var(--r-sm)",
                          overflow: "hidden",
                          flexShrink: 0,
                          backgroundColor: "var(--surface-sunken)",
                        }}
                      >
                        <img
                          src={post.coverMedia.variants["480"] || "/placeholder-image.webp"}
                          alt={post.coverMedia.altText || post.title}
                          loading="lazy"
                          decoding="async"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          marginBottom: "0.25rem",
                        }}
                      >
                        {post.publishedAt && (
                          <span>
                            {new Date(post.publishedAt).toLocaleDateString(undefined, {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        )}
                        <span>•</span>
                        <span>{post.readingTimeMinutes} min</span>
                        {post.tags && post.tags.length > 0 && (
                          <span style={{ color: "var(--paint-600)", fontWeight: 600 }}>
                            #{post.tags[0]}
                          </span>
                        )}
                      </div>

                      <h3
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: "1.125rem",
                          fontWeight: 700,
                          lineHeight: 1.25,
                          margin: "0 0 0.25rem 0",
                          color: "var(--text)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <Link
                          to={`${basePath}/${encodeURIComponent(post.slug)}`}
                          style={{ color: "inherit", textDecoration: "none" }}
                        >
                          {post.title}
                        </Link>
                      </h3>

                      {post.summary && (
                        <p
                          style={{
                            fontSize: "0.875rem",
                            color: "var(--text-muted)",
                            margin: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {post.summary}
                        </p>
                      )}
                    </div>

                    <div style={{ flexShrink: 0 }}>
                      <Link
                        to={`${basePath}/${encodeURIComponent(post.slug)}`}
                        style={{ textDecoration: "none" }}
                      >
                        <Button variant="secondary" size="sm">
                          Read
                        </Button>
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
