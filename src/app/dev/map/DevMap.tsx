"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { loadMapStyle } from "@/components/mapStyle";
import { mountMap, type MountedMap } from "@/components/mountMap";
import { MODE_LABELS, type View } from "./views";
import styles from "./page.module.css";

export function DevMap({ place, zoom, mode }: View) {
  const container = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState(0);
  const [lon, lat] = place.center;

  useEffect(() => {
    let mounted: MountedMap | null = null;
    let cancelled = false;
    const loading = loadMapStyle(`/map/coo-${mode}.style.json`);
    void import("maplibre-gl")
      .then(async (lib) => {
        const style = await loading;
        if (cancelled || !container.current) return;
        setErrors(0);
        mounted = mountMap(
          lib,
          container.current,
          {
            style,
            center: [lon, lat],
            zoom,
            minZoom: 3,
            maxZoom: 17,
          },
          { compact: false },
        );
        mounted.map.on("error", () => setErrors((n) => n + 1));
      })
      .catch(() => setErrors((n) => n + 1));
    return () => {
      cancelled = true;
      mounted?.dispose();
    };
  }, [lon, lat, zoom, mode]);

  return (
    <>
      <div
        ref={container}
        className={styles.map}
        role="img"
        aria-label={`${MODE_LABELS[mode]} map of ${place.label} at zoom ${zoom}`}
      />
      <p className={styles.errors}>{`Map errors: ${errors}`}</p>
    </>
  );
}
