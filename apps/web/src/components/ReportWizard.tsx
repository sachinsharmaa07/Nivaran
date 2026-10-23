import React, { useState, useEffect, lazy, Suspense } from "react";
import {
  Camera,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Upload,
  AlertCircle,
  Plus,
} from "lucide-react";
import { useTranslation } from "../utils/i18n.js";
import { compressPhoto, type CompressionResult } from "../utils/imageCompression.js";
import type { TenantInfo } from "./CityPicker.js";
import { useAuth } from "../utils/authContext.js";
import {
  Button,
  Field,
  TextInput,
  Textarea,
  Select,
  LaneTimeline,
  LaneLineLoader,
  useToast,
} from "../ui/index.js";

const LazyMap = lazy(() => import("./LazyMap.js"));

interface Category {
  id: string;
  code: string;
  name: string;
  names: Record<string, string>;
}

interface DuplicateSuggestion {
  publicId: string;
  score: {
    total: number;
    spatial: number;
    category: number;
    highlight: boolean;
  };
}

export function ReportWizard({
  tenant,
  initialCoordinates,
  onComplete,
}: {
  tenant: TenantInfo;
  initialCoordinates?: { lat: number; lon: number } | undefined;
  onComplete?: (() => void) | undefined;
}): React.JSX.Element {
  const { locale } = useTranslation();
  const { token, authFetch } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState<number>(1);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    return localStorage.getItem("draft_category") || "";
  });

  const [landmark, setLandmark] = useState<string>(() => {
    return localStorage.getItem("draft_landmark") || "";
  });
  const [pincode, setPincode] = useState<string>(() => {
    return localStorage.getItem("draft_pincode") || "";
  });
  const [description, setDescription] = useState<string>(() => {
    return localStorage.getItem("draft_description") || "";
  });
  const [coordinates, setCoordinates] = useState<{ lat: number; lon: number }>(() => {
    return initialCoordinates || { lat: 30.901, lon: 75.8573 };
  });

  const [photoResult, setPhotoResult] = useState<CompressionResult | null>(null);
  const [compressing, setCompressing] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedPublicId, setSubmittedPublicId] = useState<string | null>(null);
  const [duplicateSuggestions, setDuplicateSuggestions] = useState<DuplicateSuggestion[]>([]);
  const [confirmedPlusOne, setConfirmedPlusOne] = useState<Set<string>>(new Set());

  // Autosave draft on every input change per DESIGN.md §8
  useEffect(() => {
    localStorage.setItem("draft_category", selectedCategory);
    localStorage.setItem("draft_landmark", landmark);
    localStorage.setItem("draft_pincode", pincode);
    localStorage.setItem("draft_description", description);
  }, [selectedCategory, landmark, pincode, description]);

  useEffect(() => {
    if (initialCoordinates) {
      setCoordinates(initialCoordinates);
    }
  }, [initialCoordinates]);

  // Load tenant categories
  useEffect(() => {
    fetch(`/api/v1/public/${tenant.slug}/categories?locale=${locale}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { data?: { categories?: Category[] } } | null) => {
        if (data?.data?.categories && data.data.categories.length > 0) {
          setCategories(data.data.categories);
          if (!selectedCategory && data.data.categories[0]) {
            setSelectedCategory(data.data.categories[0].code);
          }
        }
      })
      .catch(() => undefined);
  }, [tenant.slug, locale]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setCompressing(true);
      setErrorMsg(null);
      // Compress in browser to max 1600px JPEG quality 0.8
      const res = await compressPhoto(file, 1600, 0.8);
      setPhotoResult(res);
      showToast({
        message: `Photo compressed to ${(res.compressedSize / 1024).toFixed(0)} KB`,
        variant: "info",
      });
    } catch (_err: unknown) {
      setErrorMsg("Photo could not be processed. Please choose a standard JPEG or PNG under 10MB.");
    } finally {
      setCompressing(false);
    }
  };

  const handlePlusOne = async (targetPublicId: string) => {
    try {
      const res = await authFetch(`/api/v1/issues/${targetPublicId}/confirm`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Failed to confirm this issue");
      }
      setConfirmedPlusOne((prev) => new Set(prev).add(targetPublicId));
      showToast({
        message: `Your confirmation (+1) was recorded for ${targetPublicId}`,
        variant: "success",
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const idempotencyKey = `rep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const body: Record<string, unknown> = {
        tenant_slug: tenant.slug,
        category_code: selectedCategory || categories[0]?.code || "road_pothole",
        description: description.trim() || "Civic report submitted via web portal",
        lat: coordinates.lat,
        lon: coordinates.lon,
        landmark: landmark.trim() || undefined,
        pincode: pincode.trim() || undefined,
        photo_keys: photoResult ? ["evidence-1.jpg"] : [],
      };

      const res = await authFetch("/api/v1/issues", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error?.message || "Failed to submit report");
      }

      const issueId = resData.data.issue_id || resData.data.public_id;

      // Photo binary upload if photo was selected
      if (photoResult && token && issueId) {
        try {
          await authFetch(`/api/v1/issues/upload/${issueId}`, {
            method: "PUT",
            headers: { "Content-Type": "image/jpeg" },
            body: photoResult.blob,
          });
        } catch {
          // Photo upload error non-fatal to issue registration
        }
      }

      // Clear drafts on successful submission
      localStorage.removeItem("draft_category");
      localStorage.removeItem("draft_landmark");
      localStorage.removeItem("draft_pincode");
      localStorage.removeItem("draft_description");

      const dupes = (resData.data.duplicate_suggestions || []) as DuplicateSuggestion[];
      setDuplicateSuggestions(dupes);
      setSubmittedPublicId(issueId);

      showToast({
        message: `Report ${issueId} registered with municipality`,
        variant: "success",
      });

      if (dupes.length === 0 && onComplete) {
        setTimeout(onComplete, 2200);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const wizardSteps = [
    { id: "where", label: "1. Where", completed: step > 1, current: step === 1 },
    { id: "what", label: "2. What", completed: step > 2, current: step === 2 },
    { id: "photos", label: "3. Photos", completed: step > 3, current: step === 3 },
    {
      id: "review",
      label: "4. Review",
      completed: Boolean(submittedPublicId),
      current: step === 4,
    },
  ];

  const selectedCategoryObj = categories.find((c) => c.code === selectedCategory);
  const categoryDisplayName =
    selectedCategoryObj?.names?.[locale] || selectedCategoryObj?.name || selectedCategory;

  return (
    <div
      style={{
        maxWidth: "560px",
        width: "100%",
        margin: "0 auto",
        backgroundColor: "var(--surface)",
        borderRadius: "var(--r-lg)",
        border: "1px solid var(--border)",
        padding: "1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
      }}
    >
      {/* 1. Lane-Line Progress Indicator */}
      <div style={{ padding: "0.25rem 0 0.5rem 0" }}>
        <LaneTimeline steps={wizardSteps} />
      </div>

      {errorMsg && (
        <div
          role="alert"
          style={{
            backgroundColor: "var(--kerb-50)",
            color: "var(--kerb-700)",
            border: "1px solid var(--kerb-300)",
            borderRadius: "var(--r-md)",
            padding: "0.75rem 1rem",
            fontSize: "0.875rem",
            display: "flex",
            alignItems: "flex-start",
            gap: "0.5rem",
          }}
        >
          <AlertCircle size={16} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: "2px" }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* STEP 1: WHERE */}
      {step === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <h2 style={{ fontSize: "1.25rem", margin: "0 0 0.25rem 0", color: "var(--text)" }}>
              Where is the issue located?
            </h2>
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-muted)" }}>
              Pin the exact spot on the map so municipal workers can find it
            </p>
          </div>

          <Suspense
            fallback={
              <div style={{ height: "200px" }}>
                <LaneLineLoader />
              </div>
            }
          >
            <LazyMap initialCoordinates={coordinates} onLocationChange={(c) => setCoordinates(c)} />
          </Suspense>

          <Field label="Nearby Landmark" hint="E.g., Outside Community Health Centre, Main GT Road">
            {({ id, "aria-describedby": ariaDescribedBy }) => (
              <TextInput
                id={id}
                aria-describedby={ariaDescribedBy}
                placeholder="Prominent landmark or shop nearby"
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
              />
            )}
          </Field>

          <Field label="PIN Code (Optional)" hint="6-digit postal code">
            {({ id, "aria-describedby": ariaDescribedBy }) => (
              <TextInput
                id={id}
                aria-describedby={ariaDescribedBy}
                placeholder="E.g. 141001"
                maxLength={6}
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
              />
            )}
          </Field>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
            <Button variant="cta" onClick={() => setStep(2)} style={{ minWidth: "120px" }}>
              <span>Next</span>
              <ArrowRight size={15} strokeWidth={1.75} aria-hidden={true} />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: WHAT */}
      {step === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <h2 style={{ fontSize: "1.25rem", margin: "0 0 0.25rem 0", color: "var(--text)" }}>
              What is the problem?
            </h2>
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-muted)" }}>
              Select the appropriate civic category and describe what needs fixing
            </p>
          </div>

          <Field label="Category" required>
            {({ id }) => (
              <Select
                id={id}
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {categories.length > 0 ? (
                  categories.map((c) => (
                    <option key={c.id || c.code} value={c.code}>
                      {c.names?.[locale] || c.name || c.code}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="road_pothole">Road: Pothole / Crater</option>
                    <option value="waste_overflow">Sanitation: Garbage Overflow</option>
                    <option value="street_light">Electrical: Street Light Defect</option>
                    <option value="water_leakage">Water Supply: Pipe Leakage</option>
                  </>
                )}
              </Select>
            )}
          </Field>

          <Field
            label="Description"
            hint="Describe the size, severity and how long it has been broken"
            required
          >
            {({ id, "aria-describedby": ariaDescribedBy }) => (
              <Textarea
                id={id}
                aria-describedby={ariaDescribedBy}
                rows={4}
                placeholder="E.g., Deep pothole about 2 feet wide on the left lane causing two-wheelers to slip."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            )}
          </Field>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "0.5rem",
            }}
          >
            <Button variant="secondary" onClick={() => setStep(1)}>
              <ArrowLeft size={15} strokeWidth={1.75} aria-hidden={true} />
              <span>Back</span>
            </Button>
            <Button
              variant="cta"
              onClick={() => {
                if (!description.trim()) {
                  setErrorMsg("Please describe the issue before proceeding");
                  return;
                }
                setErrorMsg(null);
                setStep(3);
              }}
              style={{ minWidth: "120px" }}
            >
              <span>Next</span>
              <ArrowRight size={15} strokeWidth={1.75} aria-hidden={true} />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: PHOTOS */}
      {step === 3 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <h2 style={{ fontSize: "1.25rem", margin: "0 0 0.25rem 0", color: "var(--text)" }}>
              Attach Evidence Photo
            </h2>
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-muted)" }}>
              Photos will be compressed automatically before uploading to save mobile data
            </p>
          </div>

          <div
            style={{
              border: "2px dashed var(--border)",
              borderRadius: "var(--r-md)",
              padding: "1.75rem 1rem",
              textAlign: "center",
              backgroundColor: "var(--surface-sunken)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.75rem",
            }}
          >
            {compressing ? (
              <div style={{ padding: "1rem" }}>
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--text-muted)",
                    marginBottom: "0.5rem",
                  }}
                >
                  Compressing photo in browser...
                </p>
                <LaneLineLoader delayMs={0} />
              </div>
            ) : photoResult ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "0.75rem",
                }}
              >
                <img
                  src={photoResult.dataUrl}
                  alt={`Photo of issue ${categoryDisplayName}`}
                  style={{
                    maxHeight: "180px",
                    maxWidth: "100%",
                    borderRadius: "var(--r-sm)",
                    border: "1px solid var(--border)",
                  }}
                />
                <div
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--text-muted)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  Compressed: {photoResult.width}×{photoResult.height} px (
                  {(photoResult.compressedSize / 1024).toFixed(0)} KB)
                </div>
                <Button variant="secondary" size="sm" onClick={() => setPhotoResult(null)}>
                  Remove & Choose Another
                </Button>
              </div>
            ) : (
              <>
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "var(--r-md)",
                    backgroundColor: "var(--surface)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-subtle)",
                    border: "1px solid var(--border)",
                  }}
                  aria-hidden="true"
                >
                  <Camera size={22} strokeWidth={1.75} />
                </div>
                <div>
                  <label
                    htmlFor="photo-upload-input"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.375rem",
                      padding: "0.5rem 1rem",
                      borderRadius: "var(--r-md)",
                      backgroundColor: "var(--surface)",
                      border: "1px solid var(--border-control)",
                      color: "var(--text)",
                      fontWeight: 600,
                      fontSize: "0.875rem",
                      cursor: "pointer",
                    }}
                  >
                    <Upload size={14} strokeWidth={1.75} aria-hidden={true} />
                    <span>Take Photo or Upload</span>
                  </label>
                  <input
                    id="photo-upload-input"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      void handlePhotoUpload(e);
                    }}
                    style={{ display: "none" }}
                  />
                </div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-subtle)" }}>
                  Maximum 1600 px, automatically converted to 0.8 quality JPEG
                </span>
              </>
            )}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "0.5rem",
            }}
          >
            <Button variant="secondary" onClick={() => setStep(2)}>
              <ArrowLeft size={15} strokeWidth={1.75} aria-hidden={true} />
              <span>Back</span>
            </Button>
            <Button variant="cta" onClick={() => setStep(4)} style={{ minWidth: "120px" }}>
              <span>Review Report</span>
              <ArrowRight size={15} strokeWidth={1.75} aria-hidden={true} />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4: REVIEW ON SIGN PLATE */}
      {step === 4 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div>
            <h2 style={{ fontSize: "1.25rem", margin: "0 0 0.25rem 0", color: "var(--text)" }}>
              Review Your Report
            </h2>
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-muted)" }}>
              Check details before submitting to {tenant.name}
            </p>
          </div>

          {/* SIGN PLATE CONTAINER: 2px inset border per DESIGN.md §2 */}
          <div
            className="sign-plate"
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                borderBottom: "1px solid var(--border)",
                paddingBottom: "0.75rem",
              }}
            >
              <span
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: "var(--text-subtle)",
                  textTransform: "uppercase",
                }}
              >
                Civic Report Summary
              </span>
              <span style={{ fontSize: "0.8125rem", color: "var(--text)", fontWeight: 600 }}>
                {tenant.district || tenant.name}
              </span>
            </div>

            <div>
              <div
                style={{ fontSize: "0.75rem", color: "var(--text-subtle)", marginBottom: "2px" }}
              >
                CATEGORY
              </div>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)" }}>
                {categoryDisplayName}
              </div>
            </div>

            <div>
              <div
                style={{ fontSize: "0.75rem", color: "var(--text-subtle)", marginBottom: "2px" }}
              >
                LOCATION & LANDMARK
              </div>
              <div style={{ fontSize: "0.875rem", color: "var(--text)", fontWeight: 500 }}>
                {landmark || "Coordinates pinned"} (lat: {coordinates.lat.toFixed(4)}, lon:{" "}
                {coordinates.lon.toFixed(4)}){pincode ? ` — PIN: ${pincode}` : ""}
              </div>
            </div>

            <div>
              <div
                style={{ fontSize: "0.75rem", color: "var(--text-subtle)", marginBottom: "2px" }}
              >
                DESCRIPTION
              </div>
              <p
                style={{ margin: 0, fontSize: "0.875rem", color: "var(--text)", lineHeight: 1.45 }}
              >
                {description || "No description specified"}
              </p>
            </div>

            {photoResult && (
              <div>
                <div
                  style={{ fontSize: "0.75rem", color: "var(--text-subtle)", marginBottom: "4px" }}
                >
                  ATTACHED EVIDENCE
                </div>
                <img
                  src={photoResult.dataUrl}
                  alt={`Evidence photo for ${categoryDisplayName}`}
                  style={{
                    maxHeight: "120px",
                    maxWidth: "100%",
                    borderRadius: "var(--r-sm)",
                    border: "1px solid var(--border)",
                  }}
                />
              </div>
            )}
          </div>

          {/* DUPLICATE SUGGESTIONS WITH +1 OPTION */}
          {duplicateSuggestions.length > 0 && (
            <div
              style={{
                backgroundColor: "var(--surface-sunken)",
                border: "1px solid var(--paint-300)",
                borderRadius: "var(--r-md)",
                padding: "1rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  fontSize: "0.875rem",
                  fontWeight: 700,
                  color: "var(--text)",
                  marginBottom: "0.5rem",
                }}
              >
                <AlertCircle size={15} strokeWidth={1.75} style={{ color: "var(--paint-600)" }} />
                <span>Existing Similar Reports Found Nearby</span>
              </div>
              <p
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--text-muted)",
                  margin: "0 0 0.75rem 0",
                }}
              >
                Other citizens have already reported an issue nearby. You can add your confirmation
                (+1) to elevate priority:
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {duplicateSuggestions.map((dupe) => {
                  const hasConfirmed = confirmedPlusOne.has(dupe.publicId);
                  return (
                    <div
                      key={dupe.publicId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.5rem 0.75rem",
                        backgroundColor: "var(--surface)",
                        borderRadius: "var(--r-sm)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div>
                        <span
                          style={{ fontWeight: 700, fontSize: "0.8125rem", color: "var(--text)" }}
                        >
                          {dupe.publicId}
                        </span>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                            marginLeft: "0.5rem",
                          }}
                        >
                          Similarity: {(dupe.score.total * 100).toFixed(0)}%
                        </span>
                      </div>
                      <Button
                        variant={hasConfirmed ? "secondary" : "cta"}
                        size="sm"
                        disabled={hasConfirmed}
                        onClick={() => {
                          void handlePlusOne(dupe.publicId);
                        }}
                        style={{ height: "32px", padding: "0 0.625rem" }}
                      >
                        {hasConfirmed ? (
                          <>
                            <CheckCircle2 size={13} strokeWidth={1.75} />
                            <span>Confirmed (+1)</span>
                          </>
                        ) : (
                          <>
                            <Plus size={13} strokeWidth={1.75} />
                            <span>+1 This Issue</span>
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {submittedPublicId ? (
            <div
              style={{
                textAlign: "center",
                padding: "1.25rem",
                backgroundColor: "var(--sign-50)",
                border: "1px solid var(--sign-300)",
                borderRadius: "var(--r-md)",
                color: "var(--sign-800)",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: "0.25rem" }}>
                Report Registered Successfully
              </div>
              <p style={{ margin: "0 0 1rem 0", fontSize: "0.875rem" }}>
                Your report ID is <strong>{submittedPublicId}</strong>. It has been routed to the
                relevant municipal department.
              </p>
              {onComplete && (
                <Button variant="primary" onClick={onComplete}>
                  Back to Issue Map
                </Button>
              )}
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "0.5rem",
              }}
            >
              <Button variant="secondary" onClick={() => setStep(3)}>
                <ArrowLeft size={15} strokeWidth={1.75} aria-hidden={true} />
                <span>Back</span>
              </Button>
              <Button
                variant="cta"
                onClick={() => {
                  void handleSubmit();
                }}
                loading={submitting}
                disabled={submitting}
                style={{ minWidth: "150px" }}
              >
                <span>Submit Report</span>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
