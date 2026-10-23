import React, { type ReactNode } from "react";
import { Inbox } from "lucide-react";

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
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "2.5rem 1.5rem",
        backgroundColor: "var(--surface)",
        border: "1px dashed var(--border)",
        borderRadius: "var(--r-lg)",
        gap: "0.875rem",
        ...style,
      }}
    >
      <div
        style={{
          width: "44px",
          height: "44px",
          borderRadius: "var(--r-md)",
          backgroundColor: "var(--surface-sunken)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-subtle)",
          border: "1px solid var(--border)",
        }}
        aria-hidden="true"
      >
        {icon || <Inbox size={22} strokeWidth={1.75} />}
      </div>

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
