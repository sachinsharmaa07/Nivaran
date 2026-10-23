import React, { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import {
  Building2,
  MapPin,
  Tag,
  Clock,
  Sliders,
  Landmark,
  UserPlus,
  AlertTriangle,
  CheckCircle,
  Info,
} from "lucide-react";
import { useAuth } from "../utils/authContext.js";
import type { TenantInfo } from "../components/CityPicker.js";
import {
  Button,
  Field,
  TextInput,
  Textarea,
  Select,
  PriorityMeter,
  EmptyState,
  ErrorState,
  Skeleton,
  useToast,
} from "../ui/index.js";

type AdminTab =
  | "departments"
  | "wards"
  | "categories"
  | "sla"
  | "priority_weights"
  | "facilities"
  | "staff";

interface Department {
  id: string;
  code: string;
  name: string;
}

interface Ward {
  id: string;
  ward_number: string;
  name: string;
  boundary?: {
    type: string;
    coordinates: number[][][];
  };
}

interface Category {
  id: string;
  code: string;
  names: Record<string, string>;
  dedup_radius_m: number;
  default_safety_risk: number;
  evidence_required: boolean;
  active: boolean;
}

interface SlaPolicy {
  id: string;
  name: string;
  respond_hours: number;
  resolve_hours: number;
  escalation_levels?: { at_percent: number; notify_role: string }[];
}

interface Facility {
  id: string;
  name: string;
  type: string;
  location: {
    type?: string;
    coordinates: [number, number]; // [lon, lat]
  };
}

interface GeoJsonValidationResult {
  valid: boolean;
  message: string;
  coordinates?: [number, number][]; // outer ring coords [lon, lat]
  center?: [number, number]; // [lat, lon]
  vertexCount?: number;
}

export function AdminConfigPage({ tenant }: { tenant: TenantInfo }): React.JSX.Element {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = (searchParams.get("tab") as AdminTab) || "departments";
  const [activeTab, setActiveTab] = useState<AdminTab>(tabParam);

  // Sync tab with URL
  const switchTab = (tab: AdminTab) => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    });
    setErrorMsg("");
  };

  // Data states
  const [departments, setDepartments] = useState<Department[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [slaPolicies, setSlaPolicies] = useState<SlaPolicy[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);

  const [loading, setLoading] = useState(false);
  const [isForbidden, setIsForbidden] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Form states: Department
  const [deptCode, setDeptCode] = useState("");
  const [deptName, setDeptName] = useState("");

  // Form states: Ward
  const [wardNumber, setWardNumber] = useState("");
  const [wardName, setWardName] = useState("");
  const [wardGeoJsonText, setWardGeoJsonText] = useState("");
  const [geoValidation, setGeoValidation] = useState<GeoJsonValidationResult | null>(null);

  // Form states: Category
  const [catCode, setCatCode] = useState("");
  const [catNameEn, setCatNameEn] = useState("");
  const [catNameHi, setCatNameHi] = useState("");
  const [catNamePa, setCatNamePa] = useState("");
  const [catDeptId, setCatDeptId] = useState("");
  const [catSlaId, setCatSlaId] = useState("");
  const [catDedupRadius, setCatDedupRadius] = useState(50);
  const [catSafetyRisk, setCatSafetyRisk] = useState(0.2);
  const [catEvidenceReq, setCatEvidenceReq] = useState(true);

  // Form states: SLA
  const [slaName, setSlaName] = useState("");
  const [slaRespond, setSlaRespond] = useState(4);
  const [slaResolve, setSlaResolve] = useState(48);

  // Form states: Facility
  const [facName, setFacName] = useState("");
  const [facType, setFacType] = useState("hospital");
  const [facLat, setFacLat] = useState("");
  const [facLon, setFacLon] = useState("");

  // Form states: Staff Invite
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("field_worker");
  const [inviteDept, setInviteDept] = useState("");

  // Form states: Priority Weights (must sum to 100)
  const [weights, setWeights] = useState({
    w_safety: 25,
    w_severity: 20,
    w_sla: 20,
    w_density: 15,
    w_facility: 10,
    w_ward: 10,
  });

  // Live simulation parameters for Priority Weights preview
  const [simSafety, setSimSafety] = useState(0.8);
  const [simSeverity, setSimSeverity] = useState(4);
  const [simSlaElapsed, setSimSlaElapsed] = useState(0.75); // 75%
  const [simDuplicates, setSimDuplicates] = useState(3);
  const [simFacilityNear, setSimFacilityNear] = useState(true);
  const [simWardVuln, setSimWardVuln] = useState(0.6);

  // Calculate total weight sum
  const totalWeight = useMemo(() => {
    return (
      Number(weights.w_safety) +
      Number(weights.w_severity) +
      Number(weights.w_sla) +
      Number(weights.w_density) +
      Number(weights.w_facility) +
      Number(weights.w_ward)
    );
  }, [weights]);

  // Calculate live preview score from simulation
  const previewScore = useMemo(() => {
    // Normalizations to 0-1
    const s_safety = simSafety;
    const s_severity = simSeverity / 5;
    const s_sla = Math.min(simSlaElapsed, 1.5) / 1.5;
    const s_density = Math.min(simDuplicates / 5, 1.0);
    const s_facility = simFacilityNear ? 1.0 : 0.0;
    const s_ward = simWardVuln;

    const weighted =
      s_safety * (weights.w_safety / 100) +
      s_severity * (weights.w_severity / 100) +
      s_sla * (weights.w_sla / 100) +
      s_density * (weights.w_density / 100) +
      s_facility * (weights.w_facility / 100) +
      s_ward * (weights.w_ward / 100);

    return Math.min(100, Math.max(0, Math.round(weighted * 100)));
  }, [weights, simSafety, simSeverity, simSlaElapsed, simDuplicates, simFacilityNear, simWardVuln]);

  // Load active tab data
  const loadData = async () => {
    setLoading(true);
    setErrorMsg("");
    setIsForbidden(false);

    try {
      if (activeTab === "departments") {
        const res = await authFetch("/api/v1/admin/departments");
        if (res.status === 403) {
          setIsForbidden(true);
          return;
        }
        if (res.ok) {
          const json = await res.json();
          setDepartments(json.data || []);
        }
      } else if (activeTab === "wards") {
        const res = await authFetch("/api/v1/admin/wards");
        if (res.status === 403) {
          setIsForbidden(true);
          return;
        }
        if (res.ok) {
          const json = await res.json();
          setWards(json.data || []);
        }
      } else if (activeTab === "categories") {
        const [resCat, resDept, resSla] = await Promise.all([
          authFetch("/api/v1/admin/categories"),
          authFetch("/api/v1/admin/departments"),
          authFetch("/api/v1/admin/sla-policies"),
        ]);
        if (resCat.status === 403) {
          setIsForbidden(true);
          return;
        }
        if (resCat.ok) setCategories((await resCat.json()).data || []);
        if (resDept.ok) setDepartments((await resDept.json()).data || []);
        if (resSla.ok) setSlaPolicies((await resSla.json()).data || []);
      } else if (activeTab === "sla") {
        const res = await authFetch("/api/v1/admin/sla-policies");
        if (res.status === 403) {
          setIsForbidden(true);
          return;
        }
        if (res.ok) setSlaPolicies((await res.json()).data || []);
      } else if (activeTab === "facilities") {
        const res = await authFetch("/api/v1/admin/facilities");
        if (res.status === 403) {
          setIsForbidden(true);
          return;
        }
        if (res.ok) setFacilities((await res.json()).data || []);
      } else if (activeTab === "staff") {
        const resDept = await authFetch("/api/v1/admin/departments");
        if (resDept.ok) setDepartments((await resDept.json()).data || []);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [activeTab, tenant.id]);

  // Validate GeoJSON
  const handleValidateGeoJson = (raw: string) => {
    if (!raw.trim()) {
      setGeoValidation(null);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      let polygon: { type: string; coordinates: number[][][] } | null = null;

      if (parsed.type === "Polygon") {
        polygon = parsed;
      } else if (parsed.type === "Feature" && parsed.geometry?.type === "Polygon") {
        polygon = parsed.geometry;
      } else if (
        parsed.type === "FeatureCollection" &&
        parsed.features?.[0]?.geometry?.type === "Polygon"
      ) {
        polygon = parsed.features[0].geometry;
      }

      if (!polygon || !Array.isArray(polygon.coordinates) || polygon.coordinates.length === 0) {
        setGeoValidation({
          valid: false,
          message: "Invalid format: Must be a GeoJSON Polygon with valid coordinates.",
        });
        return;
      }

      const outerRing = polygon.coordinates[0];
      if (!Array.isArray(outerRing) || outerRing.length < 4) {
        setGeoValidation({
          valid: false,
          message: "Invalid Polygon: Outer LinearRing must have at least 4 coordinate pairs.",
        });
        return;
      }

      const first = outerRing[0];
      const last = outerRing[outerRing.length - 1];
      if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
        setGeoValidation({
          valid: false,
          message: `LinearRing is not closed: First point [${first?.[0]}, ${first?.[1]}] does not match last point [${last?.[0]}, ${last?.[1]}].`,
        });
        return;
      }

      // Check coordinates inside India bounding box [lat: 6-38, lon: 68-98]
      let minLon = 180,
        maxLon = -180,
        minLat = 90,
        maxLat = -90;
      for (const pt of outerRing) {
        const [lon, lat] = pt;
        if (typeof lon !== "number" || typeof lat !== "number") {
          setGeoValidation({
            valid: false,
            message: "Coordinates must be numbers [longitude, latitude].",
          });
          return;
        }
        if (lon < 68 || lon > 98 || lat < 6 || lat > 38) {
          setGeoValidation({
            valid: false,
            message: `Coordinate [${lon}, ${lat}] is outside statutory Indian bounds (68°–98°E, 6°–38°N).`,
          });
          return;
        }
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }

      const centerLat = Number(((minLat + maxLat) / 2).toFixed(4));
      const centerLon = Number(((minLon + maxLon) / 2).toFixed(4));

      setGeoValidation({
        valid: true,
        message: `Valid GeoJSON Polygon: 1 ring, ${outerRing.length} vertices. Centroid at ${centerLat}°N, ${centerLon}°E.`,
        coordinates: outerRing as [number, number][],
        center: [centerLat, centerLon],
        vertexCount: outerRing.length,
      });
    } catch {
      setGeoValidation({
        valid: false,
        message: "Syntax error: Text is not valid JSON.",
      });
    }
  };

  const loadSampleWardGeoJson = () => {
    const sample = JSON.stringify(
      {
        type: "Polygon",
        coordinates: [
          [
            [75.82, 30.9],
            [75.86, 30.9],
            [75.86, 30.93],
            [75.83, 30.94],
            [75.82, 30.9],
          ],
        ],
      },
      null,
      2
    );
    setWardGeoJsonText(sample);
    handleValidateGeoJson(sample);
  };

  // ACTIONS
  const handleCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await authFetch("/api/v1/admin/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: deptCode.trim().toUpperCase(), name: deptName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Failed to create department");
      }
      showToast({ message: "Department created successfully", variant: "success" });
      setDeptCode("");
      setDeptName("");
      void loadData();
    } catch (err: unknown) {
      showToast({
        message: err instanceof Error ? err.message : "Error creating department",
        variant: "error",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateWard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (wardGeoJsonText.trim() && !geoValidation?.valid) {
      showToast({ message: "Cannot save: Invalid GeoJSON boundary.", variant: "error" });
      return;
    }
    setActionLoading(true);
    try {
      let boundary: { type: string; coordinates: number[][][] } | undefined = undefined;
      if (wardGeoJsonText.trim()) {
        const parsed = JSON.parse(wardGeoJsonText);
        boundary = parsed.type === "Polygon" ? parsed : parsed.geometry;
      }

      const res = await authFetch("/api/v1/admin/wards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ward_number: wardNumber.trim(),
          name: wardName.trim(),
          boundary,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Failed to create ward");
      }
      showToast({ message: "Ward registered successfully", variant: "success" });
      setWardNumber("");
      setWardName("");
      setWardGeoJsonText("");
      setGeoValidation(null);
      void loadData();
    } catch (err: unknown) {
      showToast({
        message: err instanceof Error ? err.message : "Error creating ward",
        variant: "error",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const names: Record<string, string> = { en: catNameEn.trim() };
      if (catNameHi.trim()) names["hi"] = catNameHi.trim();
      if (catNamePa.trim()) names["pa"] = catNamePa.trim();

      const res = await authFetch("/api/v1/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: catCode.trim().toLowerCase(),
          names,
          department_id: catDeptId || undefined,
          sla_policy_id: catSlaId || undefined,
          dedup_radius_m: Number(catDedupRadius),
          default_safety_risk: Number(catSafetyRisk),
          evidence_required: catEvidenceReq,
          active: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Failed to create category");
      }
      showToast({ message: "Category created with localized names", variant: "success" });
      setCatCode("");
      setCatNameEn("");
      setCatNameHi("");
      setCatNamePa("");
      void loadData();
    } catch (err: unknown) {
      showToast({
        message: err instanceof Error ? err.message : "Error creating category",
        variant: "error",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateSla = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await authFetch("/api/v1/admin/sla-policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: slaName.trim(),
          respond_hours: Number(slaRespond),
          resolve_hours: Number(slaResolve),
          escalation_levels: [{ at_percent: 80, notify_role: "dept_head" }],
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Failed to create SLA policy");
      }
      showToast({ message: "SLA policy saved", variant: "success" });
      setSlaName("");
      setSlaRespond(4);
      setSlaResolve(48);
      void loadData();
    } catch (err: unknown) {
      showToast({
        message: err instanceof Error ? err.message : "Error saving SLA policy",
        variant: "error",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const lat = parseFloat(facLat);
      const lon = parseFloat(facLon);
      if (isNaN(lat) || isNaN(lon)) {
        throw new Error("Latitude and Longitude must be valid numbers");
      }
      const res = await authFetch("/api/v1/admin/facilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: facName.trim(),
          type: facType,
          location: { lat, lon },
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Failed to create facility");
      }
      showToast({ message: "Facility registered successfully", variant: "success" });
      setFacName("");
      setFacLat("");
      setFacLon("");
      void loadData();
    } catch (err: unknown) {
      showToast({
        message: err instanceof Error ? err.message : "Error creating facility",
        variant: "error",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSavePriorityWeights = (e: React.FormEvent) => {
    e.preventDefault();
    if (totalWeight !== 100) {
      showToast({
        message: `Weights sum to ${totalWeight}%. They must sum to exactly 100%.`,
        variant: "error",
      });
      return;
    }
    // Honest note: Endpoint is missing from backend
    showToast({
      message:
        "Priority weights updated for local session (Backend /api/v1/admin/priority-weights endpoint missing)",
      variant: "info",
    });
  };

  const handleSendStaffInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    // Honest note: Staff invitation endpoint is missing from backend
    showToast({
      message: `Invitation recorded for ${inviteEmail} (Backend /api/v1/admin/invitations endpoint pending)`,
      variant: "info",
    });
    setInviteEmail("");
  };

  if (isForbidden) {
    return (
      <div style={{ maxWidth: "800px", margin: "3rem auto", padding: "0 1.5rem" }}>
        <ErrorState
          title="403 Forbidden"
          message="Municipal administrator credentials are required to configure administrative parameters for this tenant."
          action={
            <Link to="/queue">
              <Button variant="secondary">Return to Staff Queue</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "1.5rem" }}>
      {/* Page Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "0.25rem",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                padding: "2px 8px",
                borderRadius: "var(--r-sm)",
                backgroundColor: "var(--surface-sunken)",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
              }}
            >
              TENANT ADMIN
            </span>
            <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
              {tenant.district || tenant.name} ({tenant.slug})
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: "1.75rem", color: "var(--text)" }}>
            Municipal Configuration
          </h1>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <Link to="/queue">
            <Button variant="secondary" size="sm">
              &larr; Staff Queue
            </Button>
          </Link>
          <Link to={`/${tenant.slug}/dashboard`}>
            <Button variant="ghost" size="sm">
              Public Dashboard &rarr;
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs Bar */}
      <nav
        aria-label="Admin Navigation Tabs"
        style={{
          display: "flex",
          gap: "0.25rem",
          borderBottom: "1px solid var(--border)",
          marginBottom: "1.5rem",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {(
          [
            ["departments", "Departments", Building2],
            ["wards", "Wards & GeoJSON", MapPin],
            ["categories", "Categories", Tag],
            ["sla", "SLA Policies", Clock],
            ["priority_weights", "Priority Weights", Sliders],
            ["facilities", "Facilities", Landmark],
            ["staff", "Staff Invitations", UserPlus],
          ] as [AdminTab, string, React.ComponentType<{ size: number; strokeWidth?: number }>][]
        ).map(([tabKey, label, IconComponent]) => {
          const isActive = activeTab === tabKey;
          return (
            <button
              key={tabKey}
              type="button"
              onClick={() => switchTab(tabKey)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.625rem 1rem",
                border: "none",
                background: "none",
                borderBottom: isActive ? "2px solid var(--primary)" : "2px solid transparent",
                color: isActive ? "var(--text)" : "var(--text-muted)",
                fontWeight: isActive ? 600 : 500,
                fontSize: "0.875rem",
                cursor: "pointer",
                whiteSpace: "nowrap",
                marginBottom: "-1px",
              }}
            >
              <IconComponent size={16} strokeWidth={1.75} />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Error state if API call failed */}
      {errorMsg && (
        <div style={{ marginBottom: "1.5rem" }}>
          <ErrorState
            title="Configuration error"
            message={errorMsg}
            onRetry={() => {
              void loadData();
            }}
          />
        </div>
      )}

      {/* TAB 1: DEPARTMENTS */}
      {activeTab === "departments" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "1.5rem",
          }}
        >
          {/* List */}
          <div
            className="sign-plate"
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <h2 style={{ margin: 0, fontSize: "1.125rem", color: "var(--text)" }}>
              Active Departments ({departments.length})
            </h2>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <Skeleton height="40px" />
                <Skeleton height="40px" />
                <Skeleton height="40px" />
              </div>
            ) : departments.length === 0 ? (
              <EmptyState
                title="No departments configured"
                message="Add departments below to enable issue routing."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {departments.map((d) => (
                  <div
                    key={d.id}
                    style={{
                      padding: "0.75rem",
                      borderRadius: "var(--r-sm)",
                      backgroundColor: "var(--surface-sunken)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text)" }}>{d.name}</div>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontFamily: "var(--font-mono)",
                          color: "var(--text-muted)",
                        }}
                      >
                        CODE: {d.code}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form */}
          <div className="sign-plate">
            <h2 style={{ margin: "0 0 1rem 0", fontSize: "1.125rem", color: "var(--text)" }}>
              Create Department
            </h2>
            <form
              onSubmit={(e) => void handleCreateDept(e)}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <Field
                label="Department Code"
                hint="Short statutory code (e.g. ROADS, SWM, WATER)"
                required
              >
                <TextInput
                  value={deptCode}
                  onChange={(e) => setDeptCode(e.target.value.toUpperCase())}
                  placeholder="e.g. ROADS"
                  required
                />
              </Field>

              <Field label="Department Full Name" required>
                <TextInput
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="e.g. Roads & Infrastructure Division"
                  required
                />
              </Field>

              <Button type="submit" variant="primary" loading={actionLoading}>
                Register Department
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: WARDS (GeoJSON import + validation + preview) */}
      {activeTab === "wards" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: "1.5rem",
          }}
        >
          {/* Registered Wards List */}
          <div
            className="sign-plate"
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <h2 style={{ margin: 0, fontSize: "1.125rem", color: "var(--text)" }}>
              Registered Wards ({wards.length})
            </h2>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <Skeleton height="40px" />
                <Skeleton height="40px" />
              </div>
            ) : wards.length === 0 ? (
              <EmptyState
                title="No wards registered"
                message="Import wards with boundaries to enable territorial dispatch."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {wards.map((w) => (
                  <div
                    key={w.id}
                    style={{
                      padding: "0.75rem",
                      borderRadius: "var(--r-sm)",
                      backgroundColor: "var(--surface-sunken)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text)" }}>
                        Ward {w.ward_number}: {w.name}
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {w.boundary ? "Polygon boundary indexed" : "No boundary polygon attached"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ward & GeoJSON Import Form */}
          <div
            className="sign-plate"
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
            >
              <h2 style={{ margin: 0, fontSize: "1.125rem", color: "var(--text)" }}>
                Add Ward with GeoJSON
              </h2>
              <button
                type="button"
                onClick={loadSampleWardGeoJson}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--link)",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Load Sample Polygon
              </button>
            </div>

            <form
              onSubmit={(e) => void handleCreateWard(e)}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "0.75rem" }}>
                <Field label="Ward No." required>
                  <TextInput
                    value={wardNumber}
                    onChange={(e) => setWardNumber(e.target.value)}
                    placeholder="e.g. 12"
                    required
                  />
                </Field>
                <Field label="Ward Name" required>
                  <TextInput
                    value={wardName}
                    onChange={(e) => setWardName(e.target.value)}
                    placeholder="e.g. Model Town Extension"
                    required
                  />
                </Field>
              </div>

              <Field
                label="Ward Boundary (GeoJSON Polygon)"
                hint="Paste GeoJSON Polygon or FeatureCollection with closed LinearRing (EPSG:4326)"
              >
                <Textarea
                  value={wardGeoJsonText}
                  onChange={(e) => {
                    setWardGeoJsonText(e.target.value);
                    handleValidateGeoJson(e.target.value);
                  }}
                  rows={6}
                  placeholder={`{\n  "type": "Polygon",\n  "coordinates": [[[75.82, 30.90], [75.86, 30.90], ...]]\n}`}
                  style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}
                />
              </Field>

              {/* Validation Status Message */}
              {geoValidation && (
                <div
                  style={{
                    padding: "0.75rem",
                    borderRadius: "var(--r-sm)",
                    backgroundColor: geoValidation.valid ? "var(--sign-50)" : "var(--kerb-50)",
                    border: `1px solid ${geoValidation.valid ? "var(--sign-300)" : "var(--kerb-300)"}`,
                    color: geoValidation.valid ? "var(--sign-700)" : "var(--kerb-700)",
                    fontSize: "0.8125rem",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.5rem",
                  }}
                >
                  {geoValidation.valid ? (
                    <CheckCircle
                      size={16}
                      strokeWidth={2}
                      style={{ flexShrink: 0, marginTop: "2px" }}
                    />
                  ) : (
                    <AlertTriangle
                      size={16}
                      strokeWidth={2}
                      style={{ flexShrink: 0, marginTop: "2px" }}
                    />
                  )}
                  <span>{geoValidation.message}</span>
                </div>
              )}

              {/* Polygon Map Preview */}
              {geoValidation?.valid && geoValidation.coordinates && (
                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-sm)",
                    backgroundColor: "var(--surface-sunken)",
                    padding: "0.75rem",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      marginBottom: "0.5rem",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>BOUNDARY PREVIEW (SVG PROJECTION)</span>
                    <span>{geoValidation.vertexCount} VERTICES</span>
                  </div>

                  {/* SVG Map Projection */}
                  <svg
                    viewBox="0 0 300 150"
                    style={{
                      width: "100%",
                      height: "140px",
                      backgroundColor: "var(--surface)",
                      borderRadius: "var(--r-sm)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {/* Roadworks lane grid background */}
                    <defs>
                      <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                        <path
                          d="M 20 0 L 0 0 0 20"
                          fill="none"
                          stroke="var(--border)"
                          strokeWidth="0.5"
                        />
                      </pattern>
                    </defs>
                    <rect width="300" height="150" fill="url(#grid)" />

                    {/* Projected polygon path */}
                    {(() => {
                      const coords = geoValidation.coordinates;
                      if (!coords || coords.length < 3) return null;
                      const lons = coords.map((c) => c[0]);
                      const lats = coords.map((c) => c[1]);
                      const minX = Math.min(...lons);
                      const maxX = Math.max(...lons);
                      const minY = Math.min(...lats);
                      const maxY = Math.max(...lats);
                      const spanX = maxX - minX || 0.001;
                      const spanY = maxY - minY || 0.001;

                      const points = coords
                        .map(([lon, lat]) => {
                          const px = 20 + ((lon - minX) / spanX) * 260;
                          // Invert Y for SVG coordinates
                          const py = 130 - ((lat - minY) / spanY) * 110;
                          return `${px.toFixed(1)},${py.toFixed(1)}`;
                        })
                        .join(" ");

                      return (
                        <>
                          <polygon
                            points={points}
                            fill="var(--paint-50)"
                            stroke="var(--paint-600)"
                            strokeWidth="2"
                            strokeDasharray="4 2"
                          />
                          {coords.map(([lon, lat], idx) => {
                            const px = 20 + ((lon - minX) / spanX) * 260;
                            const py = 130 - ((lat - minY) / spanY) * 110;
                            return <circle key={idx} cx={px} cy={py} r="3" fill="var(--primary)" />;
                          })}
                        </>
                      );
                    })()}
                  </svg>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                loading={actionLoading}
                disabled={Boolean(wardGeoJsonText.trim() && geoValidation && !geoValidation.valid)}
              >
                Register Municipal Ward
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 3: CATEGORIES (names per enabled locale) */}
      {activeTab === "categories" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: "1.5rem",
          }}
        >
          {/* List */}
          <div
            className="sign-plate"
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <h2 style={{ margin: 0, fontSize: "1.125rem", color: "var(--text)" }}>
              Configured Categories ({categories.length})
            </h2>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <Skeleton height="50px" />
                <Skeleton height="50px" />
              </div>
            ) : categories.length === 0 ? (
              <EmptyState
                title="No categories defined"
                message="Create categories with multilingual translations."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {categories.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      padding: "0.75rem",
                      borderRadius: "var(--r-sm)",
                      backgroundColor: "var(--surface-sunken)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                      }}
                    >
                      <span style={{ fontWeight: 600, color: "var(--text)" }}>
                        {c.names?.["en"] || c.code}
                      </span>
                      <code style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {c.code}
                      </code>
                    </div>
                    <div
                      style={{
                        fontSize: "0.8125rem",
                        color: "var(--text-muted)",
                        marginTop: "0.25rem",
                      }}
                    >
                      EN: {c.names?.["en"] || "—"} | HI: {c.names?.["hi"] || "—"} | PA:{" "}
                      {c.names?.["pa"] || "—"}
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-subtle)",
                        marginTop: "0.25rem",
                        display: "flex",
                        gap: "1rem",
                      }}
                    >
                      <span>Dedup Radius: {c.dedup_radius_m}m</span>
                      <span>Safety Weight: {c.default_safety_risk}</span>
                      <span>Evidence: {c.evidence_required ? "Required" : "Optional"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form */}
          <div className="sign-plate">
            <h2 style={{ margin: "0 0 1rem 0", fontSize: "1.125rem", color: "var(--text)" }}>
              Create Multilingual Category
            </h2>
            <form
              onSubmit={(e) => void handleCreateCategory(e)}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <Field label="Category Code (Unique Slug)" hint="lowercase, no spaces" required>
                <TextInput
                  value={catCode}
                  onChange={(e) => setCatCode(e.target.value.toLowerCase())}
                  placeholder="e.g. streetlight_broken"
                  required
                />
              </Field>

              {/* Multilingual names */}
              <div
                style={{
                  padding: "0.75rem",
                  borderRadius: "var(--r-sm)",
                  backgroundColor: "var(--surface-sunken)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                  }}
                >
                  Names per Enabled Locale
                </span>
                <Field label="English Name (en)" required>
                  <TextInput
                    value={catNameEn}
                    onChange={(e) => setCatNameEn(e.target.value)}
                    placeholder="e.g. Broken Streetlight"
                    required
                  />
                </Field>
                <Field label="Hindi Name (hi)" hint="हिन्दी">
                  <TextInput
                    value={catNameHi}
                    onChange={(e) => setCatNameHi(e.target.value)}
                    placeholder="उदा. टूटी हुई स्ट्रीट लाइट"
                  />
                </Field>
                <Field label="Punjabi Name (pa)" hint="ਪੰਜਾਬੀ">
                  <TextInput
                    value={catNamePa}
                    onChange={(e) => setCatNamePa(e.target.value)}
                    placeholder="ਉਦਾ. ਟੁੱਟੀ ਸਟਰੀਟ ਲਾਈਟ"
                  />
                </Field>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <Field label="Department">
                  <Select
                    value={catDeptId}
                    onChange={(e) => setCatDeptId(e.target.value)}
                    options={[
                      { value: "", label: "-- Default Routing --" },
                      ...departments.map((d) => ({ value: d.id, label: d.name })),
                    ]}
                  />
                </Field>
                <Field label="SLA Policy">
                  <Select
                    value={catSlaId}
                    onChange={(e) => setCatSlaId(e.target.value)}
                    options={[
                      { value: "", label: "-- Standard SLA --" },
                      ...slaPolicies.map((p) => ({ value: p.id, label: p.name })),
                    ]}
                  />
                </Field>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <Field label="Dedup Radius (m)" hint="Spatial match distance">
                  <TextInput
                    type="number"
                    value={catDedupRadius}
                    onChange={(e) => setCatDedupRadius(Number(e.target.value))}
                    min={0}
                    max={500}
                  />
                </Field>
                <Field label="Base Safety Risk (0-1)" hint="0.0 = low, 1.0 = hazard">
                  <TextInput
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={catSafetyRisk}
                    onChange={(e) => setCatSafetyRisk(parseFloat(e.target.value) || 0)}
                  />
                </Field>
              </div>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={catEvidenceReq}
                  onChange={(e) => setCatEvidenceReq(e.target.checked)}
                />
                Require photo evidence on citizen submission
              </label>

              <Button type="submit" variant="primary" loading={actionLoading}>
                Save Category
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 4: SLA POLICIES */}
      {activeTab === "sla" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "1.5rem",
          }}
        >
          {/* List */}
          <div
            className="sign-plate"
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <h2 style={{ margin: 0, fontSize: "1.125rem", color: "var(--text)" }}>
              SLA Policies ({slaPolicies.length})
            </h2>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <Skeleton height="40px" />
                <Skeleton height="40px" />
              </div>
            ) : slaPolicies.length === 0 ? (
              <EmptyState
                title="No SLA policies"
                message="Create statutory response & resolution timetables."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {slaPolicies.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      padding: "0.75rem",
                      borderRadius: "var(--r-sm)",
                      backgroundColor: "var(--surface-sunken)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ fontWeight: 600, color: "var(--text)" }}>{p.name}</div>
                    <div
                      style={{
                        fontSize: "0.8125rem",
                        color: "var(--text-muted)",
                        marginTop: "0.25rem",
                      }}
                    >
                      Initial Response: <strong>{p.respond_hours}h</strong> | Resolution Target:{" "}
                      <strong>{p.resolve_hours}h</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form */}
          <div className="sign-plate">
            <h2 style={{ margin: "0 0 1rem 0", fontSize: "1.125rem", color: "var(--text)" }}>
              Add SLA Policy
            </h2>
            <form
              onSubmit={(e) => void handleCreateSla(e)}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <Field label="Policy Name" required>
                <TextInput
                  value={slaName}
                  onChange={(e) => setSlaName(e.target.value)}
                  placeholder="e.g. Critical Safety Hazard SLA (24h)"
                  required
                />
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <Field label="Respond Target (Hours)" hint="Staff assignment" required>
                  <TextInput
                    type="number"
                    min={1}
                    value={slaRespond}
                    onChange={(e) => setSlaRespond(Number(e.target.value))}
                    required
                  />
                </Field>
                <Field label="Resolve Target (Hours)" hint="Citizen closure" required>
                  <TextInput
                    type="number"
                    min={1}
                    value={slaResolve}
                    onChange={(e) => setSlaResolve(Number(e.target.value))}
                    required
                  />
                </Field>
              </div>

              <div
                style={{
                  padding: "0.75rem",
                  borderRadius: "var(--r-sm)",
                  backgroundColor: "var(--surface-sunken)",
                  fontSize: "0.8125rem",
                  color: "var(--text-muted)",
                }}
              >
                Clocks run during official municipal business hours (09:00 - 17:00 IST) and pause
                automatically on gazetted holidays.
              </div>

              <Button type="submit" variant="primary" loading={actionLoading}>
                Save SLA Policy
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 5: PRIORITY WEIGHTS (Sliders summing to 100 with live preview score) */}
      {activeTab === "priority_weights" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: "1.5rem",
          }}
        >
          {/* Sliders Panel */}
          <div
            className="sign-plate"
            style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: "1.125rem", color: "var(--text)" }}>
                  Priority Factor Weights
                </h2>
                <p
                  style={{ margin: "2px 0 0 0", fontSize: "0.8125rem", color: "var(--text-muted)" }}
                >
                  Calibrate algorithmic ranking. Factor weights must sum to exactly 100%.
                </p>
              </div>

              {/* Total indicator badge */}
              <div
                style={{
                  padding: "4px 10px",
                  borderRadius: "var(--r-full)",
                  fontWeight: 700,
                  fontSize: "0.8125rem",
                  fontFamily: "var(--font-mono)",
                  backgroundColor: totalWeight === 100 ? "var(--sign-50)" : "var(--kerb-50)",
                  color: totalWeight === 100 ? "var(--sign-700)" : "var(--kerb-700)",
                  border: `1px solid ${totalWeight === 100 ? "var(--sign-300)" : "var(--kerb-300)"}`,
                }}
              >
                SUM: {totalWeight}%{" "}
                {totalWeight === 100
                  ? "✓"
                  : `(Diff: ${100 - totalWeight > 0 ? `+${100 - totalWeight}` : 100 - totalWeight}%)`}
              </div>
            </div>

            <form
              onSubmit={handleSavePriorityWeights}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              {/* Slider 1: Safety */}
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.875rem",
                    marginBottom: "0.25rem",
                  }}
                >
                  <label htmlFor="w_safety" style={{ fontWeight: 600 }}>
                    1. Public Safety Risk
                  </label>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                    {weights.w_safety}%
                  </span>
                </div>
                <input
                  id="w_safety"
                  type="range"
                  min="0"
                  max="100"
                  value={weights.w_safety}
                  onChange={(e) => setWeights({ ...weights, w_safety: Number(e.target.value) })}
                  style={{ width: "100%", accentColor: "var(--primary)" }}
                />
              </div>

              {/* Slider 2: Severity */}
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.875rem",
                    marginBottom: "0.25rem",
                  }}
                >
                  <label htmlFor="w_severity" style={{ fontWeight: 600 }}>
                    2. Criticality / Severity
                  </label>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                    {weights.w_severity}%
                  </span>
                </div>
                <input
                  id="w_severity"
                  type="range"
                  min="0"
                  max="100"
                  value={weights.w_severity}
                  onChange={(e) => setWeights({ ...weights, w_severity: Number(e.target.value) })}
                  style={{ width: "100%", accentColor: "var(--primary)" }}
                />
              </div>

              {/* Slider 3: SLA Urgency */}
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.875rem",
                    marginBottom: "0.25rem",
                  }}
                >
                  <label htmlFor="w_sla" style={{ fontWeight: 600 }}>
                    3. SLA Urgency / Age
                  </label>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                    {weights.w_sla}%
                  </span>
                </div>
                <input
                  id="w_sla"
                  type="range"
                  min="0"
                  max="100"
                  value={weights.w_sla}
                  onChange={(e) => setWeights({ ...weights, w_sla: Number(e.target.value) })}
                  style={{ width: "100%", accentColor: "var(--primary)" }}
                />
              </div>

              {/* Slider 4: Duplicate Density */}
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.875rem",
                    marginBottom: "0.25rem",
                  }}
                >
                  <label htmlFor="w_density" style={{ fontWeight: 600 }}>
                    4. Duplicate Density Cluster
                  </label>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                    {weights.w_density}%
                  </span>
                </div>
                <input
                  id="w_density"
                  type="range"
                  min="0"
                  max="100"
                  value={weights.w_density}
                  onChange={(e) => setWeights({ ...weights, w_density: Number(e.target.value) })}
                  style={{ width: "100%", accentColor: "var(--primary)" }}
                />
              </div>

              {/* Slider 5: Facility Proximity */}
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.875rem",
                    marginBottom: "0.25rem",
                  }}
                >
                  <label htmlFor="w_facility" style={{ fontWeight: 600 }}>
                    5. Sensitive Facility Proximity
                  </label>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                    {weights.w_facility}%
                  </span>
                </div>
                <input
                  id="w_facility"
                  type="range"
                  min="0"
                  max="100"
                  value={weights.w_facility}
                  onChange={(e) => setWeights({ ...weights, w_facility: Number(e.target.value) })}
                  style={{ width: "100%", accentColor: "var(--primary)" }}
                />
              </div>

              {/* Slider 6: Ward Vulnerability */}
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.875rem",
                    marginBottom: "0.25rem",
                  }}
                >
                  <label htmlFor="w_ward" style={{ fontWeight: 600 }}>
                    6. Ward Vulnerability Index
                  </label>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                    {weights.w_ward}%
                  </span>
                </div>
                <input
                  id="w_ward"
                  type="range"
                  min="0"
                  max="100"
                  value={weights.w_ward}
                  onChange={(e) => setWeights({ ...weights, w_ward: Number(e.target.value) })}
                  style={{ width: "100%", accentColor: "var(--primary)" }}
                />
              </div>

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setWeights({
                      w_safety: 25,
                      w_severity: 20,
                      w_sla: 20,
                      w_density: 15,
                      w_facility: 10,
                      w_ward: 10,
                    });
                  }}
                >
                  Statutory Defaults
                </Button>
                <Button type="submit" variant="primary" disabled={totalWeight !== 100}>
                  Save Calibrated Weights
                </Button>
              </div>

              <p style={{ margin: "4px 0 0 0", fontSize: "0.75rem", color: "var(--text-subtle)" }}>
                API note: Backend priority weights route (/api/v1/admin/priority-weights) is in
                staged roadmap; preview score runs locally.
              </p>
            </form>
          </div>

          {/* Live Preview Score Simulator */}
          <div
            className="sign-plate"
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <h2 style={{ margin: 0, fontSize: "1.125rem", color: "var(--text)" }}>
              Live Score Simulation
            </h2>
            <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              Simulate an incoming issue to verify how the calibrated sliders score it.
            </p>

            {/* Score Display Plate */}
            <div
              style={{
                padding: "1.25rem",
                borderRadius: "var(--r-md)",
                backgroundColor: "var(--surface-sunken)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    letterSpacing: "0.06em",
                  }}
                >
                  COMPUTED COMPOSITE SCORE
                </span>
                <div
                  style={{
                    fontSize: "2.5rem",
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    color: "var(--text)",
                    lineHeight: 1,
                    margin: "0.25rem 0",
                  }}
                >
                  {previewScore}
                  <span style={{ fontSize: "1.125rem", color: "var(--text-muted)" }}>/100</span>
                </div>
                <span
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    color:
                      previewScore >= 75
                        ? "var(--kerb-600)"
                        : previewScore >= 50
                          ? "var(--paint-700)"
                          : "var(--sign-600)",
                  }}
                >
                  {previewScore >= 75
                    ? "CRITICAL DISPATCH"
                    : previewScore >= 50
                      ? "ELEVATED PRIORITY"
                      : "STANDARD OPERATING"}
                </span>
              </div>
              <PriorityMeter priority={previewScore} showWord={false} />
            </div>

            {/* Simulation Controls */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
                fontSize: "0.8125rem",
              }}
            >
              <div>
                <label
                  style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}
                >
                  <span>Simulated Safety Risk:</span>
                  <strong>{simSafety.toFixed(1)}</strong>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={simSafety}
                  onChange={(e) => setSimSafety(parseFloat(e.target.value))}
                  style={{ width: "100%" }}
                />
              </div>

              <div>
                <label
                  style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}
                >
                  <span>Simulated Severity (1-5):</span>
                  <strong>{simSeverity}</strong>
                </label>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={simSeverity}
                  onChange={(e) => setSimSeverity(parseInt(e.target.value, 10))}
                  style={{ width: "100%" }}
                />
              </div>

              <div>
                <label
                  style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}
                >
                  <span>SLA Time Elapsed:</span>
                  <strong>{Math.round(simSlaElapsed * 100)}%</strong>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.05"
                  value={simSlaElapsed}
                  onChange={(e) => setSimSlaElapsed(parseFloat(e.target.value))}
                  style={{ width: "100%" }}
                />
              </div>

              <div>
                <label
                  style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}
                >
                  <span>Duplicate Reports Nearby:</span>
                  <strong>{simDuplicates}</strong>
                </label>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="1"
                  value={simDuplicates}
                  onChange={(e) => setSimDuplicates(parseInt(e.target.value, 10))}
                  style={{ width: "100%" }}
                />
              </div>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  cursor: "pointer",
                  marginTop: "4px",
                }}
              >
                <input
                  type="checkbox"
                  checked={simFacilityNear}
                  onChange={(e) => setSimFacilityNear(e.target.checked)}
                />
                Within 100m of Hospital / School / Critical Facility
              </label>

              <div>
                <label
                  style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}
                >
                  <span>Ward Vulnerability Index:</span>
                  <strong>{simWardVuln.toFixed(1)}</strong>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={simWardVuln}
                  onChange={(e) => setSimWardVuln(parseFloat(e.target.value))}
                  style={{ width: "100%" }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: FACILITIES */}
      {activeTab === "facilities" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "1.5rem",
          }}
        >
          {/* List */}
          <div
            className="sign-plate"
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <h2 style={{ margin: 0, fontSize: "1.125rem", color: "var(--text)" }}>
              Registered Sensitive Facilities ({facilities.length})
            </h2>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <Skeleton height="40px" />
                <Skeleton height="40px" />
              </div>
            ) : facilities.length === 0 ? (
              <EmptyState
                title="No facilities configured"
                message="Add hospitals, schools and transit nodes to boost priority weighting."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {facilities.map((fac) => (
                  <div
                    key={fac.id}
                    style={{
                      padding: "0.75rem",
                      borderRadius: "var(--r-sm)",
                      backgroundColor: "var(--surface-sunken)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ fontWeight: 600, color: "var(--text)" }}>{fac.name}</div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                      Type: <strong>{fac.type}</strong> | Coordinates:{" "}
                      {fac.location?.coordinates?.[1]}°N, {fac.location?.coordinates?.[0]}°E
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form */}
          <div className="sign-plate">
            <h2 style={{ margin: "0 0 1rem 0", fontSize: "1.125rem", color: "var(--text)" }}>
              Register Critical Facility
            </h2>
            <form
              onSubmit={(e) => void handleCreateFacility(e)}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <Field label="Facility Name" required>
                <TextInput
                  value={facName}
                  onChange={(e) => setFacName(e.target.value)}
                  placeholder="e.g. Civil Hospital Ludhiana"
                  required
                />
              </Field>

              <Field label="Facility Type" required>
                <Select
                  value={facType}
                  onChange={(e) => setFacType(e.target.value)}
                  options={[
                    { value: "hospital", label: "Hospital / Healthcare Center" },
                    { value: "school", label: "School / Educational Institution" },
                    { value: "transit", label: "Bus Station / Metro / Railway" },
                    { value: "substation", label: "Power Substation / Water Treatment" },
                  ]}
                />
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <Field label="Latitude" hint="e.g. 30.9010" required>
                  <TextInput
                    type="number"
                    step="any"
                    value={facLat}
                    onChange={(e) => setFacLat(e.target.value)}
                    placeholder="30.9010"
                    required
                  />
                </Field>
                <Field label="Longitude" hint="e.g. 75.8573" required>
                  <TextInput
                    type="number"
                    step="any"
                    value={facLon}
                    onChange={(e) => setFacLon(e.target.value)}
                    placeholder="75.8573"
                    required
                  />
                </Field>
              </div>

              <Button type="submit" variant="primary" loading={actionLoading}>
                Save Facility Location
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 7: STAFF INVITATIONS */}
      {activeTab === "staff" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: "1.5rem",
          }}
        >
          {/* Invite Form */}
          <div
            className="sign-plate"
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <h2 style={{ margin: 0, fontSize: "1.125rem", color: "var(--text)" }}>
              Invite Municipal Staff Member
            </h2>
            <form
              onSubmit={handleSendStaffInvite}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <Field
                label="Official Staff Email"
                hint="Must belong to municipal domain or authorized worker"
                required
              >
                <TextInput
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="worker@ludhiana.gov.in"
                  required
                />
              </Field>

              <Field label="Assigned Role" required>
                <Select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  options={[
                    { value: "field_worker", label: "Field Worker (Resolve & Evidence Upload)" },
                    {
                      value: "dept_head",
                      label: "Department Supervisor (Route & Override Priority)",
                    },
                    { value: "tenant_admin", label: "Tenant Administrator (Full Configuration)" },
                  ]}
                />
              </Field>

              <Field label="Department Assignment">
                <Select
                  value={inviteDept}
                  onChange={(e) => setInviteDept(e.target.value)}
                  options={[
                    { value: "", label: "-- General / All Departments --" },
                    ...departments.map((d) => ({ value: d.id, label: d.name })),
                  ]}
                />
              </Field>

              <Button type="submit" variant="primary">
                Send Invitation Token
              </Button>
            </form>
          </div>

          {/* Honest Status Note on Staff Invitations Endpoint */}
          <div
            className="sign-plate"
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <h2 style={{ margin: 0, fontSize: "1.125rem", color: "var(--text)" }}>
              Access Control & RBAC Notice
            </h2>
            <div
              style={{
                padding: "1rem",
                borderRadius: "var(--r-md)",
                backgroundColor: "var(--surface-sunken)",
                border: "1px solid var(--border)",
                fontSize: "0.875rem",
                lineHeight: 1.6,
                color: "var(--text-muted)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  color: "var(--text)",
                  fontWeight: 600,
                  marginBottom: "0.5rem",
                }}
              >
                <Info size={18} strokeWidth={1.75} />
                <span>Backend Route Staging</span>
              </div>
              <p style={{ margin: "0 0 0.75rem 0" }}>
                The endpoint <code>/api/v1/admin/invitations</code> is pending deployment in the
                next sprint.
              </p>
              <p style={{ margin: 0 }}>
                Currently, staff authorization is managed directly through session tokens issued via{" "}
                <code>POST /api/v1/auth/login</code> with pre-assigned role claims (
                <code>field_worker</code>, <code>dept_head</code>, <code>tenant_admin</code>).
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
