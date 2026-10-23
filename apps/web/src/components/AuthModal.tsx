import React, { useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import { useTranslation } from "../utils/i18n.js";
import { useAuth } from "../utils/authContext.js";
import { Dialog, TextInput, Button, Field } from "../ui/index.js";

export function AuthModal({
  isOpen,
  tenantSlug,
  onClose,
}: {
  isOpen: boolean;
  tenantSlug: string;
  onClose: () => void;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const { login, register } = useAuth();
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
          setErrorMsg(
            t("consent_checkbox") || "You must consent to data processing for civic reporting"
          );
          setLoading(false);
          return;
        }

        await register({
          tenantSlug,
          name,
          identifier,
          pass: password,
          consent: true,
        });
        onClose();
      } else {
        await login(identifier, password, tenantSlug);
        onClose();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const googleAuthUrl = `/api/v1/auth/google?tenant=${encodeURIComponent(tenantSlug)}&consent=true`;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={
        tab === "login"
          ? t("login") || "Citizen Sign In"
          : t("register") || "Register Citizen Account"
      }
      description="Access your submitted issues, receive notifications, and verify resolutions"
      maxWidth="460px"
    >
      <div>
        {/* Tab Toggle: Flat asphalt wayfinding style */}
        <div
          role="tablist"
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            marginBottom: "1.25rem",
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "login"}
            onClick={() => {
              setTab("login");
              setErrorMsg("");
            }}
            className="touch-target"
            style={{
              flex: 1,
              padding: "0.625rem",
              background: "none",
              border: "none",
              borderBottom: tab === "login" ? "2px solid var(--primary)" : "2px solid transparent",
              fontWeight: tab === "login" ? 700 : 500,
              color: tab === "login" ? "var(--text)" : "var(--text-muted)",
              cursor: "pointer",
              fontSize: "0.9375rem",
            }}
          >
            <LogIn
              size={15}
              strokeWidth={1.75}
              style={{ marginRight: "0.375rem" }}
              aria-hidden={true}
            />
            <span>{t("login") || "Sign In"}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "register"}
            onClick={() => {
              setTab("register");
              setErrorMsg("");
            }}
            className="touch-target"
            style={{
              flex: 1,
              padding: "0.625rem",
              background: "none",
              border: "none",
              borderBottom:
                tab === "register" ? "2px solid var(--primary)" : "2px solid transparent",
              fontWeight: tab === "register" ? 700 : 500,
              color: tab === "register" ? "var(--text)" : "var(--text-muted)",
              cursor: "pointer",
              fontSize: "0.9375rem",
            }}
          >
            <UserPlus
              size={15}
              strokeWidth={1.75}
              style={{ marginRight: "0.375rem" }}
              aria-hidden={true}
            />
            <span>{t("register") || "New Account"}</span>
          </button>
        </div>

        {errorMsg && (
          <div
            role="alert"
            style={{
              backgroundColor: "var(--kerb-50)",
              color: "var(--kerb-700)",
              border: "1px solid var(--kerb-300)",
              borderRadius: "var(--r-md)",
              padding: "0.625rem 0.875rem",
              fontSize: "0.8125rem",
              lineHeight: 1.4,
              marginBottom: "1rem",
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Continue with Google */}
        <div style={{ marginBottom: "1.25rem" }}>
          <a
            href={consent ? googleAuthUrl : undefined}
            onClick={(e) => {
              if (!consent) {
                e.preventDefault();
                setErrorMsg("Please check the consent box below before continuing with Google.");
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.625rem",
              width: "100%",
              minHeight: "44px",
              padding: "0.5rem 1rem",
              borderRadius: "var(--r-md)",
              border: `1px solid ${consent ? "var(--border-control)" : "var(--border)"}`,
              backgroundColor: consent ? "var(--surface)" : "var(--surface-sunken)",
              color: consent ? "var(--text)" : "var(--text-subtle)",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: consent ? "pointer" : "not-allowed",
              opacity: consent ? 1 : 0.65,
              transition: "all var(--dur-fast) var(--ease-out)",
            }}
            aria-disabled={!consent}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path
                d="M17.64 9.20455C17.64 8.56636 17.5827 7.95273 17.4764 7.36364H9V10.845H13.8436C13.635 11.97 13.0009 12.9232 12.0477 13.5614V15.8195H14.9564C16.6582 14.2527 17.64 11.9455 17.64 9.20455Z"
                fill="#4285F4"
              />
              <path
                d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8195L12.0477 13.5614C11.2418 14.1014 10.2109 14.4205 9 14.4205C6.65591 14.4205 4.67182 12.8373 3.96409 10.71H0.957275V13.0418C2.43818 15.9832 5.48182 18 9 18Z"
                fill="#34A853"
              />
              <path
                d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957275C0.347727 6.17318 0 7.54773 0 9C0 10.4523 0.347727 11.8268 0.957275 13.0418L3.96409 10.71Z"
                fill="#FBBC05"
              />
              <path
                d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65591 3.57955 9 3.57955Z"
                fill="#EA4335"
              />
            </svg>
            <span>Continue with Google</span>
          </a>
          {!consent && (
            <p
              style={{
                margin: "0.25rem 0 0 0",
                fontSize: "0.75rem",
                color: "var(--text-subtle)",
                textAlign: "center",
              }}
            >
              Tick the consent checkbox below to enable Google sign-in
            </p>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            margin: "1rem 0",
            color: "var(--text-subtle)",
            fontSize: "0.75rem",
          }}
          aria-hidden="true"
        >
          <div style={{ flex: 1, height: "1px", backgroundColor: "var(--border)" }} />
          <span>OR</span>
          <div style={{ flex: 1, height: "1px", backgroundColor: "var(--border)" }} />
        </div>

        {/* Credentials Form */}
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
        >
          {tab === "register" && (
            <Field label="Full Name" required>
              {({ id, "aria-describedby": ariaDescribedBy, "aria-invalid": ariaInvalid }) => (
                <TextInput
                  id={id}
                  aria-describedby={ariaDescribedBy}
                  isInvalid={ariaInvalid}
                  placeholder="Citizen name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              )}
            </Field>
          )}

          <Field
            label="Email or Mobile Number"
            hint="Enter 10-digit Indian phone number (e.g. 9876543210) or valid email"
            required
          >
            {({ id, "aria-describedby": ariaDescribedBy, "aria-invalid": ariaInvalid }) => (
              <TextInput
                id={id}
                aria-describedby={ariaDescribedBy}
                isInvalid={ariaInvalid}
                type="text"
                placeholder="citizen@example.in or 9876543210"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
              />
            )}
          </Field>

          <Field label="Password" required>
            {({ id, "aria-describedby": ariaDescribedBy, "aria-invalid": ariaInvalid }) => (
              <TextInput
                id={id}
                aria-describedby={ariaDescribedBy}
                isInvalid={ariaInvalid}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            )}
          </Field>

          {/* Consent Checkbox */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.625rem",
              margin: "1rem 0 1.25rem 0",
              padding: "0.625rem 0.75rem",
              borderRadius: "var(--r-sm)",
              backgroundColor: "var(--surface-sunken)",
              border: "1px solid var(--border)",
            }}
          >
            <input
              id="consent-checkbox"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              style={{
                width: "18px",
                height: "18px",
                marginTop: "2px",
                accentColor: "var(--primary)",
                cursor: "pointer",
              }}
            />
            <label
              htmlFor="consent-checkbox"
              style={{
                fontSize: "0.8125rem",
                color: "var(--text)",
                lineHeight: 1.4,
                cursor: "pointer",
              }}
            >
              I consent to the collection and processing of my contact and report data for resolving
              civic issues in accordance with municipal privacy norms.
            </label>
          </div>

          <Button
            type="submit"
            variant="cta"
            loading={loading}
            disabled={loading}
            style={{ width: "100%", minHeight: "44px" }}
          >
            {tab === "login" ? t("login") || "Sign In" : t("register") || "Create Account"}
          </Button>
        </form>
      </div>
    </Dialog>
  );
}
