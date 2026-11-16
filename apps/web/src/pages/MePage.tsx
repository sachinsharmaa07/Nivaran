import React, { useState } from "react";
import { User, Globe, Trash2, LogOut, ArrowRight, AlertTriangle } from "lucide-react";
import { useAuth } from "../utils/authContext.js";
import { useTranslation } from "../utils/i18n.js";
import type { TenantInfo } from "../components/CityPicker.js";
import { Button, Dialog, SignPlate } from "../ui/index.js";

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  hi: "हिन्दी (Hindi)",
  pa: "ਪੰਜਾਬੀ (Punjabi)",
};

export function MePage({
  tenant,
  onOpenAuth,
}: {
  tenant: TenantInfo;
  onOpenAuth: () => void;
}): React.JSX.Element {
  const { user, logout, authFetch, loading } = useAuth();
  const { locale, setLocale, availableLocales } = useTranslation();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    setDeleteError("");
    try {
      const res = await authFetch("/api/v1/auth/me", {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || "Failed to delete account");
      }
      setDeleteModalOpen(false);
      await logout();
      window.location.href = "/";
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: "640px", margin: "2rem auto", padding: "1rem" }}>
        <div style={{ color: "var(--text-muted)", fontSize: "0.9375rem" }}>Loading profile...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ maxWidth: "540px", margin: "3rem auto", padding: "1.5rem" }}>
        <SignPlate label="Account access" style={{ padding: "2.5rem 1.75rem", textAlign: "left" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "var(--r-md)",
              backgroundColor: "var(--surface-sunken)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-subtle)",
              marginBottom: "1.25rem",
              border: "1px solid var(--border)",
            }}
            aria-hidden="true"
          >
            <User size={24} strokeWidth={1.75} />
          </div>

          <h1
            className="display-text-sm"
            style={{ margin: "0 0 0.5rem 0", color: "var(--text)", lineHeight: 1.1 }}
          >
            Sign in to manage your account
          </h1>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "0.9375rem",
              lineHeight: 1.5,
              marginBottom: "1.75rem",
            }}
          >
            Track your reports, change your preferred language, or manage your personal data across
            civic services.
          </p>
          <Button variant="cta" onClick={onOpenAuth} style={{ minWidth: "160px" }}>
            <span>Sign in or register</span>
            <ArrowRight size={15} strokeWidth={1.75} aria-hidden={true} />
          </Button>
        </SignPlate>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "640px", margin: "0 auto", padding: "2rem 1rem", width: "100%" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h1
          className="display-text"
          style={{
            margin: "0 0 0.5rem 0",
            fontSize: "clamp(2rem, 1.8rem + 1vw, 2.5rem)",
            color: "var(--text)",
            lineHeight: 1.05,
          }}
        >
          Account & preferences
        </h1>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9375rem" }}>
          Registered in {tenant.district || tenant.name}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Profile Card */}
        <section
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            padding: "1.5rem",
          }}
        >
          <h2
            style={{
              margin: "0 0 1rem 0",
              fontSize: "1.125rem",
              fontWeight: 600,
              color: "var(--text)",
            }}
          >
            Profile details
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-subtle)",
                  marginBottom: "0.125rem",
                }}
              >
                Full name
              </div>
              <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text)" }}>
                {user.name}
              </div>
            </div>
            {user.email && (
              <div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-subtle)",
                    marginBottom: "0.125rem",
                  }}
                >
                  Email address
                </div>
                <div style={{ fontSize: "0.9375rem", color: "var(--text)" }}>{user.email}</div>
              </div>
            )}
            {user.phone && (
              <div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-subtle)",
                    marginBottom: "0.125rem",
                  }}
                >
                  Phone number
                </div>
                <div
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--text)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {user.phone}
                </div>
              </div>
            )}
            <div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-subtle)",
                  marginBottom: "0.125rem",
                }}
              >
                Role
              </div>
              <div
                style={{
                  fontSize: "0.875rem",
                  color: "var(--text-muted)",
                  textTransform: "capitalize",
                }}
              >
                {user.role}
              </div>
            </div>
          </div>
        </section>

        {/* Language Selection */}
        <section
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            padding: "1.5rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "0.5rem",
            }}
          >
            <Globe size={18} strokeWidth={1.75} style={{ color: "var(--text-subtle)" }} />
            <h2
              style={{
                margin: 0,
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "var(--text)",
              }}
            >
              Interface language
            </h2>
          </div>
          <p
            style={{
              margin: "0 0 1rem 0",
              fontSize: "0.875rem",
              color: "var(--text-muted)",
            }}
          >
            Select your preferred language for road signage, forms and updates.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {availableLocales.map((loc) => {
              const isSelected = locale === loc;
              return (
                <label
                  key={loc}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.75rem 1rem",
                    borderRadius: "var(--r-sm)",
                    border: `1px solid ${isSelected ? "var(--primary)" : "var(--border)"}`,
                    backgroundColor: isSelected ? "var(--surface-sunken)" : "var(--surface)",
                    cursor: "pointer",
                    fontSize: "0.9375rem",
                    color: "var(--text)",
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  <input
                    type="radio"
                    name="locale-selection"
                    value={loc}
                    checked={isSelected}
                    onChange={() => setLocale(loc)}
                    style={{ accentColor: "var(--paint-500)" }}
                  />
                  <span>{LANGUAGE_LABELS[loc] || loc.toUpperCase()}</span>
                </label>
              );
            })}
          </div>
        </section>

        {/* Actions & Danger Zone */}
        <section
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          <div>
            <h2
              style={{
                margin: "0 0 0.25rem 0",
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "var(--text)",
              }}
            >
              Session & privacy
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: "0.875rem",
                color: "var(--text-muted)",
              }}
            >
              Sign out from this device or delete your citizen account.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              paddingTop: "0.5rem",
              borderTop: "1px solid var(--border)",
              flexWrap: "wrap",
            }}
          >
            <Button
              variant="secondary"
              onClick={() => {
                void logout().then(() => {
                  window.location.href = "/";
                });
              }}
            >
              <LogOut size={16} strokeWidth={1.75} aria-hidden={true} />
              <span>Sign out</span>
            </Button>

            <Button
              variant="ghost"
              onClick={() => setDeleteModalOpen(true)}
              style={{ color: "var(--kerb-500)" }}
            >
              <Trash2 size={16} strokeWidth={1.75} aria-hidden={true} />
              <span>Delete account</span>
            </Button>
          </div>
        </section>
      </div>

      {/* Account Deletion Confirmation Dialog */}
      <Dialog
        isOpen={deleteModalOpen}
        onClose={() => {
          if (!isDeleting) setDeleteModalOpen(false);
        }}
        title="Delete account & personal data"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              padding: "0.875rem 1rem",
              backgroundColor: "var(--kerb-50)",
              border: "1px solid var(--kerb-300)",
              borderRadius: "var(--r-sm)",
              color: "var(--kerb-700)",
              fontSize: "0.875rem",
            }}
          >
            <AlertTriangle
              size={20}
              strokeWidth={1.75}
              style={{ flexShrink: 0, marginTop: "2px" }}
            />
            <div>
              <strong>This action is permanent and cannot be undone.</strong> Your personal phone
              number, email, and notification records will be deleted from the system.
            </div>
          </div>

          <p
            style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-muted)", lineHeight: 1.5 }}
          >
            Past civic reports you filed will remain on the public registry in anonymized form to
            ensure road and public infrastructure work orders remain intact.
          </p>

          {deleteError && (
            <div
              style={{
                color: "var(--kerb-600)",
                fontSize: "0.875rem",
                padding: "0.5rem",
                backgroundColor: "var(--kerb-50)",
                borderRadius: "var(--r-sm)",
              }}
            >
              {deleteError}
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.75rem",
              marginTop: "0.5rem",
            }}
          >
            <Button
              variant="secondary"
              disabled={isDeleting}
              onClick={() => setDeleteModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={isDeleting}
              onClick={() => void handleDeleteAccount()}
              style={{
                backgroundColor: "var(--kerb-600)",
                color: "white",
                borderColor: "var(--kerb-700)",
              }}
            >
              {isDeleting ? "Deleting..." : "Permanently delete account"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
