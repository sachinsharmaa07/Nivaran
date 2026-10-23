import React, { useState, lazy, Suspense, type JSX } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "./utils/i18n.js";
import { AuthProvider } from "./utils/authContext.js";
import { CityPicker, type TenantInfo } from "./components/CityPicker.js";
import { AuthModal } from "./components/AuthModal.js";
import { AppShell, ToastProvider, LaneLineLoader } from "./ui/index.js";

// Lazy-loaded route components per React.lazy requirements
const CitizenHomePage = lazy(() =>
  import("./pages/CitizenHomePage.js").then((m) => ({ default: m.CitizenHomePage }))
);
const IssueDetailPage = lazy(() =>
  import("./pages/IssueDetailPage.js").then((m) => ({ default: m.IssueDetailPage }))
);
const MyReportsPage = lazy(() =>
  import("./pages/MyReportsPage.js").then((m) => ({ default: m.MyReportsPage }))
);
const StaffQueuePage = lazy(() =>
  import("./pages/StaffQueuePage.js").then((m) => ({ default: m.StaffQueuePage }))
);
const AdminConfigPage = lazy(() =>
  import("./pages/AdminConfigPage.js").then((m) => ({ default: m.AdminConfigPage }))
);
const PublicDashboardPage = lazy(() =>
  import("./pages/PublicDashboardPage.js").then((m) => ({ default: m.PublicDashboardPage }))
);
const AuthErrorPage = lazy(() =>
  import("./pages/AuthErrorPage.js").then((m) => ({ default: m.AuthErrorPage }))
);

const DEFAULT_TENANT: TenantInfo = {
  id: "demo-punjab-id",
  slug: "demo-punjab",
  code: "DPB",
  name: "Municipal Corporation Ludhiana",
  ulb_type: "municipal_corporation",
  state_code: "PB",
  district: "Ludhiana",
  default_locale: "en",
  enabled_locales: ["en", "hi", "pa"],
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      retry: 1,
    },
  },
});

export function App(): JSX.Element {
  const [tenant, setTenant] = useState<TenantInfo>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("nivaran_tenant");
      if (saved) {
        try {
          return JSON.parse(saved) as TenantInfo;
        } catch {
          // ignore corrupted json
        }
      }
    }
    return DEFAULT_TENANT;
  });

  // First-visit city picker: open automatically if no tenant is remembered
  const [cityPickerOpen, setCityPickerOpen] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return !localStorage.getItem("nivaran_tenant");
    }
    return false;
  });

  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);

  const handleSelectTenant = (t: TenantInfo) => {
    setTenant(t);
    setCityPickerOpen(false);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <I18nProvider
            tenantDefaultLocale={tenant.default_locale}
            tenantEnabledLocales={tenant.enabled_locales}
          >
            <ToastProvider>
              <AppShell
                tenant={tenant}
                onOpenCityPicker={() => setCityPickerOpen(true)}
                onOpenAuth={() => setAuthModalOpen(true)}
              >
                <Suspense
                  fallback={
                    <div
                      style={{
                        padding: "3rem 1rem",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.75rem",
                      }}
                    >
                      <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                        Loading page...
                      </span>
                      <LaneLineLoader width="120px" />
                    </div>
                  }
                >
                  <Routes>
                    {/* 1. Citizen Map Home with pins and bottom sheet */}
                    <Route
                      path="/"
                      element={
                        <CitizenHomePage
                          tenant={tenant}
                          onOpenAuth={() => setAuthModalOpen(true)}
                        />
                      }
                    />

                    {/* 2. My Reports */}
                    <Route
                      path="/my-reports"
                      element={
                        <MyReportsPage tenant={tenant} onOpenAuth={() => setAuthModalOpen(true)} />
                      }
                    />
                    <Route
                      path="/reports"
                      element={
                        <MyReportsPage tenant={tenant} onOpenAuth={() => setAuthModalOpen(true)} />
                      }
                    />

                    {/* 3. Issue Detail Page with Lane-line timeline */}
                    <Route path="/issues/:publicId" element={<IssueDetailPage />} />

                    {/* 4. Staff Workbench Queue */}
                    <Route path="/staff/*" element={<StaffQueuePage tenant={tenant} />} />
                    <Route path="/queue" element={<StaffQueuePage tenant={tenant} />} />

                    {/* 5. Tenant Admin Configuration */}
                    <Route path="/admin/*" element={<AdminConfigPage tenant={tenant} />} />

                    {/* 6. Public Civic Performance Dashboard */}
                    <Route path="/dashboard" element={<PublicDashboardPage tenant={tenant} />} />
                    <Route
                      path="/:tenantSlug/dashboard"
                      element={<PublicDashboardPage tenant={tenant} />}
                    />

                    {/* 7. Friendly OAuth Error Page */}
                    <Route path="/auth/error" element={<AuthErrorPage />} />

                    {/* 404 Not Found Page */}
                    <Route
                      path="*"
                      element={
                        <div style={{ padding: "4rem 1.5rem", textAlign: "center" }}>
                          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
                            404 — Page Not Found
                          </h1>
                          <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>
                            The page you requested does not exist or has been moved.
                          </p>
                          <Link
                            to="/"
                            style={{
                              display: "inline-flex",
                              padding: "0.625rem 1.25rem",
                              borderRadius: "var(--r-md)",
                              backgroundColor: "var(--primary)",
                              color: "var(--on-primary)",
                              textDecoration: "none",
                              fontWeight: 600,
                              fontSize: "0.875rem",
                            }}
                          >
                            Return to Issue Map
                          </Link>
                        </div>
                      }
                    />
                  </Routes>
                </Suspense>

                {/* Modals */}
                <CityPicker
                  isOpen={cityPickerOpen}
                  onClose={() => setCityPickerOpen(false)}
                  onSelectTenant={handleSelectTenant}
                />

                <AuthModal
                  isOpen={authModalOpen}
                  tenantSlug={tenant.slug}
                  onClose={() => setAuthModalOpen(false)}
                />
              </AppShell>
            </ToastProvider>
          </I18nProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
