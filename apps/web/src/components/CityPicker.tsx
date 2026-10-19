import React, { useState, useEffect } from "react";
import { useTranslation } from "../utils/i18n.js";

export interface TenantInfo {
  id: string;
  slug: string;
  code: string;
  name: string;
  ulb_type: string;
  state_code: string;
  district: string;
  default_locale: string;
  enabled_locales: string[];
}

interface StateInfo {
  code: string;
  name: string;
}

const FALLBACK_STATES: StateInfo[] = [
  { code: "PB", name: "Punjab" },
  { code: "MH", name: "Maharashtra" },
  { code: "TN", name: "Tamil Nadu" },
  { code: "DL", name: "Delhi" },
  { code: "KA", name: "Karnataka" },
  { code: "UP", name: "Uttar Pradesh" },
];

const FALLBACK_TENANTS: TenantInfo[] = [
  {
    id: "demo-punjab-id",
    slug: "demo-punjab",
    code: "DPB",
    name: "Municipal Corporation Ludhiana (Demo Punjab)",
    ulb_type: "municipal_corporation",
    state_code: "PB",
    district: "Ludhiana",
    default_locale: "en",
    enabled_locales: ["en", "hi", "pa"],
  },
  {
    id: "demo-maharashtra-id",
    slug: "demo-maharashtra",
    code: "DMH",
    name: "Brihanmumbai Municipal Corporation (Demo Maharashtra)",
    ulb_type: "municipal_corporation",
    state_code: "MH",
    district: "Mumbai",
    default_locale: "en",
    enabled_locales: ["en", "hi"],
  },
  {
    id: "demo-tamil-nadu-id",
    slug: "demo-tamil-nadu",
    code: "DTN",
    name: "Greater Chennai Corporation (Demo Tamil Nadu)",
    ulb_type: "municipal_corporation",
    state_code: "TN",
    district: "Chennai",
    default_locale: "en",
    enabled_locales: ["en"],
  },
];

export function CityPicker({
  isOpen,
  onClose,
  onSelectTenant,
}: {
  isOpen: boolean;
  onClose?: () => void;
  onSelectTenant: (t: TenantInfo) => void;
}): React.JSX.Element | null {
  const { t } = useTranslation();

  const [states, setStates] = useState<StateInfo[]>(FALLBACK_STATES);
  const [tenants, setTenants] = useState<TenantInfo[]>(FALLBACK_TENANTS);

  const [selectedState, setSelectedState] = useState<string>("");
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    // Attempt fetching live data from public API
    fetch("/api/v1/public/states")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { data?: StateInfo[] } | null) => {
        if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
          setStates(data.data);
        }
      })
      .catch((_err: unknown) => {
        // Fallback states used
      });

    fetch("/api/v1/public/tenants")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { data?: TenantInfo[] } | null) => {
        if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
          setTenants(data.data);
        }
      })
      .catch((_err: unknown) => {
        // Fallback tenants used
      });
  }, []);

  if (!isOpen) return null;

  // Filter districts available for the selected state
  const availableDistricts = Array.from(
    new Set(
      tenants
        .filter((t) => !selectedState || t.state_code.toUpperCase() === selectedState.toUpperCase())
        .map((t) => t.district)
    )
  ).sort();

  // Filter ULBs by state, district, and search query
  const filteredUlbs = tenants.filter((t) => {
    if (selectedState && t.state_code.toUpperCase() !== selectedState.toUpperCase()) return false;
    if (selectedDistrict && t.district.toLowerCase() !== selectedDistrict.toLowerCase())
      return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.district.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleSelect = (t: TenantInfo) => {
    localStorage.setItem("nivaran_tenant", JSON.stringify(t));
    onSelectTenant(t);
    if (onClose) onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1rem",
      }}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "560px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          padding: "2rem",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
        }}
      >
        <div>
          <h2 style={{ margin: "0 0 0.5rem 0", color: "#0f172a", fontSize: "1.5rem" }}>
            {t("city_picker_title")}
          </h2>
          <p style={{ margin: 0, color: "#64748b", fontSize: "0.875rem" }}>
            {t("city_picker_subtitle")}
          </p>
        </div>

        {/* 1. State Selector */}
        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#334155",
              marginBottom: "0.375rem",
            }}
          >
            {t("select_state")}
          </label>
          <select
            value={selectedState}
            onChange={(e) => {
              setSelectedState(e.target.value);
              setSelectedDistrict("");
            }}
            style={{
              width: "100%",
              padding: "0.625rem",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              fontSize: "0.95rem",
            }}
          >
            <option value="">-- All States --</option>
            {states.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </div>

        {/* 2. District Selector */}
        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#334155",
              marginBottom: "0.375rem",
            }}
          >
            {t("select_district")}
          </label>
          <select
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            disabled={!selectedState && availableDistricts.length === 0}
            style={{
              width: "100%",
              padding: "0.625rem",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              fontSize: "0.95rem",
              backgroundColor: !selectedState ? "#f8fafc" : "#ffffff",
            }}
          >
            <option value="">-- All Districts --</option>
            {availableDistricts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* 3. ULB Search & List */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem", flex: 1, minHeight: 0 }}
        >
          <label
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#334155",
            }}
          >
            {t("select_ulb")}
          </label>
          <input
            type="text"
            placeholder={t("search_placeholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "0.625rem",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              fontSize: "0.95rem",
            }}
          />

          <div
            style={{
              overflowY: "auto",
              maxHeight: "220px",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {filteredUlbs.length === 0 ? (
              <div style={{ padding: "1rem", color: "#94a3b8", textAlign: "center" }}>
                No municipality found for selected filter
              </div>
            ) : (
              filteredUlbs.map((ulb) => (
                <button
                  key={ulb.id}
                  onClick={() => handleSelect(ulb)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.75rem 1rem",
                    border: "none",
                    borderBottom: "1px solid #f1f5f9",
                    backgroundColor: "transparent",
                    textAlign: "left",
                    cursor: "pointer",
                    transition: "background-color 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: "#1e293b", fontSize: "0.95rem" }}>
                      {ulb.name}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                      {ulb.district}, {ulb.state_code} • {ulb.ulb_type.replace("_", " ")}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      padding: "0.25rem 0.5rem",
                      borderRadius: "6px",
                      backgroundColor: "#e0e7ff",
                      color: "#4338ca",
                      fontWeight: 600,
                    }}
                  >
                    Select
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {onClose && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={onClose}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                backgroundColor: "#f8fafc",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
