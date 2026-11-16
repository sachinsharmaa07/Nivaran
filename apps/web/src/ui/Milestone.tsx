import React from "react";

/**
 * Milestone marker: a small stone shape with a rounded top cap and a face.
 * Used on timeline nodes, map pins, and issue headers.
 * Never decorative — always carries a status or identifier.
 */
export interface MilestoneProps {
  /** Number or short text shown on the marker face (issue ID fragment, ward number) */
  label?: string | undefined;
  /** Controls cap colour via data-status attribute */
  status?: string | undefined;
  /** Size variant */
  size?: ("sm" | "md" | "lg") | undefined;
  /** Whether to animate the plant (drop 8px and settle) */
  plant?: boolean | undefined;
  className?: string | undefined;
  style?: React.CSSProperties | undefined;
}

export function Milestone({
  label,
  status = "submitted",
  size = "md",
  plant = false,
  className = "",
  style,
}: MilestoneProps): React.JSX.Element {
  const sizeMap = {
    sm: { cap: { w: 20, h: 8 }, body: { w: 20, h: 20 }, font: "0.5rem" },
    md: { cap: { w: 28, h: 12 }, body: { w: 28, h: 28 }, font: "0.6875rem" },
    lg: { cap: { w: 36, h: 14 }, body: { w: 36, h: 36 }, font: "0.875rem" },
  };
  const s = sizeMap[size];

  const capColor = getCapColor(status);

  return (
    <div
      className={`milestone-marker ${plant ? "milestone-plant" : ""} ${className}`}
      data-status={status}
      aria-hidden="true"
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        ...style,
      }}
    >
      <div
        className="milestone-marker-cap"
        style={{
          width: `${s.cap.w}px`,
          height: `${s.cap.h}px`,
          borderRadius: `${s.cap.w / 2}px ${s.cap.w / 2}px 0 0`,
          backgroundColor: capColor,
        }}
      />
      <div
        className="milestone-marker-body"
        style={{
          width: `${s.body.w}px`,
          minHeight: `${s.body.h}px`,
          backgroundColor: "var(--surface)",
          border: "2px solid var(--border)",
          borderTop: "none",
          borderRadius: "0 0 2px 2px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: s.font,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
          color: "var(--text)",
          padding: "2px",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function getCapColor(status: string): string {
  switch (status) {
    case "triaged":
    case "assigned":
      return "var(--water-500)";
    case "in_progress":
      return "var(--paint-400)";
    case "resolved":
      return "var(--sign-500)";
    case "closed":
      return "var(--asphalt-700)";
    case "reopened":
      return "var(--kerb-500)";
    case "submitted":
    default:
      return "var(--asphalt-500)";
  }
}

/** Inline SVG milestone marker for Leaflet map pins with white halo */
export function milestonePinHtml(label: string, status: string, _priorityColor: string): string {
  const capColor = (() => {
    switch (status) {
      case "triaged":
      case "assigned":
        return "#2a78b5";
      case "in_progress":
        return "#f2c21b";
      case "resolved":
        return "#1e9460";
      case "closed":
        return "#39423e";
      case "reopened":
        return "#d13f34";
      default:
        return "#6c7772";
    }
  })();

  return `<div style="
    display:flex;flex-direction:column;align-items:center;
    filter:drop-shadow(0 2px 4px rgba(14,17,16,0.35));
  ">
    <div style="width:22px;height:9px;border-radius:11px 11px 0 0;background:${capColor};"></div>
    <div style="
      width:22px;height:22px;background:#fff;
      border:2px solid #dce1df;border-top:none;border-radius:0 0 2px 2px;
      display:flex;align-items:center;justify-content:center;
      font-family:'Barlow Semi Condensed',sans-serif;font-weight:700;
      font-size:0.5rem;line-height:1;color:#171b1a;
    ">${label}</div>
  </div>`;
}
