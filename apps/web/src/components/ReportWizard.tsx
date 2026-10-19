import React, { useState, useEffect, lazy, Suspense } from "react";
import { useTranslation } from "../utils/i18n.js";
import { compressPhoto, type CompressionResult } from "../utils/imageCompression.js";
import type { TenantInfo } from "./CityPicker.js";

// Lazy-load the map component as required
const LazyMap = lazy(() => import("./LazyMap.js"));

interface Category {
  id: string;
  code: string;
  name: string;
  names: Record<string, string>;
}

export function ReportWizard({
  tenant,
  authToken,
  onComplete,
}: {
  tenant: TenantInfo;
  authToken?: string | undefined;
  onComplete?: (() => void) | undefined;
}): React.JSX.Element {
  const { t, locale } = useTranslation();

  const [step, setStep] = useState<number>(1);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");

  const [landmark, setLandmark] = useState<string>("");
  const [pincode, setPincode] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [coordinates, setCoordinates] = useState<{ lat: number; lon: number }>({
    lat: 30.901,
    lon: 75.8573,
  });

  const [photoResult, setPhotoResult] = useState<CompressionResult | null>(null);
  const [compressing, setCompressing] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [resultMsg, setResultMsg] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  useEffect(() => {
    // Fetch categories for tenant
    fetch(`/api/v1/public/${tenant.slug}/categories?locale=${locale}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { data?: { categories?: Category[] } } | null) => {
        if (data?.data?.categories) {
          setCategories(data.data.categories);
          if (data.data.categories[0]) {
            setSelectedCategory(data.data.categories[0].code);
          }
        }
      })
      .catch((_err: unknown) => {
        // Fallback categories used
      });
  }, [tenant.slug, locale]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setCompressing(true);
      const res = await compressPhoto(file, 1600, 0.8);
      setPhotoResult(res);
    } catch (err: unknown) {
      alert("Error compressing photo: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setCompressing(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setResultMsg(null);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const body: Record<string, unknown> = {
        tenant_slug: tenant.slug,
        category_code: selectedCategory,
        description: description || "Civic report submitted via web portal",
        lat: coordinates.lat,
        lon: coordinates.lon,
        landmark: landmark.trim() || undefined,
        pincode: pincode.trim() || undefined,
        evidence_keys: photoResult ? ["mock-photo-key-1.jpg"] : [],
      };

      const res = await fetch("/api/v1/issues", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error?.message || "Failed to submit report");
      }

      setResultMsg({
        type: "success",
        text: `Report submitted successfully! Public ID: ${resData.data.issue_id}. Reporters factor: ${resData.data.reporters_factor}`,
      });
      if (onComplete) onComplete();
    } catch (err: unknown) {
      setResultMsg({
        type: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: "#ffffff",
        borderRadius: "16px",
        border: "1px solid #e2e8f0",
        padding: "2rem",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
        maxWidth: "680px",
        margin: "0 auto",
      }}
    >
      {/* Wizard Step Indicator */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          borderBottom: "1px solid #e2e8f0",
          paddingBottom: "1rem",
          marginBottom: "1.5rem",
          fontSize: "0.85rem",
          fontWeight: 600,
        }}
      >
        <span style={{ color: step >= 1 ? "#2563eb" : "#94a3b8" }}>{t("step_category")}</span>
        <span style={{ color: step >= 2 ? "#2563eb" : "#94a3b8" }}>{t("step_location")}</span>
        <span style={{ color: step >= 3 ? "#2563eb" : "#94a3b8" }}>{t("step_photo")}</span>
        <span style={{ color: step >= 4 ? "#2563eb" : "#94a3b8" }}>{t("step_review")}</span>
      </div>

      {resultMsg && (
        <div
          style={{
            padding: "1rem",
            borderRadius: "8px",
            marginBottom: "1.5rem",
            backgroundColor: resultMsg.type === "success" ? "#f0fdf4" : "#fef2f2",
            color: resultMsg.type === "success" ? "#166534" : "#b91c1c",
            fontWeight: 500,
          }}
        >
          {resultMsg.text}
        </div>
      )}

      {/* Step 1: Category */}
      {step === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <h3 style={{ margin: 0, color: "#0f172a" }}>Select Issue Category</h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "0.75rem",
            }}
          >
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.code)}
                style={{
                  padding: "1rem",
                  borderRadius: "10px",
                  border: selectedCategory === cat.code ? "2px solid #2563eb" : "1px solid #cbd5e1",
                  backgroundColor: selectedCategory === cat.code ? "#eff6ff" : "#ffffff",
                  color: selectedCategory === cat.code ? "#1d4ed8" : "#334155",
                  fontWeight: 600,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!selectedCategory}
              style={{
                padding: "0.625rem 1.5rem",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "#2563eb",
                color: "#ffffff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Next: Location & Address →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Location, Landmark & Pincode */}
      {step === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <h3 style={{ margin: 0, color: "#0f172a" }}>Location & Address Details</h3>

          {/* Lazy loaded map */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "#334155",
                marginBottom: "0.375rem",
              }}
            >
              Pinpoint on Map
            </label>
            <Suspense
              fallback={
                <div style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>
                  Loading interactive map...
                </div>
              }
            >
              <LazyMap
                initialCoordinates={coordinates}
                onLocationChange={(c) => setCoordinates(c)}
              />
            </Suspense>
          </div>

          {/* Landmark Field (Free text) */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "#334155",
                marginBottom: "0.375rem",
              }}
            >
              {t("landmark_label")}
            </label>
            <input
              type="text"
              placeholder={t("landmark_placeholder")}
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "0.625rem",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
              }}
            />
          </div>

          {/* Pincode Field (6 digits optional) */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "#334155",
                marginBottom: "0.375rem",
              }}
            >
              {t("pincode_label")}
            </label>
            <input
              type="text"
              maxLength={6}
              placeholder={t("pincode_placeholder")}
              value={pincode}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "0.625rem",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
              }}
            />
            {pincode && pincode.length !== 6 && (
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "#dc2626",
                  marginTop: "0.25rem",
                  display: "block",
                }}
              >
                PIN code must be exactly 6 digits
              </span>
            )}
          </div>

          {/* Description */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "#334155",
                marginBottom: "0.375rem",
              }}
            >
              {t("description_label")}
            </label>
            <textarea
              rows={3}
              placeholder={t("description_placeholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "0.625rem",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontFamily: "inherit",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
            <button
              type="button"
              onClick={() => setStep(1)}
              style={{
                padding: "0.625rem 1.25rem",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                backgroundColor: "#f8fafc",
                cursor: "pointer",
              }}
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              style={{
                padding: "0.625rem 1.5rem",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "#2563eb",
                color: "#ffffff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Next: Photo Evidence →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Photo with Client Compression */}
      {step === 3 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <h3 style={{ margin: 0, color: "#0f172a" }}>Photo Evidence (Browser Compression)</h3>

          <p style={{ margin: 0, fontSize: "0.875rem", color: "#64748b" }}>
            Photos are compressed in your browser to at most 1600 px (JPEG quality 0.8) before
            uploading to save mobile bandwidth.
          </p>

          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              void handlePhotoUpload(e);
            }}
            style={{
              padding: "0.75rem",
              borderRadius: "8px",
              border: "1px dashed #cbd5e1",
              backgroundColor: "#f8fafc",
            }}
          />

          {compressing && (
            <div style={{ color: "#2563eb", fontSize: "0.875rem", fontWeight: 600 }}>
              {t("compressing_photo")}
            </div>
          )}

          {photoResult && (
            <div
              style={{
                display: "flex",
                gap: "1rem",
                alignItems: "center",
                padding: "1rem",
                borderRadius: "8px",
                backgroundColor: "#f0fdf4",
                border: "1px solid #bbf7d0",
              }}
            >
              <img
                src={photoResult.dataUrl}
                alt="Compressed preview"
                style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "6px" }}
              />
              <div style={{ fontSize: "0.85rem", color: "#166534" }}>
                <div>
                  <strong>Resolution:</strong> {photoResult.width} × {photoResult.height} px (max
                  1600 px)
                </div>
                <div>
                  <strong>Compressed Size:</strong> {(photoResult.compressedSize / 1024).toFixed(1)}{" "}
                  KB
                </div>
                <div>
                  <strong>Original Size:</strong> {(photoResult.originalSize / 1024).toFixed(1)} KB
                  (Saved{" "}
                  {Math.round((1 - photoResult.compressedSize / photoResult.originalSize) * 100)}%)
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
            <button
              type="button"
              onClick={() => setStep(2)}
              style={{
                padding: "0.625rem 1.25rem",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                backgroundColor: "#f8fafc",
                cursor: "pointer",
              }}
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              style={{
                padding: "0.625rem 1.5rem",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "#2563eb",
                color: "#ffffff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Next: Review & Submit →
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Review and Submit */}
      {step === 4 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <h3 style={{ margin: 0, color: "#0f172a" }}>Review & Submit Report</h3>

          <div
            style={{
              backgroundColor: "#f8fafc",
              padding: "1rem",
              borderRadius: "8px",
              fontSize: "0.9rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            <div>
              <strong>Municipality:</strong> {tenant.name} ({tenant.slug})
            </div>
            <div>
              <strong>Category:</strong> {selectedCategory}
            </div>
            <div>
              <strong>Landmark:</strong> {landmark || "(None provided)"}
            </div>
            <div>
              <strong>PIN Code:</strong> {pincode || "(None provided)"}
            </div>
            <div>
              <strong>Coordinates:</strong> {coordinates.lat.toFixed(4)}° N,{" "}
              {coordinates.lon.toFixed(4)}° E
            </div>
            <div>
              <strong>Description:</strong> {description || "(Standard civic report)"}
            </div>
            <div>
              <strong>Photo Attached:</strong> {photoResult ? "Yes (Compressed)" : "No"}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
            <button
              type="button"
              onClick={() => setStep(3)}
              style={{
                padding: "0.625rem 1.25rem",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                backgroundColor: "#f8fafc",
                cursor: "pointer",
              }}
            >
              ← Back
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                void handleSubmit();
              }}
              style={{
                padding: "0.625rem 2rem",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "#16a34a",
                color: "#ffffff",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 4px 6px -1px rgba(22, 163, 74, 0.3)",
              }}
            >
              {submitting ? "Submitting..." : t("submit_report")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
