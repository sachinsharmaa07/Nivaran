import React from "react";
import {
  CircleDashed,
  UserCheck,
  Construction,
  Check,
  CircleCheck,
  RotateCcw,
  Copy,
  Ban,
  Clock,
} from "lucide-react";

export type IssueStatus =
  | "submitted"
  | "triaged"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "closed"
  | "reopened"
  | "duplicate"
  | "rejected"
  | string;

export interface StatusChipProps {
  status: IssueStatus;
  label?: string | undefined;
  className?: string;
  style?: React.CSSProperties;
}

interface StatusMeta {
  label: string;
  ramp: "asphalt" | "water" | "paint" | "sign" | "kerb" | "signal";
  Icon: React.ComponentType<{
    size?: number;
    strokeWidth?: number;
    className?: string;
    "aria-hidden"?: boolean | "true" | "false";
  }>;
  dashedBorder?: boolean;
}

const STATUS_METAS: Record<string, StatusMeta> = {
  submitted: {
    label: "Submitted",
    ramp: "asphalt",
    Icon: CircleDashed,
  },
  triaged: {
    label: "Triaged",
    ramp: "water",
    Icon: UserCheck,
  },
  assigned: {
    label: "Assigned",
    ramp: "water",
    Icon: UserCheck,
  },
  in_progress: {
    label: "In progress",
    ramp: "paint",
    Icon: Construction,
  },
  resolved: {
    label: "Resolved",
    ramp: "sign",
    Icon: Check,
  },
  closed: {
    label: "Closed",
    ramp: "asphalt",
    Icon: CircleCheck,
  },
  reopened: {
    label: "Reopened",
    ramp: "kerb",
    Icon: RotateCcw,
  },
  duplicate: {
    label: "Duplicate",
    ramp: "asphalt",
    Icon: Copy,
    dashedBorder: true,
  },
  rejected: {
    label: "Rejected",
    ramp: "asphalt",
    Icon: Ban,
  },
};

export function StatusChip({
  status,
  label,
  className = "",
  style,
}: StatusChipProps): React.JSX.Element {
  const normStatus = (status || "submitted").toLowerCase();
  const meta: StatusMeta = STATUS_METAS[normStatus] || {
    label: status,
    ramp: "asphalt",
    Icon: Clock,
    dashedBorder: false,
  };

  const displayLabel = label || meta.label;
  const { ramp, Icon, dashedBorder } = meta;

  const bgVar = `var(--chip-bg-${ramp})`;
  const textVar = `var(--chip-text-${ramp})`;
  const borderVar = `var(--chip-border-${ramp})`;

  return (
    <span
      className={`status-chip status-${normStatus} ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.375rem",
        padding: "0.25rem 0.5rem",
        borderRadius: "var(--r-sm)",
        fontSize: "0.75rem",
        fontWeight: 600,
        lineHeight: 1.2,
        letterSpacing: "0.01em",
        backgroundColor: bgVar,
        color: textVar,
        border: `${dashedBorder ? "1px dashed" : "1px solid"} ${borderVar}`,
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
        ...style,
      }}
    >
      <Icon size={13} strokeWidth={1.75} aria-hidden={true} />
      <span>{displayLabel}</span>
    </span>
  );
}
