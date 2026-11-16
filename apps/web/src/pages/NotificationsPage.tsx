import React, { useState, useEffect } from "react";
import { Link } from "react-router";
import { Bell, ArrowRight, ChevronRight } from "lucide-react";
import { useAuth } from "../utils/authContext.js";
import type { TenantInfo } from "../components/CityPicker.js";
import { Button, Skeleton, EmptyState, ErrorState, StatusChip } from "../ui/index.js";

interface NotificationItem {
  id: string;
  type: string;
  issuePublicId?: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export function NotificationsPage({
  tenant,
  onOpenAuth,
}: {
  tenant: TenantInfo;
  onOpenAuth: () => void;
}): React.JSX.Element {
  const { user, authFetch } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const fetchNotifications = async () => {
    if (!user) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await authFetch(
        `/api/v1/notifications?tenant_slug=${encodeURIComponent(tenant.slug)}&limit=50`
      );
      if (!res.ok) throw new Error("Could not load notifications");
      const data = await res.json();
      setNotifications(data.data || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) void fetchNotifications();
  }, [user, tenant.slug]);

  if (!user) {
    return (
      <div style={{ maxWidth: "540px", margin: "3rem auto", padding: "1.5rem" }}>
        <div className="sign-plate" style={{ padding: "2.5rem 1.75rem" }}>
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
            <Bell size={24} strokeWidth={1.75} />
          </div>

          <h1 style={{ margin: "0 0 0.5rem 0", fontSize: "1.5rem", color: "var(--text)" }}>
            Stay updated on your reports
          </h1>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "0.9375rem",
              lineHeight: 1.5,
              marginBottom: "1.75rem",
            }}
          >
            Sign in to receive notifications when your civic reports are triaged, assigned, or
            resolved by municipal workers.
          </p>
          <Button variant="cta" onClick={onOpenAuth} style={{ minWidth: "160px" }}>
            <span>Sign in</span>
            <ArrowRight size={15} strokeWidth={1.75} aria-hidden={true} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto", padding: "2rem 1rem", width: "100%" }}>
      <h1
        className="display-text-sm"
        style={{
          fontSize: "clamp(1.5rem, 1.2rem + 1vw, 2rem)",
          margin: "0 0 0.25rem 0",
          lineHeight: 1.1,
        }}
      >
        Notifications
      </h1>
      <p style={{ margin: "0 0 1.5rem 0", color: "var(--text-muted)", fontSize: "0.875rem" }}>
        Updates on issues you reported or supported in {tenant.district || tenant.name}
      </p>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <Skeleton height="60px" />
          <Skeleton height="60px" />
          <Skeleton height="60px" />
        </div>
      ) : errorMsg ? (
        <ErrorState
          title="Could not load notifications"
          message={errorMsg}
          onRetry={() => {
            void fetchNotifications();
          }}
        />
      ) : notifications.length === 0 ? (
        <EmptyState
          title="No notifications yet"
          description="You will receive updates here when your civic reports are triaged, assigned, or resolved."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {notifications.map((n) => (
            <div
              key={n.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.75rem 1rem",
                backgroundColor: n.read ? "var(--surface)" : "var(--surface-sunken)",
                border: `1px solid ${n.read ? "var(--border)" : "var(--paint-300)"}`,
                borderRadius: "var(--r-md)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0, marginRight: "0.75rem" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginBottom: "0.25rem",
                  }}
                >
                  {n.issuePublicId && (
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: "0.8125rem",
                        color: "var(--text)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {n.issuePublicId}
                    </span>
                  )}
                  <StatusChip
                    status={
                      n.type === "RESOLVED"
                        ? "resolved"
                        : n.type === "ASSIGNED"
                          ? "assigned"
                          : "submitted"
                    }
                  />
                </div>
                <p
                  style={{ margin: 0, fontSize: "0.875rem", color: "var(--text)", lineHeight: 1.4 }}
                >
                  {n.message}
                </p>
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-subtle)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {new Date(n.createdAt).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              {n.issuePublicId && (
                <Link
                  to={`/issues/${n.issuePublicId}`}
                  style={{
                    color: "var(--link)",
                    display: "inline-flex",
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <ChevronRight size={16} strokeWidth={1.75} />
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
