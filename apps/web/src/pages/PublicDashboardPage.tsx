import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router";
import { AlertTriangle, HelpCircle, Building2 } from "lucide-react";
import { StateSummary } from "../components/StateSummary.js";
import type { TenantInfo } from "../components/CityPicker.js";
import { CitizenMap, type MapPin as CitizenMapPin } from "../components/CitizenMap.js";
import { Button, Skeleton, EmptyState, ErrorState, SignPlate } from "../ui/index.js";

interface DepartmentMetric {
  department_id: string;
  department_code: string;
  department_name: string;
  metrics: {
    total_issues: number;
    open_count: number | "insufficient";
    median_resolution_hours: number | "insufficient";
    p90_resolution_hours: number | "insufficient";
    sla_compliance_pct: number | "insufficient";
    reopen_rate_pct: number | "insufficient";
  };
}

interface PublicMetricsData {
  tenant_slug: string;
  tenant_name: string;
  overall: {
    total_issues: number;
    open_count: number | "insufficient";
    median_resolution_hours: number | "insufficient";
    p90_resolution_hours: number | "insufficient";
    sla_compliance_pct: number | "insufficient";
    reopen_rate_pct: number | "insufficient";
  };
  by_department: DepartmentMetric[];
  by_ward: {
    ward_id: string;
    ward_number: string;
    ward_name: string;
    metrics: {
      total_issues: number;
      open_count: number | "insufficient";
      median_resolution_hours: number | "insufficient";
      p90_resolution_hours: number | "insufficient";
      sla_compliance_pct: number | "insufficient";
      reopen_rate_pct: number | "insufficient";
    };
  }[];
}

interface Hotspot {
  grid_id: string;
  lat_grid: number;
  lon_grid: number;
  count: number;
  primary_category?: string | null;
}

// Single-run count-up hook per DESIGN.md §3 (700 ms count-up once)
function useCountUp(target: number | null, duration = 700): number {
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
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [metrics, setMetrics] = useState<PublicMetricsData | null>(null);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [hotspotStatus, setHotspotStatus] = useState<"loading" | "missing" | "ready">("loading");

  // Fetch live metrics directly from the municipal endpoint
  const fetchMetrics = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`/api/v1/public/${tenant.slug}/metrics`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error(`Municipal metrics record not found for ${tenant.name} (${tenant.slug})`);
        }
        throw new Error("Unable to fetch civic service level metrics from city API");
      }
      const json = await res.json();
      if (json.data) {
        setMetrics(json.data as PublicMetricsData);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Fetch spatial hotspots
  useEffect(() => {
    fetch(`/api/v1/public/${tenant.slug}/hotspots`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const spots = json?.data?.hotspots ?? [];
        setHotspots(spots);
        setHotspotStatus("ready");
      })
      .catch(() => setHotspotStatus("missing"));
  }, [tenant.slug]);

  useEffect(() => {
    void fetchMetrics();
  }, [tenant.slug]);

  // Animated KPI numbers
  const rawMedian = metrics?.overall?.median_resolution_hours;
  const numMedian = typeof rawMedian === "number" ? rawMedian : null;
  const animatedMedian = useCountUp(numMedian);

  const rawSla = metrics?.overall?.sla_compliance_pct;
  const numSla = typeof rawSla === "number" ? rawSla : null;
  const animatedSla = useCountUp(numSla);

  const rawOpen = metrics?.overall?.open_count;
  const numOpen = typeof rawOpen === "number" ? rawOpen : null;
  const animatedOpen = useCountUp(numOpen);

  const rawReopen = metrics?.overall?.reopen_rate_pct;
  const numReopen = typeof rawReopen === "number" ? rawReopen : null;
  const animatedReopen = useCountUp(numReopen);

  const hasInsufficientData =
    rawMedian === "insufficient" ||
    rawSla === "insufficient" ||
    rawOpen === "insufficient" ||
    rawReopen === "insufficient" ||
    metrics?.by_department.some((d) => d.metrics.open_count === "insufficient");

  // Center map coordinates based on tenant state/region
  const defaultCenter =
    tenant.state_code === "MH"
      ? { lat: 18.5204, lon: 73.8567 }
      : tenant.state_code === "TN"
        ? { lat: 13.0827, lon: 80.2707 }
        : { lat: 31.634, lon: 74.8723 }; // Punjab default

  const mapCenter = defaultCenter;

  const hotspotPins: CitizenMapPin[] = hotspots.map((h) => ({
    publicId: h.grid_id,
    lat: h.lat_grid,
    lon: h.lon_grid,
    categoryCode: h.primary_category || "pothole",
    categoryName: `${h.count} incidents`,
    status: h.count > 10 ? "in_progress" : "submitted",
    description: `Density cell (${h.count} complaints)`,
  }));

  return (
    <div style={{ backgroundColor: "var(--bg)", minHeight: "100vh" }}>
      {/* 1. Asphalt Header Band with City Name & One-Line Live Summary */}
      <header
        style={{
          backgroundColor: "var(--asphalt-900)",
          color: "#ffffff",
          padding: "3rem 1.5rem 2.5rem 1.5rem",
          borderBottom: "4px solid var(--paint-400)",
        }}
      >
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "1.5rem",
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "4px 10px",
                  borderRadius: "var(--r-sm)",
                  backgroundColor: "rgba(255, 255, 255, 0.12)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: "0.75rem",
                  color: "var(--paint-400)",
                }}
              >
                <span>CIVIC SLA & TRANSPARENCY</span>
                <span>•</span>
                <span>{tenant.state_code} MUNICIPAL RECORD</span>
              </div>

              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(2.25rem, 5vw, 3.75rem)",
                  fontWeight: 700,
                  margin: "0 0 0.5rem 0",
                  lineHeight: 1.05,
                  letterSpacing: "-0.01em",
                  textTransform: "uppercase",
                  color: "#ffffff",
                }}
              >
                {tenant.name}
              </h1>

              <p
                style={{
                  margin: 0,
                  fontSize: "1.0625rem",
                  color: "var(--asphalt-300)",
                  maxWidth: "760px",
                  lineHeight: 1.45,
                }}
              >
                Real-time municipal service level agreement compliance and resolution statistics
              </p>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
              <Link to="/">
                <Button
                  variant="ghost"
                  size="sm"
                  style={{
                    color: "#ffffff",
                    border: "1px solid rgba(255, 255, 255, 0.4)",
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                  }}
                >
                  &larr; Citizen Portal
                </Button>
              </Link>
              <Link to="/report">
                <Button variant="cta" size="sm">
                  Report an Issue
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem 1.5rem" }}>
        {/* Error Alert */}
        {errorMsg && (
          <div style={{ marginBottom: "2rem" }}>
            <ErrorState
              title="Unable to load public metrics"
              message={errorMsg}
              onRetry={() => {
                void fetchMetrics();
              }}
            />
          </div>
        )}

        {/* Visible "Not Enough Data" Notice if data is suppressed */}
        {hasInsufficientData && (
          <div
            style={{
              padding: "1rem 1.25rem",
              borderRadius: "var(--r-md)",
              backgroundColor: "var(--paint-50)",
              border: "1px solid var(--paint-300)",
              color: "var(--paint-900)",
              fontSize: "0.875rem",
              marginBottom: "2rem",
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
            }}
          >
            <AlertTriangle
              size={20}
              strokeWidth={2}
              style={{ flexShrink: 0, marginTop: "2px", color: "var(--paint-700)" }}
            />
            <div>
              <strong style={{ fontSize: "0.9375rem" }}>
                Notice: Statistical Threshold Applied (Not Enough Data)
              </strong>
              <p style={{ margin: "4px 0 0 0", fontSize: "0.8125rem", lineHeight: 1.5 }}>
                Certain department or ward cells have fewer than 10 recorded issues. Under municipal
                privacy and DPDP data hygiene guidelines, metrics for small sample cells are marked
                as &ldquo;not enough data&rdquo; to avoid distortion and preserve reporting
                confidentiality.
              </p>
            </div>
          </div>
        )}

        {/* 2. Four Sign-Plate KPIs with Once-Only Count-Up */}
        <section aria-label="Key Performance Indicators" style={{ marginBottom: "2.5rem" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "1.25rem",
            }}
          >
            {/* KPI 1: Median Resolution Time */}
            <SignPlate label="Median Resolution Time">
              <div
                style={{
                  minHeight: "90px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                {loading ? (
                  <Skeleton height="3rem" width="60%" />
                ) : rawMedian === "insufficient" ? (
                  <div
                    style={{
                      fontSize: "1.75rem",
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                    }}
                  >
                    Not enough data
                  </div>
                ) : numMedian !== null ? (
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.375rem" }}>
                    <span
                      style={{
                        fontSize: "3.25rem",
                        fontFamily: "var(--font-display)",
                        fontWeight: 700,
                        color: "var(--text)",
                        lineHeight: 1,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {animatedMedian.toFixed(1)}
                    </span>
                    <span
                      style={{ fontSize: "1.25rem", color: "var(--text-muted)", fontWeight: 500 }}
                    >
                      hours
                    </span>
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: "2rem",
                      fontFamily: "var(--font-display)",
                      color: "var(--text-muted)",
                    }}
                  >
                    —
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
                50th percentile (P50) across resolved civic reports
              </div>
            </SignPlate>

            {/* KPI 2: SLA Compliance Rate */}
            <SignPlate label="SLA Compliance Rate">
              <div
                style={{
                  minHeight: "90px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                {loading ? (
                  <Skeleton height="3rem" width="60%" />
                ) : rawSla === "insufficient" ? (
                  <div
                    style={{
                      fontSize: "1.75rem",
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                    }}
                  >
                    Not enough data
                  </div>
                ) : numSla !== null ? (
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem" }}>
                    <span
                      style={{
                        fontSize: "3.25rem",
                        fontFamily: "var(--font-display)",
                        fontWeight: 700,
                        color: "var(--text)",
                        lineHeight: 1,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {Math.round(animatedSla)}
                    </span>
                    <span
                      style={{ fontSize: "1.5rem", color: "var(--text-muted)", fontWeight: 600 }}
                    >
                      %
                    </span>
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: "2rem",
                      fontFamily: "var(--font-display)",
                      color: "var(--text-muted)",
                    }}
                  >
                    —
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
                Resolved within statutory municipal timeframe
              </div>
            </SignPlate>

            {/* KPI 3: Open Grievances */}
            <SignPlate label="Open Grievances">
              <div
                style={{
                  minHeight: "90px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                {loading ? (
                  <Skeleton height="3rem" width="60%" />
                ) : rawOpen === "insufficient" ? (
                  <div
                    style={{
                      fontSize: "1.75rem",
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                    }}
                  >
                    Not enough data
                  </div>
                ) : numOpen !== null ? (
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem" }}>
                    <span
                      style={{
                        fontSize: "3.25rem",
                        fontFamily: "var(--font-display)",
                        fontWeight: 700,
                        color: "var(--text)",
                        lineHeight: 1,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {Math.round(animatedOpen)}
                    </span>
                    <span
                      style={{ fontSize: "1.125rem", color: "var(--text-muted)", fontWeight: 500 }}
                    >
                      active
                    </span>
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: "2rem",
                      fontFamily: "var(--font-display)",
                      color: "var(--text-muted)",
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
                Currently in submitted, triaged or in-progress status
              </div>
            </SignPlate>

            {/* KPI 4: Citizen Reopen Rate */}
            <SignPlate label="Citizen Reopen Rate">
              <div
                style={{
                  minHeight: "90px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                {loading ? (
                  <Skeleton height="3rem" width="60%" />
                ) : rawReopen === "insufficient" ? (
                  <div
                    style={{
                      fontSize: "1.75rem",
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                    }}
                  >
                    Not enough data
                  </div>
                ) : numReopen !== null ? (
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem" }}>
                    <span
                      style={{
                        fontSize: "3.25rem",
                        fontFamily: "var(--font-display)",
                        fontWeight: 700,
                        color: "var(--text)",
                        lineHeight: 1,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {animatedReopen.toFixed(1)}
                    </span>
                    <span
                      style={{ fontSize: "1.5rem", color: "var(--text-muted)", fontWeight: 600 }}
                    >
                      %
                    </span>
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: "2rem",
                      fontFamily: "var(--font-display)",
                      color: "var(--text-muted)",
                    }}
                  >
                    0.0%
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
                Resolved issues disputed or reopened by citizens
              </div>
            </SignPlate>
          </div>
        </section>

        {/* 3. Calm Hotspot Map */}
        <section aria-label="Calm Hotspot Map" style={{ marginBottom: "2.5rem" }}>
          <SignPlate label="Geographic Density & Recurrent Hotspots">
            <div style={{ marginBottom: "1rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <div>
                  <h2
                    style={{
                      fontSize: "1.25rem",
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      margin: 0,
                      color: "var(--text)",
                    }}
                  >
                    Spatial Cluster Analysis (~500m Resolution)
                  </h2>
                  <p
                    style={{
                      margin: "2px 0 0 0",
                      fontSize: "0.875rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    Recurrent complaints grouped by spatial centroid with calmed map tiles
                  </p>
                </div>
                <span
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {hotspots.length} ACTIVE CLUSTERS
                </span>
              </div>
            </div>

            {hotspotStatus === "loading" ? (
              <Skeleton height="360px" />
            ) : (
              <div
                style={{
                  height: "380px",
                  borderRadius: "var(--r-md)",
                  overflow: "hidden",
                  border: "1px solid var(--border)",
                }}
              >
                <CitizenMap pins={hotspotPins} center={mapCenter} zoom={12} />
              </div>
            )}
          </SignPlate>
        </section>

        {/* 4. Department Table with a Small Bar Per Row */}
        <section aria-label="Department Breakdown" style={{ marginBottom: "2.5rem" }}>
          <SignPlate label="Departmental Performance Breakdown">
            <div style={{ marginBottom: "1rem" }}>
              <h2
                style={{
                  fontSize: "1.25rem",
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  margin: 0,
                  color: "var(--text)",
                }}
              >
                Active Municipal Departments
              </h2>
              <p style={{ margin: "2px 0 0 0", fontSize: "0.875rem", color: "var(--text-muted)" }}>
                Volume, backlog, resolution median, and statutory SLA compliance with live progress
                indicator
              </p>
            </div>

            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <Skeleton height="44px" />
                <Skeleton height="44px" />
                <Skeleton height="44px" />
              </div>
            ) : !metrics?.by_department || metrics.by_department.length === 0 ? (
              <EmptyState
                title="No department metrics available"
                description="Departmental breakdown will appear once reports are triaged."
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
                      style={{
                        backgroundColor: "var(--surface-sunken)",
                        borderBottom: "1px solid var(--border)",
                        color: "var(--text-muted)",
                        fontSize: "0.75rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        fontWeight: 700,
                      }}
                    >
                      <th style={{ padding: "0.75rem 1rem" }}>Department</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Total Reports</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Active Open</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>P50 Median</th>
                      <th style={{ padding: "0.75rem 1rem" }}>SLA Compliance (Target: 85%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.by_department.map((dept) => {
                      const slaVal =
                        typeof dept.metrics.sla_compliance_pct === "number"
                          ? dept.metrics.sla_compliance_pct
                          : 0;
                      const hasSla = typeof dept.metrics.sla_compliance_pct === "number";

                      return (
                        <tr
                          key={dept.department_id}
                          style={{
                            borderBottom: "1px solid var(--border)",
                            transition: "background-color var(--dur-fast) var(--ease-out)",
                          }}
                        >
                          <td
                            style={{
                              padding: "0.875rem 1rem",
                              fontWeight: 600,
                              color: "var(--text)",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <Building2
                                size={16}
                                strokeWidth={1.75}
                                style={{ color: "var(--text-muted)" }}
                              />
                              <span>{dept.department_name}</span>
                              <code
                                style={{
                                  fontSize: "0.75rem",
                                  color: "var(--text-subtle)",
                                  backgroundColor: "var(--surface-sunken)",
                                  padding: "1px 6px",
                                  borderRadius: "var(--r-sm)",
                                }}
                              >
                                {dept.department_code}
                              </code>
                            </div>
                          </td>

                          <td
                            style={{
                              padding: "0.875rem 1rem",
                              textAlign: "right",
                              fontVariantNumeric: "tabular-nums",
                              fontWeight: 600,
                            }}
                          >
                            {dept.metrics.total_issues}
                          </td>

                          <td
                            style={{
                              padding: "0.875rem 1rem",
                              textAlign: "right",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {dept.metrics.open_count === "insufficient" ? (
                              <span style={{ fontSize: "0.75rem", color: "var(--text-subtle)" }}>
                                &lt; 10 (hidden)
                              </span>
                            ) : (
                              dept.metrics.open_count
                            )}
                          </td>

                          <td
                            style={{
                              padding: "0.875rem 1rem",
                              textAlign: "right",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {dept.metrics.median_resolution_hours === "insufficient" ? (
                              <span style={{ fontSize: "0.75rem", color: "var(--text-subtle)" }}>
                                —
                              </span>
                            ) : typeof dept.metrics.median_resolution_hours === "number" ? (
                              `${dept.metrics.median_resolution_hours}h`
                            ) : (
                              "—"
                            )}
                          </td>

                          <td style={{ padding: "0.875rem 1rem" }}>
                            {hasSla ? (
                              <div
                                style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}
                              >
                                <div
                                  style={{
                                    flex: "1",
                                    maxWidth: "140px",
                                    height: "8px",
                                    backgroundColor: "var(--surface-sunken)",
                                    borderRadius: "4px",
                                    overflow: "hidden",
                                    border: "1px solid var(--border)",
                                  }}
                                  role="progressbar"
                                  aria-valuenow={slaVal}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                >
                                  <div
                                    style={{
                                      width: `${Math.min(100, Math.max(0, slaVal))}%`,
                                      height: "100%",
                                      backgroundColor:
                                        slaVal >= 85
                                          ? "var(--sign-600)"
                                          : slaVal >= 70
                                            ? "var(--paint-500)"
                                            : "var(--kerb-500)",
                                    }}
                                  />
                                </div>
                                <span
                                  style={{
                                    fontWeight: 700,
                                    fontVariantNumeric: "tabular-nums",
                                    fontSize: "0.8125rem",
                                    color: slaVal >= 85 ? "var(--sign-700)" : "var(--text)",
                                  }}
                                >
                                  {slaVal}%
                                </span>
                              </div>
                            ) : (
                              <span style={{ fontSize: "0.75rem", color: "var(--text-subtle)" }}>
                                Not enough data
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SignPlate>
        </section>

        {/* 5. Statewide Comparison Summary */}
        <section aria-label="Statewide Comparison" style={{ marginBottom: "2.5rem" }}>
          <StateSummary stateCode={tenant.state_code} />
        </section>

        {/* 6. Methodology Note & Statistical Disclosures */}
        <section aria-label="Methodology Disclosures">
          <SignPlate label="Methodology & Public Data Hygiene Note">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.75rem",
                color: "var(--text)",
                fontWeight: 700,
              }}
            >
              <HelpCircle size={18} strokeWidth={2} />
              <span>Audit Methodology & Privacy Cell Standards</span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "1.25rem",
                fontSize: "0.8125rem",
                color: "var(--text-muted)",
                lineHeight: 1.6,
              }}
            >
              <div>
                <strong style={{ color: "var(--text)" }}>Median Resolution Time (P50):</strong>{" "}
                Calculated as the exact median duration between verified citizen intake and staff
                resolution completion. Night hours outside statutory working calendars are paused to
                reflect true operational responsiveness.
              </div>
              <div>
                <strong style={{ color: "var(--text)" }}>SLA Compliance Percentage:</strong>{" "}
                Measures the fraction of closed tickets resolved before the deadline specified in
                statutory ULB citizen charters.
              </div>
              <div>
                <strong style={{ color: "var(--text)" }}>Reopen Rate:</strong> The percentage of
                resolved tickets flagged as &ldquo;still broken&rdquo; by citizens within 72 hours
                of closure.
              </div>
              <div>
                <strong style={{ color: "var(--text)" }}>
                  DPDP & Privacy Suppression (&ldquo;Not Enough Data&rdquo;):
                </strong>{" "}
                Administrative cells containing fewer than 10 submissions are masked with a visible
                notice to prevent re-identification of whistleblowers or individual households.
              </div>
            </div>
          </SignPlate>
        </section>
      </main>
    </div>
  );
}
