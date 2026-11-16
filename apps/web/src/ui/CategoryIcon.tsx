import React from "react";

/**
 * CategoryIcon: custom 24px stroke icons (1.75 stroke, round caps)
 * hand-coded as inline SVG for civic categories in one consistent style.
 * Use lucide only for generic UI controls.
 */
export type CivicCategory =
  | "pothole"
  | "garbage"
  | "streetlight"
  | "water_leak"
  | "drain"
  | "road_damage"
  | "other";

export interface CategoryIconProps {
  category: string;
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

const CATEGORY_MAP: Record<string, CivicCategory> = {
  road_pothole: "pothole",
  pothole: "pothole",
  waste_overflow: "garbage",
  garbage: "garbage",
  sanitation: "garbage",
  street_light: "streetlight",
  streetlight: "streetlight",
  electrical: "streetlight",
  water_leakage: "water_leak",
  water_leak: "water_leak",
  water: "water_leak",
  drain: "drain",
  drainage: "drain",
  sewage: "drain",
  road_damage: "road_damage",
  road: "road_damage",
};

export function CategoryIcon({
  category,
  size = 24,
  color = "currentColor",
  className = "",
  style,
}: CategoryIconProps): React.JSX.Element {
  const cat = CATEGORY_MAP[category.toLowerCase()] || "other";

  const svgProps = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    style,
    "aria-hidden": true as const,
  };

  switch (cat) {
    case "pothole":
      // Irregular oval crater with depth lines
      return (
        <svg {...svgProps}>
          <ellipse cx="12" cy="14" rx="7" ry="4" />
          <path d="M7 14c1-2 3-3 5-3s4 1 5 3" />
          <path d="M9 12v-2" />
          <path d="M15 12v-2" />
        </svg>
      );
    case "garbage":
      // Open bin with overflow lines
      return (
        <svg {...svgProps}>
          <path d="M6 8h12l-1.5 12H7.5L6 8z" />
          <path d="M4 8h16" />
          <path d="M9 8V6h6v2" />
          <path d="M8 5l-1-2" />
          <path d="M16 5l1-2" />
          <path d="M12 4v-1.5" />
        </svg>
      );
    case "streetlight":
      // Lamp post with light cone
      return (
        <svg {...svgProps}>
          <path d="M12 22v-14" />
          <path d="M12 8h4l1-3h-5" />
          <path d="M14 8l3 6" />
          <path d="M10 8l-3 6" />
          <circle cx="16" cy="5" r="1.5" />
        </svg>
      );
    case "water_leak":
      // Pipe with drip
      return (
        <svg {...svgProps}>
          <path d="M4 10h7" />
          <path d="M13 10h7" />
          <path d="M11 10v2c0 1-1 2-1 3s1 2 2 2 2-1 2-2-1-2-1-3v-2" />
          <circle cx="12" cy="20" r="1" />
        </svg>
      );
    case "drain":
      // Manhole cover with grate lines
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="8" />
          <path d="M8 9h8" />
          <path d="M8 12h8" />
          <path d="M8 15h8" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "road_damage":
      // Cracked road surface
      return (
        <svg {...svgProps}>
          <path d="M3 19h18" />
          <path d="M5 19v-6l3-2 2 3 4-5 3 4 2-2v8" />
          <path d="M10 14l1-3" />
          <path d="M14 11l-1 2" />
        </svg>
      );
    case "other":
    default:
      // Generic civic issue marker
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v5" />
          <circle cx="12" cy="16" r="0.5" fill={color} stroke="none" />
        </svg>
      );
  }
}
