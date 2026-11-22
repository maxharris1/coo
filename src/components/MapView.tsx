"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import {
  bearingDeg,
  interpolate,
  positionAt,
  type FlightPlan,
  type LatLon,
} from "@/lib/flight/engine";
import { Bird, type GearId, type Look } from "./Bird";
import { mountMap, type MountedMap } from "./mountMap";

export type Place = LatLon & { label: string };
export type BirdLite = {
  id: string;
  name: string;
  look: string;
  gear: string[];
};

export type MapViewProps = {
  flightId: string;
  from: Place;
  to: Place;
  plan: FlightPlan;
  distanceMi: number;
  bird: BirdLite;
  offsetMs: number;
  bottomPadding: number;
  night: boolean;
  loftLabel: string;
  sillLabel: string;
};

export const ZOOM_BANDS: readonly { underMi: number; zoom: number }[] = [
  { underMi: 1, zoom: 16 },
  { underMi: 5, zoom: 14 },
  { underMi: 30, zoom: 11 },
  { underMi: 150, zoom: 8 },
  { underMi: 600, zoom: 6 },
];
export const FAR_ZOOM = 4.5;

const MAP_STYLES = {
  day: "https://tiles.openfreemap.org/styles/liberty",
  night: "/map/coo-night.style.json",
} as const;
const INK = "#2A2140";
const TOMATO = "#F4623F";
const FOLLOW_EVERY_MS = 5000;
const EDGE_MARGIN = 0.2;
const LEAD_PX = 60;
const BIRD_PX = 56;
const PIN_LABEL = {
  position: "absolute",
  top: "100%",
  left: "50%",
  transform: "translateX(-50%)",
  marginTop: 4,
  padding: "2px 8px",
  background: "var(--coo-card)",
  border: "var(--coo-line-thin)",
  borderRadius: "var(--coo-radius-pill)",
  color: "var(--coo-ink)",
  font: "800 12px var(--coo-font-body)",
  whiteSpace: "nowrap",
} as const;

export function zoomForDistance(milesLeft: number): number {
  return ZOOM_BANDS.find((b) => milesLeft < b.underMi)?.zoom ?? FAR_ZOOM;
}

export function headsWest(from: LatLon, to: LatLon): boolean {
  return bearingDeg(from, to) > 180;
}

export function routeFractions(distanceMi: number): number[] {
  const steps = distanceMi > 300 ? 500 : 100;
  return Array.from({ length: steps + 1 }, (_, i) => i / steps);
}

function line(from: LatLon, to: LatLon, fracs: number[]) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: fracs.map((f) => {
        const p = interpolate(from, to, f);
        return [p.lon, p.lat];
      }),
    },
  };
}

function splitRoute(from: LatLon, to: LatLon, fracs: number[], at: number) {
  const flown = [...fracs.filter((f) => f < at), at];
  const left = [at, ...fracs.filter((f) => f > at)];
  return { flown: line(from, to, flown), left: line(from, to, left) };
}

function nearEdge(map: MapLibreMap, p: LatLon): boolean {
  const { x, y } = map.project([p.lon, p.lat]);
  const { clientWidth: w, clientHeight: h } = map.getContainer();
  return (
    x < w * EDGE_MARGIN ||
    x > w * (1 - EDGE_MARGIN) ||
    y < h * EDGE_MARGIN ||
    y > h * (1 - EDGE_MARGIN)
  );
}

export function MapView({
  flightId,
  from,
  to,
  plan,
  distanceMi,
  bird,
  offsetMs,
  bottomPadding,
  night,
  loftLabel,
  sillLabel,
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const birdEl = useRef<HTMLDivElement>(null);
  const loftEl = useRef<HTMLDivElement>(null);
  const sillEl = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const recentre = useRef<() => void>(() => {});
  const [following, setFollowing] = useState(true);
  const style = MAP_STYLES[night ? "night" : "day"];
  const styleRef = useRef(style);
  const mapRef = useRef<MapLibreMap | null>(null);
  const west = headsWest(from, to);

  useEffect(() => {
    if (styleRef.current === style) return;
    styleRef.current = style;
    mapRef.current?.setStyle(style, { diff: false });
  }, [style]);

  useEffect(() => {
    let mounted: MountedMap | null = null;
    let markers: Marker[] = [];
    let frame = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    const fracs = routeFractions(distanceMi);
    const now = () => Date.now() + offsetMs;
    const bearing = bearingDeg(from, to) * (Math.PI / 180);

    void import("maplibre-gl").then((lib) => {
      const { Marker, LngLatBounds } = lib;
      const el = container.current;
      if (cancelled || !el || !birdEl.current) return;
      if (!loftEl.current || !sillEl.current) return;
      mounted = mountMap(
        lib,
        el,
        {
          style: styleRef.current,
          bounds: new LngLatBounds(
            [from.lon, from.lat],
            [from.lon, from.lat],
          ).extend([to.lon, to.lat]),
          fitBoundsOptions: {
            padding: { top: 80, left: 48, right: 48, bottom: bottomPadding },
          },
          minZoom: 3,
          maxZoom: 17,
          maxPitch: 0,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
        },
        { compact: true },
      );
      const m = mounted.map;
      mapRef.current = m;
      m.touchZoomRotate.disableRotation();
      m.keyboard.disableRotation();

      const loft = new Marker({ element: loftEl.current, anchor: "bottom" })
        .setLngLat([from.lon, from.lat])
        .addTo(m);
      const sill = new Marker({ element: sillEl.current, anchor: "bottom" })
        .setLngLat([to.lon, to.lat])
        .addTo(m);
      const start = positionAt(plan, from, to, now());
      const marker = new Marker({ element: birdEl.current })
        .setLngLat([start.lon, start.lat])
        .addTo(m);
      markers = [loft, sill, marker];

      const drawRoute = (frac: number) => {
        const { flown, left } = splitRoute(from, to, fracs, frac);
        (m.getSource("route-flown") as GeoJSONSource | undefined)?.setData(
          flown,
        );
        (m.getSource("route-left") as GeoJSONSource | undefined)?.setData(left);
      };

      m.on("style.load", () => {
        const { frac } = positionAt(plan, from, to, now());
        const { flown, left } = splitRoute(from, to, fracs, frac);
        m.addSource("route-flown", { type: "geojson", data: flown });
        m.addSource("route-left", { type: "geojson", data: left });
        m.addLayer({
          id: "route-left",
          type: "line",
          source: "route-left",
          layout: { "line-cap": "round" },
          paint: {
            "line-color": INK,
            "line-width": 2,
            "line-dasharray": [2, 2],
          },
        });
        m.addLayer({
          id: "route-flown-casing",
          type: "line",
          source: "route-flown",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": INK, "line-width": 6 },
        });
        m.addLayer({
          id: "route-flown",
          type: "line",
          source: "route-flown",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": TOMATO, "line-width": 4 },
        });
      });

      const tick = () => {
        const p = positionAt(plan, from, to, now());
        marker.setLngLat([p.lon, p.lat]);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);

      const follow = (always: boolean) => {
        const p = positionAt(plan, from, to, now());
        drawRoute(p.frac);
        if (!followRef.current || (!always && !nearEdge(m, p))) return;
        m.easeTo({
          center: [p.lon, p.lat],
          zoom: zoomForDistance(distanceMi * (1 - p.frac)),
          offset: [-Math.sin(bearing) * LEAD_PX, Math.cos(bearing) * LEAD_PX],
          duration: 1500,
        });
      };
      recentre.current = () => follow(true);
      timer = setInterval(() => follow(false), FOLLOW_EVERY_MS);

      const stopFollowing = (e: { originalEvent?: unknown }) => {
        if (!e.originalEvent) return;
        followRef.current = false;
        setFollowing(false);
      };
      m.on("dragstart", stopFollowing);
      m.on("zoomstart", stopFollowing);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearInterval(timer);
      recentre.current = () => {};
      for (const m of markers) m.remove();
      mounted?.dispose();
      mapRef.current = null;
    };
  }, [flightId, from, to, plan, distanceMi, offsetMs, bottomPadding]);

  const findBird = () => {
    followRef.current = true;
    setFollowing(true);
    recentre.current();
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={container} style={{ position: "absolute", inset: 0 }} />
      <div style={{ display: "none" }}>
        <div ref={loftEl}>
          <div style={{ position: "relative" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/svg/map/pin-loft.svg"
              alt=""
              width={32}
              height={40}
              style={{ display: "block" }}
            />
            <span style={PIN_LABEL}>{loftLabel}</span>
          </div>
        </div>
        <div ref={sillEl}>
          <div style={{ position: "relative" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/svg/map/pin-sill.svg"
              alt=""
              width={32}
              height={40}
              style={{ display: "block" }}
            />
            <span style={PIN_LABEL}>{sillLabel}</span>
          </div>
        </div>
        <div ref={birdEl}>
          <Bird
            look={bird.look as Look}
            gear={bird.gear as GearId[]}
            pose="fly"
            animated
            size={BIRD_PX}
            flip={west}
            title={bird.name}
          />
        </div>
      </div>
      {!following && (
        <button
          type="button"
          onClick={findBird}
          style={{ position: "absolute", top: 16, right: 16 }}
        >
          Find {bird.name}
        </button>
      )}
    </div>
  );
}
