"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { config } from "@/lib/config";
import { STOCK_STYLE, type Roost } from "./roost";
import styles from "./page.module.css";

const BLOCK_ZOOM = 15;

export function RoostMap({ roost }: { roost: Roost }) {
  const container = useRef<HTMLDivElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const { lat, lon } = roost;

  useEffect(() => {
    let map: import("maplibre-gl").Map | null = null;
    let cancelled = false;
    void import("maplibre-gl").then(({ Map, Marker, setWorkerUrl }) => {
      if (cancelled || !container.current || !pin.current) return;
      setWorkerUrl(
        new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url)
          .href,
      );
      map = new Map({
        container: container.current,
        style: STOCK_STYLE,
        center: [lon, lat],
        zoom: BLOCK_ZOOM,
        interactive: false,
        attributionControl: {
          compact: true,
          customAttribution: config.app.mapAttribution,
        },
      });
      new Marker({ element: pin.current }).setLngLat([lon, lat]).addTo(map);
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lon]);

  return (
    <div
      className={styles.map}
      role="img"
      aria-label={`Map of ${roost.label} with your roost pin`}
    >
      <div ref={container} className={styles.mapCanvas} />
      <div className={styles.pinHolder}>
        <div ref={pin} className={styles.pin}>
          <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
            <circle
              cx="16"
              cy="16"
              r="12"
              fill="#FFC93C"
              stroke="#2A2140"
              strokeWidth="2.5"
            />
            <path d="M10 17 L16 11 L22 17 V22 H10 Z" fill="#2A2140" />
          </svg>
        </div>
      </div>
    </div>
  );
}
