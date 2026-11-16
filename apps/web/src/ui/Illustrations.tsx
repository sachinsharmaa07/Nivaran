import React from "react";

/**
 * Three small hand-coded line illustrations for empty list, success and 404,
 * built from the lane line, a milestone and a manhole cover.
 * No stock images, no gradients, no glow.
 */

/** Empty list: a dashed lane line leading to a milestone stone with "0" */
export function IllustrationEmptyList({
  size = 120,
  className = "",
}: {
  size?: number;
  className?: string;
}): React.JSX.Element {
  const scale = size / 120;
  return (
    <svg
      width={size}
      height={size * 0.75}
      viewBox="0 0 120 90"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Dashed lane line */}
      <line
        x1="10"
        y1="68"
        x2="65"
        y2="68"
        stroke="var(--border)"
        strokeWidth={2 / scale}
        strokeDasharray="8 4"
        strokeLinecap="round"
      />
      {/* Milestone stone */}
      <rect
        x="70"
        y="38"
        width="28"
        height="32"
        rx="1"
        fill="var(--surface)"
        stroke="var(--border)"
        strokeWidth="2"
      />
      <path d="M70 38 h28" stroke="var(--border)" strokeWidth="2" />
      <path
        d="M71 38 A13 13 0 0 1 97 38"
        fill="var(--asphalt-400)"
        stroke="var(--border)"
        strokeWidth="2"
      />
      {/* "0" on the stone face */}
      <text
        x="84"
        y="58"
        textAnchor="middle"
        fill="var(--text-muted)"
        fontFamily="var(--font-display)"
        fontWeight="700"
        fontSize="14"
      >
        0
      </text>
    </svg>
  );
}

/** Success: a milestone with a checkmark on top and a painted yellow line */
export function IllustrationSuccess({
  size = 120,
  className = "",
}: {
  size?: number;
  className?: string;
}): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size * 0.75}
      viewBox="0 0 120 90"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Yellow road paint line */}
      <line
        x1="10"
        y1="70"
        x2="110"
        y2="70"
        stroke="var(--paint-400)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Milestone stone */}
      <rect
        x="46"
        y="30"
        width="28"
        height="32"
        rx="1"
        fill="var(--surface)"
        stroke="var(--border)"
        strokeWidth="2"
      />
      <path
        d="M47 30 A13 13 0 0 1 73 30"
        fill="var(--sign-500)"
        stroke="var(--sign-600)"
        strokeWidth="2"
      />
      {/* Checkmark */}
      <polyline
        points="54,48 58,54 66,42"
        stroke="var(--sign-500)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/** 404: a manhole cover (circle with grate) and a broken lane line */
export function Illustration404({
  size = 120,
  className = "",
}: {
  size?: number;
  className?: string;
}): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size * 0.75}
      viewBox="0 0 120 90"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Broken lane line */}
      <line
        x1="10"
        y1="68"
        x2="38"
        y2="68"
        stroke="var(--border)"
        strokeWidth="2"
        strokeDasharray="8 4"
        strokeLinecap="round"
      />
      <line
        x1="82"
        y1="68"
        x2="110"
        y2="68"
        stroke="var(--border)"
        strokeWidth="2"
        strokeDasharray="8 4"
        strokeLinecap="round"
      />
      {/* Manhole cover */}
      <circle
        cx="60"
        cy="50"
        r="20"
        fill="var(--surface-sunken)"
        stroke="var(--border)"
        strokeWidth="2"
      />
      <line x1="47" y1="44" x2="73" y2="44" stroke="var(--border)" strokeWidth="1.5" />
      <line x1="47" y1="50" x2="73" y2="50" stroke="var(--border)" strokeWidth="1.5" />
      <line x1="47" y1="56" x2="73" y2="56" stroke="var(--border)" strokeWidth="1.5" />
      <circle cx="60" cy="50" r="8" fill="none" stroke="var(--border)" strokeWidth="1.5" />
      {/* 404 text */}
      <text
        x="60"
        y="53"
        textAnchor="middle"
        fill="var(--text-subtle)"
        fontFamily="var(--font-display)"
        fontWeight="700"
        fontSize="8"
      >
        404
      </text>
    </svg>
  );
}
