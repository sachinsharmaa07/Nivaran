import React from "react";
import { Link, useSearchParams } from "react-router";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "../ui/index.js";

const ERROR_CODE_MAP: Record<string, string> = {
  STATE_COOKIE_MISSING:
    "Your sign-in session expired or was started in a different browser tab. For security, please start sign-in again from this tab.",
  STATE_MISMATCH:
    "Security verification between Google and your browser failed. Please try signing in again.",
  STATE_EXPIRED: "The sign-in window timed out before completing. Please try signing in again.",
  STATE_SIGNATURE_INVALID:
    "The sign-in verification data was altered or corrupted. Please restart sign-in.",
  INVALID_PKCE:
    "Browser cookies or session security tokens are blocked. Please check your browser cookie settings and try again.",
  INVALID_CODE:
    "Google authorization could not be completed or the code expired. Please try signing in again.",
  INVALID_STATE:
    "The sign-in state parameter was missing. Please try signing in again from the home page.",
  TENANT_MISMATCH:
    "The municipality selected in sign-in does not match your active session. Please re-select your city.",
  TENANT_NOT_FOUND: "The requested municipality was not found or is currently inactive.",
  CONSENT_REQUIRED:
    "Consent to civic data processing is required before you can access the platform.",
};

export function AuthErrorPage(): React.JSX.Element {
  const [searchParams] = useSearchParams();
  const rawCode =
    searchParams.get("code") ||
    searchParams.get("error") ||
    searchParams.get("message") ||
    "UNKNOWN_ERROR";

  const message =
    ERROR_CODE_MAP[rawCode] ||
    (rawCode.toLowerCase().includes("consent")
      ? "Consent to data processing is required to use this portal."
      : rawCode.toLowerCase().includes("state")
        ? "Your sign-in session expired or was started in another tab. Please start again."
        : `Could not complete authentication (${rawCode}). Please try signing in again.`);

  return (
    <div
      style={{
        minHeight: "75dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      <div
        className="sign-plate"
        style={{
          maxWidth: "480px",
          width: "100%",
          textAlign: "center",
          padding: "2.5rem 1.75rem",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "var(--r-md)",
            backgroundColor: "var(--kerb-50)",
            color: "var(--kerb-600)",
            border: "1px solid var(--kerb-300)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.25rem auto",
          }}
          aria-hidden="true"
        >
          <AlertCircle size={24} strokeWidth={1.75} />
        </div>

        <h1
          style={{
            fontSize: "1.5rem",
            marginBottom: "0.75rem",
            color: "var(--text)",
          }}
        >
          Sign In Could Not Proceed
        </h1>

        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.9375rem",
            lineHeight: 1.5,
            marginBottom: "1.75rem",
          }}
        >
          {message}
        </p>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
          <Link to="/">
            <Button variant="primary">
              <ArrowLeft size={15} strokeWidth={1.75} aria-hidden={true} />
              <span>Return to Map</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
