"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { config } from "@/lib/config";
import type { View } from "./views";
import styles from "./page.module.css";

export function DevMap({ place, zoom }: View) {
  const container = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState(0);
  const [lon, lat] = place.center;

  useEffect(() => {
    let map: import("maplibre-gl").Map | null = null;
    let cancelled = false;
    void import("maplibre-gl").then(({ Map, setWorkerUrl }) => {
      if (cancelled || !container.current) return;
      setWorkerUrl(
        new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url)
          .href,
      );
      setErrors(0);
      map = new Map({
        container: container.current,
        style: "/map/coo-day.style.json",
        center: [lon, lat],
        zoom,
        minZoom: 3,
        maxZoom: 17,
        attributionControl: {
          compact: false,
          customAttribution: config.app.mapAttribution,
        },
      });
      map.on("error", () => setErrors((n) => n + 1));
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lon, lat, zoom]);

  return (
    <>
      <div
        ref={container}
        className={styles.map}
        role="img"
        aria-label={`Day map of ${place.label} at zoom ${zoom}`}
      />
      <p className={styles.errors}>{`Map errors: ${errors}`}</p>
    </>
  );
}
