import React, { useRef, useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string | undefined;
  children: ReactNode;
  maxWidth?: string;
}

export function Dialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = "520px",
}: DialogProps): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      previouslyFocusedElement.current = document.activeElement as HTMLElement;
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
      if (previouslyFocusedElement.current) {
        previouslyFocusedElement.current.focus();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };

    const handleClickBackdrop = (e: MouseEvent) => {
      const rect = dialog.getBoundingClientRect();
      const isInDialog =
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width;
      if (!isInDialog) {
        onClose();
      }
    };

    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("click", handleClickBackdrop);
    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("click", handleClickBackdrop);
    };
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      style={{
        width: "100%",
        maxWidth,
        margin: "auto",
        backgroundColor: "var(--surface-raised)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-overlay)",
        padding: 0,
        overflow: "hidden",
      }}
      aria-labelledby="dialog-title"
      aria-describedby={description ? "dialog-description" : undefined}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1rem 1.25rem",
          borderBottom: "1px solid var(--border)",
          backgroundColor: "var(--surface)",
        }}
      >
        <div>
          <h2
            id="dialog-title"
            style={{
              margin: 0,
              fontSize: "1.25rem",
              fontWeight: 600,
              color: "var(--text)",
            }}
          >
            {title}
          </h2>
          {description && (
            <p
              id="dialog-description"
              style={{
                margin: "0.25rem 0 0 0",
                fontSize: "0.8125rem",
                color: "var(--text-muted)",
              }}
            >
              {description}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          style={{
            background: "none",
            border: "none",
            color: "var(--text-subtle)",
            cursor: "pointer",
            width: "44px",
            height: "44px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "var(--r-sm)",
          }}
        >
          <X size={18} strokeWidth={1.75} aria-hidden={true} />
        </button>
      </div>

      <div style={{ padding: "1.25rem", maxHeight: "calc(85vh - 80px)", overflowY: "auto" }}>
        {children}
      </div>
    </dialog>
  );
}
