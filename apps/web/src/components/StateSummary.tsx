import React, { useState, useEffect } from "react";
import { useTranslation } from "../utils/i18n.js";
import { Select, Skeleton, EmptyState } from "../ui/index.js";

interface UlbSummaryItem {
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

export function StateSummary({ stateCode = "PB" }: { stateCode?: string }): React.JSX.Element {
  const { t } = useTranslation();
  const [data, setData] = useState<UlbSummaryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [code, setCode] = useState<string>(stateCode);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/v1/public/states/${code}/summary`)
      .then((r) => (r.ok ? r.json() : null))
      .then((res: { data?: { ulbs?: UlbSummaryItem[] } } | null) => {
        if (res?.data?.ulbs) {
          setData(res.data.ulbs);
        }
      })
      .catch((_err: unknown) => {
        // Fallback state metrics
      })
      .finally(() => setLoading(false));
  }, [code]);

  return (
    <div
      className="card-container"
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
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: "0 0 0.25rem 0", fontSize: "1.25rem", color: "var(--text)" }}>
            {t("state_summary") || "State Civic Health Summary"}
          </h2>
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            {t("privacy_masked_note") || "Counts under 5 are masked for citizen privacy"}
          </p>
        </div>

        <div style={{ minWidth: "160px" }}>
          <Select value={code} onChange={(e) => setCode(e.target.value)}>
            <option value="PB">Punjab (PB)</option>
            <option value="MH">Maharashtra (MH)</option>
            <option value="TN">Tamil Nadu (TN)</option>
          </Select>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <Skeleton height="44px" />
          <Skeleton height="44px" />
          <Skeleton height="44px" />
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          title={`No metrics for state ${code}`}
          description="Municipality aggregate performance data has not yet been ingested for this region."
        />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.875rem",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <thead>
              <tr
                style={{
                  backgroundColor: "var(--surface-sunken)",
                  textAlign: "left",
                  borderBottom: "1px solid var(--border)",
                  color: "var(--text-muted)",
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.02em",
                }}
              >
                <th style={{ padding: "0.625rem 0.75rem" }}>Municipality</th>
                <th style={{ padding: "0.625rem 0.75rem" }}>District</th>
                <th style={{ padding: "0.625rem 0.75rem" }}>Open Issues</th>
                <th style={{ padding: "0.625rem 0.75rem" }}>SLA Compliance</th>
                <th style={{ padding: "0.625rem 0.75rem" }}>Median Resolution</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr
                  key={item.tenant_id}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                >
                  <td style={{ padding: "0.625rem 0.75rem", fontWeight: 600 }}>
                    {item.tenant_name}
                  </td>
                  <td style={{ padding: "0.625rem 0.75rem", color: "var(--text-muted)" }}>
                    {item.district}
                  </td>
                  <td style={{ padding: "0.625rem 0.75rem" }}>
                    {item.masked ? (
                      <span style={{ color: "var(--text-subtle)", fontStyle: "italic" }}>
                        &lt; 5 (masked)
                      </span>
                    ) : (
                      (item.open_count ?? "0")
                    )}
                  </td>
                  <td style={{ padding: "0.625rem 0.75rem" }}>
                    {item.masked || item.sla_compliance_pct === null ? (
                      <span style={{ color: "var(--text-subtle)" }}>—</span>
                    ) : (
                      <span
                        style={{
                          color:
                            item.sla_compliance_pct >= 85
                              ? "var(--sign-600)"
                              : item.sla_compliance_pct >= 70
                                ? "var(--paint-600)"
                                : "var(--kerb-600)",
                          fontWeight: 600,
                        }}
                      >
                        {item.sla_compliance_pct}%
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "0.625rem 0.75rem" }}>
                    {item.masked || item.median_resolution_hours === null
                      ? "—"
                      : `${item.median_resolution_hours} hours`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
