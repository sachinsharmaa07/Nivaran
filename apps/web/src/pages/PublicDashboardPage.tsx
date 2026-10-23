import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router";
import {
  Clock,
  ShieldCheck,
  Inbox,
  RotateCcw,
  AlertCircle,
  HelpCircle,
  MapPin,
} from "lucide-react";
import { StateSummary } from "../components/StateSummary.js";
import type { TenantInfo } from "../components/CityPicker.js";
import { Button, Skeleton, EmptyState, ErrorState } from "../ui/index.js";

interface UlbMetric {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  ulb_type: string;
  district: string;
  open_count: number | null;
  sla_compliance_pct: number | null;
  median_resolution_hours: number | null;
  masked: boolean;
}

interface PublicCategory {
  id: string;
  code: string;
  name: string;
  names?: Record<string, string>;
  evidence_required?: boolean;
}

// Single-run count-up hook
function useCountUp(target: number | null, duration = 750): number {
  const [value, setValue] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (target === null || isNaN(target)) {
      setValue(0);
      return;
    }
    if (hasAnimated.current) {
      setValue(target);
      return;
    }
    hasAnimated.current = true;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      setValue(target * ease);
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setValue(target);
      }
    };
    requestAnimationFrame(animate);
  }, [target, duration]);

  return value;
}

export function PublicDashboardPage({ tenant }: { tenant: TenantInfo }): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [currentUlb, setCurrentUlb] = useState<UlbMetric | null>(null);
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [hotspotStatus, setHotspotStatus] = useState<"loading" | "missing" | "ready">("loading");

  // Fetch live state summary metrics
  const fetchSummary = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`/api/v1/public/states/${tenant.state_code}/summary`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error(`Summary not found for state ${tenant.state_code}`);
        }
        throw new Error("Unable to load municipal performance metrics");
      }
      const data = await res.json();
      const ulbs = (data.data?.ulbs || []) as UlbMetric[];
      const match = ulbs.find((u) => u.tenant_slug === tenant.slug || u.tenant_id === tenant.id);
      if (match) {
        setCurrentUlb(match);
      } else {
        // Honest empty state when ULB not found in state summary
        setCurrentUlb(null);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Fetch categories for public breakdown table
  const fetchCategories = async () => {
    setCategoriesLoading(true);
    try {
      const res = await fetch(`/api/v1/public/${tenant.slug}/categories`);
      if (res.ok) {
        const json = await res.json();
        setCategories(json.data || []);
      }
    } catch {
      // Keep empty if failed
    } finally {
      setCategoriesLoading(false);
    }
  };

  // Probe hotspot metrics API honestly
  useEffect(() => {
    fetch(`/api/v1/metrics/hotspots?tenant_id=${tenant.id}`)
      .then((r) => {
        if (r.ok) setHotspotStatus("ready");
        else setHotspotStatus("missing");
      })
      .catch(() => setHotspotStatus("missing"));
  }, [tenant.id]);

  useEffect(() => {
    void fetchSummary();
    void fetchCategories();
  }, [tenant.state_code, tenant.slug, tenant.id]);

  // Animated values using count-up
  const animatedMedian = useCountUp(
    currentUlb && !currentUlb.masked && currentUlb.median_resolution_hours !== null
      ? currentUlb.median_resolution_hours
      : null
  );

  const animatedSla = useCountUp(
    currentUlb && !currentUlb.masked && currentUlb.sla_compliance_pct !== null
      ? currentUlb.sla_compliance_pct
      : null
  );

  const animatedOpen = useCountUp(
    currentUlb && !currentUlb.masked && currentUlb.open_count !== null
      ? currentUlb.open_count
      : null
  );

  const isMasked = currentUlb?.masked;

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "1.5rem" }}>
      {/* 1. City Header */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "2rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "0.25rem",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                padding: "2px 8px",
                borderRadius: "var(--r-sm)",
                backgroundColor: "var(--surface-sunken)",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
              }}
            >
              PUBLIC TRANSPARENCY
            </span>
            <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
              {tenant.district || tenant.name}, {tenant.state_code}
            </span>
          </div>

          <h1 style={{ margin: 0, fontSize: "2rem", color: "var(--text)" }}>
            {tenant.name} Civic Performance
          </h1>
          <p style={{ margin: "4px 0 0 0", color: "var(--text-muted)", fontSize: "0.9375rem" }}>
            Real-time municipal service level agreement compliance and resolution statistics
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <Link to="/">
            <Button variant="secondary" size="sm">
              &larr; Citizen Portal
            </Button>
          </Link>
          <Link to="/report">
            <Button variant="primary" size="sm">
              Report Issue
            </Button>
          </Link>
        </div>
      </header>

      {/* Error State */}
      {errorMsg && (
        <div style={{ marginBottom: "2rem" }}>
          <ErrorState
            title="Unable to load public metrics"
            message={errorMsg}
            onRetry={() => {
              void fetchSummary();
            }}
          />
        </div>
      )}

      {/* DPDP Privacy Masking Notice if active */}
      {isMasked && (
        <div
          style={{
            padding: "1rem 1.25rem",
            borderRadius: "var(--r-md)",
            backgroundColor: "var(--paint-50)",
            border: "1px solid var(--paint-300)",
            color: "var(--paint-900)",
            fontSize: "0.875rem",
            marginBottom: "1.75rem",
            display: "flex",
            alignItems: "flex-start",
            gap: "0.75rem",
          }}
        >
          <AlertCircle size={20} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: "2px" }} />
          <div>
            <strong>Statistical Privacy Suppression Active</strong>
            <p style={{ margin: "4px 0 0 0", fontSize: "0.8125rem", lineHeight: 1.5 }}>
              This municipal administrative unit currently has fewer than 10 submitted reports.
              Individual cell metrics are suppressed to prevent citizen or whistleblower
              re-identification under platform privacy standards.
            </p>
          </div>
        </div>
      )}

      {/* 2. Four KPI Plates (Median resolution, SLA compliance, Open grievances, Reopen rate) */}
      <section aria-label="Key Performance Indicators" style={{ marginBottom: "2.5rem" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "1.25rem",
          }}
        >
          {/* KPI 1: Median Resolution Time */}
          <div
            className="sign-plate"
            style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  color: "var(--text-muted)",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                <Clock size={16} strokeWidth={1.75} />
                <span>MEDIAN RESOLUTION TIME</span>
              </div>

              {loading ? (
                <div style={{ margin: "0.75rem 0" }}>
                  <Skeleton height="2.5rem" width="60%" />
                </div>
              ) : isMasked ? (
                <div
                  style={{
                    fontSize: "2.5rem",
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    margin: "0.5rem 0",
                  }}
                >
                  &mdash;
                </div>
              ) : currentUlb?.median_resolution_hours !== null &&
                currentUlb?.median_resolution_hours !== undefined ? (
                <div
                  style={{
                    fontSize: "2.5rem",
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    color: "var(--text)",
                    margin: "0.5rem 0",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {animatedMedian.toFixed(1)}
                  <span
                    style={{
                      fontSize: "1.25rem",
                      fontWeight: 500,
                      color: "var(--text-muted)",
                      marginLeft: "4px",
                    }}
                  >
                    hours
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    fontSize: "2rem",
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    margin: "0.5rem 0",
                  }}
                >
                  No data
                </div>
              )}
            </div>

            <div
              style={{
                fontSize: "0.8125rem",
                color: "var(--text-muted)",
                borderTop: "1px solid var(--border)",
                paddingTop: "0.5rem",
                marginTop: "0.5rem",
              }}
            >
              {isMasked
                ? "Masked for privacy (<10 reports)"
                : "50th percentile across resolved issues"}
            </div>
          </div>

          {/* KPI 2: SLA Compliance */}
          <div
            className="sign-plate"
            style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  color: "var(--text-muted)",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                <ShieldCheck size={16} strokeWidth={1.75} />
                <span>SLA COMPLIANCE</span>
              </div>

              {loading ? (
                <div style={{ margin: "0.75rem 0" }}>
                  <Skeleton height="2.5rem" width="60%" />
                </div>
              ) : isMasked ? (
                <div
                  style={{
                    fontSize: "2.5rem",
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    margin: "0.5rem 0",
                  }}
                >
                  &mdash;
                </div>
              ) : currentUlb?.sla_compliance_pct !== null &&
                currentUlb?.sla_compliance_pct !== undefined ? (
                <div
                  style={{
                    fontSize: "2.5rem",
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    color: "var(--text)",
                    margin: "0.5rem 0",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {animatedSla.toFixed(1)}
                  <span
                    style={{
                      fontSize: "1.5rem",
                      fontWeight: 500,
                      color: "var(--text-muted)",
                      marginLeft: "2px",
                    }}
                  >
                    %
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    fontSize: "2rem",
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    margin: "0.5rem 0",
                  }}
                >
                  No data
                </div>
              )}
            </div>

            <div
              style={{
                fontSize: "0.8125rem",
                color: "var(--text-muted)",
                borderTop: "1px solid var(--border)",
                paddingTop: "0.5rem",
                marginTop: "0.5rem",
              }}
            >
              {isMasked
                ? "Masked for privacy (<10 reports)"
                : "Resolved within statutory policy window"}
            </div>
          </div>

          {/* KPI 3: Open Grievances */}
          <div
            className="sign-plate"
            style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  color: "var(--text-muted)",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                <Inbox size={16} strokeWidth={1.75} />
                <span>OPEN NOW</span>
              </div>

              {loading ? (
                <div style={{ margin: "0.75rem 0" }}>
                  <Skeleton height="2.5rem" width="60%" />
                </div>
              ) : isMasked ? (
                <div
                  style={{
                    fontSize: "2.5rem",
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    margin: "0.5rem 0",
                  }}
                >
                  &mdash;
                </div>
              ) : currentUlb?.open_count !== null && currentUlb?.open_count !== undefined ? (
                <div
                  style={{
                    fontSize: "2.5rem",
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    color: "var(--text)",
                    margin: "0.5rem 0",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {Math.round(animatedOpen)}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: "2rem",
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    margin: "0.5rem 0",
                  }}
                >
                  0
                </div>
              )}
            </div>

            <div
              style={{
                fontSize: "0.8125rem",
                color: "var(--text-muted)",
                borderTop: "1px solid var(--border)",
                paddingTop: "0.5rem",
                marginTop: "0.5rem",
              }}
            >
              {isMasked
                ? "Masked for privacy (<10 reports)"
                : "Active reports currently pending action"}
            </div>
          </div>

          {/* KPI 4: Citizen Reopen Rate */}
          <div
            className="sign-plate"
            style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  color: "var(--text-muted)",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                <RotateCcw size={16} strokeWidth={1.75} />
                <span>REOPEN RATE</span>
              </div>

              {/* Honest empty state: API summary doesn't compute reopen rate */}
              <div
                style={{
                  fontSize: "2.5rem",
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  margin: "0.5rem 0",
                }}
              >
                &mdash;
              </div>
            </div>

            <div
              style={{
                fontSize: "0.8125rem",
                color: "var(--text-muted)",
                borderTop: "1px solid var(--border)",
                paddingTop: "0.5rem",
                marginTop: "0.5rem",
              }}
            >
              API metric endpoint pending backend implementation
            </div>
          </div>
        </div>
      </section>

      {/* 3. Department & Category Services Table */}
      <section style={{ marginBottom: "2.5rem" }}>
        <div className="sign-plate">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: "1rem",
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: "1.25rem", color: "var(--text)" }}>
                Municipal Service Categories
              </h2>
              <p style={{ margin: "2px 0 0 0", fontSize: "0.875rem", color: "var(--text-muted)" }}>
                Active reporting heads and SLA coverage for {tenant.name}
              </p>
            </div>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              {categories.length} Active Categories
            </span>
          </div>

          {categoriesLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <Skeleton height="40px" />
              <Skeleton height="40px" />
              <Skeleton height="40px" />
            </div>
          ) : categories.length === 0 ? (
            <EmptyState
              title="No service categories published"
              message="Configured municipal departments and categories will appear here."
            />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  textAlign: "left",
                  fontSize: "0.875rem",
                }}
              >
                <thead>
                  <tr
                    style={{ borderBottom: "2px solid var(--border)", color: "var(--text-muted)" }}
                  >
                    <th style={{ padding: "0.75rem", fontWeight: 600 }}>Category Name</th>
                    <th style={{ padding: "0.75rem", fontWeight: 600 }}>Statutory Code</th>
                    <th style={{ padding: "0.75rem", fontWeight: 600 }}>
                      Multilingual Localization
                    </th>
                    <th style={{ padding: "0.75rem", fontWeight: 600 }}>Evidence Requirement</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat) => (
                    <tr
                      key={cat.id || cat.code}
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <td style={{ padding: "0.75rem", fontWeight: 600, color: "var(--text)" }}>
                        {cat.name || cat.names?.["en"] || cat.code}
                      </td>
                      <td style={{ padding: "0.75rem" }}>
                        <code style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {cat.code}
                        </code>
                      </td>
                      <td style={{ padding: "0.75rem", color: "var(--text-muted)" }}>
                        {cat.names?.["hi"] ? `HI: ${cat.names["hi"]}` : ""}{" "}
                        {cat.names?.["pa"] ? `| PA: ${cat.names["pa"]}` : ""}
                        {!cat.names?.["hi"] && !cat.names?.["pa"] ? "Standard EN" : ""}
                      </td>
                      <td style={{ padding: "0.75rem" }}>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            padding: "2px 8px",
                            borderRadius: "var(--r-sm)",
                            backgroundColor: "var(--surface-sunken)",
                            border: "1px solid var(--border)",
                            color: "var(--text-muted)",
                          }}
                        >
                          {cat.evidence_required !== false ? "Mandatory Photo" : "Optional"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* 4. Hotspot Map or Grid from Metrics API */}
      <section style={{ marginBottom: "2.5rem" }}>
        <div className="sign-plate">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: "1rem",
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: "1.25rem", color: "var(--text)" }}>
                Geographic Issue Density & Hotspots
              </h2>
              <p style={{ margin: "2px 0 0 0", fontSize: "0.875rem", color: "var(--text-muted)" }}>
                PostGIS spatial clustering and recurrent complaint density
              </p>
            </div>
          </div>

          {/* Honest Empty State for Missing Hotspot Endpoint */}
          {hotspotStatus === "loading" ? (
            <div style={{ padding: "1.5rem" }}>
              <Skeleton height="100px" />
            </div>
          ) : (
            <div
              style={{
                padding: "2.5rem 1.5rem",
                borderRadius: "var(--r-md)",
                backgroundColor: "var(--surface-sunken)",
                border: "1px dashed var(--border)",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <MapPin size={32} strokeWidth={1.5} style={{ color: "var(--text-subtle)" }} />
              <div>
                <h3 style={{ margin: "0 0 0.25rem 0", fontSize: "1rem", color: "var(--text)" }}>
                  Hotspot Metrics API Not Configured
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.8125rem",
                    color: "var(--text-muted)",
                    maxWidth: "520px",
                  }}
                >
                  Endpoint <code>/api/v1/metrics/hotspots</code> is pending PostGIS cluster pipeline
                  deployment. Once enabled, spatial kernel density surfaces and ward hotspots will
                  render here.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 5. Statewide ULB Comparison Table */}
      <section style={{ marginBottom: "2.5rem" }}>
        <StateSummary stateCode={tenant.state_code} />
      </section>

      {/* 6. Methodology & DPDP Privacy Disclosure Note */}
      <section>
        <div
          className="sign-plate"
          style={{
            backgroundColor: "var(--surface-sunken)",
            fontSize: "0.8125rem",
            color: "var(--text-muted)",
            lineHeight: 1.6,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              color: "var(--text)",
              fontWeight: 700,
              marginBottom: "0.5rem",
            }}
          >
            <HelpCircle size={16} strokeWidth={2} />
            <span>Methodology & Statistical Privacy Disclosures</span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1rem",
            }}
          >
            <div>
              <strong style={{ color: "var(--text)" }}>Median Resolution Time:</strong> Computed as
              the 50th percentile (P50) duration between verified ticket intake and the terminal
              resolved timestamp. Pauses outside official working hours.
            </div>
            <div>
              <strong style={{ color: "var(--text)" }}>SLA Compliance Rate:</strong> The percentage
              of tickets resolved within statutory policy hours without breaching SLA escalation
              thresholds.
            </div>
            <div>
              <strong style={{ color: "var(--text)" }}>Open Grievances:</strong> Current unresolved
              reports in Submitted, Triaged, In Progress, or Scheduled states.
            </div>
            <div>
              <strong style={{ color: "var(--text)" }}>DPDP Privacy Cell Suppression:</strong>{" "}
              Administrative units with fewer than 10 submitted reports are masked (&mdash;) to
              prevent re-identification of individual citizens or reporting households.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
