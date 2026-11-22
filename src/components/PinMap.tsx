"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { mountMap, type MountedMap } from "@/components/mountMap";
import type { Point } from "@/lib/game/privacy";
import styles from "./PinMap.module.css";

export const STOCK_STYLE = "https://tiles.openfreemap.org/styles/liberty";

const BLOCK_ZOOM = 15;

export type PinMapProps = {
  start: Point;
  label: string;
  onMove?: (point: Point) => void;
  settle?: (lat: number, lon: number) => Point;
};

export function PinMap({ start, label, onMove, settle }: PinMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onMove, settle });
  const { lat, lon } = start;

  useEffect(() => {
    handlers.current = { onMove, settle };
  });

  useEffect(() => {
    let mounted: MountedMap | null = null;
    let cancelled = false;
    void import("maplibre-gl").then((lib) => {
      if (cancelled || !container.current || !pin.current) return;
      mounted = mountMap(
        lib,
        container.current,
        {
          style: STOCK_STYLE,
          center: [lon, lat],
          zoom: BLOCK_ZOOM,
          interactive: Boolean(handlers.current.onMove),
        },
        { compact: true },
      );
      if (!handlers.current.onMove) {
        new lib.Marker({ element: pin.current })
          .setLngLat([lon, lat])
          .addTo(mounted.map);
        return;
      }
      const marker = new lib.Marker({ element: pin.current, draggable: true })
        .setLngLat([lon, lat])
        .addTo(mounted.map);
      const moveTo = ({ lat, lng }: { lat: number; lng: number }) => {
        const { onMove, settle } = handlers.current;
        const point = settle ? settle(lat, lng) : { lat, lon: lng };
        marker.setLngLat([point.lon, point.lat]);
        onMove?.(point);
      };
      marker.on("dragend", () => moveTo(marker.getLngLat()));
      mounted.map.on("click", (e) => moveTo(e.lngLat));
    });
    return () => {
      cancelled = true;
      mounted?.dispose();
    };
  }, [lat, lon]);

  return (
    <div
      className={styles.map}
      role="img"
      aria-label={`Map of ${label} with your roost pin`}
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
