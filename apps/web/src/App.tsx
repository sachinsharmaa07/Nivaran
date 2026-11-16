import React, { useState, lazy, Suspense, type JSX } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "./utils/i18n.js";
import { AuthProvider } from "./utils/authContext.js";
import { CityPicker, type TenantInfo } from "./components/CityPicker.js";
import { AuthModal } from "./components/AuthModal.js";
import { AppShell, ToastProvider, LaneLineLoader, Illustration404, Button } from "./ui/index.js";

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
const NotificationsPage = lazy(() =>
  import("./pages/NotificationsPage.js").then((m) => ({ default: m.NotificationsPage }))
);
const MePage = lazy(() => import("./pages/MePage.js").then((m) => ({ default: m.MePage })));
const UpdatesListPage = lazy(() =>
  import("./pages/UpdatesListPage.js").then((m) => ({ default: m.UpdatesListPage }))
);
const ArticlePage = lazy(() =>
  import("./pages/ArticlePage.js").then((m) => ({ default: m.ArticlePage }))
);
const StaffUpdatesPage = lazy(() =>
  import("./pages/StaffUpdatesPage.js").then((m) => ({ default: m.StaffUpdatesPage }))
);

function NotFoundPage(): React.JSX.Element {
  return (
    <div style={{ padding: "4rem 1.5rem", maxWidth: "480px" }}>
      <Illustration404 size={120} />
      <h1
        className="display-text-sm"
        style={{
          fontSize: "clamp(1.5rem, 1.2rem + 1vw, 2rem)",
          margin: "1.5rem 0 0.5rem 0",
          lineHeight: 1.1,
        }}
      >
        Page not found
      </h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem", fontSize: "0.9375rem" }}>
        The page you requested does not exist or has been moved.
      </p>
      <Link to="/">
        <Button variant="primary">Return to issue map</Button>
      </Link>
    </div>
  );
}

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

class RouteErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("RouteErrorBoundary caught error:", error, errorInfo);
  }
  override render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "2rem", maxWidth: "800px", margin: "2rem auto" }}>
          <h2 style={{ color: "var(--kerb-600)", marginBottom: "1rem" }}>
            Application Error Caught
          </h2>
          <div
            style={{
              padding: "1rem",
              borderRadius: "var(--r-md)",
              backgroundColor: "var(--surface-sunken)",
              border: "1px solid var(--border)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.875rem",
              whiteSpace: "pre-wrap",
            }}
          >
            {this.state.error?.stack || this.state.error?.message || "Unknown error"}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
                <RouteErrorBoundary>
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
                          <MyReportsPage
                            tenant={tenant}
                            onOpenAuth={() => setAuthModalOpen(true)}
                          />
                        }
                      />
                      <Route
                        path="/reports"
                        element={
                          <MyReportsPage
                            tenant={tenant}
                            onOpenAuth={() => setAuthModalOpen(true)}
                          />
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

                      {/* 7. Notifications */}
                      <Route
                        path="/notifications"
                        element={
                          <NotificationsPage
                            tenant={tenant}
                            onOpenAuth={() => setAuthModalOpen(true)}
                          />
                        }
                      />

                      {/* 8. Me (profile, language, delete account, sign out) */}
                      <Route
                        path="/me"
                        element={
                          <MePage tenant={tenant} onOpenAuth={() => setAuthModalOpen(true)} />
                        }
                      />

                      {/* 9. Civic Updates & Blogs */}
                      <Route path="/updates" element={<UpdatesListPage tenant={tenant} />} />
                      <Route
                        path="/:tenantSlug/updates"
                        element={<UpdatesListPage tenant={tenant} />}
                      />
                      <Route path="/updates/:slug" element={<ArticlePage tenant={tenant} />} />
                      <Route
                        path="/:tenantSlug/updates/:slug"
                        element={<ArticlePage tenant={tenant} />}
                      />
                      <Route path="/blogs" element={<UpdatesListPage tenant={tenant} />} />
                      <Route
                        path="/:tenantSlug/blogs"
                        element={<UpdatesListPage tenant={tenant} />}
                      />
                      <Route
                        path="/blogs/new"
                        element={
                          <StaffUpdatesPage
                            tenant={tenant}
                            onOpenAuth={() => setAuthModalOpen(true)}
                            isBlogMode={true}
                          />
                        }
                      />
                      <Route
                        path="/blogs/editor"
                        element={
                          <StaffUpdatesPage
                            tenant={tenant}
                            onOpenAuth={() => setAuthModalOpen(true)}
                            isBlogMode={true}
                          />
                        }
                      />
                      <Route path="/blogs/:slug" element={<ArticlePage tenant={tenant} />} />
                      <Route
                        path="/:tenantSlug/blogs/:slug"
                        element={<ArticlePage tenant={tenant} />}
                      />
                      <Route path="/staff/updates" element={<StaffUpdatesPage tenant={tenant} />} />
                      <Route
                        path="/updates/editor"
                        element={
                          <StaffUpdatesPage
                            tenant={tenant}
                            onOpenAuth={() => setAuthModalOpen(true)}
                          />
                        }
                      />

                      {/* 10. Friendly OAuth Error Page */}
                      <Route path="/auth/error" element={<AuthErrorPage />} />

                      {/* 404 Not Found Page */}
                      <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                  </Suspense>
                </RouteErrorBoundary>

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
