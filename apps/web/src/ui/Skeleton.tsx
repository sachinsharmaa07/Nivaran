import React from "react";

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({
  width = "100%",
  height = "20px",
  borderRadius = "var(--r-sm)",
  className = "",
  style,
}: SkeletonProps): React.JSX.Element {
  return (
    <div
      className={`nivaran-skeleton ${className}`}
      aria-hidden="true"
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: "var(--surface-sunken)",
        border: "1px solid var(--border)",
        ...style,
      }}
    >
      <style>{`
        @keyframes skeletonPulse {
          0%, 100% {
            opacity: 0.6;
          }
          50% {
            opacity: 1;
          }
        }
        .nivaran-skeleton {
          animation: skeletonPulse 1.4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .nivaran-skeleton {
            animation: none !important;
            opacity: 0.7;
          }
        }
      `}</style>
    </div>
  );
}
