import React, { useState, type ReactNode } from "react";

export interface SheetProps {
  isOpen?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  title?: ReactNode;
  headerAction?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Sheet({
  isOpen = true,
  expanded = false,
  onToggleExpand,
  title,
  headerAction,
  children,
  className = "",
  style,
}: SheetProps): React.JSX.Element | null {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = onToggleExpand ? expanded : internalExpanded;
  const toggle = onToggleExpand ? onToggleExpand : () => setInternalExpanded((prev) => !prev);

  if (!isOpen) return null;

  return (
    <aside
      className={`nivaran-sheet ${className}`}
      aria-label="Issues panel"
      style={{
        zIndex: 20,
        backgroundColor: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      <style>{`
        @media (max-width: 768px) {
          .nivaran-sheet {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            border-top: 1px solid var(--border);
            border-top-left-radius: var(--r-sheet);
            border-top-right-radius: var(--r-sheet);
            box-shadow: var(--shadow-overlay);
            max-height: ${isExpanded ? "82dvh" : "210px"};
            transition: max-height var(--dur-base) var(--ease-out);
            padding: 0.75rem 1rem 1rem 1rem;
          }
          .sheet-drag-handle {
            display: block;
          }
        }
        @media (min-width: 769px) {
          .nivaran-sheet {
            position: absolute;
            top: 0;
            left: 0;
            bottom: 0;
            width: 380px;
            border-right: 1px solid var(--border);
            box-shadow: 2px 0 12px rgba(14, 17, 16, 0.08);
            padding: 1.25rem;
            max-height: 100%;
          }
          .sheet-drag-handle {
            display: none;
          }
        }
      `}</style>

      {/* Drag handle for mobile */}
      <div
        className="sheet-drag-handle"
        onClick={toggle}
        role="button"
        tabIndex={0}
        aria-label={isExpanded ? "Collapse sheet" : "Expand sheet"}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        style={{
          width: "40px",
          height: "4px",
          backgroundColor: "var(--asphalt-300)",
          borderRadius: "2px",
          margin: "0 auto 0.75rem auto",
          cursor: "pointer",
          flexShrink: 0,
        }}
      />

      {/* Sheet Header */}
      {(title || headerAction) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            marginBottom: "0.75rem",
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>{title}</div>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}

      {/* Scrollable sheet body */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        {children}
      </div>
    </aside>
  );
}
