import React, { useState } from "react";
import { useTranslation } from "../utils/i18n.js";
import { normalizePhone } from "@nivaran/shared";

export function AuthModal({
  isOpen,
  tenantSlug,
  onClose,
  onAuthSuccess,
}: {
  isOpen: boolean;
  tenantSlug: string;
  onClose: () => void;
  onAuthSuccess: (user: { name: string; role: string; token: string }) => void;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"login" | "register">("login");

  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    try {
      if (tab === "register") {
        if (!consent) {
          setErrorMsg(t("consent_checkbox"));
          setLoading(false);
          return;
        }

        const isEmail = identifier.includes("@");
        const body: Record<string, unknown> = {
          tenantSlug,
          name,
          password,
          consent: true,
          locale: "en",
        };

        if (isEmail) {
          body["email"] = identifier;
        } else {
          body["phone"] = normalizePhone(identifier);
        }

        const res = await fetch("/api/v1/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error?.message || "Registration failed");
        }

        onAuthSuccess({
          name: data.data.user.name,
          role: data.data.user.role,
          token: data.data.accessToken,
        });
        onClose();
      } else {
        const res = await fetch("/api/v1/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantSlug,
            identifier: identifier.includes("@") ? identifier : normalizePhone(identifier),
            password,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error?.message || "Login failed");
        }

        onAuthSuccess({
          name: data.data.user.name,
          role: data.data.user.role,
          token: data.data.accessToken,
        });
        onClose();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
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
          maxWidth: "440px",
          padding: "2rem",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
      >
        {/* Tab switch */}
        <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", marginBottom: "1.5rem" }}>
          <button
            type="button"
            onClick={() => {
              setTab("login");
              setErrorMsg("");
            }}
            style={{
              flex: 1,
              padding: "0.75rem",
              border: "none",
              borderBottom: tab === "login" ? "2px solid #2563eb" : "none",
              fontWeight: 600,
              color: tab === "login" ? "#2563eb" : "#64748b",
              backgroundColor: "transparent",
              cursor: "pointer",
            }}
          >
            {t("login")}
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("register");
              setErrorMsg("");
            }}
            style={{
              flex: 1,
              padding: "0.75rem",
              border: "none",
              borderBottom: tab === "register" ? "2px solid #2563eb" : "none",
              fontWeight: 600,
              color: tab === "register" ? "#2563eb" : "#64748b",
              backgroundColor: "transparent",
              cursor: "pointer",
            }}
          >
            {t("register")}
          </button>
        </div>

        {errorMsg && (
          <div
            style={{
              backgroundColor: "#fef2f2",
              color: "#b91c1c",
              padding: "0.75rem",
              borderRadius: "8px",
              fontSize: "0.875rem",
              marginBottom: "1rem",
            }}
          >
            {errorMsg}
          </div>
        )}

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          {tab === "register" && (
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "#334155",
                }}
              >
                Full Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "0.625rem",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  marginTop: "0.25rem",
                }}
              />
            </div>
          )}

          <div>
            <label
              style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#334155" }}
            >
              {t("email_or_phone")}
            </label>
            <input
              type="text"
              required
              placeholder="name@example.com or 9876543210"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "0.625rem",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                marginTop: "0.25rem",
              }}
            />
          </div>

          <div>
            <label
              style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#334155" }}
            >
              {t("password")}
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "0.625rem",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                marginTop: "0.25rem",
              }}
            />
          </div>

          {tab === "register" && (
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.5rem",
                fontSize: "0.8rem",
                color: "#475569",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                style={{ marginTop: "0.2rem" }}
              />
              <span>{t("consent_checkbox")}</span>
            </label>
          )}

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: "0.625rem",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                backgroundColor: "#f8fafc",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                padding: "0.625rem",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "#2563eb",
                color: "#ffffff",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {loading ? "Processing..." : tab === "login" ? t("sign_in") : t("sign_up")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
