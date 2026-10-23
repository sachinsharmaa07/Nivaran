import React, { useState, useEffect, lazy, Suspense } from "react";
import { Link } from "react-router";
import { Plus, MapPin, ChevronRight } from "lucide-react";
import type { MapPin as MapPinType } from "../components/CitizenMap.js";
import { ReportWizard } from "../components/ReportWizard.js";
import type { TenantInfo } from "../components/CityPicker.js";
import { useAuth } from "../utils/authContext.js";
import {
  Button,
  Sheet,
  StatusChip,
  PriorityMeter,
  Skeleton,
  EmptyState,
  ErrorState,
  Dialog,
  LaneLineLoader,
} from "../ui/index.js";

const CitizenMap = lazy(() => import("../components/CitizenMap.js"));

interface ApiIssueItem {
  publicId: string;
  location?: { coordinates: [number, number] };
  category?: { code: string; name?: string; names?: Record<string, string> };
  status: string;
  description: string;
  priority?: {
    breakdown?: { score?: number; level?: string };
    override?: { score?: number; level?: string };
  };
}

export function CitizenHomePage({
  tenant,
  onOpenAuth: _onOpenAuth,
}: {
  tenant: TenantInfo;
  onOpenAuth: () => void;
}): React.JSX.Element {
  const { authFetch } = useAuth();

  const [pins, setPins] = useState<MapPinType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | undefined>(undefined);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);

  // Center coordinates per state/district (Default to Ludhiana: 30.901, 75.8573)
  const defaultCenter =
    tenant.state_code === "PB"
      ? { lat: 30.901, lon: 75.8573 }
      : tenant.state_code === "MH"
        ? { lat: 19.076, lon: 72.8777 }
        : tenant.state_code === "TN"
          ? { lat: 13.0827, lon: 80.2707 }
          : { lat: 28.6139, lon: 77.209 };

  const fetchIssues = () => {
    setLoading(true);
    setErrorMsg(null);
    authFetch(`/api/v1/issues?tenant_slug=${encodeURIComponent(tenant.slug)}&limit=60`)
      .then((r) => {
        if (!r.ok) {
          throw new Error("Could not load civic reports for this municipality");
        }
        return r.json();
      })
      .then((res: { data?: ApiIssueItem[] } | null) => {
        if (res?.data && Array.isArray(res.data)) {
          const mappedPins: MapPinType[] = res.data
            .filter((i): i is ApiIssueItem & { location: { coordinates: [number, number] } } =>
              Boolean(i.location?.coordinates)
            )
            .map((i) => ({
              publicId: i.publicId,
              lat: i.location.coordinates[1],
              lon: i.location.coordinates[0],
              categoryCode: i.category?.code || "issue",
              categoryName:
                i.category?.names?.[tenant.default_locale] || i.category?.name || i.category?.code,
              status: i.status,
              description: i.description,
              priorityScore: i.priority?.override?.score ?? i.priority?.breakdown?.score ?? 30,
              priorityLevel:
                i.priority?.override?.level ?? i.priority?.breakdown?.level ?? "medium",
            }));
          setPins(mappedPins);
        } else {
          setPins([]);
        }
      })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : "Failed to load issues");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchIssues();
  }, [tenant.slug]);

  const selectedPin = pins.find((p) => p.publicId === selectedPinId);

  return (
    <div
      style={{
        position: "relative",
        height: "calc(100dvh - 56px)",
        width: "100%",
        overflow: "hidden",
        backgroundColor: "var(--bg)",
      }}
    >
      {/* Full-bleed interactive map */}
      <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
        <Suspense
          fallback={
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "var(--surface-sunken)",
                gap: "0.75rem",
              }}
            >
              <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                Loading municipal map...
              </span>
              <LaneLineLoader width="140px" />
            </div>
          }
        >
          <CitizenMap
            pins={pins}
            center={defaultCenter}
            zoom={13}
            selectedPinId={selectedPinId}
            onSelectPin={(pin) => {
              setSelectedPinId(pin.publicId);
              setSheetExpanded(true);
            }}
          />
        </Suspense>
      </div>

      {/* Floating Municipality indicator */}
      <div
        style={{
          position: "absolute",
          top: "0.75rem",
          left: "0.75rem",
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            backgroundColor: "var(--surface-raised)",
            padding: "0.375rem 0.75rem",
            borderRadius: "var(--r-sm)",
            border: "1px solid var(--border)",
            fontSize: "0.8125rem",
            fontWeight: 600,
            color: "var(--text)",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.375rem",
            boxShadow: "var(--shadow-overlay)",
          }}
        >
          <MapPin
            size={13}
            strokeWidth={1.75}
            style={{ color: "var(--text-muted)" }}
            aria-hidden={true}
          />
          <span>{tenant.name}</span>
        </div>
      </div>

      {/* Responsive Sheet (Desktop 380px left rail, mobile draggable bottom sheet) */}
      <Sheet
        isOpen={true}
        expanded={sheetExpanded}
        onToggleExpand={() => setSheetExpanded(!sheetExpanded)}
        title={
          <div>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text)" }}>
              {pins.length} open issues near you
            </div>
            <p style={{ margin: "2px 0 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Reported in {tenant.district || tenant.name}
            </p>
          </div>
        }
        headerAction={
          <button
            type="button"
            onClick={() => setSheetExpanded(!sheetExpanded)}
            style={{
              background: "none",
              border: "none",
              color: "var(--link)",
              fontSize: "0.8125rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {sheetExpanded ? "Collapse" : "View all"}
          </button>
        }
      >
        {/* ONE main action per screen: Road-paint yellow CTA */}
        <Button
          variant="cta"
          onClick={() => setReportModalOpen(true)}
          style={{ width: "100%", minHeight: "44px" }}
        >
          <Plus size={16} strokeWidth={1.75} aria-hidden={true} />
          <span>Report an issue</span>
        </Button>

        {/* Selected Issue Preview Card if clicked */}
        {selectedPin && (
          <div
            className="sign-plate"
            style={{
              padding: "0.75rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              backgroundColor: "var(--surface)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: "0.8125rem", color: "var(--text)" }}>
                {selectedPin.publicId}
              </span>
              <StatusChip status={selectedPin.status} />
            </div>
            <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-muted)" }}>
              {selectedPin.categoryName || selectedPin.categoryCode}
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "0.8125rem",
                color: "var(--text)",
                lineHeight: 1.4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {selectedPin.description}
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "2px",
              }}
            >
              <PriorityMeter priority={selectedPin.priorityScore ?? 30} />
              <Link
                to={`/issues/${selectedPin.publicId}`}
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--link)",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "2px",
                }}
              >
                <span>View timeline</span>
                <ChevronRight size={13} strokeWidth={1.75} />
              </Link>
            </div>
          </div>
        )}

        {/* List of nearby issues */}
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <Skeleton height="60px" />
            <Skeleton height="60px" />
            <Skeleton height="60px" />
          </div>
        ) : errorMsg ? (
          <ErrorState title="Could not load issues" message={errorMsg} onRetry={fetchIssues} />
        ) : pins.length === 0 ? (
          <EmptyState
            title="No open issues reported"
            description="No active road, pipe, light or sanitation issues currently reported in this area."
            action={
              <Button variant="cta" size="sm" onClick={() => setReportModalOpen(true)}>
                Report the first issue
              </Button>
            }
          />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            {pins.map((pin) => {
              const isSelected = pin.publicId === selectedPinId;
              return (
                <div
                  key={pin.publicId}
                  onClick={() => setSelectedPinId(pin.publicId)}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSelected}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedPinId(pin.publicId);
                    }
                  }}
                  style={{
                    padding: "0.625rem 0.75rem",
                    borderRadius: "var(--r-md)",
                    border: `1px solid ${isSelected ? "var(--asphalt-900)" : "var(--border)"}`,
                    backgroundColor: isSelected ? "var(--surface-sunken)" : "var(--surface)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.375rem",
                    transition: "all var(--dur-fast) var(--ease-out)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: "0.8125rem",
                        color: "var(--text)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {pin.publicId}
                    </span>
                    <StatusChip status={pin.status} />
                  </div>

                  <div
                    style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-muted)" }}
                  >
                    {pin.categoryName || pin.categoryCode}
                  </div>

                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.8125rem",
                      color: "var(--text)",
                      lineHeight: 1.35,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {pin.description}
                  </p>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: "2px",
                    }}
                  >
                    <PriorityMeter priority={pin.priorityScore ?? 30} />
                    <Link
                      to={`/issues/${pin.publicId}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--link)",
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "2px",
                      }}
                    >
                      <span>Details</span>
                      <ChevronRight size={12} strokeWidth={1.75} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Sheet>

      {/* Report Wizard Modal */}
      <Dialog
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        title="Report a Civic Issue"
        description="Submit a road defect, broken light, water leak or overflowing bin"
        maxWidth="580px"
      >
        <ReportWizard
          tenant={tenant}
          initialCoordinates={defaultCenter}
          onComplete={() => {
            setReportModalOpen(false);
            fetchIssues();
          }}
        />
      </Dialog>
    </div>
  );
}
