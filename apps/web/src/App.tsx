import React, { useState, type JSX } from "react";
import { I18nProvider, useTranslation } from "./utils/i18n.js";
import { CityPicker, type TenantInfo } from "./components/CityPicker.js";
import { AuthModal } from "./components/AuthModal.js";
import { ReportWizard } from "./components/ReportWizard.js";
import { StateSummary } from "./components/StateSummary.js";

const DEFAULT_TENANT: TenantInfo = {
  id: "demo-punjab-id",
  slug: "demo-punjab",
  code: "DPB",
  name: "Municipal Corporation Ludhiana (Demo Punjab)",
  ulb_type: "municipal_corporation",
  state_code: "PB",
  district: "Ludhiana",
  default_locale: "en",
  enabled_locales: ["en", "hi", "pa"],
};

function MainContent({
  tenant,
  onOpenCityPicker,
  onOpenAuth,
  currentUser,
  onLogout,
}: {
  tenant: TenantInfo;
  onOpenCityPicker: () => void;
  onOpenAuth: () => void;
  currentUser: { name: string; role: string; token: string } | null;
  onLogout: () => void;
}): JSX.Element {
  const { t, locale, setLocale, availableLocales } = useTranslation();
  const [activeTab, setActiveTab] = useState<"report" | "summary">("report");

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f8fafc", color: "#0f172a" }}>
      {/* Header bar */}
      <header
        style={{
          backgroundColor: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          position: "sticky",
          top: 0,
          zIndex: 100,
          boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)",
        }}
      >
        <div
          style={{
            maxWidth: "1120px",
            margin: "0 auto",
            padding: "0.875rem 1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Logo & Tenant badge */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  backgroundColor: "#2563eb",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: "1.1rem",
                }}
              >
                N
              </div>
              <div>
                <span style={{ fontSize: "1.25rem", fontWeight: 800, color: "#1e3a8a" }}>
                  {t("app_title")}
                </span>
              </div>
            </div>

            {/* Selected City Pill */}
            <button
              onClick={onOpenCityPicker}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                backgroundColor: "#eff6ff",
                border: "1px solid #bfdbfe",
                padding: "0.375rem 0.75rem",
                borderRadius: "20px",
                fontSize: "0.85rem",
                color: "#1e40af",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              title="Click to change city"
            >
              <span>📍 {tenant.name}</span>
              <span style={{ fontSize: "0.75rem", opacity: 0.75 }}>({t("change_city")})</span>
            </button>
          </div>

          {/* Right Controls: Language & Auth */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            {/* Language Picker */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>🌐</span>
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                style={{
                  padding: "0.375rem 0.5rem",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  backgroundColor: "#ffffff",
                }}
              >
                {availableLocales.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc === "en" ? "English" : loc === "hi" ? "हिन्दी (HI)" : "ਪੰਜਾਬੀ (PA)"}
                  </option>
                ))}
              </select>
            </div>

            {/* Auth Button / Profile */}
            {currentUser ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#1e293b" }}>
                  {currentUser.name} ({currentUser.role})
                </span>
                <button
                  onClick={onLogout}
                  style={{
                    padding: "0.375rem 0.75rem",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#f8fafc",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  {t("logout")}
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: "#2563eb",
                  color: "#ffffff",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t("login")} / {t("register")}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: "1120px", margin: "0 auto", padding: "2rem 1.5rem" }}>
        {/* Navigation Tabs */}
        <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem" }}>
          <button
            onClick={() => setActiveTab("report")}
            style={{
              padding: "0.75rem 1.5rem",
              borderRadius: "10px",
              border: "none",
              backgroundColor: activeTab === "report" ? "#2563eb" : "#e2e8f0",
              color: activeTab === "report" ? "#ffffff" : "#475569",
              fontWeight: 700,
              fontSize: "0.95rem",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            ✍️ {t("report_issue")}
          </button>
          <button
            onClick={() => setActiveTab("summary")}
            style={{
              padding: "0.75rem 1.5rem",
              borderRadius: "10px",
              border: "none",
              backgroundColor: activeTab === "summary" ? "#2563eb" : "#e2e8f0",
              color: activeTab === "summary" ? "#ffffff" : "#475569",
              fontWeight: 700,
              fontSize: "0.95rem",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            📊 {t("state_summary")}
          </button>
        </div>

        {/* Tab content */}
        {activeTab === "report" ? (
          <div>
            <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
              <h2 style={{ margin: "0 0 0.5rem 0", color: "#0f172a" }}>
                {t("report_issue")} in {tenant.name}
              </h2>
              <p style={{ margin: 0, color: "#64748b", fontSize: "0.95rem" }}>
                Civic complaints are geo-validated, routed automatically, and tracked under citizen
                verification.
              </p>
            </div>
            <ReportWizard tenant={tenant} authToken={currentUser?.token} />
          </div>
        ) : (
          <div>
            <StateSummary stateCode={tenant.state_code} />
          </div>
        )}
      </main>
    </div>
  );
}

export function App(): JSX.Element {
  const [tenant, setTenant] = useState<TenantInfo>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("nivaran_tenant");
      if (saved) {
        try {
          return JSON.parse(saved) as TenantInfo;
        } catch {
          // ignore error
        }
      }
    }
    return DEFAULT_TENANT;
  });

  const [cityPickerOpen, setCityPickerOpen] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return !localStorage.getItem("nivaran_tenant");
    }
    return false;
  });

  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<{
    name: string;
    role: string;
    token: string;
  } | null>(null);

  const handleSelectTenant = (t: TenantInfo) => {
    setTenant(t);
    setCityPickerOpen(false);
  };

  return (
    <I18nProvider
      tenantDefaultLocale={tenant.default_locale}
      tenantEnabledLocales={tenant.enabled_locales}
    >
      <MainContent
        tenant={tenant}
        onOpenCityPicker={() => setCityPickerOpen(true)}
        onOpenAuth={() => setAuthModalOpen(true)}
        currentUser={currentUser}
        onLogout={() => setCurrentUser(null)}
      />

      <CityPicker
        isOpen={cityPickerOpen}
        onClose={() => setCityPickerOpen(false)}
        onSelectTenant={handleSelectTenant}
      />

      <AuthModal
        isOpen={authModalOpen}
        tenantSlug={tenant.slug}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={(user) => setCurrentUser(user)}
      />
    </I18nProvider>
  );
}
