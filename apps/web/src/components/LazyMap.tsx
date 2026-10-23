import React, { useState } from "react";
import { Navigation } from "lucide-react";

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
        borderRadius: "var(--r-md)",
        overflow: "hidden",
        border: "1px solid var(--border)",
        backgroundColor: "var(--surface-sunken)",
        position: "relative",
      }}
    >
      {/* Map coordinate simulation canvas */}
      <div
        style={{
          height: "200px",
          backgroundColor: "var(--surface-sunken)",
          backgroundImage:
            "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {/* Service geofence boundary outline */}
        <div
          style={{
            position: "absolute",
            width: "160px",
            height: "160px",
            borderRadius: "50%",
            border: "2px dashed var(--asphalt-500)",
            pointerEvents: "none",
          }}
          aria-hidden="true"
        />

        {/* Pin marker: 220ms drop fade motion per DESIGN.md §3 */}
        <div
          style={{
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
          aria-hidden="true"
        >
          <div
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "50% 50% 50% 0",
              transform: "rotate(-45deg)",
              backgroundColor: "var(--kerb-500)",
              border: "2px solid #ffffff",
              boxShadow: "0 2px 6px rgba(14,17,16,0.25)",
            }}
          />
        </div>

        <div
          style={{
            position: "absolute",
            bottom: "8px",
            left: "8px",
            backgroundColor: "var(--surface-raised)",
            padding: "0.25rem 0.5rem",
            borderRadius: "var(--r-sm)",
            fontSize: "0.75rem",
            color: "var(--text)",
            border: "1px solid var(--border)",
            fontVariantNumeric: "tabular-nums",
            fontWeight: 600,
          }}
        >
          {coords.lat.toFixed(5)}, {coords.lon.toFixed(5)}
        </div>
      </div>

      {/* Manual nudge controls */}
      <div
        style={{
          padding: "0.625rem 0.75rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: "var(--surface)",
          borderTop: "1px solid var(--border)",
          fontSize: "0.8125rem",
        }}
      >
        <span
          style={{
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
          }}
        >
          <Navigation size={13} strokeWidth={1.75} aria-hidden={true} />
          <span>Adjust marker</span>
        </span>
        <div style={{ display: "flex", gap: "0.375rem" }}>
          <button
            type="button"
            onClick={() => handleAdjust(0.0005, 0)}
            className="touch-target"
            style={{
              padding: "0 0.5rem",
              height: "32px",
              minHeight: "32px",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)",
              backgroundColor: "var(--surface-raised)",
              color: "var(--text)",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            North
          </button>
          <button
            type="button"
            onClick={() => handleAdjust(-0.0005, 0)}
            className="touch-target"
            style={{
              padding: "0 0.5rem",
              height: "32px",
              minHeight: "32px",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)",
              backgroundColor: "var(--surface-raised)",
              color: "var(--text)",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            South
          </button>
          <button
            type="button"
            onClick={() => handleAdjust(0, -0.0005)}
            className="touch-target"
            style={{
              padding: "0 0.5rem",
              height: "32px",
              minHeight: "32px",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)",
              backgroundColor: "var(--surface-raised)",
              color: "var(--text)",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            West
          </button>
          <button
            type="button"
            onClick={() => handleAdjust(0, 0.0005)}
            className="touch-target"
            style={{
              padding: "0 0.5rem",
              height: "32px",
              minHeight: "32px",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)",
              backgroundColor: "var(--surface-raised)",
              color: "var(--text)",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            East
          </button>
        </div>
      </div>
    </div>
  );
}
