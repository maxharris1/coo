"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import type { Marker } from "maplibre-gl";
import { mountMap, type MountedMap } from "@/components/mountMap";
import { config } from "@/lib/config";
import type { Point } from "@/lib/game/privacy";
import styles from "./PinMap.module.css";

export const STOCK_STYLE = "https://tiles.openfreemap.org/styles/liberty";

const BLOCK_ZOOM = 15;

const { gridLatDeg, gridLonDeg } = config.game.roost;

const NUDGES: Record<string, Point> = {
  ArrowUp: { lat: gridLatDeg, lon: 0 },
  ArrowDown: { lat: -gridLatDeg, lon: 0 },
  ArrowLeft: { lat: 0, lon: -gridLonDeg },
  ArrowRight: { lat: 0, lon: gridLonDeg },
};

export type PinMapProps = {
  start: Point;
  label: string;
  onMove?: (point: Point) => void;
  settle?: (lat: number, lon: number) => Point;
};

export function PinMap({ start, label, onMove, settle }: PinMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const placed = useRef<{ mounted: MountedMap; marker: Marker } | null>(null);
  const latest = useRef({ start, onMove, settle });
  const editable = Boolean(onMove);
  const { lat, lon } = start;

  useEffect(() => {
    latest.current = { start, onMove, settle };
  });

  const ask = (lat: number, lon: number) => {
    const { start, onMove, settle } = latest.current;
    placed.current?.marker.setLngLat([start.lon, start.lat]);
    onMove?.(settle ? settle(lat, lon) : { lat, lon });
  };

  useEffect(() => {
    let cancelled = false;
    void import("maplibre-gl").then((lib) => {
      if (cancelled || !container.current || !pin.current) return;
      const { start, onMove } = latest.current;
      const at: [number, number] = [start.lon, start.lat];
      const mounted = mountMap(
        lib,
        container.current,
        {
          style: STOCK_STYLE,
          center: at,
          zoom: BLOCK_ZOOM,
          interactive: Boolean(onMove),
        },
        { compact: true },
      );
      if (!onMove) {
        const marker = new lib.Marker({ element: pin.current })
          .setLngLat(at)
          .addTo(mounted.map);
        placed.current = { mounted, marker };
        return;
      }
      const marker = new lib.Marker({ element: pin.current, draggable: true })
        .setLngLat(at)
        .addTo(mounted.map);
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLngLat();
        ask(lat, lng);
      });
      mounted.map.on("click", (e) => ask(e.lngLat.lat, e.lngLat.lng));
      placed.current = { mounted, marker };
    });
    return () => {
      cancelled = true;
      placed.current?.mounted.dispose();
      placed.current = null;
    };
  }, []);

  useEffect(() => {
    if (!placed.current) return;
    placed.current.marker.setLngLat([lon, lat]);
    placed.current.mounted.map.setCenter([lon, lat]);
  }, [lat, lon]);

  const nudge = (e: KeyboardEvent) => {
    const step = NUDGES[e.key];
    if (!step) return;
    e.preventDefault();
    ask(lat + step.lat, lon + step.lon);
  };

  return (
    <div
      className={styles.map}
      role={editable ? "group" : "img"}
      aria-label={`Map of ${label} with your roost pin`}
    >
      <div ref={container} className={styles.mapCanvas} />
      <div className={styles.pinHolder}>
        <div
          ref={pin}
          className={styles.pin}
          {...(editable && {
            role: "button",
            tabIndex: 0,
            "aria-label": `Roost pin at ${label}. Arrow keys move it one block.`,
            onKeyDown: nudge,
          })}
        >
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
