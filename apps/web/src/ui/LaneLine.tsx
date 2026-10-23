import React, { useState, useEffect } from "react";

export interface LaneLineLoaderProps {
  delayMs?: number;
  width?: string | number;
  height?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function LaneLineLoader({
  delayMs = 300, // per DESIGN.md §3: loader only after 300 ms
  width = "100%",
  height = 4,
  color = "var(--paint-400)",
  className = "",
  style,
}: LaneLineLoaderProps): React.JSX.Element | null {
  const [visible, setVisible] = useState(delayMs === 0);

  useEffect(() => {
    if (delayMs <= 0) return;
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  if (!visible) return null;

  return (
    <div
      role="progressbar"
      aria-label="Loading"
      className={`lane-line-loader-container ${className}`}
      style={{
        width,
        height: `${height}px`,
        overflow: "hidden",
        position: "relative",
        ...style,
      }}
    >
      <svg
        width="100%"
        height={height}
        preserveAspectRatio="none"
        style={{ display: "block", overflow: "visible" }}
      >
        <line
          x1="0"
          y1={height / 2}
          x2="100%"
          y2={height / 2}
          stroke={color}
          strokeWidth={height}
          strokeDasharray="12 6"
          className="lane-line-loader"
        />
      </svg>
    </div>
  );
}

export interface LaneTimelineProps {
  steps: {
    id: string;
    label: string;
    completed: boolean;
    current?: boolean;
    timestamp?: string | undefined;
    detail?: string | undefined;
  }[];
  vertical?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function LaneTimeline({
  steps,
  vertical = false,
  className = "",
  style,
}: LaneTimelineProps): React.JSX.Element {
  if (vertical) {
    return (
      <div
        className={`lane-timeline-vertical ${className}`}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
          position: "relative",
          paddingLeft: "1.75rem",
          ...style,
        }}
      >
        {/* Continuous lane line connector */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "8px",
            top: "8px",
            bottom: "8px",
            width: "2px",
            borderLeft: "2px dashed var(--border)",
          }}
        />

        {steps.map((step) => {
          const isDone = step.completed;
          const isCurrent = step.current;

          return (
            <div key={step.id} style={{ position: "relative" }}>
              {/* Timeline Node */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: "-1.75rem",
                  top: "2px",
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  backgroundColor: isDone
                    ? "var(--sign-500)"
                    : isCurrent
                      ? "var(--paint-400)"
                      : "var(--surface)",
                  border: `2px solid ${
                    isDone ? "var(--sign-600)" : isCurrent ? "var(--asphalt-900)" : "var(--border)"
                  }`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: isDone ? "#ffffff" : "var(--asphalt-900)",
                  fontSize: "10px",
                  fontWeight: 800,
                  transition: "all var(--dur-base) var(--ease-out)",
                }}
              >
                {isDone ? "✓" : isCurrent ? "•" : ""}
              </div>

              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.9375rem",
                      fontWeight: isCurrent || isDone ? 600 : 500,
                      color: isCurrent || isDone ? "var(--text)" : "var(--text-muted)",
                    }}
                  >
                    {step.label}
                  </span>
                  {step.timestamp && (
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-subtle)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {step.timestamp}
                    </span>
                  )}
                </div>

                {step.detail && (
                  <p
                    style={{
                      margin: "0.25rem 0 0 0",
                      fontSize: "0.8125rem",
                      color: "var(--text-muted)",
                      lineHeight: 1.4,
                    }}
                  >
                    {step.detail}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Horizontal lane line (Wizard progress)
  return (
    <div
      className={`lane-timeline-horizontal ${className}`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        position: "relative",
        ...style,
      }}
    >
      {/* Background dashed road lane line */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "14px",
          left: "16px",
          right: "16px",
          height: "2px",
          borderTop: "2px dashed var(--border)",
          zIndex: 1,
        }}
      />

      {steps.map((step, index) => {
        const isDone = step.completed;
        const isCurrent = step.current;

        return (
          <div
            key={step.id}
            style={{
              position: "relative",
              zIndex: 2,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.375rem",
              flex: 1,
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                backgroundColor: isDone
                  ? "var(--sign-500)"
                  : isCurrent
                    ? "var(--cta)"
                    : "var(--surface)",
                border: `2px solid ${
                  isDone ? "var(--sign-600)" : isCurrent ? "var(--asphalt-900)" : "var(--border)"
                }`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: isDone ? "#ffffff" : isCurrent ? "var(--on-cta)" : "var(--text-subtle)",
                fontSize: "0.8125rem",
                fontWeight: 700,
                transition: "all var(--dur-base) var(--ease-out)",
              }}
            >
              {isDone ? "✓" : index + 1}
            </div>

            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: isCurrent || isDone ? 600 : 500,
                color: isCurrent ? "var(--text)" : "var(--text-subtle)",
                textAlign: "center",
                whiteSpace: "nowrap",
              }}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
