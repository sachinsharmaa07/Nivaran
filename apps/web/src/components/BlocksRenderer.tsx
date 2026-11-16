import React from "react";
import { Link } from "react-router";
import type { Block } from "@nivaran/shared";
import { Milestone, LaneLine, StatusChip } from "../ui/index.js";
import { AlertTriangle, Info, ExternalLink } from "lucide-react";

export interface ExpandedMediaInfo {
  variants?: {
    "480"?: string;
    "960"?: string;
    "1600"?: string;
    fallback?: string;
  };
  altText?: string;
  caption?: string | null;
  width?: number;
  height?: number;
}

export interface ExpandedIssueInfo {
  publicId: string;
  status: string;
  categoryName: string;
  createdAt: string | Date;
  locationHint?: string | null;
}

export type RenderableBlock = Block & {
  media?: ExpandedMediaInfo | null;
  issue?: ExpandedIssueInfo | null;
};

interface BlocksRendererProps {
  blocks: RenderableBlock[];
  className?: string;
}

export function BlocksRenderer({ blocks, className = "" }: BlocksRendererProps): React.JSX.Element {
  if (!blocks || blocks.length === 0) {
    return <></>;
  }

  return (
    <div
      className={`blocks-renderer ${className}`}
      style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
    >
      {blocks.map((block, idx) => {
        const key = `block-${idx}`;

        switch (block.type) {
          case "paragraph":
            return (
              <p
                key={key}
                style={{
                  fontSize: "1.0625rem",
                  lineHeight: 1.7,
                  color: "var(--text)",
                  margin: 0,
                  whiteSpace: "pre-line",
                  wordBreak: "break-word",
                }}
              >
                {block.text}
              </p>
            );

          case "heading":
            if (block.level === 2) {
              return (
                <h2
                  key={key}
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(1.5rem, 1.25rem + 1vw, 2rem)",
                    fontWeight: 700,
                    lineHeight: 1.15,
                    letterSpacing: "-0.01em",
                    color: "var(--text)",
                    margin: "1rem 0 0.25rem 0",
                  }}
                >
                  {block.text}
                </h2>
              );
            }
            return (
              <h3
                key={key}
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(1.25rem, 1.1rem + 0.5vw, 1.5rem)",
                  fontWeight: 600,
                  lineHeight: 1.2,
                  letterSpacing: "-0.01em",
                  color: "var(--text)",
                  margin: "0.75rem 0 0.25rem 0",
                }}
              >
                {block.text}
              </h3>
            );

          case "image": {
            const media = block.media;
            const w = media?.width ?? 1600;
            const h = media?.height ?? 900;
            const aspect = `${w} / ${h}`;
            const alt = block.alt || media?.altText || "Civic update image";
            const caption = block.caption || media?.caption;

            // Generate srcset
            let src = "/placeholder-image.webp";
            let srcSet: string | undefined = undefined;

            if (media?.variants) {
              const v = media.variants;
              const setParts: string[] = [];
              if (v["480"]) setParts.push(`${v["480"]} 480w`);
              if (v["960"]) setParts.push(`${v["960"]} 960w`);
              if (v["1600"]) setParts.push(`${v["1600"]} 1600w`);
              if (setParts.length > 0) {
                srcSet = setParts.join(", ");
              }
              src = v["960"] || v["1600"] || v["480"] || v.fallback || src;
            }

            return (
              <figure
                key={key}
                style={{
                  margin: "0.5rem 0",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: aspect,
                    backgroundColor: "var(--surface-sunken)",
                    borderRadius: "var(--r-md)",
                    overflow: "hidden",
                    border: "1px solid var(--border)",
                  }}
                >
                  <img
                    src={src}
                    srcSet={srcSet}
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 800px, 960px"
                    alt={alt}
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
                {caption ? (
                  <figcaption
                    style={{
                      fontSize: "0.8125rem",
                      color: "var(--text-muted)",
                      textAlign: "center",
                      fontStyle: "italic",
                    }}
                  >
                    {caption}
                  </figcaption>
                ) : null}
              </figure>
            );
          }

          case "list": {
            const ListTag = block.ordered ? "ol" : "ul";
            return (
              <ListTag
                key={key}
                style={{
                  margin: "0 0 0 1.25rem",
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.375rem",
                  color: "var(--text)",
                  fontSize: "1.0625rem",
                  lineHeight: 1.6,
                }}
              >
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx}>{item}</li>
                ))}
              </ListTag>
            );
          }

          case "quote":
            return (
              <blockquote
                key={key}
                style={{
                  margin: "0.5rem 0",
                  padding: "0.75rem 1.25rem",
                  borderLeft: "4px solid var(--paint-500)",
                  backgroundColor: "var(--surface-sunken)",
                  borderRadius: "0 var(--r-sm) var(--r-sm) 0",
                  fontStyle: "italic",
                  color: "var(--text)",
                }}
              >
                <p style={{ margin: 0, fontSize: "1.125rem", lineHeight: 1.6 }}>
                  &ldquo;{block.text}&rdquo;
                </p>
                {block.citation ? (
                  <cite
                    style={{
                      display: "block",
                      marginTop: "0.375rem",
                      fontSize: "0.8125rem",
                      fontStyle: "normal",
                      fontWeight: 600,
                      color: "var(--text-muted)",
                    }}
                  >
                    — {block.citation}
                  </cite>
                ) : null}
              </blockquote>
            );

          case "callout": {
            const isWarning = block.variant === "warning";
            const borderColor = isWarning ? "var(--kerb-500)" : "var(--asphalt-700)";
            const bgColor = isWarning ? "rgba(224, 78, 57, 0.08)" : "var(--surface-sunken)";
            const Icon = isWarning ? AlertTriangle : Info;
            return (
              <div
                key={key}
                style={{
                  display: "flex",
                  gap: "0.875rem",
                  alignItems: "flex-start",
                  padding: "0.875rem 1rem",
                  borderRadius: "var(--r-md)",
                  border: `1px solid ${borderColor}`,
                  backgroundColor: bgColor,
                  color: "var(--text)",
                }}
              >
                <div style={{ flexShrink: 0, marginTop: "0.125rem" }}>
                  <Icon
                    size={20}
                    style={{ color: isWarning ? "var(--kerb-600)" : "var(--paint-600)" }}
                    aria-hidden="true"
                  />
                </div>
                <div style={{ fontSize: "0.9375rem", lineHeight: 1.5, wordBreak: "break-word" }}>
                  {block.title && (
                    <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>{block.title}</div>
                  )}
                  {block.text}
                </div>
              </div>
            );
          }

          case "issueLink": {
            const issue = block.issue;
            return (
              <div
                key={key}
                style={{
                  margin: "0.5rem 0",
                  padding: "1rem",
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--surface)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Milestone
                      label={block.publicId.slice(-4)}
                      status={issue?.status ?? "submitted"}
                      size="sm"
                    />
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontWeight: 700,
                        fontSize: "1rem",
                      }}
                    >
                      {block.publicId}
                    </span>
                  </div>
                  {issue ? <StatusChip status={issue.status} /> : null}
                </div>
                {issue ? (
                  <div
                    style={{
                      fontSize: "0.875rem",
                      color: "var(--text-muted)",
                      marginBottom: "0.75rem",
                    }}
                  >
                    <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: "0.25rem" }}>
                      {issue.categoryName}
                    </div>
                    {issue.locationHint ? <div>Location: {issue.locationHint}</div> : null}
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: "0.875rem",
                      color: "var(--text-muted)",
                      marginBottom: "0.75rem",
                    }}
                  >
                    Linked civic issue tracking ID
                  </div>
                )}
                <Link
                  to={`/issues/${encodeURIComponent(block.publicId)}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    color: "var(--paint-600)",
                    textDecoration: "none",
                  }}
                >
                  View issue progress & timeline
                  <ExternalLink size={13} aria-hidden="true" />
                </Link>
              </div>
            );
          }

          case "divider":
            return (
              <div key={key} style={{ margin: "1rem 0" }}>
                <LaneLine width="100%" />
              </div>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
