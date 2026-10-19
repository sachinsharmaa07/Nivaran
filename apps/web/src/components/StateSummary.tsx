import React, { useState, useEffect } from "react";
import { useTranslation } from "../utils/i18n.js";

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
      style={{
        backgroundColor: "#ffffff",
        borderRadius: "16px",
        border: "1px solid #e2e8f0",
        padding: "1.5rem",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <div>
          <h3 style={{ margin: "0 0 0.25rem 0", color: "#0f172a" }}>{t("state_summary")}</h3>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
            {t("privacy_masked_note")}
          </p>
        </div>

        <select
          value={code}
          onChange={(e) => setCode(e.target.value)}
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "8px",
            border: "1px solid #cbd5e1",
            fontWeight: 600,
          }}
        >
          <option value="PB">Punjab (PB)</option>
          <option value="MH">Maharashtra (MH)</option>
          <option value="TN">Tamil Nadu (TN)</option>
        </select>
      </div>

      {loading ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>
          Loading civic metrics...
        </div>
      ) : data.length === 0 ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>
          No ULBs found for state {code}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ backgroundColor: "#f8fafc", textAlign: "left" }}>
                <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #e2e8f0" }}>
                  Municipality
                </th>
                <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #e2e8f0" }}>
                  District
                </th>
                <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #e2e8f0" }}>
                  Open Issues
                </th>
                <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #e2e8f0" }}>
                  SLA Compliance
                </th>
                <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #e2e8f0" }}>
                  Median Resolution
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.tenant_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "#1e293b" }}>
                    {item.tenant_name}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "#64748b" }}>{item.district}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    {item.masked ? (
                      <span style={{ color: "#94a3b8", fontStyle: "italic" }}>
                        — (&lt;10 issues)
                      </span>
                    ) : (
                      <span style={{ fontWeight: 600, color: "#2563eb" }}>{item.open_count}</span>
                    )}
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    {item.masked ? (
                      <span style={{ color: "#94a3b8", fontStyle: "italic" }}>—</span>
                    ) : (
                      <span
                        style={{
                          fontWeight: 600,
                          color: (item.sla_compliance_pct ?? 0) >= 80 ? "#16a34a" : "#ca8a04",
                        }}
                      >
                        {item.sla_compliance_pct}%
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    {item.masked ? (
                      <span style={{ color: "#94a3b8", fontStyle: "italic" }}>—</span>
                    ) : (
                      <span>{item.median_resolution_hours} hrs</span>
                    )}
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
