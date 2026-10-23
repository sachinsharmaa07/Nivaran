import React, { type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { MapPin, Globe, User, LogOut, FileText, Map, Shield, BarChart2 } from "lucide-react";
import { useTranslation } from "../utils/i18n.js";
import { useAuth } from "../utils/authContext.js";
import type { TenantInfo } from "../components/CityPicker.js";

export interface AppShellProps {
  tenant: TenantInfo;
  onOpenCityPicker: () => void;
  onOpenAuth: () => void;
  children: ReactNode;
}

export function AppShell({
  tenant,
  onOpenCityPicker,
  onOpenAuth,
  children,
}: AppShellProps): React.JSX.Element {
  const { t, locale, setLocale, availableLocales } = useTranslation();
  const { user, logout } = useAuth();
  const location = useLocation();

  const isStaffOrAdmin =
    user?.role === "staff" ||
    user?.role === "dept_head" ||
    user?.role === "tenant_admin" ||
    user?.role === "platform_admin";

  const nextLocale = (): string => {
    const list = availableLocales.length > 0 ? availableLocales : ["en", "hi", "pa"];
    const idx = list.indexOf(locale);
    const nextIdx = (idx + 1) % list.length;
    return list[nextIdx] ?? "en";
  };

  const localeLabels: Record<string, string> = {
    en: "EN",
    hi: "हि",
    pa: "ਪੰ",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100dvh",
        backgroundColor: "var(--bg)",
      }}
    >
      <header
        style={{
          backgroundColor: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          position: "sticky",
          top: 0,
          zIndex: 100,
          height: "56px",
        }}
      >
        <div
          style={{
            maxWidth: "1440px",
            height: "100%",
            margin: "0 auto",
            padding: "0 1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          {/* Left: Brand mark + Municipality switcher */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
            <Link
              to="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                color: "var(--text)",
                flexShrink: 0,
                textDecoration: "none",
              }}
            >
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "var(--r-sm)",
                  backgroundColor: "var(--asphalt-900)",
                  color: "var(--paint-400)",
                  border: "1px solid var(--asphalt-800)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "1rem",
                  fontFamily: "var(--font-display)",
                }}
              >
                N
              </div>
              <span
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 600,
                  fontFamily: "var(--font-display)",
                  letterSpacing: "-0.01em",
                }}
              >
                {t("app_title") || "Nivaran"}
              </span>
            </Link>

            {/* City Selector Button (Wayfinding Plate style) */}
            <button
              type="button"
              onClick={onOpenCityPicker}
              className="touch-target"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                backgroundColor: "var(--surface-sunken)",
                border: "1px solid var(--border)",
                padding: "0.25rem 0.625rem",
                borderRadius: "var(--r-sm)",
                fontSize: "0.8125rem",
                color: "var(--text)",
                fontWeight: 600,
                cursor: "pointer",
                maxWidth: "180px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                height: "36px",
              }}
              title="Select municipality"
            >
              <MapPin
                size={13}
                strokeWidth={1.75}
                style={{ color: "var(--text-muted)", flexShrink: 0 }}
                aria-hidden={true}
              />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {tenant.district || tenant.name}
              </span>
            </button>
          </div>

          {/* Center/Right Navigation links */}
          <nav
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <Link
              to="/"
              className="touch-target"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.375rem 0.625rem",
                borderRadius: "var(--r-sm)",
                fontSize: "0.875rem",
                fontWeight: location.pathname === "/" ? 600 : 500,
                color: location.pathname === "/" ? "var(--text)" : "var(--text-muted)",
                backgroundColor:
                  location.pathname === "/" ? "var(--surface-sunken)" : "transparent",
              }}
            >
              <Map size={15} strokeWidth={1.75} aria-hidden={true} />
              <span className="nav-label">Map</span>
            </Link>

            <Link
              to="/my-reports"
              className="touch-target"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.375rem 0.625rem",
                borderRadius: "var(--r-sm)",
                fontSize: "0.875rem",
                fontWeight: location.pathname === "/my-reports" ? 600 : 500,
                color: location.pathname === "/my-reports" ? "var(--text)" : "var(--text-muted)",
                backgroundColor:
                  location.pathname === "/my-reports" ? "var(--surface-sunken)" : "transparent",
              }}
            >
              <FileText size={15} strokeWidth={1.75} aria-hidden={true} />
              <span className="nav-label">{t("my_reports")}</span>
            </Link>

            <Link
              to="/dashboard"
              className="touch-target"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.375rem 0.625rem",
                borderRadius: "var(--r-sm)",
                fontSize: "0.875rem",
                fontWeight: location.pathname === "/dashboard" ? 600 : 500,
                color: location.pathname === "/dashboard" ? "var(--text)" : "var(--text-muted)",
                backgroundColor:
                  location.pathname === "/dashboard" ? "var(--surface-sunken)" : "transparent",
              }}
            >
              <BarChart2 size={15} strokeWidth={1.75} aria-hidden={true} />
              <span className="nav-label">Dashboard</span>
            </Link>

            {isStaffOrAdmin && (
              <Link
                to="/staff"
                className="touch-target"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  padding: "0.375rem 0.625rem",
                  borderRadius: "var(--r-sm)",
                  fontSize: "0.875rem",
                  fontWeight: location.pathname.startsWith("/staff") ? 600 : 500,
                  color: location.pathname.startsWith("/staff")
                    ? "var(--text)"
                    : "var(--text-muted)",
                  backgroundColor: location.pathname.startsWith("/staff")
                    ? "var(--surface-sunken)"
                    : "transparent",
                }}
              >
                <Shield size={15} strokeWidth={1.75} aria-hidden={true} />
                <span className="nav-label">{t("staff_queue")}</span>
              </Link>
            )}

            {/* Language toggle: 44px min target */}
            <button
              type="button"
              onClick={() => setLocale(nextLocale())}
              className="touch-target"
              aria-label={`Current language: ${locale}. Switch language.`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                backgroundColor: "transparent",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)",
                padding: "0 0.5rem",
                height: "36px",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              <Globe size={14} strokeWidth={1.75} aria-hidden={true} />
              <span>{localeLabels[locale] || locale.toUpperCase()}</span>
            </button>

            {/* Auth Button */}
            {user ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <span
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    color: "var(--text)",
                    maxWidth: "110px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={user.name}
                >
                  {user.name.split(" ")[0]}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void logout();
                  }}
                  className="touch-target"
                  aria-label="Sign out"
                  title="Sign out"
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-subtle)",
                    cursor: "pointer",
                    height: "36px",
                    width: "36px",
                  }}
                >
                  <LogOut size={16} strokeWidth={1.75} aria-hidden={true} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="touch-target"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  backgroundColor: "var(--surface)",
                  border: "1px solid var(--border-control)",
                  borderRadius: "var(--r-sm)",
                  padding: "0 0.75rem",
                  height: "36px",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: "var(--text)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                <User size={14} strokeWidth={1.75} aria-hidden={true} />
                <span>{t("login")}</span>
              </button>
            )}
          </nav>
        </div>
      </header>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>
        {children}
      </main>
    </div>
  );
}
