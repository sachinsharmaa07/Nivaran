import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { Undo2, X } from "lucide-react";

export interface ToastItem {
  id: string;
  message: string;
  variant?: "info" | "success" | "warning" | "error";
  onUndo?: (() => void) | undefined;
  durationMs?: number;
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastItem, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newToast: ToastItem = {
      id,
      durationMs: toast.onUndo ? 8000 : 4500, // 8s for undo per DESIGN.md §8
      ...toast,
    };

    setToasts((prev) => [...prev, newToast]);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      {/* Toast viewport container at bottom-right / bottom-center */}
      <div
        aria-live="polite"
        role="region"
        aria-label="Notifications"
        style={{
          position: "fixed",
          bottom: "1.25rem",
          right: "1.25rem",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          maxWidth: "420px",
          width: "calc(100% - 2.5rem)",
          pointerEvents: "none",
        }}
      >
        {toasts.map((toast) => (
          <SingleToast key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function SingleToast({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: () => void;
}): React.JSX.Element {
  useEffect(() => {
    const timer = setTimeout(onDismiss, toast.durationMs ?? 4500);
    return () => clearTimeout(timer);
  }, [toast.durationMs, onDismiss]);

  const handleUndo = () => {
    if (toast.onUndo) {
      toast.onUndo();
    }
    onDismiss();
  };

  const getBorderColor = () => {
    switch (toast.variant) {
      case "success":
        return "var(--sign-500)";
      case "error":
        return "var(--kerb-500)";
      case "warning":
        return "var(--signal-500)";
      default:
        return "var(--border)";
    }
  };

  return (
    <div
      role="status"
      className="toast-item"
      style={{
        pointerEvents: "auto",
        backgroundColor: "var(--surface-raised)",
        color: "var(--text)",
        border: `1px solid ${getBorderColor()}`,
        borderRadius: "var(--r-md)",
        padding: "0.75rem 1rem",
        boxShadow: "var(--shadow-overlay)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
        fontSize: "0.875rem",
        lineHeight: 1.4,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 500 }}>{toast.message}</p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", flexShrink: 0 }}>
        {toast.onUndo && (
          <button
            type="button"
            onClick={handleUndo}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.25rem",
              background: "var(--surface-sunken)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)",
              padding: "0.25rem 0.5rem",
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "var(--text)",
              cursor: "pointer",
              minHeight: "32px",
            }}
          >
            <Undo2 size={13} strokeWidth={1.75} aria-hidden={true} />
            <span>Undo</span>
          </button>
        )}

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          style={{
            background: "none",
            border: "none",
            color: "var(--text-subtle)",
            cursor: "pointer",
            padding: "0.25rem",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "32px",
            minWidth: "32px",
          }}
        >
          <X size={14} strokeWidth={1.75} aria-hidden={true} />
        </button>
      </div>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback if rendered outside provider
    return {
      showToast: (t) => console.log("[Toast]", t.message),
      removeToast: () => undefined,
    };
  }
  return ctx;
}
