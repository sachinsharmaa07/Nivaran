import React, { useState, useEffect } from "react";
import { Search, MapPin, Building2 } from "lucide-react";
import { useTranslation } from "../utils/i18n.js";
import { Dialog, Select, TextInput, Button, Skeleton, EmptyState } from "../ui/index.js";

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
    name: "Municipal Corporation Ludhiana",
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
    name: "Brihanmumbai Municipal Corporation",
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
    name: "Greater Chennai Corporation",
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
  const [loading, setLoading] = useState(false);

  const [selectedState, setSelectedState] = useState<string>("PB");
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    setLoading(true);
    void Promise.all([
      fetch("/api/v1/public/states")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch("/api/v1/public/tenants")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([statesRes, tenantsRes]) => {
        if (statesRes?.data && Array.isArray(statesRes.data) && statesRes.data.length > 0) {
          setStates(statesRes.data);
        }
        if (tenantsRes?.data && Array.isArray(tenantsRes.data) && tenantsRes.data.length > 0) {
          setTenants(tenantsRes.data);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const availableDistricts = Array.from(
    new Set(
      tenants
        .filter((t) => !selectedState || t.state_code.toUpperCase() === selectedState.toUpperCase())
        .map((t) => t.district)
        .filter(Boolean)
    )
  ).sort();

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
    <Dialog
      isOpen={isOpen}
      onClose={onClose ? onClose : () => undefined}
      title={t("city_picker_title") || "Select Your Municipality"}
      description="Choose your state, district and local body to report and track issues"
      maxWidth="540px"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Step 1: State Selection */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          <label
            htmlFor="state-selector"
            style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text)" }}
          >
            {t("select_state") || "State"}
          </label>
          <Select
            id="state-selector"
            value={selectedState}
            onChange={(e) => {
              setSelectedState(e.target.value);
              setSelectedDistrict("");
            }}
          >
            <option value="">All States</option>
            {states.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name} ({s.code})
              </option>
            ))}
          </Select>
        </div>

        {/* Step 2: District Filter */}
        {availableDistricts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <label
              htmlFor="district-selector"
              style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text)" }}
            >
              District
            </label>
            <Select
              id="district-selector"
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
            >
              <option value="">All Districts in {selectedState || "State"}</option>
              {availableDistricts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </div>
        )}

        {/* Step 3: ULB Search */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          <label
            htmlFor="ulb-search"
            style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text)" }}
          >
            Search Urban Local Body (ULB)
          </label>
          <div style={{ position: "relative" }}>
            <TextInput
              id="ulb-search"
              placeholder="Search by city, town or corporation name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: "2.25rem" }}
            />
            <div
              style={{
                position: "absolute",
                left: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-subtle)",
                pointerEvents: "none",
                display: "flex",
                alignItems: "center",
              }}
              aria-hidden="true"
            >
              <Search size={16} strokeWidth={1.75} />
            </div>
          </div>
        </div>

        {/* ULB Results List */}
        <div>
          <div
            style={{
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: "var(--text-muted)",
              marginBottom: "0.5rem",
            }}
          >
            Available Municipalities ({filteredUlbs.length})
          </div>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <Skeleton height="56px" />
              <Skeleton height="56px" />
            </div>
          ) : filteredUlbs.length === 0 ? (
            <EmptyState
              title="No municipalities found"
              description="No local body matched your search query in this state/district."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSelectedState("");
                    setSelectedDistrict("");
                    setSearchQuery("");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div
              role="listbox"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                maxHeight: "240px",
                overflowY: "auto",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-md)",
                padding: "0.5rem",
                backgroundColor: "var(--surface)",
              }}
            >
              {filteredUlbs.map((t) => (
                <div
                  key={t.id || t.slug}
                  role="option"
                  aria-selected="false"
                  tabIndex={0}
                  onClick={() => handleSelect(t)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelect(t);
                    }
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.625rem 0.75rem",
                    borderRadius: "var(--r-sm)",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--surface-raised)",
                    cursor: "pointer",
                    transition: "background-color var(--dur-fast) var(--ease-out)",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: "0.9375rem",
                        fontWeight: 600,
                        color: "var(--text)",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.375rem",
                      }}
                    >
                      <Building2
                        size={15}
                        strokeWidth={1.75}
                        style={{ color: "var(--text-subtle)", flexShrink: 0 }}
                        aria-hidden={true}
                      />
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t.name}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                        marginTop: "2px",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.25rem",
                      }}
                    >
                      <MapPin size={11} strokeWidth={1.75} aria-hidden={true} />
                      <span>
                        {t.district}, {t.state_code}
                      </span>
                      <span style={{ color: "var(--border)" }}>•</span>
                      <span style={{ textTransform: "capitalize" }}>
                        {t.ulb_type?.replace(/_/g, " ") || "ULB"}
                      </span>
                    </div>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    style={{ flexShrink: 0, height: "32px", padding: "0 0.625rem" }}
                  >
                    Select
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
