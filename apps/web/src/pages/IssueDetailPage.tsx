import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router";
import { ArrowLeft, CheckCircle2, RotateCcw, Shield, Send, Clock, ThumbsUp } from "lucide-react";
import { useTranslation } from "../utils/i18n.js";
import { useAuth } from "../utils/authContext.js";
import {
  Button,
  StatusChip,
  PriorityMeter,
  LaneTimeline,
  Skeleton,
  ErrorState,
  Dialog,
  Textarea,
  Field,
  useToast,
  Milestone,
  CategoryIcon,
} from "../ui/index.js";

interface AuditEvent {
  seq: number;
  event: string;
  actor: { userId: string; role: string };
  payload: Record<string, unknown>;
  at: string;
}

interface IssueData {
  publicId: string;
  status: string;
  description: string;
  category?: { code: string; name?: string; names?: Record<string, string> };
  department?: { id: string; code: string; name: string };
  location?: { coordinates: [number, number]; wardId?: string };
  landmark?: string;
  pincode?: string;
  evidence?: { key: string }[];
  resolution?: { note?: string; resolvedAt?: string; evidence?: string[] };
  createdAt: string;
  reporterIds?: string[];
  priority?: {
    breakdown?: { score?: number; level?: string };
    override?: { score?: number; level?: string };
  };
}

const TIMELINE_STAGES = [
  { key: "submitted", label: "Submitted" },
  { key: "triaged", label: "Triaged" },
  { key: "assigned", label: "Assigned to Department" },
  { key: "in_progress", label: "Work in Progress" },
  { key: "resolved", label: "Resolved by Field Staff" },
  { key: "closed", label: "Closed and Citizen Confirmed" },
];

export function IssueDetailPage(): React.JSX.Element {
  const { publicId } = useParams<{ publicId: string }>();
  const { t } = useTranslation();
  const { user, authFetch } = useAuth();
  const { showToast } = useToast();

  const [issue, setIssue] = useState<IssueData | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [disputeNote, setDisputeNote] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);

  const [timelineNote, setTimelineNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [transitioningStatus, setTransitioningStatus] = useState<string | null>(null);

  const [upvoteCount, setUpvoteCount] = useState<number>(1);
  const [hasUpvoted, setHasUpvoted] = useState<boolean>(false);
  const [upvoting, setUpvoting] = useState<boolean>(false);

  const handleUpvote = async () => {
    if (!publicId || upvoting) return;
    setUpvoting(true);
    try {
      const res = await authFetch(`/api/v1/issues/${publicId}/upvote`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        const count = data.data?.upvote_count ?? data.data?.reporter_count;
        setUpvoteCount(count ?? upvoteCount + 1);
        setHasUpvoted(true);
        showToast({
          message: data.data?.already_upvoted
            ? `You have already confirmed/upvoted ${publicId}`
            : `Upvoted ${publicId} (+1 citizen confirmation)`,
          variant: "success",
        });
      } else {
        throw new Error(data.error?.message || "Could not upvote issue");
      }
    } catch (err: unknown) {
      showToast({
        message: err instanceof Error ? err.message : "Error upvoting",
        variant: "error",
      });
    } finally {
      setUpvoting(false);
    }
  };

  const isStaffOrAdmin = Boolean(
    user &&
      ((user.roles && user.roles.some((r) => r !== "citizen")) ||
        (user.role && user.role !== "citizen"))
  );

  const handleTimelineTransition = async (toStatus: string, note?: string) => {
    if (!publicId) return;
    setTransitioningStatus(toStatus);
    try {
      const res = await authFetch(`/api/v1/issues/${publicId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: toStatus,
          note: note || `Status updated to ${toStatus} by municipal staff`,
          evidence_keys:
            toStatus === "resolved" ? ["resolutions/default_verification.jpg"] : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Transition forbidden");
      }
      showToast({
        message: `Issue marked as ${toStatus}`,
        variant: "success",
      });
      await fetchIssueDetails();
    } catch (err: unknown) {
      showToast({
        message: err instanceof Error ? err.message : "Error transitioning issue",
        variant: "error",
      });
    } finally {
      setTransitioningStatus(null);
    }
  };

  const handleAddTimelineNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicId || !timelineNote.trim()) return;
    setAddingNote(true);
    try {
      const res = await authFetch(`/api/v1/issues/${publicId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: timelineNote.trim(),
          stage: issue?.status,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Failed to add note");
      }
      showToast({
        message: "Note added to timeline",
        variant: "success",
      });
      setTimelineNote("");
      await fetchIssueDetails();
    } catch (err: unknown) {
      showToast({
        message: err instanceof Error ? err.message : "Error adding note",
        variant: "error",
      });
    } finally {
      setAddingNote(false);
    }
  };

  const fetchIssueDetails = async () => {
    if (!publicId) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await authFetch(`/api/v1/issues/${publicId}`);
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? `Issue '${publicId}' was not found in this municipality`
            : "Could not load issue details"
        );
      }
      const data = await res.json();
      setIssue(data.data);
      if (data.data?.reporterIds && Array.isArray(data.data.reporterIds)) {
        setUpvoteCount(data.data.reporterIds.length);
        if (user?.id && data.data.reporterIds.includes(user.id)) {
          setHasUpvoted(true);
        }
      }

      const auditRes = await authFetch(`/api/v1/issues/${publicId}/audit`);
      if (auditRes.ok) {
        const auditData = await auditRes.json();
        setAuditEvents(auditData.data?.events || []);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchIssueDetails();
  }, [publicId]);

  const handleConfirmFixed = async () => {
    if (!publicId) return;
    setSubmittingAction(true);
    try {
      const res = await authFetch(`/api/v1/issues/${publicId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: "closed", note: "Citizen confirmed resolution" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Failed to confirm resolution");
      }
      setConfirmModalOpen(false);
      showToast({
        message: `Issue ${publicId} confirmed and marked closed`,
        variant: "success",
      });
      await fetchIssueDetails();
    } catch (err: unknown) {
      showToast({
        message: err instanceof Error ? err.message : "Error confirming fix",
        variant: "error",
      });
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleDispute = async () => {
    if (!publicId) return;
    if (!disputeNote.trim()) {
      showToast({ message: "Please state why the issue remains unresolved", variant: "warning" });
      return;
    }
    setSubmittingAction(true);
    try {
      const res = await authFetch(`/api/v1/issues/${publicId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: "reopened",
          note: disputeNote.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Failed to dispute resolution");
      }
      setDisputeModalOpen(false);
      setDisputeNote("");
      showToast({
        message: `Issue ${publicId} disputed and reopened for staff review`,
        variant: "info",
      });
      await fetchIssueDetails();
    } catch (err: unknown) {
      showToast({
        message: err instanceof Error ? err.message : "Error disputing fix",
        variant: "error",
      });
    } finally {
      setSubmittingAction(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 1rem", width: "100%" }}>
        <div
          style={{
            backgroundColor: "var(--asphalt-900)",
            padding: "2rem 1.5rem",
            marginBottom: "1.5rem",
          }}
        >
          <Skeleton height="44px" width="220px" style={{ marginBottom: "0.75rem" }} />
          <Skeleton height="20px" width="160px" />
        </div>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem", padding: "0 1rem" }}
        >
          <Skeleton height="280px" />
          <Skeleton height="320px" />
        </div>
      </div>
    );
  }

  if (errorMsg || !issue) {
    return (
      <div style={{ maxWidth: "600px", margin: "3rem auto", padding: "0 1rem" }}>
        <ErrorState
          title="Issue details unavailable"
          message={errorMsg || "This issue could not be found."}
          action={
            <Link to="/">
              <Button variant="secondary">
                <ArrowLeft size={15} strokeWidth={1.75} aria-hidden={true} />
                <span>Return to Issue Map</span>
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const priorityScore = issue.priority?.override?.score ?? issue.priority?.breakdown?.score ?? 35;
  const isResolved = issue.status === "resolved";
  const categoryCode = issue.category?.code || "other";

  // Build lane line timeline steps
  const stageOrder = ["submitted", "triaged", "assigned", "in_progress", "resolved", "closed"];
  const currentIdx = stageOrder.indexOf(issue.status);

  const timelineSteps = TIMELINE_STAGES.map((st, idx) => {
    const isDone = currentIdx >= idx;
    const isCurrent = issue.status === st.key;

    // Find matching audit event if any
    const matchingAudit = auditEvents.find(
      (ev) =>
        ev.event === `TRANSITION_TO_${st.key.toUpperCase()}` ||
        (ev.event === "STATUS_CHANGED" && ev.payload?.["to"] === st.key) ||
        (st.key === "submitted" && ev.event === "CREATED") ||
        (ev.event === "NOTE_ADDED" && ev.payload?.["stage"] === st.key)
    );

    return {
      id: st.key,
      label: st.label,
      completed: isDone,
      current: isCurrent,
      timestamp: matchingAudit
        ? new Date(matchingAudit.at).toLocaleString("en-IN", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })
        : undefined,
      detail: (matchingAudit?.payload?.["note"] as string) || undefined,
    };
  });

  return (
    <div style={{ width: "100%" }}>
      <style>{`
        .issue-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1.5rem;
          margin-top: 1.25rem;
        }
        @media (min-width: 768px) {
          .issue-grid {
            grid-template-columns: 1fr 380px;
          }
        }
      `}</style>

      {/* ═══ ASPHALT BAND: full-bleed dark header ═══ */}
      <div className="asphalt-band" style={{ padding: "2rem 0" }}>
        <div className="content-max">
          {/* Back navigation */}
          <Link
            to="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              color: "var(--band-text-muted)",
              fontSize: "0.875rem",
              fontWeight: 500,
              marginBottom: "1rem",
            }}
          >
            <ArrowLeft size={15} strokeWidth={1.75} aria-hidden={true} />
            <span>Back to Issues</span>
          </Link>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
              {/* Milestone marker with issue number */}
              <Milestone label={issue.publicId.slice(-3)} status={issue.status} size="lg" />

              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                  }}
                >
                  <h1
                    className="display-text-sm"
                    style={{
                      margin: 0,
                      color: "var(--band-text)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {issue.publicId}
                  </h1>
                  <StatusChip status={issue.status} />
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginTop: "0.375rem",
                    color: "var(--band-text-muted)",
                    fontSize: "0.9375rem",
                    fontWeight: 500,
                  }}
                >
                  <CategoryIcon category={categoryCode} size={18} color="var(--band-text-muted)" />
                  <span>
                    {issue.category?.names?.[t("lang") || "en"] ||
                      issue.category?.name ||
                      issue.category?.code ||
                      "Civic Issue"}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              <PriorityMeter priority={priorityScore} />
              <button
                type="button"
                onClick={handleUpvote}
                disabled={upvoting}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.4375rem 0.875rem",
                  borderRadius: "var(--r-md)",
                  border: hasUpvoted
                    ? "1px solid var(--paint-500)"
                    : "1px solid rgba(255,255,255,0.25)",
                  backgroundColor: hasUpvoted ? "var(--paint-500)" : "rgba(255,255,255,0.1)",
                  color: hasUpvoted ? "#1c221e" : "#ffffff",
                  fontWeight: 700,
                  fontSize: "0.875rem",
                  cursor: upvoting ? "wait" : "pointer",
                  transition: "all var(--dur-fast)",
                }}
                title="Upvote this civic issue to increase urgency"
              >
                <ThumbsUp size={16} strokeWidth={2.2} />
                <span>{upvoteCount} Upvotes</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content below band */}
      <div className="content-max" style={{ paddingTop: "1.5rem", paddingBottom: "3rem" }}>
        {/* Citizen Resolution Action Banner if status is resolved */}
        {isResolved && (
          <div
            style={{
              marginBottom: "1.25rem",
              backgroundColor: "var(--sign-50)",
              border: "1px solid var(--sign-300)",
              borderRadius: "var(--r-lg)",
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <CheckCircle2 size={18} strokeWidth={1.75} style={{ color: "var(--sign-600)" }} />
              <span style={{ fontWeight: 700, fontSize: "0.9375rem", color: "var(--sign-800)" }}>
                Field team has marked this issue as resolved
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text)", lineHeight: 1.45 }}>
              Please verify the repair at the physical location. If the road, light, pipe or bin has
              been properly fixed, confirm below to close this report. If the defect persists, you
              can dispute it.
            </p>
            <div
              style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.25rem" }}
            >
              <Button variant="cta" onClick={() => setConfirmModalOpen(true)}>
                <CheckCircle2 size={15} strokeWidth={1.75} aria-hidden={true} />
                <span>Confirm fixed</span>
              </Button>
              <Button variant="secondary" onClick={() => setDisputeModalOpen(true)}>
                <RotateCcw size={15} strokeWidth={1.75} aria-hidden={true} />
                <span>Still broken (Dispute)</span>
              </Button>
            </div>
          </div>
        )}

        {/* Two-column layout per DESIGN.md §6 */}
        <div className="issue-grid">
          {/* Left Column: Details, Location, Evidence */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Issue Description Card */}
            <div
              style={{
                backgroundColor: "var(--surface)",
                borderRadius: "var(--r-lg)",
                border: "1px solid var(--border)",
                padding: "1.25rem",
              }}
            >
              <h2
                style={{
                  fontSize: "0.875rem",
                  margin: "0 0 0.75rem 0",
                  color: "var(--text-subtle)",
                  fontWeight: 600,
                }}
              >
                Reported problem
              </h2>
              <p style={{ margin: 0, fontSize: "1rem", color: "var(--text)", lineHeight: 1.5 }}>
                {issue.description}
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "0.875rem",
                  marginTop: "1.25rem",
                  paddingTop: "1rem",
                  borderTop: "1px solid var(--border)",
                  fontSize: "0.8125rem",
                }}
              >
                <div>
                  <span
                    style={{
                      color: "var(--text-subtle)",
                      display: "block",
                      fontWeight: 600,
                      marginBottom: "2px",
                    }}
                  >
                    Landmark
                  </span>
                  <span style={{ fontWeight: 600, color: "var(--text)" }}>
                    {issue.landmark || "Not specified"}
                  </span>
                </div>
                <div>
                  <span
                    style={{
                      color: "var(--text-subtle)",
                      display: "block",
                      fontWeight: 600,
                      marginBottom: "2px",
                    }}
                  >
                    PIN code
                  </span>
                  <span style={{ fontWeight: 600, color: "var(--text)" }}>
                    {issue.pincode || "Not specified"}
                  </span>
                </div>
                <div>
                  <span
                    style={{
                      color: "var(--text-subtle)",
                      display: "block",
                      fontWeight: 600,
                      marginBottom: "2px",
                    }}
                  >
                    Department
                  </span>
                  <span style={{ fontWeight: 600, color: "var(--text)" }}>
                    {issue.department?.name || "Assigned by Ward"}
                  </span>
                </div>
                <div>
                  <span
                    style={{
                      color: "var(--text-subtle)",
                      display: "block",
                      fontWeight: 600,
                      marginBottom: "2px",
                    }}
                  >
                    Reported on
                  </span>
                  <span style={{ fontWeight: 600, color: "var(--text)" }}>
                    {new Date(issue.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div>
                  <span
                    style={{
                      color: "var(--text-subtle)",
                      display: "block",
                      fontWeight: 600,
                      marginBottom: "2px",
                    }}
                  >
                    Confirmations / Upvotes
                  </span>
                  <span style={{ fontWeight: 700, color: "var(--paint-700)" }}>
                    ▲ {upvoteCount} citizen{upvoteCount !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </div>

            {/* Resolution note if present */}
            {issue.resolution?.note && (
              <div
                className="sign-plate"
                style={{
                  padding: "1.25rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <h2
                  style={{
                    fontSize: "0.875rem",
                    margin: 0,
                    color: "var(--text-subtle)",
                    fontWeight: 600,
                  }}
                >
                  Resolution report from field crew
                </h2>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.9375rem",
                    color: "var(--text)",
                    lineHeight: 1.45,
                  }}
                >
                  {issue.resolution.note}
                </p>
              </div>
            )}

            {/* Evidence photos */}
            {issue.evidence && issue.evidence.length > 0 && (
              <div
                style={{
                  backgroundColor: "var(--surface)",
                  borderRadius: "var(--r-lg)",
                  border: "1px solid var(--border)",
                  padding: "1.25rem",
                }}
              >
                <h2 style={{ fontSize: "1rem", margin: "0 0 0.75rem 0", color: "var(--text)" }}>
                  Evidence photos
                </h2>
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  {issue.evidence.map((ev, index) => (
                    <div
                      key={ev.key || index}
                      style={{
                        width: "140px",
                        height: "100px",
                        borderRadius: "var(--r-sm)",
                        border: "1px solid var(--border)",
                        backgroundColor: "var(--surface-sunken)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--text-subtle)",
                        fontSize: "0.75rem",
                      }}
                    >
                      <span>Photo {index + 1}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Milestone Timeline & Staff Controls */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Staff / Admin Timeline Controls Panel */}
            {isStaffOrAdmin && (
              <div
                style={{
                  backgroundColor: "var(--surface)",
                  borderRadius: "var(--r-lg)",
                  border: "2px solid var(--primary)",
                  padding: "1.25rem",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "1rem",
                    paddingBottom: "0.5rem",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Shield size={18} strokeWidth={2} style={{ color: "var(--primary)" }} />
                    <span style={{ fontWeight: 700, fontSize: "0.9375rem", color: "var(--text)" }}>
                      Timeline Operations
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      backgroundColor: "var(--surface-sunken)",
                      padding: "0.2rem 0.5rem",
                      borderRadius: "var(--r-sm)",
                      border: "1px solid var(--border)",
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                    }}
                  >
                    Role: {user?.role || "Staff"}
                  </span>
                </div>

                {/* Status Transitions */}
                <div style={{ marginBottom: "1rem" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "var(--text-subtle)",
                      marginBottom: "0.5rem",
                      textTransform: "uppercase",
                    }}
                  >
                    Set Stage / Status
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                    {issue.status === "submitted" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          void handleTimelineTransition(
                            "triaged",
                            "Triage verified by municipal staff"
                          )
                        }
                        loading={transitioningStatus === "triaged"}
                      >
                        📌 Mark Triaged
                      </Button>
                    )}
                    {(issue.status === "submitted" ||
                      issue.status === "triaged" ||
                      issue.status === "reopened") && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() =>
                          void handleTimelineTransition("assigned", "Assigned to department crew")
                        }
                        loading={transitioningStatus === "assigned"}
                      >
                        👷 Mark Assigned
                      </Button>
                    )}
                    {(issue.status === "assigned" ||
                      issue.status === "triaged" ||
                      issue.status === "reopened") && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          void handleTimelineTransition(
                            "in_progress",
                            "Field repair work in progress"
                          )
                        }
                        loading={transitioningStatus === "in_progress"}
                      >
                        🚜 Mark In Progress
                      </Button>
                    )}
                    {(issue.status === "in_progress" || issue.status === "assigned") && (
                      <Button
                        variant="cta"
                        size="sm"
                        onClick={() =>
                          void handleTimelineTransition(
                            "resolved",
                            "Repair completed by field crew"
                          )
                        }
                        loading={transitioningStatus === "resolved"}
                      >
                        ✅ Mark Resolved
                      </Button>
                    )}
                    {issue.status === "resolved" && (
                      <Button
                        variant="cta"
                        size="sm"
                        onClick={() =>
                          void handleTimelineTransition(
                            "closed",
                            "Confirmed and closed by municipal authority"
                          )
                        }
                        loading={transitioningStatus === "closed"}
                      >
                        🏁 Mark Complete (Closed)
                      </Button>
                    )}
                    {(issue.status === "closed" ||
                      issue.status === "resolved" ||
                      issue.status === "rejected") && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          void handleTimelineTransition("reopened", "Reopened for review")
                        }
                        loading={transitioningStatus === "reopened"}
                      >
                        🔄 Reopen
                      </Button>
                    )}
                  </div>
                </div>

                {/* Add Timeline Note Form */}
                <form
                  onSubmit={(e) => void handleAddTimelineNote(e)}
                  style={{
                    marginTop: "1rem",
                    paddingTop: "0.75rem",
                    borderTop: "1px dashed var(--border)",
                  }}
                >
                  <label
                    htmlFor="staff-timeline-note"
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "var(--text-subtle)",
                      marginBottom: "0.375rem",
                      textTransform: "uppercase",
                    }}
                  >
                    Add Timeline / Progress Note
                  </label>
                  <Textarea
                    id="staff-timeline-note"
                    value={timelineNote}
                    onChange={(e) => setTimelineNote(e.target.value)}
                    placeholder="Enter dispatch notes, materials used, inspection findings..."
                    rows={2}
                    style={{ fontSize: "0.8125rem", marginBottom: "0.5rem" }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Button
                      variant="primary"
                      size="sm"
                      type="submit"
                      disabled={!timelineNote.trim() || addingNote}
                      loading={addingNote}
                    >
                      <Send
                        size={13}
                        strokeWidth={2}
                        style={{ marginRight: "0.25rem" }}
                        aria-hidden={true}
                      />
                      <span>Post Note</span>
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {/* Standard Progress timeline */}
            <div
              style={{
                backgroundColor: "var(--surface)",
                borderRadius: "var(--r-lg)",
                border: "1px solid var(--border)",
                padding: "1.25rem",
              }}
            >
              <h2 style={{ fontSize: "1rem", margin: "0 0 1rem 0", color: "var(--text)" }}>
                Progress timeline
              </h2>
              <LaneTimeline steps={timelineSteps} vertical={true} />
            </div>

            {/* Timeline Notes & Audit Log */}
            {auditEvents.length > 0 && (
              <div
                style={{
                  backgroundColor: "var(--surface)",
                  borderRadius: "var(--r-lg)",
                  border: "1px solid var(--border)",
                  padding: "1.25rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginBottom: "0.75rem",
                  }}
                >
                  <Clock size={16} strokeWidth={1.75} style={{ color: "var(--text-muted)" }} />
                  <h3
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 700,
                      margin: 0,
                      color: "var(--text)",
                    }}
                  >
                    Activity Log & Notes ({auditEvents.length})
                  </h3>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.625rem",
                    maxHeight: "300px",
                    overflowY: "auto",
                  }}
                >
                  {auditEvents
                    .slice()
                    .reverse()
                    .map((ev) => (
                      <div
                        key={ev.seq}
                        style={{
                          padding: "0.5rem 0.625rem",
                          backgroundColor: "var(--surface-sunken)",
                          borderRadius: "var(--r-sm)",
                          border: "1px solid var(--border)",
                          fontSize: "0.75rem",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            color: "var(--text-muted)",
                            marginBottom: "0.25rem",
                          }}
                        >
                          <span style={{ fontWeight: 600, color: "var(--text)" }}>
                            {ev.event.replace(/_/g, " ")}
                          </span>
                          <span>
                            {new Date(ev.at).toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div
                          style={{
                            color: "var(--text-subtle)",
                            fontSize: "0.6875rem",
                            marginBottom: "0.25rem",
                          }}
                        >
                          Actor: <strong>{ev.actor?.role || "System"}</strong>
                        </div>
                        {Boolean(ev.payload?.["note"]) && (
                          <p
                            style={{
                              margin: 0,
                              color: "var(--text)",
                              fontStyle: "italic",
                              lineHeight: 1.35,
                            }}
                          >
                            "{String(ev.payload?.["note"])}"
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title="Confirm resolution"
        description="This will mark the civic report as verified and closed"
      >
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--text)",
            lineHeight: 1.5,
            margin: "0 0 1.25rem 0",
          }}
        >
          By confirming, you certify that the reported defect has been satisfactorily repaired by
          municipal services.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
          <Button variant="secondary" onClick={() => setConfirmModalOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="cta"
            onClick={() => {
              void handleConfirmFixed();
            }}
            loading={submittingAction}
          >
            Confirm and close report
          </Button>
        </div>
      </Dialog>

      {/* Dispute Dialog */}
      <Dialog
        isOpen={disputeModalOpen}
        onClose={() => setDisputeModalOpen(false)}
        title="Dispute resolution"
        description="State why the civic issue is still unresolved"
      >
        <Field
          label="Reason for dispute"
          hint="Explain what remains broken so the department can re-dispatch workers"
          required
        >
          {({ id, "aria-describedby": ariaDescribedBy }) => (
            <Textarea
              id={id}
              aria-describedby={ariaDescribedBy}
              rows={3}
              placeholder="E.g., Pothole was only partially filled with loose gravel and washed away with rain."
              value={disputeNote}
              onChange={(e) => setDisputeNote(e.target.value)}
            />
          )}
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
          <Button variant="secondary" onClick={() => setDisputeModalOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              void handleDispute();
            }}
            loading={submittingAction}
          >
            Submit dispute and reopen
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
