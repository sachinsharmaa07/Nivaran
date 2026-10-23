import React, { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonVariant = "cta" | "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    disabled = false,
    children,
    style,
    className = "",
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading;

  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case "cta":
        return {
          backgroundColor: "var(--cta)",
          color: "var(--on-cta)",
          border: "1px solid var(--paint-500)",
          fontWeight: 700,
        };
      case "primary":
        return {
          backgroundColor: "var(--primary)",
          color: "var(--on-primary)",
          border: "1px solid var(--primary)",
          fontWeight: 600,
        };
      case "danger":
        return {
          backgroundColor: "var(--kerb-500)",
          color: "var(--asphalt-0)",
          border: "1px solid var(--kerb-600)",
          fontWeight: 600,
        };
      case "ghost":
        return {
          backgroundColor: "transparent",
          color: "var(--text)",
          border: "1px solid transparent",
          fontWeight: 500,
        };
      case "secondary":
      default:
        return {
          backgroundColor: "var(--surface)",
          color: "var(--text)",
          border: "1px solid var(--border-control)",
          fontWeight: 500,
        };
    }
  };

  const getSizeStyles = (): React.CSSProperties => {
    switch (size) {
      case "sm":
        return {
          minHeight: "36px",
          padding: "0.25rem 0.75rem",
          fontSize: "0.875rem",
        };
      case "lg":
        return {
          minHeight: "48px",
          padding: "0.75rem 1.5rem",
          fontSize: "1.05rem",
        };
      case "md":
      default:
        return {
          minHeight: "44px",
          padding: "0.5rem 1.125rem",
          fontSize: "0.9375rem",
        };
    }
  };

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      aria-busy={loading}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        borderRadius: "var(--r-md)",
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled ? 0.6 : 1,
        fontFamily: "var(--font-body)",
        letterSpacing: "0.01em",
        lineHeight: 1.2,
        transition:
          "transform var(--dur-instant) var(--ease-out), background-color var(--dur-fast) var(--ease-out)",
        ...getVariantStyles(),
        ...getSizeStyles(),
        ...style,
      }}
      className={`btn-${variant} ${className}`}
      {...props}
    >
      {loading ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
          <svg width="24" height="6" viewBox="0 0 24 6" fill="none" aria-hidden="true">
            <line
              x1="0"
              y1="3"
              x2="24"
              y2="3"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeDasharray="4 3"
              className="lane-line-loader"
            />
          </svg>
          <span>{children}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
});
