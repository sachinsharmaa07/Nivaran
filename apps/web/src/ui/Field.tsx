import React, { type ReactNode, useId } from "react";

export interface FieldProps {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean;
  children:
    | ReactNode
    | ((props: {
        id: string;
        "aria-describedby"?: string | undefined;
        "aria-invalid"?: boolean | undefined;
      }) => ReactNode);
  className?: string;
  style?: React.CSSProperties;
}

export function Field({
  label,
  hint,
  error,
  required = false,
  children,
  className = "",
  style,
}: FieldProps): React.JSX.Element {
  const generatedId = useId();
  const inputId = `field-${generatedId}`;
  const hintId = hint ? `hint-${generatedId}` : undefined;
  const errorId = error ? `error-${generatedId}` : undefined;

  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div
      className={`form-field ${className}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.375rem",
        marginBottom: "1rem",
        ...style,
      }}
    >
      <label
        htmlFor={inputId}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.25rem",
          fontSize: "0.875rem",
          fontWeight: 600,
          color: "var(--text)",
          lineHeight: 1.3,
        }}
      >
        <span>{label}</span>
        {required && (
          <span style={{ color: "var(--kerb-500)", fontWeight: 700 }} aria-hidden="true">
            *
          </span>
        )}
      </label>

      {hint && (
        <p
          id={hintId}
          style={{
            fontSize: "0.8125rem",
            color: "var(--text-subtle)",
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          {hint}
        </p>
      )}

      {typeof children === "function"
        ? (
            children as (props: {
              id: string;
              "aria-describedby"?: string | undefined;
              "aria-invalid"?: boolean | undefined;
            }) => ReactNode
          )({
            id: inputId,
            "aria-describedby": describedBy,
            "aria-invalid": Boolean(error),
          })
        : children}

      {error && (
        <div
          id={errorId}
          role="alert"
          style={{
            fontSize: "0.8125rem",
            color: "var(--kerb-600)",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
            transition: "all var(--dur-fast) var(--ease-out)",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: "4px",
              height: "4px",
              borderRadius: "50%",
              backgroundColor: "var(--kerb-500)",
            }}
          />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
