import React from "react";

export type PriorityLevel = "critical" | "high" | "medium" | "low" | string;

export interface PriorityMeterProps {
  priority: PriorityLevel | number;
  showWord?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function PriorityMeter({
  priority,
  showWord = true,
  className = "",
  style,
}: PriorityMeterProps): React.JSX.Element {
  let level = "low";
  let filledBars = 1;

  if (typeof priority === "number") {
    if (priority >= 80) {
      level = "critical";
      filledBars = 4;
    } else if (priority >= 60) {
      level = "high";
      filledBars = 3;
    } else if (priority >= 35) {
      level = "medium";
      filledBars = 2;
    } else {
      level = "low";
      filledBars = 1;
    }
  } else {
    const norm = (priority || "low").toLowerCase();
    if (norm === "critical") {
      level = "critical";
      filledBars = 4;
    } else if (norm === "high") {
      level = "high";
      filledBars = 3;
    } else if (norm === "medium") {
      level = "medium";
      filledBars = 2;
    } else {
      level = "low";
      filledBars = 1;
    }
  }

  const getColor = (): string => {
    switch (level) {
      case "critical":
        return "var(--kerb-500)";
      case "high":
        return "var(--signal-500)";
      case "medium":
        return "var(--paint-500)";
      case "low":
      default:
        return "var(--asphalt-500)";
    }
  };

  const word = level.charAt(0).toUpperCase() + level.slice(1);
  const color = getColor();

  return (
    <div
      className={`priority-meter ${className}`}
      aria-label={`Priority: ${word}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        ...style,
      }}
    >
      {/* 4 distinct vertical bars */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "2px",
          height: "14px",
        }}
        aria-hidden="true"
      >
        {[1, 2, 3, 4].map((barIndex) => {
          const isFilled = barIndex <= filledBars;
          const barHeight = 5 + barIndex * 2.5; // stepped height 7.5px, 10px, 12.5px, 15px
          return (
            <div
              key={barIndex}
              style={{
                width: "3px",
                height: `${barHeight}px`,
                backgroundColor: isFilled ? color : "var(--border)",
                borderRadius: "1px",
                transition: "background-color var(--dur-fast) var(--ease-out)",
              }}
            />
          );
        })}
      </div>

      {showWord && (
        <span
          style={{
            fontSize: "0.8125rem",
            fontWeight: 600,
            color: "var(--text)",
            lineHeight: 1,
            letterSpacing: "0.01em",
          }}
        >
          {word}
        </span>
      )}
    </div>
  );
}
