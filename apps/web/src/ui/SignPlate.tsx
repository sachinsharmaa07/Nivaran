import React, { type ReactNode } from "react";

/**
 * SignPlate: bordered sign-plate container with inset border.
 * Used ONLY for KPIs, the review summary, and issue IDs.
 * Everything else is flat: tonal surfaces and 1px hairlines.
 */
export interface SignPlateProps {
  children: ReactNode;
  /** Optional header label in the plate */
  label?: string | undefined;
  /** Optional right-aligned text in header */
  meta?: string | undefined;
  className?: string | undefined;
  style?: React.CSSProperties | undefined;
}

export function SignPlate({
  children,
  label,
  meta,
  className = "",
  style,
}: SignPlateProps): React.JSX.Element {
  return (
    <div
      className={`sign-plate ${className}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-3)",
        ...style,
      }}
    >
      {(label || meta) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            borderBottom: "1px solid var(--border)",
            paddingBottom: "var(--sp-3)",
          }}
        >
          {label && (
            <span
              style={{
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "var(--text-subtle)",
              }}
            >
              {label}
            </span>
          )}
          {meta && (
            <span
              style={{
                fontSize: "0.8125rem",
                color: "var(--text)",
                fontWeight: 600,
              }}
            >
              {meta}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
