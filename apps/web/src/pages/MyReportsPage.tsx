import React, { useState, useEffect } from "react";
import { Link } from "react-router";
import { Plus, ChevronRight, FileText, ArrowRight } from "lucide-react";
import { useTranslation } from "../utils/i18n.js";
import { useAuth } from "../utils/authContext.js";
import type { TenantInfo } from "../components/CityPicker.js";
import {
  Button,
  StatusChip,
  PriorityMeter,
  Skeleton,
  EmptyState,
  ErrorState,
} from "../ui/index.js";

interface MyIssueItem {
  publicId: string;
  status: string;
  description: string;
  category?: { code: string; name?: string; names?: Record<string, string> };
  landmark?: string;
  pincode?: string;
  createdAt: string;
  priority?: {
    breakdown?: { score?: number };
    override?: { score?: number };
  };
}

export function MyReportsPage({
  tenant,
  onOpenAuth,
}: {
  tenant: TenantInfo;
  onOpenAuth: () => void;
}): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { user, authFetch } = useAuth();
  const [issues, setIssues] = useState<MyIssueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const loadMyReports = async () => {
    if (!user) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await authFetch(
        `/api/v1/issues?tenant_slug=${encodeURIComponent(tenant.slug)}&reporter_id=me&limit=50`
      );
      if (!res.ok) {
        throw new Error("Failed to load your submitted reports");
      }
      const data = await res.json();
      setIssues(data.data || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      void loadMyReports();
    }
  }, [user, tenant.slug]);

  if (!user) {
    return (
      <div
        style={{
          maxWidth: "540px",
          margin: "3rem auto",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <div className="sign-plate" style={{ padding: "2.5rem 1.75rem" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "var(--r-md)",
              backgroundColor: "var(--surface-sunken)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-subtle)",
              margin: "0 auto 1.25rem auto",
              border: "1px solid var(--border)",
            }}
            aria-hidden="true"
          >
            <FileText size={24} strokeWidth={1.75} />
          </div>

          <h1 style={{ margin: "0 0 0.5rem 0", fontSize: "1.5rem", color: "var(--text)" }}>
            Track Your Civic Reports
          </h1>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "0.9375rem",
              lineHeight: 1.5,
              marginBottom: "1.75rem",
            }}
          >
            Sign in with your mobile number or email to view the progress of issues you've reported
            or verified.
          </p>
          <Button variant="cta" onClick={onOpenAuth} style={{ minWidth: "160px" }}>
            <span>Sign In / Register</span>
            <ArrowRight size={15} strokeWidth={1.75} aria-hidden={true} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "880px", margin: "0 auto", padding: "2rem 1rem", width: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: "1.5rem",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 0.25rem 0", fontSize: "1.75rem", color: "var(--text)" }}>
            {t("my_reports") || "My Reports"}
          </h1>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Issues you submitted or supported in {tenant.district || tenant.name}
          </p>
        </div>

        <Link to="/">
          <Button variant="cta">
            <Plus size={15} strokeWidth={1.75} aria-hidden={true} />
            <span>Report an issue</span>
          </Button>
        </Link>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Skeleton height="72px" />
          <Skeleton height="72px" />
          <Skeleton height="72px" />
        </div>
      ) : errorMsg ? (
        <ErrorState
          title="Could not load reports"
          message={errorMsg}
          onRetry={() => {
            void loadMyReports();
          }}
        />
      ) : issues.length === 0 ? (
        <EmptyState
          title="No reports submitted yet"
          description="You haven't reported any potholes, broken lights or overflowing bins in this municipality."
          action={
            <Link to="/">
              <Button variant="cta">
                <Plus size={15} strokeWidth={1.75} aria-hidden={true} />
                <span>Submit your first report</span>
              </Button>
            </Link>
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {issues.map((issue) => {
            const catName =
              issue.category?.names?.[locale] ||
              issue.category?.name ||
              issue.category?.code ||
              "Civic report";
            const score = issue.priority?.override?.score ?? issue.priority?.breakdown?.score ?? 30;

            return (
              <Link
                key={issue.publicId}
                to={`/issues/${issue.publicId}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "1rem 1.25rem",
                  backgroundColor: "var(--surface)",
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--border)",
                  textDecoration: "none",
                  color: "inherit",
                  transition: "background-color var(--dur-fast) var(--ease-out)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0, marginRight: "1rem" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.625rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: "0.875rem",
                        color: "var(--text)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {issue.publicId}
                    </span>
                    <StatusChip status={issue.status} />
                  </div>

                  <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text)" }}>
                    {catName}
                  </div>

                  <p
                    style={{
                      margin: "0.25rem 0 0 0",
                      fontSize: "0.8125rem",
                      color: "var(--text-muted)",
                      lineHeight: 1.35,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {issue.description}
                  </p>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      marginTop: "0.375rem",
                      fontSize: "0.75rem",
                      color: "var(--text-subtle)",
                    }}
                  >
                    <span>
                      {new Date(issue.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    {issue.landmark && (
                      <>
                        <span>•</span>
                        <span>Near {issue.landmark}</span>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexShrink: 0 }}>
                  <PriorityMeter priority={score} />
                  <ChevronRight
                    size={16}
                    strokeWidth={1.75}
                    style={{ color: "var(--text-subtle)" }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
