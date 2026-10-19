import React, { useState } from "react";

export interface Coordinates {
  lat: number;
  lon: number;
}

export default function LazyMap({
  initialCoordinates,
  onLocationChange,
}: {
  initialCoordinates: Coordinates;
  onLocationChange?: (coords: Coordinates) => void;
}): React.JSX.Element {
  const [coords, setCoords] = useState<Coordinates>(initialCoordinates);

  const handleAdjust = (dLat: number, dLon: number) => {
    const updated = {
      lat: Number((coords.lat + dLat).toFixed(5)),
      lon: Number((coords.lon + dLon).toFixed(5)),
    };
    setCoords(updated);
    if (onLocationChange) onLocationChange(updated);
  };

  return (
    <div
      style={{
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid #cbd5e1",
        backgroundColor: "#f8fafc",
        position: "relative",
      }}
    >
      {/* Map visual canvas simulation with grid */}
      <div
        style={{
          height: "220px",
          background: "radial-gradient(circle, #e0f2fe 10%, #bae6fd 90%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {/* Service Area circle illustration */}
        <div
          style={{
            position: "absolute",
            width: "180px",
            height: "180px",
            borderRadius: "50%",
            border: "2px dashed #0284c7",
            backgroundColor: "rgba(14, 165, 233, 0.15)",
            pointerEvents: "none",
          }}
        />

        {/* Pin marker */}
        <div
          style={{
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            animation: "bounce 1s infinite alternate",
          }}
        >
          <div
            style={{
              backgroundColor: "#ef4444",
              color: "#ffffff",
              padding: "0.25rem 0.5rem",
              borderRadius: "4px",
              fontSize: "0.75rem",
              fontWeight: 700,
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.2)",
            }}
          >
            Issue Location
          </div>
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: "8px solid #ef4444",
            }}
          />
        </div>

        <div
          style={{
            position: "absolute",
            bottom: "8px",
            left: "8px",
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            padding: "0.25rem 0.5rem",
            borderRadius: "6px",
            fontSize: "0.75rem",
            color: "#0369a1",
            fontWeight: 600,
          }}
        >
          📍 {coords.lat.toFixed(4)}° N, {coords.lon.toFixed(4)}° E (Service Area OK)
        </div>
      </div>

      {/* Location nudge controls */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.5rem 0.75rem",
          backgroundColor: "#ffffff",
          borderTop: "1px solid #e2e8f0",
          fontSize: "0.8rem",
        }}
      >
        <span style={{ color: "#64748b" }}>Adjust coordinates slightly:</span>
        <div style={{ display: "flex", gap: "0.25rem" }}>
          <button
            type="button"
            onClick={() => handleAdjust(0.001, 0)}
            style={{ padding: "0.25rem 0.5rem", borderRadius: "4px", border: "1px solid #cbd5e1" }}
          >
            ↑ North
          </button>
          <button
            type="button"
            onClick={() => handleAdjust(-0.001, 0)}
            style={{ padding: "0.25rem 0.5rem", borderRadius: "4px", border: "1px solid #cbd5e1" }}
          >
            ↓ South
          </button>
          <button
            type="button"
            onClick={() => handleAdjust(0, -0.001)}
            style={{ padding: "0.25rem 0.5rem", borderRadius: "4px", border: "1px solid #cbd5e1" }}
          >
            ← West
          </button>
          <button
            type="button"
            onClick={() => handleAdjust(0, 0.001)}
            style={{ padding: "0.25rem 0.5rem", borderRadius: "4px", border: "1px solid #cbd5e1" }}
          >
            → East
          </button>
        </div>
      </div>
    </div>
  );
}
