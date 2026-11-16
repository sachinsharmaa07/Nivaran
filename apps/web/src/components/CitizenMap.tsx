import React, { useEffect, useRef } from "react";
import { milestonePinHtml } from "../ui/Milestone.js";

export interface MapPin {
  publicId: string;
  lat: number;
  lon: number;
  categoryCode: string;
  categoryName?: string | undefined;
  status: string;
  description: string;
  priorityScore?: number | undefined;
  priorityLevel?: string | undefined;
  upvoteCount?: number | undefined;
}

export function CitizenMap({
  pins,
  center,
  zoom = 13,
  selectedPinId,
  onSelectPin,
  onLocationPick,
  pickMode = false,
}: {
  pins: MapPin[];
  center: { lat: number; lon: number };
  zoom?: number;
  selectedPinId?: string | undefined;
  onSelectPin?: ((pin: MapPin) => void) | undefined;
  onLocationPick?: ((coords: { lat: number; lon: number }) => void) | undefined;
  pickMode?: boolean;
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const pickMarkerRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);

  // Initialize Leaflet map dynamically
  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;
    let isCancelled = false;

    void import("leaflet").then((LModule) => {
      if (isCancelled || !containerRef.current) return;
      const L = LModule.default || LModule;
      leafletRef.current = L;

      if (!mapRef.current) {
        const map = L.map(containerRef.current, {
          center: [center.lat, center.lon],
          zoom,
          zoomControl: true,
        });

        // OpenStreetMap raster tiles with required attribution per DESIGN.md §10
        // Map tiles are calmed via CSS filter on .leaflet-tile-pane in tokens.css
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);

        const markersLayer = L.layerGroup().addTo(map);
        markersLayerRef.current = markersLayer;
        mapRef.current = map;

        map.on("click", (e: any) => {
          if (pickMode && onLocationPick) {
            onLocationPick({
              lat: Number(e.latlng.lat.toFixed(5)),
              lon: Number(e.latlng.lng.toFixed(5)),
            });
          }
        });
      }
    });

    return () => {
      isCancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update center when changed
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setView([center.lat, center.lon], zoom);
    }
  }, [center.lat, center.lon, zoom]);

  // Render picked marker when in location selection mode
  useEffect(() => {
    const L = leafletRef.current;
    if (!mapRef.current || !L) return;

    if (pickMode) {
      if (!pickMarkerRef.current) {
        const icon = L.divIcon({
          className: "custom-pick-marker",
          html: `<div style="
            width: 26px;
            height: 26px;
            background: #d13f34;
            border: 3px solid #ffffff;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            box-shadow: 0 4px 10px rgba(14,17,16,0.35);
          "></div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 26],
        });
        pickMarkerRef.current = L.marker([center.lat, center.lon], { icon }).addTo(mapRef.current);
      } else {
        pickMarkerRef.current.setLatLng([center.lat, center.lon]);
      }
    } else if (pickMarkerRef.current) {
      pickMarkerRef.current.remove();
      pickMarkerRef.current = null;
    }
  }, [pickMode, center.lat, center.lon]);

  // Render milestone pins: coloured cap by status, white halo body
  useEffect(() => {
    const L = leafletRef.current;
    if (!markersLayerRef.current || !L) return;
    const layer = markersLayerRef.current;
    layer.clearLayers();

    pins.forEach((pin) => {
      const isSelected = pin.publicId === selectedPinId;

      // Priority colour for popup reference
      let priorityColor = "#6c7772";
      const score = pin.priorityScore ?? 25;
      if (score >= 80 || pin.priorityLevel === "critical") {
        priorityColor = "#d13f34";
      } else if (score >= 60 || pin.priorityLevel === "high") {
        priorityColor = "#e8761a";
      } else if (score >= 35 || pin.priorityLevel === "medium") {
        priorityColor = "#d9a800";
      }

      // Extract short label from publicId (last 3 chars)
      const shortLabel = pin.publicId.slice(-3);

      const pinHtml = milestonePinHtml(shortLabel, pin.status, priorityColor);

      const size = isSelected ? 34 : 30;
      const icon = L.divIcon({
        className: "milestone-map-pin",
        html: pinHtml,
        iconSize: [size, size + 3],
        iconAnchor: [size / 2, size + 3],
      });

      const marker = L.marker([pin.lat, pin.lon], { icon }).addTo(layer);

      marker.bindPopup(`
        <div style="font-family: var(--font-body); max-width: 220px; padding: 2px;">
          <div style="font-weight: 700; font-size: 0.8125rem; color: #171b1a; font-variant-numeric: tabular-nums; display: flex; justify-content: space-between; align-items: center;">
            <span>${pin.publicId}</span>
            <span style="font-size: 0.6875rem; background: #e8f5e9; padding: 1px 5px; border-radius: 4px; color: #1b5e20; font-weight: 700;">
              ▲ ${pin.upvoteCount ?? 1} Upvotes
            </span>
          </div>
          <div style="font-size: 0.8125rem; font-weight: 600; color: #4f5954; margin: 2px 0 4px 0;">
            ${pin.categoryName || pin.categoryCode}
          </div>
          <p style="font-size: 0.8125rem; margin: 0 0 8px 0; color: #39423e; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
            ${pin.description}
          </p>
          <a href="/issues/${pin.publicId}" style="display: inline-block; font-size: 0.8125rem; color: #1d6196; font-weight: 600; text-decoration: underline;">
            View issue timeline
          </a>
        </div>
      `);

      marker.on("click", () => {
        if (onSelectPin) onSelectPin(pin);
      });
    });
  }, [pins, selectedPinId, onSelectPin]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: "320px",
        backgroundColor: "var(--surface-sunken)",
      }}
      tabIndex={0}
      aria-label="Interactive map displaying reported civic issues in this municipality"
    />
  );
}

export default CitizenMap;
