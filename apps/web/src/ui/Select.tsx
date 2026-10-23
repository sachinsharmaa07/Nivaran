import { forwardRef, type SelectHTMLAttributes } from "react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options?: SelectOption[];
  isInvalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, isInvalid, disabled, children, style, className = "", ...props },
  ref
) {
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <select
        ref={ref}
        disabled={disabled}
        aria-invalid={isInvalid}
        style={{
          width: "100%",
          minHeight: "44px",
          padding: "0.625rem 2.25rem 0.625rem 0.875rem",
          borderRadius: "var(--r-md)",
          border: `1px solid ${isInvalid ? "var(--kerb-500)" : "var(--border-control)"}`,
          backgroundColor: "var(--surface)",
          color: "var(--text)",
          fontSize: "0.9375rem",
          lineHeight: 1.4,
          fontFamily: "var(--font-body)",
          boxSizing: "border-box",
          appearance: "none",
          WebkitAppearance: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          ...style,
        }}
        className={`select-input ${className}`}
        {...props}
      >
        {options
          ? options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))
          : children}
      </select>
      <div
        style={{
          position: "absolute",
          right: "0.875rem",
          top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "none",
          color: "var(--text-muted)",
          display: "flex",
          alignItems: "center",
        }}
        aria-hidden="true"
      >
        <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
          <path
            d="M1 1.5L6 6.5L11 1.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
});
