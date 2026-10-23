import { forwardRef, type InputHTMLAttributes } from "react";

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  isInvalid?: boolean | undefined;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { isInvalid, disabled, style, className = "", ...props },
  ref
) {
  return (
    <input
      ref={ref}
      disabled={disabled}
      aria-invalid={isInvalid}
      style={{
        width: "100%",
        minHeight: "44px",
        padding: "0.625rem 0.875rem",
        borderRadius: "var(--r-md)",
        border: `1px solid ${isInvalid ? "var(--kerb-500)" : "var(--border-control)"}`,
        backgroundColor: "var(--surface)",
        color: "var(--text)",
        fontSize: "0.9375rem",
        lineHeight: 1.4,
        fontFamily: "var(--font-body)",
        boxSizing: "border-box",
        transition: "border-color var(--dur-fast) var(--ease-out)",
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? "not-allowed" : "text",
        ...style,
      }}
      className={`text-input ${className}`}
      {...props}
    />
  );
});
