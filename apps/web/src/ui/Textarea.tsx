import { forwardRef, type TextareaHTMLAttributes } from "react";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  isInvalid?: boolean | undefined;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { isInvalid, disabled, rows = 3, style, className = "", ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      disabled={disabled}
      rows={rows}
      aria-invalid={isInvalid}
      style={{
        width: "100%",
        minHeight: "88px",
        padding: "0.625rem 0.875rem",
        borderRadius: "var(--r-md)",
        border: `1px solid ${isInvalid ? "var(--kerb-500)" : "var(--border-control)"}`,
        backgroundColor: "var(--surface)",
        color: "var(--text)",
        fontSize: "0.9375rem",
        lineHeight: 1.5,
        fontFamily: "var(--font-body)",
        resize: "vertical",
        boxSizing: "border-box",
        transition: "border-color var(--dur-fast) var(--ease-out)",
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? "not-allowed" : "text",
        ...style,
      }}
      className={`textarea-input ${className}`}
      {...props}
    />
  );
});
