import React, { type ReactNode } from "react";
import { IllustrationEmptyList } from "./Illustrations.js";

export interface EmptyStateProps {
  title: string;
  description?: string | undefined;
  message?: string | undefined;
  action?: ReactNode | undefined;
  icon?: ReactNode | undefined;
  className?: string;
  style?: React.CSSProperties;
}

export function EmptyState({
  title,
  description,
  message,
  action,
  icon,
  className = "",
  style,
}: EmptyStateProps): React.JSX.Element {
  const text = description || message || "";
  return (
    <div
      className={`empty-state ${className}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        textAlign: "left",
        padding: "2.5rem 1.5rem",
        backgroundColor: "var(--surface)",
        border: "1px dashed var(--border)",
        borderRadius: "var(--r-lg)",
        gap: "0.875rem",
        ...style,
      }}
    >
      <div aria-hidden="true">{icon || <IllustrationEmptyList size={96} />}</div>

      <div style={{ maxWidth: "380px" }}>
        <h3
          style={{
            margin: "0 0 0.375rem 0",
            fontSize: "1.125rem",
            fontWeight: 600,
            color: "var(--text)",
          }}
        >
          {title}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: "0.875rem",
            color: "var(--text-muted)",
            lineHeight: 1.45,
          }}
        >
          {text}
        </p>
      </div>

      {action && <div style={{ marginTop: "0.5rem" }}>{action}</div>}
    </div>
  );
}
