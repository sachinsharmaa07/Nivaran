import React, { type ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "./Button.js";

export interface ErrorStateProps {
  title?: string | undefined;
  message: string;
  onRetry?: (() => void) | undefined;
  action?: ReactNode | undefined;
  className?: string;
  style?: React.CSSProperties;
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  action,
  className = "",
  style,
}: ErrorStateProps): React.JSX.Element {
  return (
    <div
      role="alert"
      className={`error-state ${className}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "2rem 1.5rem",
        backgroundColor: "var(--surface)",
        border: "1px solid var(--kerb-300)",
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
          backgroundColor: "var(--kerb-50)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--kerb-600)",
          border: "1px solid var(--kerb-300)",
        }}
        aria-hidden="true"
      >
        <AlertTriangle size={22} strokeWidth={1.75} />
      </div>

      <div style={{ maxWidth: "420px" }}>
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
          {message}
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.25rem" }}>
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            <RotateCw size={14} strokeWidth={1.75} aria-hidden={true} />
            <span>Try again</span>
          </Button>
        )}
        {action}
      </div>
    </div>
  );
}
