import React, { useState, useEffect, useRef } from "react";
import {
  Navigation,
  Crosshair,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

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
  const [locating, setLocating] = useState<boolean>(false);
  const [locSuccess, setLocSuccess] = useState<boolean>(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerInstanceRef = useRef<any>(null);
  const [isLeafletLoaded, setIsLeafletLoaded] = useState<boolean>(false);

  // Sync coords from external initialCoordinates
  useEffect(() => {
    if (initialCoordinates) {
      setCoords(initialCoordinates);
      if (markerInstanceRef.current) {
        markerInstanceRef.current.setLatLng([initialCoordinates.lat, initialCoordinates.lon]);
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([initialCoordinates.lat, initialCoordinates.lon]);
      }
    }
  }, [initialCoordinates.lat, initialCoordinates.lon]);

  // Dynamically load Leaflet for smooth interactive map & draggable marker
  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;
    let cancelled = false;

    void import("leaflet")
      .then((LModule) => {
        if (cancelled || !containerRef.current) return;
        const L = LModule.default || LModule;

        if (!mapInstanceRef.current) {
          const map = L.map(containerRef.current, {
            center: [coords.lat, coords.lon],
            zoom: 15,
            zoomControl: false,
          });

          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap",
            maxZoom: 19,
          }).addTo(map);

          // Custom pin icon with drag pulse
          const pinIcon = L.divIcon({
            className: "draggable-marker-mover",
            html: `
              <div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:grab;">
                <div style="width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--kerb-500,#e53935);border:2.5px solid #ffffff;box-shadow:0 3px 10px rgba(0,0,0,0.35);"></div>
                <div style="width:8px;height:4px;border-radius:50%;background:rgba(0,0,0,0.3);margin-top:2px;"></div>
              </div>
            `,
            iconSize: [28, 36],
            iconAnchor: [14, 34],
          });

          const marker = L.marker([coords.lat, coords.lon], {
            draggable: true,
            icon: pinIcon,
            title: "Drag to relocate marker",
          }).addTo(map);

          // Marker Mover: drag end updates location
          marker.on("dragend", () => {
            const pos = marker.getLatLng();
            const updated = {
              lat: Number(pos.lat.toFixed(5)),
              lon: Number(pos.lng.toFixed(5)),
            };
            setCoords(updated);
            setLocSuccess(false);
            if (onLocationChange) onLocationChange(updated);
          });

          // Click anywhere on map to instantly move the marker
          map.on("click", (e: any) => {
            marker.setLatLng(e.latlng);
            const updated = {
              lat: Number(e.latlng.lat.toFixed(5)),
              lon: Number(e.latlng.lng.toFixed(5)),
            };
            setCoords(updated);
            setLocSuccess(false);
            if (onLocationChange) onLocationChange(updated);
          });

          mapInstanceRef.current = map;
          markerInstanceRef.current = marker;
          setIsLeafletLoaded(true);
        }
      })
      .catch(() => {
        // Fallback to simulated canvas
        setIsLeafletLoaded(false);
      });

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerInstanceRef.current = null;
      }
    };
  }, []);

  const handleAdjust = (dLat: number, dLon: number) => {
    const updated = {
      lat: Number((coords.lat + dLat).toFixed(5)),
      lon: Number((coords.lon + dLon).toFixed(5)),
    };
    setCoords(updated);
    setLocSuccess(false);

    if (markerInstanceRef.current) {
      markerInstanceRef.current.setLatLng([updated.lat, updated.lon]);
    }
    if (mapInstanceRef.current) {
      mapInstanceRef.current.panTo([updated.lat, updated.lon]);
    }
    if (onLocationChange) onLocationChange(updated);
  };

  // Select Current Location via browser Geolocation API
  const handleCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lon = Number(pos.coords.longitude.toFixed(5));
        const updated = { lat, lon };
        setCoords(updated);
        setLocSuccess(true);
        setGpsAccuracy(Math.round(pos.coords.accuracy));

        if (markerInstanceRef.current) {
          markerInstanceRef.current.setLatLng([lat, lon]);
        }
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setView([lat, lon], 16);
        }
        if (onLocationChange) onLocationChange(updated);
      },
      () => {
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  };

  // Canvas click handler for simulated fallback
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isLeafletLoaded) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const dLat = Number((-y * 0.00003).toFixed(5));
    const dLon = Number((x * 0.00003).toFixed(5));
    handleAdjust(dLat, dLon);
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
      {/* Map Header with Track Location button */}
      <div
        style={{
          padding: "0.5rem 0.75rem",
          backgroundColor: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
          <Navigation size={14} style={{ color: "var(--kerb-500)" }} />
          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text)" }}>
            Drag pin or click map to move marker
          </span>
        </div>

        <button
          type="button"
          onClick={handleCurrentLocation}
          disabled={locating}
          className="touch-target"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.375rem",
            padding: "0.3125rem 0.625rem",
            borderRadius: "var(--r-sm)",
            backgroundColor: locSuccess ? "var(--paint-50)" : "var(--surface-raised)",
            border: `1px solid ${locSuccess ? "var(--paint-500)" : "var(--border)"}`,
            color: locSuccess ? "var(--paint-700)" : "var(--text)",
            fontSize: "0.75rem",
            fontWeight: 600,
            cursor: locating ? "wait" : "pointer",
            transition: "all var(--dur-fast)",
          }}
          title="Detect and track your current GPS location"
        >
          {locSuccess ? (
            <CheckCircle2 size={13} style={{ color: "var(--paint-600)" }} />
          ) : (
            <Crosshair size={13} className={locating ? "spin-pulse" : ""} />
          )}
          <span>
            {locating
              ? "Locating..."
              : locSuccess
                ? "Current Location Locked"
                : "Track My Location"}
          </span>
        </button>
      </div>

      {/* Interactive Map Container */}
      <div
        ref={containerRef}
        onClick={handleCanvasClick}
        style={{
          height: "220px",
          width: "100%",
          backgroundColor: "var(--surface-sunken)",
          backgroundImage: isLeafletLoaded
            ? "none"
            : "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          position: "relative",
          cursor: "crosshair",
        }}
      >
        {/* Fallback pin marker when Leaflet tiles are not loaded */}
        {!isLeafletLoaded && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -100%)",
              zIndex: 10,
              pointerEvents: "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: "26px",
                height: "26px",
                borderRadius: "50% 50% 50% 0",
                transform: "rotate(-45deg)",
                backgroundColor: "var(--kerb-500)",
                border: "2px solid #ffffff",
                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
              }}
            />
            <div
              style={{
                width: "8px",
                height: "4px",
                borderRadius: "50%",
                backgroundColor: "rgba(0,0,0,0.25)",
                marginTop: "2px",
              }}
            />
          </div>
        )}

        {/* Live GPS / Coordinate pill */}
        <div
          style={{
            position: "absolute",
            bottom: "8px",
            left: "8px",
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(4px)",
            padding: "0.25rem 0.5rem",
            borderRadius: "var(--r-sm)",
            fontSize: "0.75rem",
            color: "var(--asphalt-900)",
            border: "1px solid var(--border)",
            fontVariantNumeric: "tabular-nums",
            fontWeight: 700,
            zIndex: 1000,
            boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
          }}
        >
          {coords.lat.toFixed(5)}, {coords.lon.toFixed(5)}
          {gpsAccuracy !== null && (
            <span style={{ marginLeft: "4px", color: "var(--paint-700)" }}>(±{gpsAccuracy}m)</span>
          )}
        </div>
      </div>

      {/* Manual Fine-Tuning Controls */}
      <div
        style={{
          padding: "0.5rem 0.75rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: "var(--surface)",
          borderTop: "1px solid var(--border)",
          fontSize: "0.8125rem",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Fine-tune position:</span>
        <div style={{ display: "flex", gap: "0.35rem" }}>
          <button
            type="button"
            onClick={() => handleAdjust(0.0003, 0)}
            className="touch-target"
            style={{
              padding: "0 0.5rem",
              height: "28px",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)",
              backgroundColor: "var(--surface-raised)",
              color: "var(--text)",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "2px",
            }}
            title="Nudge North"
          >
            <ArrowUp size={11} /> N
          </button>
          <button
            type="button"
            onClick={() => handleAdjust(-0.0003, 0)}
            className="touch-target"
            style={{
              padding: "0 0.5rem",
              height: "28px",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)",
              backgroundColor: "var(--surface-raised)",
              color: "var(--text)",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "2px",
            }}
            title="Nudge South"
          >
            <ArrowDown size={11} /> S
          </button>
          <button
            type="button"
            onClick={() => handleAdjust(0, -0.0003)}
            className="touch-target"
            style={{
              padding: "0 0.5rem",
              height: "28px",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)",
              backgroundColor: "var(--surface-raised)",
              color: "var(--text)",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "2px",
            }}
            title="Nudge West"
          >
            <ArrowLeft size={11} /> W
          </button>
          <button
            type="button"
            onClick={() => handleAdjust(0, 0.0003)}
            className="touch-target"
            style={{
              padding: "0 0.5rem",
              height: "28px",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)",
              backgroundColor: "var(--surface-raised)",
              color: "var(--text)",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "2px",
            }}
            title="Nudge East"
          >
            <ArrowRight size={11} /> E
          </button>
        </div>
      </div>
    </div>
  );
}
