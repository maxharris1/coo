"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker,
  StyleSpecification,
} from "maplibre-gl";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import {
  bearingDeg,
  interpolate,
  positionAt,
  type BirdPosition,
  type FlightPlan,
  type LatLon,
} from "@/lib/flight/engine";
import { collapseAttributionSoon, keepCreditOpen } from "./attribution";
import { Bird, type GearId, type Look, type Pose } from "./Bird";
import { MAP_STYLES, STOCK_STYLE, loadMapStyle } from "./mapStyle";
import styles from "./MapView.module.css";
import { mountMap, type MountedMap } from "./mountMap";
import { bubbleSide, startBubble } from "./speechBubble";

export type Place = LatLon & { label: string };
export type BirdLite = {
  id: string;
  name: string;
  look: string;
  gear: string[];
};

export type LoftAt = "from" | "to";

export type BirdState =
  "scheduled" | "flying" | "roosting" | "delayed" | "landed";

const POSE: Record<BirdState, Pose> = {
  scheduled: "perched",
  flying: "fly",
  roosting: "sleep",
  delayed: "surprise",
  landed: "landed",
};

export function birdState(p: BirdPosition["state"]): BirdState {
  return p === "waiting" ? "scheduled" : p;
}

export type MapViewProps = {
  flightId: string;
  from: Place;
  to: Place;
  plan: FlightPlan | null;
  distanceMi: number;
  bird: BirdLite;
  offsetMs: number;
  bottomPadding: number;
  /** Camera room kept clear at the top, for the header and a pin under it. */
  topPadding?: number;
  /** How far up to lift the map's credit: the height of the card over it. */
  controlsBottom?: number;
  /** A name for the map picture. The credit stays outside it. */
  mapLabel?: string;
  night: boolean;
  loftLabel: string;
  sillLabel: string;
  loftAt?: LoftAt;
  state?: BirdState;
  preview?: boolean;
  bubbleLines?: readonly string[];
};

export const ZOOM_BANDS: readonly { underMi: number; zoom: number }[] = [
  { underMi: 1, zoom: 16 },
  { underMi: 5, zoom: 14 },
  { underMi: 30, zoom: 11 },
  { underMi: 150, zoom: 8 },
  { underMi: 600, zoom: 6 },
];
export const FAR_ZOOM = 4.5;

type StylePath = (typeof MAP_STYLES)[keyof typeof MAP_STYLES];
const INK = "#2A2140";
const TOMATO = "#F4623F";
const DOT_WIDTH = 3.5;
const DOT_DASH = [0.01, 2.2];
const DOT_GAP_PX = DOT_DASH[1] * DOT_WIDTH;
const DOT_GAP_STEP = 0.001;
const ROUTE_LEFT_PAINT: Record<
  "day" | "night",
  { "line-color": string; "line-opacity"?: number }
> = {
  day: { "line-color": INK },
  night: { "line-color": "#FFF4DC", "line-opacity": 0.85 },
};
const FOLLOW_EVERY_MS = 5000;
const EDGE_MARGIN = 0.2;
const LEAD_PX = 60;
const BIRD_PX = 82;
// A preview is 140 px tall: room above for a pin (40 px tall, standing on its
// point) and below for the always-open credit, so both pins show.
const PREVIEW_PADDING = { top: 46, left: 24, right: 24, bottom: 34 };
const SIDE_PADDING = 48;
// The camera keeps a row clear above the card for the map credit (24 px tall
// with an 8 px margin) and a little air, so the credit, open or folded, never
// covers the bird or a pin, and a pin never sits flush on the card.
const CREDIT_ROW_PX = 40;
const LABEL_PAD = 16;
const PIN_GAP = 4;
const PIN_HALF_WIDTH = 16;
const PIN_BESIDE = `calc(100% + ${PIN_GAP}px)`;
const PILL_CAP = { loft: 160, sill: 180 } as const;
const PIN_LABEL = {
  position: "absolute",
  top: 16,
  left: PIN_BESIDE,
  transform: "translateY(-50%)",
  padding: "4px 10px",
  background: "var(--coo-card)",
  border: "2px solid var(--coo-ink)",
  borderRadius: "var(--coo-radius-pill)",
  color: "var(--coo-ink)",
  font: "900 12px var(--coo-font-body)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  boxSizing: "border-box",
} as const;
const NO_LINES: readonly string[] = [];
const CLOUD_MAX_ZOOM = 11;
const CLOUDS = [
  { top: "18%", drift: 34, start: 0, rest: "35%" },
  { top: "42%", drift: 46, start: -15, rest: "85%" },
  { top: "64%", drift: 40, start: -28, rest: "60%" },
] as const;
const BUBBLE_BOX = {
  position: "absolute",
  bottom: "100%",
  display: "none",
  flexDirection: "column",
  width: "max-content",
  transform: "rotate(-4deg)",
  pointerEvents: "none",
} as const;
const BUBBLE_TEXT = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  overflow: "hidden",
  maxWidth: 190,
  padding: "6px 12px",
  background: "var(--coo-card)",
  border: "2.5px solid var(--coo-ink)",
  borderRadius: 14,
  color: "var(--coo-ink)",
  font: "700 22px var(--coo-font-hand)",
  boxSizing: "border-box",
} as const;

export function pinLabelShift({
  pinX,
  pinHalfWidth,
  mapWidth,
  cap,
  pad,
  gap,
}: {
  pinX: number;
  pinHalfWidth: number;
  mapWidth: number;
  cap: number;
  pad: number;
  gap: number;
}): { side: "left" | "right"; maxWidth: number } {
  const side = pinX < mapWidth / 2 ? "right" : "left";
  const room =
    side === "right"
      ? mapWidth - pad - (pinX + pinHalfWidth + gap)
      : pinX - pinHalfWidth - gap - pad;
  return { side, maxWidth: Math.max(0, Math.min(cap, room)) };
}

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

function nearLon(lon: number, ref: number): number {
  return lon + 360 * Math.round((ref - lon) / 360);
}

function line(from: LatLon, to: LatLon, fracs: number[]) {
  let lon = from.lon;
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: fracs.map((f) => {
        const p = interpolate(from, to, f);
        lon = nearLon(p.lon, lon);
        return [lon, p.lat];
      }),
    },
  };
}

function splitRoute(
  from: LatLon,
  to: LatLon,
  fracs: number[],
  at: number,
  dotsAt: number,
) {
  const flown = [...fracs.filter((f) => f < at), at];
  const left = [dotsAt, ...fracs.filter((f) => f > dotsAt)];
  return { flown: line(from, to, flown), left: line(from, to, left) };
}

export function dotsStart(
  map: Pick<MapLibreMap, "project">,
  from: LatLon,
  to: LatLon,
  at: number,
): number {
  const step = Math.min(at + DOT_GAP_STEP, 1) - at;
  if (step <= 0) return 1;
  const here = interpolate(from, to, at);
  const ahead = interpolate(from, to, at + step);
  const a = map.project([here.lon, here.lat]);
  const b = map.project([nearLon(ahead.lon, here.lon), ahead.lat]);
  const px = Math.hypot(b.x - a.x, b.y - a.y);
  return Math.min(at + (DOT_GAP_PX / px) * step, 1);
}

type StyleKind = "day" | "night" | "stock";
type Applied = { path: StylePath | typeof STOCK_STYLE; kind: StyleKind };

const kindOf = (path: StylePath): StyleKind =>
  path === MAP_STYLES.night ? "night" : "day";

/**
 * The style a new map opens with: ours with its sprite made absolute, or the
 * stock style if ours fails, with the kind that actually loaded.
 */
function resolveStyle(
  path: StylePath,
): Promise<{ style: StyleSpecification | string; applied: Applied }> {
  return loadMapStyle(path).then(
    (style) => ({ style, applied: { path, kind: kindOf(path) } }),
    () => ({
      style: STOCK_STYLE,
      applied: { path: STOCK_STYLE, kind: "stock" as const },
    }),
  );
}

/**
 * Restyles the open map in place, so the route, pins and bird stay put. It
 * does nothing when that style is already on the map. A style that resolves
 * after the map closed or after a newer swap is dropped, and one that fails to
 * load leaves the current style in place.
 */
function swapStyle(
  m: MapLibreMap,
  path: StylePath,
  current: {
    map: RefObject<MapLibreMap | null>;
    style: RefObject<StylePath>;
    applied: RefObject<Applied>;
  },
) {
  if (current.applied.current.path === path) return;
  loadMapStyle(path).then(
    (next) => {
      if (current.map.current !== m || current.style.current !== path) return;
      if (current.applied.current.path === path) return;
      current.applied.current = { path, kind: kindOf(path) };
      m.setStyle(next, { diff: false });
    },
    () => {},
  );
}

type Insets = { top: number; bottom: number };

/** Near an edge of the part of the map the header and card leave clear. */
export function nearEdge(
  map: Pick<MapLibreMap, "project" | "getContainer">,
  p: LatLon,
  clear: Insets,
): boolean {
  const { x, y } = map.project([p.lon, p.lat]);
  const { clientWidth: w, clientHeight: h } = map.getContainer();
  return (
    x < w * EDGE_MARGIN ||
    x > w * (1 - EDGE_MARGIN) ||
    y < Math.max(h * EDGE_MARGIN, clear.top) ||
    y > Math.min(h * (1 - EDGE_MARGIN), h - clear.bottom)
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
  topPadding = 80,
  controlsBottom = 0,
  mapLabel,
  night,
  loftLabel,
  sillLabel,
  loftAt = "from",
  state = "flying",
  preview = false,
  bubbleLines = NO_LINES,
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const birdEl = useRef<HTMLDivElement>(null);
  const loftEl = useRef<HTMLDivElement>(null);
  const sillEl = useRef<HTMLDivElement>(null);
  const loftLabelEl = useRef<HTMLSpanElement>(null);
  const sillLabelEl = useRef<HTMLSpanElement>(null);
  const bubbleEl = useRef<HTMLDivElement>(null);
  const bubbleTextEl = useRef<HTMLSpanElement>(null);
  const cloudsEl = useRef<HTMLDivElement>(null);
  const linesRef = useRef(bubbleLines);
  const followRef = useRef(true);
  const recentre = useRef<() => void>(() => {});
  const refit = useRef<() => void>(() => {});
  const insetsRef = useRef<Insets>({ top: topPadding, bottom: bottomPadding });
  const [following, setFollowing] = useState(true);
  // Until MapLibre's canvas carries the map's name (or if it never draws),
  // the frame carries it, so the map always has an accessible name.
  const [canvasNamed, setCanvasNamed] = useState(false);
  const style: StylePath = MAP_STYLES[night ? "night" : "day"];
  const styleRef = useRef<StylePath>(style);
  const appliedRef = useRef<Applied>({ path: style, kind: kindOf(style) });
  const mapRef = useRef<MapLibreMap | null>(null);
  const stateRef = useRef(state);
  const markerRef = useRef<Marker | null>(null);
  const draggingRef = useRef(false);
  const west = headsWest(from, to);
  const westRef = useRef(west);
  const pose = POSE[plan ? state : "scheduled"];

  useEffect(() => {
    if (styleRef.current === style) return;
    styleRef.current = style;
    const m = mapRef.current;
    if (m) {
      swapStyle(m, style, {
        map: mapRef,
        style: styleRef,
        applied: appliedRef,
      });
    }
  }, [style]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // The header and card can change height (a measured card, a new log line)
  // without rebuilding the map: keep the camera clear of them instead.
  useEffect(() => {
    const prev = insetsRef.current;
    if (prev.top === topPadding && prev.bottom === bottomPadding) return;
    insetsRef.current = { top: topPadding, bottom: bottomPadding };
    refit.current();
  }, [topPadding, bottomPadding]);

  useEffect(() => {
    westRef.current = west;
  }, [west]);

  useEffect(() => {
    linesRef.current = bubbleLines;
  }, [bubbleLines]);

  useEffect(() => {
    const box = bubbleEl.current;
    const text = bubbleTextEl.current;
    if (preview || !box || !text) return;
    let said = 0;
    const stopBubble = startBubble({
      show: () => {
        const lines = linesRef.current;
        const m = mapRef.current;
        const marker = markerRef.current;
        if (!lines.length || !m || !marker) return;
        text.textContent = lines[said++ % lines.length];
        const side = bubbleSide({
          birdX: m.project(marker.getLngLat()).x,
          mapWidth: m.getContainer().clientWidth,
          west: westRef.current,
        });
        box.style.left = side === "right" ? "50%" : "auto";
        box.style.right = side === "left" ? "50%" : "auto";
        box.style.alignItems = side === "right" ? "flex-start" : "flex-end";
        box.style.display = "flex";
      },
      hide: () => {
        box.style.display = "none";
      },
      dragging: () => draggingRef.current,
    });
    return stopBubble;
  }, [preview]);

  useEffect(() => {
    let mounted: MountedMap | null = null;
    let markers: Marker[] = [];
    let frame = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    let stopClouds = () => {};
    let stopCredit = () => {};
    const fracs = routeFractions(distanceMi);
    const now = () => Date.now() + offsetMs;
    const bearing = bearingDeg(from, to) * (Math.PI / 180);
    const where = () =>
      !plan
        ? { ...from, frac: 0 }
        : stateRef.current === "landed"
          ? { ...to, frac: 1 }
          : positionAt(plan, from, to, now());

    const firstStyle = styleRef.current;
    void Promise.all([import("maplibre-gl"), resolveStyle(firstStyle)]).then(
      ([lib, loaded]) => {
        const { Marker, LngLatBounds } = lib;
        const el = container.current;
        if (cancelled || !el || !birdEl.current) return;
        if (!loftEl.current || !sillEl.current) return;
        const bounds = new LngLatBounds(
          [from.lon, from.lat],
          [from.lon, from.lat],
        ).extend([to.lon, to.lat]);
        const clearArea = (): Insets => ({
          top: insetsRef.current.top,
          bottom: insetsRef.current.bottom + CREDIT_ROW_PX,
        });
        const fitPadding = () =>
          preview
            ? PREVIEW_PADDING
            : { ...clearArea(), left: SIDE_PADDING, right: SIDE_PADDING };
        mounted = mountMap(
          lib,
          el,
          {
            style: loaded.style,
            bounds,
            fitBoundsOptions: { padding: fitPadding() },
            ...(preview && { interactive: false }),
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
        appliedRef.current = loaded.applied;
        // Name or hide the picture (canvas and markers) but not the credit,
        // which MapLibre keeps beside it, so screen readers still reach it.
        if (preview) m.getCanvasContainer().setAttribute("aria-hidden", "true");
        if (mapLabel) {
          const canvas = m.getCanvasContainer();
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", mapLabel);
          setCanvasNamed(true);
        }
        // A preview sits inside a link and nobody can pan it, so its credit
        // stays open; a tap on the credit neither folds it nor opens the link.
        stopCredit = preview
          ? keepCreditOpen(el)
          : collapseAttributionSoon(m, el);
        if (styleRef.current !== firstStyle) {
          swapStyle(m, styleRef.current, {
            map: mapRef,
            style: styleRef,
            applied: appliedRef,
          });
        }
        m.touchZoomRotate.disableRotation();
        m.keyboard.disableRotation();

        const [loftPin, sillPin] = loftAt === "to" ? [to, from] : [from, to];
        const loft = new Marker({ element: loftEl.current, anchor: "bottom" })
          .setLngLat([loftPin.lon, loftPin.lat])
          .addTo(m);
        const sill = new Marker({ element: sillEl.current, anchor: "bottom" })
          .setLngLat([sillPin.lon, sillPin.lat])
          .addTo(m);
        const start = where();
        const marker = new Marker({ element: birdEl.current })
          .setLngLat([start.lon, start.lat])
          .addTo(m);
        markers = [loft, sill, marker];
        markerRef.current = marker;

        const clouds = cloudsEl.current;
        if (!preview && clouds) {
          m.getCanvas().after(clouds);
          const showClouds = () => {
            clouds.style.display =
              m.getZoom() <= CLOUD_MAX_ZOOM ? "block" : "none";
          };
          const pauseClouds = () => {
            clouds.style.animationPlayState = document.hidden
              ? "paused"
              : "running";
          };
          showClouds();
          pauseClouds();
          m.on("zoom", showClouds);
          document.addEventListener("visibilitychange", pauseClouds);
          stopClouds = () =>
            document.removeEventListener("visibilitychange", pauseClouds);
        }

        const clampLabels = () => {
          const mapWidth = m.getContainer().clientWidth;
          for (const [pin, label, cap] of [
            [loft, loftLabelEl.current, PILL_CAP.loft],
            [sill, sillLabelEl.current, PILL_CAP.sill],
          ] as const) {
            if (!label) continue;
            const { side, maxWidth } = pinLabelShift({
              pinX: m.project(pin.getLngLat()).x,
              pinHalfWidth: PIN_HALF_WIDTH,
              mapWidth,
              cap,
              pad: LABEL_PAD,
              gap: PIN_GAP,
            });
            label.style.left = side === "right" ? PIN_BESIDE : "auto";
            label.style.right = side === "left" ? PIN_BESIDE : "auto";
            label.style.maxWidth = `${maxWidth}px`;
          }
        };
        if (!preview) {
          for (const e of ["load", "move", "resize"] as const) {
            m.on(e, clampLabels);
          }
        }

        const route = (frac: number) =>
          splitRoute(from, to, fracs, frac, dotsStart(m, from, to, frac));

        m.on("style.load", () => {
          const { flown, left } = route(where().frac);
          m.addSource("route-flown", { type: "geojson", data: flown });
          m.addSource("route-left", { type: "geojson", data: left });
          m.addLayer({
            id: "route-left",
            type: "line",
            source: "route-left",
            layout: { "line-cap": "round" },
            paint: {
              ...ROUTE_LEFT_PAINT[
                appliedRef.current.kind === "night" ? "night" : "day"
              ],
              "line-width": DOT_WIDTH,
              "line-dasharray": DOT_DASH,
            },
          });
          m.addLayer({
            id: "route-flown-casing",
            type: "line",
            source: "route-flown",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": INK, "line-width": 8 },
          });
          m.addLayer({
            id: "route-flown",
            type: "line",
            source: "route-flown",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": TOMATO, "line-width": 5 },
          });
        });

        let drawn = { frac: NaN, zoom: NaN };
        const drawRoute = (frac: number) => {
          const flownSource = m.getSource<GeoJSONSource>("route-flown");
          const leftSource = m.getSource<GeoJSONSource>("route-left");
          if (!flownSource || !leftSource) return;
          const zoom = m.getZoom();
          if (frac === drawn.frac && zoom === drawn.zoom) return;
          drawn = { frac, zoom };
          const { flown, left } = route(frac);
          flownSource.setData(flown);
          leftSource.setData(left);
        };

        const tick = () => {
          const p = where();
          marker.setLngLat([p.lon, p.lat]);
          drawRoute(p.frac);
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);

        // Until the camera first follows the bird it shows the whole route,
        // refitted whenever the header or card changes height.
        let followed = false;
        const follow = (always: boolean) => {
          const p = where();
          if (preview || !followRef.current) return;
          if (!always && !nearEdge(m, p, clearArea())) return;
          followed = true;
          m.easeTo({
            center: [p.lon, p.lat],
            zoom: zoomForDistance(distanceMi * (1 - p.frac)),
            offset: [-Math.sin(bearing) * LEAD_PX, Math.cos(bearing) * LEAD_PX],
            padding: { ...clearArea(), left: 0, right: 0 },
            duration: 1500,
          });
        };
        timer = setInterval(() => follow(false), FOLLOW_EVERY_MS);
        if (preview) return;
        recentre.current = () => follow(true);
        refit.current = () => {
          if (followed || !followRef.current) return;
          m.fitBounds(bounds, { padding: fitPadding(), duration: 300 });
        };

        const stopFollowing = (e: { originalEvent?: unknown }) => {
          if (!e.originalEvent) return;
          followRef.current = false;
          setFollowing(false);
        };
        m.on("dragstart", (e) => {
          draggingRef.current = true;
          if (bubbleEl.current) bubbleEl.current.style.display = "none";
          stopFollowing(e);
        });
        m.on("dragend", () => {
          draggingRef.current = false;
        });
        m.on("zoomstart", stopFollowing);
      },
    );

    return () => {
      cancelled = true;
      stopClouds();
      stopCredit();
      cancelAnimationFrame(frame);
      clearInterval(timer);
      recentre.current = () => {};
      refit.current = () => {};
      for (const m of markers) m.remove();
      mounted?.dispose();
      mapRef.current = null;
      markerRef.current = null;
      draggingRef.current = false;
    };
  }, [
    flightId,
    from,
    to,
    plan,
    distanceMi,
    offsetMs,
    loftAt,
    preview,
    mapLabel,
  ]);

  const findBird = () => {
    followRef.current = true;
    setFollowing(true);
    recentre.current();
  };

  return (
    <div
      className={styles.frame}
      data-preview={preview || undefined}
      role={mapLabel && !canvasNamed ? "img" : undefined}
      aria-label={mapLabel && !canvasNamed ? mapLabel : undefined}
      style={
        {
          position: "relative",
          width: "100%",
          height: "100%",
          "--coo-map-bottom": `${controlsBottom}px`,
        } as CSSProperties
      }
    >
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
            {!preview && (
              <span
                ref={loftLabelEl}
                style={{ ...PIN_LABEL, maxWidth: PILL_CAP.loft }}
              >
                {loftLabel}
              </span>
            )}
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
            {!preview && (
              <span
                ref={sillLabelEl}
                style={{ ...PIN_LABEL, maxWidth: PILL_CAP.sill }}
              >
                {sillLabel}
              </span>
            )}
          </div>
        </div>
        <div ref={birdEl}>
          <div style={{ position: "relative" }}>
            <Bird
              look={bird.look as Look}
              gear={bird.gear as GearId[]}
              pose={pose}
              animated
              size={BIRD_PX}
              flip={west}
              title={bird.name}
            />
            {pose === "fly" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/assets/svg/map/${night ? "night/" : ""}bird-shadow.svg`}
                alt=""
                width={34}
                height={12}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "calc(100% + 26px)",
                  transform: "translateX(-50%)",
                  display: "block",
                  pointerEvents: "none",
                }}
              />
            )}
            {!preview && (
              <div ref={bubbleEl} style={BUBBLE_BOX}>
                <span ref={bubbleTextEl} style={BUBBLE_TEXT} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/assets/svg/map/bubble-tail.svg"
                  alt=""
                  width={14}
                  height={12}
                  style={{
                    position: "relative",
                    display: "block",
                    margin: "-3px 16px 0",
                  }}
                />
              </div>
            )}
          </div>
        </div>
        <div ref={cloudsEl} className={styles.clouds}>
          {CLOUDS.map((c) => (
            <div
              key={c.top}
              className={styles.lane}
              style={
                {
                  top: c.top,
                  "--drift": `${c.drift}s`,
                  "--start": `${c.start}s`,
                  "--rest": c.rest,
                } as CSSProperties
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/assets/svg/map/${night ? "night/" : ""}cloud.svg`}
                alt=""
                width={74}
                height={36}
              />
            </div>
          ))}
        </div>
      </div>
      {!preview && !following && (
        <button
          type="button"
          onClick={findBird}
          className="coo-truncate"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            maxWidth: "calc(100% - 32px)",
          }}
        >
          Find {bird.name}
        </button>
      )}
    </div>
  );
}
