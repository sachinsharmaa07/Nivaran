import React, { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router";
import { Inbox, Map as MapIcon, Users, Settings, Search, X } from "lucide-react";
import { useTranslation } from "../utils/i18n.js";
import { useAuth } from "../utils/authContext.js";
import type { TenantInfo } from "../components/CityPicker.js";
import {
  Button,
  TextInput,
  Select,
  StatusChip,
  PriorityMeter,
  LaneTimeline,
  Skeleton,
  EmptyState,
  ErrorState,
  useToast,
} from "../ui/index.js";

interface PriorityFactorDetail {
  raw?: number;
  weight?: number;
  contribution?: number;
}

interface IssueItem {
  publicId: string;
  status: string;
  description: string;
  category?: {
    code: string;
    name?: string;
    names?: Record<string, string>;
    evidenceRequired?: boolean;
  };
  department?: { id: string; code: string; name: string };
  location?: { coordinates: [number, number]; wardId?: string };
  landmark?: string;
  pincode?: string;
  severity: number;
  slaPolicy?: { resolveHours?: number; resolveBy?: string };
  duplicateOf?: string;
  duplicates?: { secondaryId: string; mergedAt: string }[];
  priority?: {
    breakdown?: {
      score?: number;
      level?: string;
      safety?: PriorityFactorDetail;
      severity?: PriorityFactorDetail;
      facility?: PriorityFactorDetail;
      reporters?: PriorityFactorDetail;
      age?: PriorityFactorDetail;
      slaPressure?: PriorityFactorDetail;
    };
    override?: {
      score?: number;
      level?: string;
      reason: string;
      byUserId?: string;
      at?: string;
    };
  };
  createdAt: string;
}

interface AuditEvent {
  seq: number;
  event: string;
  actor: { userId: string; role: string };
  payload: Record<string, unknown>;
  at: string;
}

interface Department {
  id: string;
  code: string;
  name: string;
}

interface Ward {
  id: string;
  ward_number: string;
  name: string;
}

// State machine allowed transitions for staff
const ALLOWED_STAFF_TRANSITIONS: Record<string, string[]> = {
  submitted: ["triaged", "in_progress", "rejected", "duplicate"],
  triaged: ["assigned", "in_progress", "rejected", "duplicate"],
  assigned: ["in_progress", "rejected", "duplicate"],
  in_progress: ["resolved", "rejected", "duplicate"],
  resolved: [], // citizen verifies
  closed: [],
  reopened: ["assigned", "in_progress", "rejected"],
  duplicate: ["submitted"], // unmerge
  rejected: [],
};

export function StaffQueuePage({ tenant }: { tenant: TenantInfo }): React.JSX.Element {
  const { locale } = useTranslation();
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters from URL search params
  const statusFilter = searchParams.get("status") || "";
  const deptFilter = searchParams.get("dept") || "";
  const wardFilter = searchParams.get("ward") || "";
  const searchQuery = searchParams.get("q") || "";
  const selectedPublicId = searchParams.get("issue") || "";

  const [issues, setIssues] = useState<IssueItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [flashingIssueId, setFlashingIssueId] = useState<string | null>(null);

  // Selected issue detail
  const [selectedIssue, setSelectedIssue] = useState<IssueItem | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Detail panel action inputs
  const [overrideScore, setOverrideScore] = useState<string>("");
  const [overrideReason, setOverrideReason] = useState<string>("");
  const [resolutionNote, setResolutionNote] = useState<string>("");
  const [resolutionEvidenceKey, setResolutionEvidenceKey] = useState<string>("");
  const [rejectionReason, setRejectionReason] = useState<string>("");
  const [selectedRouteDept, setSelectedRouteDept] = useState<string>("");
  const [mergeTargetId, setMergeTargetId] = useState<string>("");

  const updateFilters = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setSearchParams(next);
  };

  const selectIssue = (publicId: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (publicId) {
      next.set("issue", publicId);
    } else {
      next.delete("issue");
    }
    setSearchParams(next);
  };

  const fetchIssues = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const params = new URLSearchParams();
      params.set("tenant_slug", tenant.slug);
      if (statusFilter) params.set("status", statusFilter);
      if (deptFilter) params.set("department_id", deptFilter);
      if (wardFilter) params.set("ward_id", wardFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      params.set("limit", "100");

      const res = await authFetch(`/api/v1/issues?${params.toString()}`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error("403 Forbidden: Staff credentials required to view queue.");
        }
        throw new Error("Could not load queue issues from municipal API.");
      }
      const data = await res.json();
      const loadedIssues = (data.data || []) as IssueItem[];

      // Sort by priority descending (override score takes precedence)
      loadedIssues.sort((a, b) => {
        const scoreA = a.priority?.override?.score ?? a.priority?.breakdown?.score ?? 0;
        const scoreB = b.priority?.override?.score ?? b.priority?.breakdown?.score ?? 0;
        return scoreB - scoreA;
      });

      setIssues(loadedIssues);

      // Keep selected issue in sync
      if (selectedPublicId) {
        const match = loadedIssues.find((i) => i.publicId === selectedPublicId);
        if (match) {
          setSelectedIssue(match);
        }
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Load departments and wards for filters
  useEffect(() => {
    authFetch("/api/v1/admin/departments")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { data?: Department[] } | null) => {
        if (data?.data) setDepartments(data.data);
      })
      .catch(() => undefined);

    authFetch("/api/v1/admin/wards")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { data?: Ward[] } | null) => {
        if (data?.data) setWards(data.data);
      })
      .catch(() => undefined);
  }, [tenant.id]);

  useEffect(() => {
    void fetchIssues();
  }, [tenant.slug, statusFilter, deptFilter, wardFilter, searchQuery]);

  // Load detail & audit trail when selected issue changes
  useEffect(() => {
    if (!selectedPublicId) {
      setSelectedIssue(null);
      setAuditEvents([]);
      return;
    }

    setDetailLoading(true);
    authFetch(`/api/v1/issues/${selectedPublicId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { data?: IssueItem } | null) => {
        if (data?.data) {
          setSelectedIssue(data.data);
        }
      })
      .catch(() => undefined);

    authFetch(`/api/v1/issues/${selectedPublicId}/audit`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { data?: { events?: AuditEvent[] } } | null) => {
        if (data?.data?.events) {
          setAuditEvents(data.data.events);
        }
      })
      .catch(() => undefined)
      .finally(() => setDetailLoading(false));
  }, [selectedPublicId]);

  // ACTION: Override priority
  const handleOverridePriority = async () => {
    if (!selectedIssue) return;
    const scoreNum = parseFloat(overrideScore);
    if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
      showToast({ message: "Score must be a number between 0 and 100", variant: "warning" });
      return;
    }
    if (!overrideReason.trim()) {
      showToast({
        message: "Mandatory justification reason required for override",
        variant: "warning",
      });
      return;
    }

    setActionLoading(true);
    try {
      const res = await authFetch(`/api/v1/issues/${selectedIssue.publicId}/override-priority`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: scoreNum, reason: overrideReason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Override failed");
      }
      setFlashingIssueId(selectedIssue.publicId);
      setTimeout(() => setFlashingIssueId(null), 1200);

      showToast({
        message: `Priority overridden to ${scoreNum} for ${selectedIssue.publicId}`,
        variant: "success",
      });
      setOverrideScore("");
      setOverrideReason("");
      void fetchIssues();
    } catch (err: unknown) {
      showToast({
        message: err instanceof Error ? err.message : "Error overriding priority",
        variant: "error",
      });
    } finally {
      setActionLoading(false);
    }
  };

  // ACTION: Transition status
  const handleTransition = async (toStatus: string) => {
    if (!selectedIssue) return;

    if (toStatus === "rejected" && !rejectionReason.trim()) {
      showToast({ message: "Please provide a rejection reason", variant: "warning" });
      return;
    }

    if (
      toStatus === "resolved" &&
      selectedIssue.category?.evidenceRequired &&
      !resolutionEvidenceKey.trim()
    ) {
      showToast({
        message: "Resolution evidence key is required for this category",
        variant: "warning",
      });
      return;
    }

    setActionLoading(true);
    try {
      const body: Record<string, unknown> = {
        to: toStatus,
        note: resolutionNote.trim() || undefined,
        rejection_reason: rejectionReason.trim() || undefined,
        evidence_keys: resolutionEvidenceKey.trim() ? [resolutionEvidenceKey.trim()] : undefined,
      };

      const res = await authFetch(`/api/v1/issues/${selectedIssue.publicId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Transition forbidden");
      }

      showToast({
        message: `Status moved to ${toStatus} for ${selectedIssue.publicId}`,
        variant: "success",
      });
      setResolutionNote("");
      setResolutionEvidenceKey("");
      setRejectionReason("");
      void fetchIssues();
    } catch (err: unknown) {
      showToast({
        message: err instanceof Error ? err.message : "Error transitioning issue",
        variant: "error",
      });
    } finally {
      setActionLoading(false);
    }
  };

  // ACTION: Route department
  const handleRouteDepartment = async () => {
    if (!selectedIssue || !selectedRouteDept) return;
    setActionLoading(true);
    try {
      const res = await authFetch(`/api/v1/issues/${selectedIssue.publicId}/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department_id: selectedRouteDept }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Routing failed");
      }
      showToast({ message: "Department routed successfully", variant: "success" });
      void fetchIssues();
    } catch (err: unknown) {
      showToast({
        message: err instanceof Error ? err.message : "Error routing",
        variant: "error",
      });
    } finally {
      setActionLoading(false);
    }
  };

  // ACTION: Merge duplicate
  const handleMerge = async () => {
    if (!selectedIssue || !mergeTargetId.trim()) return;
    setActionLoading(true);
    try {
      const res = await authFetch(`/api/v1/issues/${selectedIssue.publicId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duplicateOf: mergeTargetId.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Merge failed");
      }
      showToast({
        message: `Merged ${selectedIssue.publicId} into ${mergeTargetId.trim()}`,
        variant: "success",
      });
      setMergeTargetId("");
      void fetchIssues();
    } catch (err: unknown) {
      showToast({
        message: err instanceof Error ? err.message : "Error merging",
        variant: "error",
      });
    } finally {
      setActionLoading(false);
    }
  };

  // ACTION: Unmerge
  const handleUnmerge = async () => {
    if (!selectedIssue) return;
    setActionLoading(true);
    try {
      const res = await authFetch(`/api/v1/issues/${selectedIssue.publicId}/unmerge`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Unmerge failed");
      }
      showToast({ message: `Unmerged ${selectedIssue.publicId}`, variant: "success" });
      void fetchIssues();
    } catch (err: unknown) {
      showToast({
        message: err instanceof Error ? err.message : "Error unmerging",
        variant: "error",
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Format time remaining until SLA deadline
  const formatSlaRemaining = (issue: IssueItem): { text: string; breached: boolean } => {
    if (!issue.slaPolicy?.resolveBy && !issue.slaPolicy?.resolveHours) {
      return { text: "No SLA", breached: false };
    }

    const deadlineMs = issue.slaPolicy?.resolveBy
      ? new Date(issue.slaPolicy.resolveBy).getTime()
      : new Date(issue.createdAt).getTime() + (issue.slaPolicy.resolveHours || 48) * 3600 * 1000;

    const diffHours = (deadlineMs - Date.now()) / (3600 * 1000);
    if (diffHours < 0) {
      const overdueH = Math.abs(Math.round(diffHours));
      return { text: `Overdue by ${overdueH}h`, breached: true };
    }
    if (diffHours < 24) {
      return { text: `${Math.round(diffHours)}h remaining`, breached: false };
    }
    const days = Math.round(diffHours / 24);
    return { text: `${days}d remaining`, breached: false };
  };

  const allowedMoves = selectedIssue ? ALLOWED_STAFF_TRANSITIONS[selectedIssue.status] || [] : [];

  return (
    <div
      style={{
        display: "flex",
        height: "calc(100dvh - 56px)",
        backgroundColor: "var(--bg)",
        overflow: "hidden",
      }}
    >
      <style>{`
        .staff-layout {
          display: flex;
          width: 100%;
          height: 100%;
        }
        .staff-left-rail {
          width: 64px;
          border-right: 1px solid var(--border);
          background-color: var(--surface);
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 1rem 0;
          gap: 1.25rem;
          flex-shrink: 0;
        }
        .staff-content-area {
          flex: 1;
          display: flex;
          min-width: 0;
          height: 100%;
          overflow: hidden;
        }
        .staff-table-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          padding: 1.25rem;
          min-width: 0;
        }
        .staff-detail-panel {
          width: 420px;
          border-left: 1px solid var(--border);
          background-color: var(--surface-raised);
          overflow-y: auto;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          flex-shrink: 0;
          transition: width var(--dur-base) var(--ease-out);
        }
        @media (max-width: 1024px) {
          .staff-detail-panel {
            position: fixed;
            top: 56px;
            right: 0;
            bottom: 0;
            width: min(100vw, 420px);
            z-index: 50;
            box-shadow: var(--shadow-overlay);
          }
        }
        @media (max-width: 640px) {
          .staff-left-rail {
            display: none;
          }
          .staff-table-panel {
            padding: 0.75rem;
          }
          .queue-table thead {
            display: none;
          }
          .queue-table, .queue-table tbody, .queue-table tr, .queue-table td {
            display: block;
            width: 100%;
          }
          .queue-table tr {
            margin-bottom: 0.75rem;
            border: 1px solid var(--border);
            border-radius: var(--r-md);
            padding: 0.75rem;
            background-color: var(--surface);
          }
          .queue-table td {
            padding: 0.25rem 0;
            border: none;
          }
        }
        @keyframes flashTint {
          0% { background-color: var(--paint-100); }
          100% { background-color: transparent; }
        }
        .row-flashing {
          animation: flashTint 1.2s ease-out;
        }
      `}</style>

      {/* 1. Left Rail (Queue, Map, Team, Admin) */}
      <aside className="staff-left-rail" aria-label="Staff Navigation Rail">
        <Link
          to="/queue"
          className="touch-target"
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "var(--r-md)",
            backgroundColor: "var(--surface-sunken)",
            color: "var(--primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--border)",
          }}
          title="Queue"
        >
          <Inbox size={20} strokeWidth={1.75} aria-hidden={true} />
        </Link>

        <Link
          to="/"
          className="touch-target"
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "var(--r-md)",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Map"
        >
          <MapIcon size={20} strokeWidth={1.75} aria-hidden={true} />
        </Link>

        <Link
          to="/admin?tab=staff"
          className="touch-target"
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "var(--r-md)",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Team & Staff"
        >
          <Users size={20} strokeWidth={1.75} aria-hidden={true} />
        </Link>

        <Link
          to="/admin"
          className="touch-target"
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "var(--r-md)",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Admin Settings"
        >
          <Settings size={20} strokeWidth={1.75} aria-hidden={true} />
        </Link>
      </aside>

      {/* 2. Main content area: Filters + Queue Table + Right Detail Panel */}
      <div className="staff-content-area">
        {/* Table Panel */}
        <section className="staff-table-panel">
          {/* Header & Filters bar */}
          <div style={{ marginBottom: "1rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: "0.75rem",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <div>
                <h1 style={{ fontSize: "1.5rem", margin: 0, color: "var(--text)" }}>
                  Operational Issue Queue
                </h1>
                <p
                  style={{ margin: "2px 0 0 0", fontSize: "0.8125rem", color: "var(--text-muted)" }}
                >
                  {issues.length} reports in queue for {tenant.district || tenant.name}
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {(statusFilter || deptFilter || wardFilter || searchQuery) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearchParams(new URLSearchParams());
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            </div>

            {/* Filter controls row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: "0.625rem",
                padding: "0.75rem",
                backgroundColor: "var(--surface)",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--border)",
              }}
            >
              {/* Search */}
              <div style={{ position: "relative" }}>
                <TextInput
                  placeholder="Search ID or description..."
                  value={searchQuery}
                  onChange={(e) => updateFilters("q", e.target.value)}
                  style={{
                    paddingLeft: "2.25rem",
                    minHeight: "36px",
                    height: "36px",
                    fontSize: "0.8125rem",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: "0.75rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-subtle)",
                    pointerEvents: "none",
                  }}
                  aria-hidden="true"
                >
                  <Search size={14} strokeWidth={1.75} />
                </div>
              </div>

              {/* Status filter */}
              <Select
                value={statusFilter}
                onChange={(e) => updateFilters("status", e.target.value)}
                style={{ minHeight: "36px", height: "36px", fontSize: "0.8125rem" }}
              >
                <option value="">All Statuses</option>
                <option value="submitted">Submitted</option>
                <option value="triaged">Triaged</option>
                <option value="assigned">Assigned</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
                <option value="reopened">Reopened</option>
                <option value="duplicate">Duplicate</option>
                <option value="rejected">Rejected</option>
              </Select>

              {/* Department filter */}
              <Select
                value={deptFilter}
                onChange={(e) => updateFilters("dept", e.target.value)}
                style={{ minHeight: "36px", height: "36px", fontSize: "0.8125rem" }}
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>

              {/* Ward filter */}
              <Select
                value={wardFilter}
                onChange={(e) => updateFilters("ward", e.target.value)}
                style={{ minHeight: "36px", height: "36px", fontSize: "0.8125rem" }}
              >
                <option value="">All Wards</option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    Ward {w.ward_number}: {w.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* Table container */}
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <Skeleton height="44px" />
              <Skeleton height="44px" />
              <Skeleton height="44px" />
            </div>
          ) : errorMsg ? (
            <ErrorState
              title="Queue error"
              message={errorMsg}
              onRetry={() => {
                void fetchIssues();
              }}
            />
          ) : issues.length === 0 ? (
            <EmptyState
              title="No issues found in queue"
              description="No reports match your current filter parameters."
            />
          ) : (
            <div
              style={{
                backgroundColor: "var(--surface)",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--border)",
                overflow: "hidden",
              }}
            >
              <table
                className="queue-table"
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.875rem",
                  textAlign: "left",
                }}
              >
                <thead>
                  <tr
                    style={{
                      backgroundColor: "var(--surface-sunken)",
                      borderBottom: "1px solid var(--border)",
                      color: "var(--text-muted)",
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.02em",
                    }}
                  >
                    <th style={{ padding: "0.75rem 1rem" }}>Priority</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Public ID</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Category</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Ward</th>
                    <th style={{ padding: "0.75rem 1rem" }}>SLA Deadline</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((issue) => {
                    const isSelected = selectedIssue?.publicId === issue.publicId;
                    const isFlashing = flashingIssueId === issue.publicId;
                    const score =
                      issue.priority?.override?.score ?? issue.priority?.breakdown?.score ?? 30;
                    const catName =
                      issue.category?.names?.[locale] ||
                      issue.category?.name ||
                      issue.category?.code ||
                      "Issue";
                    const sla = formatSlaRemaining(issue);

                    return (
                      <tr
                        key={issue.publicId}
                        onClick={() => selectIssue(issue.publicId)}
                        tabIndex={0}
                        role="button"
                        aria-pressed={isSelected}
                        className={isFlashing ? "row-flashing" : ""}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            selectIssue(issue.publicId);
                          }
                        }}
                        style={{
                          borderBottom: "1px solid var(--border)",
                          backgroundColor: isSelected ? "var(--surface-sunken)" : "transparent",
                          cursor: "pointer",
                          transition: "background-color var(--dur-fast) var(--ease-out)",
                        }}
                      >
                        <td style={{ padding: "0.75rem 1rem" }}>
                          <PriorityMeter priority={score} />
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 1rem",
                            fontWeight: 700,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {issue.publicId}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", fontWeight: 500 }}>{catName}</td>
                        <td style={{ padding: "0.75rem 1rem", color: "var(--text-muted)" }}>
                          {issue.location?.wardId || "Ward —"}
                        </td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          <span
                            style={{
                              fontSize: "0.8125rem",
                              fontWeight: 600,
                              color: sla.breached ? "var(--kerb-600)" : "var(--text)",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {sla.text}
                          </span>
                        </td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          <StatusChip status={issue.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 3. Right Detail Panel */}
        {selectedIssue && (
          <aside className="staff-detail-panel" aria-label="Issue Detail Panel">
            {/* Header */}
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span
                    style={{
                      fontSize: "1.25rem",
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {selectedIssue.publicId}
                  </span>
                  <StatusChip status={selectedIssue.status} />
                </div>
                <p
                  style={{ margin: "2px 0 0 0", fontSize: "0.875rem", color: "var(--text-muted)" }}
                >
                  {selectedIssue.category?.names?.[locale] ||
                    selectedIssue.category?.name ||
                    selectedIssue.category?.code}
                </p>
              </div>

              <button
                type="button"
                onClick={() => selectIssue(null)}
                className="touch-target"
                aria-label="Close detail panel"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-subtle)",
                  cursor: "pointer",
                  width: "36px",
                  height: "36px",
                }}
              >
                <X size={18} strokeWidth={1.75} aria-hidden={true} />
              </button>
            </div>

            {/* Description */}
            <div
              style={{
                padding: "0.75rem",
                backgroundColor: "var(--surface)",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--border)",
                fontSize: "0.875rem",
                lineHeight: 1.45,
              }}
            >
              {selectedIssue.description}
            </div>

            {/* SECTION A: Priority Factor Bars & Override */}
            <div
              className="sign-plate"
              style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}
            >
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
              >
                <span
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: "var(--text-subtle)",
                  }}
                >
                  Priority Breakdown
                </span>
                <span
                  style={{
                    fontSize: "1.25rem",
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {selectedIssue.priority?.override?.score ??
                    selectedIssue.priority?.breakdown?.score ??
                    0}
                </span>
              </div>

              {selectedIssue.priority?.override && (
                <div
                  style={{
                    backgroundColor: "var(--paint-50)",
                    border: "1px solid var(--paint-300)",
                    borderRadius: "var(--r-sm)",
                    padding: "0.5rem 0.625rem",
                    fontSize: "0.8125rem",
                    color: "var(--paint-700)",
                  }}
                >
                  <strong>Override Justification:</strong> {selectedIssue.priority.override.reason}{" "}
                  (by {selectedIssue.priority.override.byUserId || "staff"})
                </div>
              )}

              {/* 6 Factor Bars */}
              {selectedIssue.priority?.breakdown && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {[
                    { label: "Safety Risk", item: selectedIssue.priority.breakdown.safety },
                    { label: "Physical Severity", item: selectedIssue.priority.breakdown.severity },
                    { label: "Key Facility", item: selectedIssue.priority.breakdown.facility },
                    {
                      label: "Reporter Multiplier",
                      item: selectedIssue.priority.breakdown.reporters,
                    },
                    { label: "Issue Age", item: selectedIssue.priority.breakdown.age },
                    { label: "SLA Pressure", item: selectedIssue.priority.breakdown.slaPressure },
                  ].map(({ label, item }) => {
                    const contrib = item?.contribution ?? 0;
                    const weight = item?.weight ?? 0;
                    return (
                      <div key={label}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                            marginBottom: "2px",
                          }}
                        >
                          <span>
                            {label} ({weight}%)
                          </span>
                          <span style={{ fontVariantNumeric: "tabular-nums" }}>
                            +{contrib.toFixed(1)}
                          </span>
                        </div>
                        <div
                          style={{
                            height: "6px",
                            backgroundColor: "var(--surface-sunken)",
                            borderRadius: "3px",
                            overflow: "hidden",
                            border: "1px solid var(--border)",
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, Math.max(0, contrib * 3))}%`,
                              height: "100%",
                              backgroundColor: "var(--paint-500)",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Priority Override Form */}
              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  paddingTop: "0.75rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                  Manual Priority Override
                </span>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <TextInput
                    placeholder="Score (0-100)"
                    type="number"
                    value={overrideScore}
                    onChange={(e) => setOverrideScore(e.target.value)}
                    style={{
                      width: "110px",
                      minHeight: "36px",
                      height: "36px",
                      fontSize: "0.8125rem",
                    }}
                  />
                  <TextInput
                    placeholder="Mandatory reason for override..."
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    style={{ flex: 1, minHeight: "36px", height: "36px", fontSize: "0.8125rem" }}
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={actionLoading || !overrideScore || !overrideReason.trim()}
                  onClick={() => {
                    void handleOverridePriority();
                  }}
                >
                  Apply Override
                </Button>
              </div>
            </div>

            {/* SECTION B: Status Moves & Resolution */}
            <div
              style={{
                backgroundColor: "var(--surface)",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--border)",
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <span
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--text-subtle)",
                }}
              >
                Workflow Transitions
              </span>

              {allowedMoves.length === 0 ? (
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  No further staff transitions available for status '{selectedIssue.status}'.
                </p>
              ) : (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {allowedMoves.map((st) => (
                    <Button
                      key={st}
                      variant={
                        st === "resolved" ? "cta" : st === "rejected" ? "danger" : "secondary"
                      }
                      size="sm"
                      disabled={actionLoading}
                      onClick={() => {
                        void handleTransition(st);
                      }}
                    >
                      <span>Move to {st}</span>
                    </Button>
                  ))}
                </div>
              )}

              {allowedMoves.includes("resolved") && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.375rem",
                    marginTop: "0.25rem",
                  }}
                >
                  <TextInput
                    placeholder="Evidence Key (e.g. resolve-photo-1.jpg)"
                    value={resolutionEvidenceKey}
                    onChange={(e) => setResolutionEvidenceKey(e.target.value)}
                    style={{ minHeight: "36px", height: "36px", fontSize: "0.8125rem" }}
                  />
                  <TextInput
                    placeholder="Resolution notes..."
                    value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                    style={{ minHeight: "36px", height: "36px", fontSize: "0.8125rem" }}
                  />
                </div>
              )}

              {allowedMoves.includes("rejected") && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                  <TextInput
                    placeholder="Rejection justification reason..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    style={{ minHeight: "36px", height: "36px", fontSize: "0.8125rem" }}
                  />
                </div>
              )}
            </div>

            {/* SECTION C: Assign Department Routing */}
            <div
              style={{
                backgroundColor: "var(--surface)",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--border)",
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.625rem",
              }}
            >
              <span
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--text-subtle)",
                }}
              >
                Department Routing
              </span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Select
                  value={selectedRouteDept}
                  onChange={(e) => setSelectedRouteDept(e.target.value)}
                  style={{ minHeight: "36px", height: "36px", fontSize: "0.8125rem" }}
                >
                  <option value="">Select Department...</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={actionLoading || !selectedRouteDept}
                  onClick={() => {
                    void handleRouteDepartment();
                  }}
                >
                  Route
                </Button>
              </div>
            </div>

            {/* SECTION D: Duplicates & Merge */}
            <div
              style={{
                backgroundColor: "var(--surface)",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--border)",
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.625rem",
              }}
            >
              <span
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--text-subtle)",
                }}
              >
                Duplicate Management
              </span>

              {selectedIssue.duplicateOf ? (
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                    Merged into: <strong>{selectedIssue.duplicateOf}</strong>
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={actionLoading}
                    onClick={() => {
                      void handleUnmerge();
                    }}
                  >
                    Unmerge
                  </Button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <TextInput
                    placeholder="Primary Issue ID to merge into..."
                    value={mergeTargetId}
                    onChange={(e) => setMergeTargetId(e.target.value)}
                    style={{ minHeight: "36px", height: "36px", fontSize: "0.8125rem" }}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={actionLoading || !mergeTargetId.trim()}
                    onClick={() => {
                      void handleMerge();
                    }}
                  >
                    Merge
                  </Button>
                </div>
              )}
            </div>

            {/* SECTION E: Audit Trail as Lane Line Timeline */}
            <div
              style={{
                backgroundColor: "var(--surface)",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--border)",
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <span
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--text-subtle)",
                }}
              >
                Audit Trail
              </span>
              {detailLoading ? (
                <Skeleton height="60px" />
              ) : auditEvents.length === 0 ? (
                <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  No audit events recorded.
                </span>
              ) : (
                <LaneTimeline
                  vertical={true}
                  steps={auditEvents.map((ev) => ({
                    id: String(ev.seq),
                    label: ev.event.replace(/_/g, " "),
                    completed: true,
                    timestamp: new Date(ev.at).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    }),
                    detail: `Actor: ${ev.actor.userId} (${ev.actor.role})`,
                  }))}
                />
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
