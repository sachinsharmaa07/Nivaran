import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router";
import { ArrowLeft, CheckCircle2, RotateCcw } from "lucide-react";
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
  { key: "closed", label: "Closed & Citizen Confirmed" },
];

export function IssueDetailPage(): React.JSX.Element {
  const { publicId } = useParams<{ publicId: string }>();
  const { t } = useTranslation();
  const { authFetch } = useAuth();
  const { showToast } = useToast();

  const [issue, setIssue] = useState<IssueData | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [disputeNote, setDisputeNote] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);

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
      <div style={{ maxWidth: "1024px", margin: "2rem auto", padding: "0 1rem", width: "100%" }}>
        <Skeleton height="36px" width="180px" style={{ marginBottom: "1.5rem" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>
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
        (st.key === "submitted" && ev.event === "CREATED")
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
    <div
      style={{
        maxWidth: "1080px",
        margin: "0 auto",
        padding: "1.5rem 1rem 3rem 1rem",
        width: "100%",
      }}
    >
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

      {/* Top back navigation */}
      <div style={{ marginBottom: "1rem" }}>
        <Link
          to="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.375rem",
            color: "var(--text-muted)",
            fontSize: "0.875rem",
            fontWeight: 500,
          }}
        >
          <ArrowLeft size={15} strokeWidth={1.75} aria-hidden={true} />
          <span>Back to Issues</span>
        </Link>
      </div>

      {/* Header plate */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "1rem",
          paddingBottom: "1rem",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <h1
              style={{
                fontSize: "1.75rem",
                margin: 0,
                color: "var(--text)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {issue.publicId}
            </h1>
            <StatusChip status={issue.status} />
          </div>
          <p
            style={{
              margin: "0.375rem 0 0 0",
              fontSize: "0.9375rem",
              color: "var(--text-muted)",
              fontWeight: 500,
            }}
          >
            {issue.category?.names?.[t("lang") || "en"] ||
              issue.category?.name ||
              issue.category?.code ||
              "Civic Issue"}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <PriorityMeter priority={priorityScore} />
        </div>
      </div>

      {/* Citizen Resolution Action Banner if status is resolved */}
      {isResolved && (
        <div
          className="sign-plate"
          style={{
            marginTop: "1.25rem",
            backgroundColor: "var(--sign-50)",
            border: "1px solid var(--sign-300)",
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
            been properly fixed, confirm below to close this report. If the defect persists, you can
            dispute it.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
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
                fontSize: "1rem",
                margin: "0 0 0.5rem 0",
                color: "var(--text-subtle)",
                textTransform: "uppercase",
                letterSpacing: "0.02em",
              }}
            >
              Reported Problem
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
                <span style={{ color: "var(--text-subtle)", display: "block" }}>LANDMARK</span>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>
                  {issue.landmark || "Not specified"}
                </span>
              </div>
              <div>
                <span style={{ color: "var(--text-subtle)", display: "block" }}>PIN CODE</span>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>
                  {issue.pincode || "Not specified"}
                </span>
              </div>
              <div>
                <span style={{ color: "var(--text-subtle)", display: "block" }}>DEPARTMENT</span>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>
                  {issue.department?.name || "Assigned by Ward"}
                </span>
              </div>
              <div>
                <span style={{ color: "var(--text-subtle)", display: "block" }}>REPORTED ON</span>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>
                  {new Date(issue.createdAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
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
                  textTransform: "uppercase",
                }}
              >
                Resolution Report from Field Crew
              </h2>
              <p
                style={{ margin: 0, fontSize: "0.9375rem", color: "var(--text)", lineHeight: 1.45 }}
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
                Evidence Photos
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

        {/* Right Column: Spine Timeline per DESIGN.md §6 */}
        <div>
          <div
            style={{
              backgroundColor: "var(--surface)",
              borderRadius: "var(--r-lg)",
              border: "1px solid var(--border)",
              padding: "1.25rem",
            }}
          >
            <h2 style={{ fontSize: "1rem", margin: "0 0 1rem 0", color: "var(--text)" }}>
              Progress Timeline
            </h2>
            <LaneTimeline steps={timelineSteps} vertical={true} />
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title="Confirm Resolution"
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
            Confirm & Close Report
          </Button>
        </div>
      </Dialog>

      {/* Dispute Dialog */}
      <Dialog
        isOpen={disputeModalOpen}
        onClose={() => setDisputeModalOpen(false)}
        title="Dispute Resolution"
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
            Submit Dispute & Reopen
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
