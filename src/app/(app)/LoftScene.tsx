"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { Bird, type GearId, type Look } from "@/components/Bird";
import type { SyncPayload } from "@/components/sync";
import { isAway } from "@/lib/format";
import { gestureAnimation, startLoftIdle, type Gesture } from "./loftIdle";
import { BIRD_SCALE, BIRD_SIZE, coopLayout, type Box } from "./coopLayout";
import styles from "./MainTop.module.css";

type FlockBird = SyncPayload["birds"][number];

const INK = "#2A2140";
const TAN = "#D99A6C";
const CREAM = "#FFF4DC";
const ILLUSTRATIONS = "/assets/svg/illustrations";
const REDUCE = "(prefers-reduced-motion: reduce)";

export const CLOUDS = [
  { x: 194, y: 18, w: 64, h: 31, pxPerSec: 6 },
  { x: 104, y: 12, w: 48, h: 23, pxPerSec: 4.5 },
  { x: 300, y: 44, w: 40, h: 19, pxPerSec: 5.2 },
] as const;

const NUMBER_WORDS = ["No", "One", "Two", "Three", "Four", "Five"];

const pct = (n: number, of: number) => `${(n / of) * 100}%`;

function subscribeReducedMotion(onChange: () => void) {
  const query = globalThis.matchMedia?.(REDUCE);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

const prefersReducedMotion = () =>
  globalThis.matchMedia?.(REDUCE).matches ?? false;

function listNames(names: string[]): string {
  return names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function describeScene(
  perched: FlockBird[],
  sleeper: FlockBird | undefined,
  away: FlockBird | undefined,
  free: number,
): string {
  const parts = [
    perched.length > 0 &&
      `${listNames(perched.map((b) => b.name))} ${perched.length === 1 ? "sits on a perch" : "sit on their perches"}`,
    sleeper && `${sleeper.name} is asleep in the coop`,
    away && `${away.name}'s door has an OUT tag on it`,
  ].filter((p): p is string => Boolean(p));
  const body =
    parts.length < 2
      ? parts.join("")
      : `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
  const freeLine =
    free === 0
      ? ""
      : ` ${NUMBER_WORDS[free]} ${free === 1 ? "perch is" : "perches are"} free.`;
  return `Your rooftop loft.${body ? ` ${body}.` : ""}${freeLine}`;
}

function cloudMotion(
  cloud: (typeof CLOUDS)[number],
  width: number,
): CSSProperties {
  const travel = width + cloud.w;
  const seconds = travel / cloud.pxPerSec;
  const delay = (cloud.x + cloud.w) / cloud.pxPerSec;
  return {
    "--coo-cloud-travel": `${travel}px`,
    animation: `coo-cloud-wrap ${seconds.toFixed(1)}s linear -${delay.toFixed(1)}s infinite`,
  } as CSSProperties;
}

export function LoftScene({
  birds,
  perches,
}: {
  birds: FlockBird[];
  perches: number;
}) {
  const layout = coopLayout(perches);
  const { width, height, parapetY, coop } = layout;
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    prefersReducedMotion,
  );
  const [gestures, setGestures] = useState<Record<string, Gesture>>({});
  const [paused, setPaused] = useState(false);

  const seated = birds.slice(0, layout.slots.length).map((bird, slot) => ({
    bird,
    slot,
  }));
  const home = birds.filter((b) => !isAway(b.status));
  const sleeper = home.find((b) => b.tired);
  const away = birds.find((b) => isAway(b.status));
  const perched = seated.filter(
    ({ bird }) => !isAway(bird.status) && !bird.tired,
  );
  const perchedKey = perched.map(({ bird }) => bird.id).join(" ");

  useEffect(
    () =>
      startLoftIdle({
        birdIds: perchedKey ? perchedKey.split(" ") : [],
        reducedMotion: reduced,
        doc: document,
        onGesture: (id, gesture) =>
          setGestures((all) => {
            const next = { ...all };
            if (gesture) next[id] = gesture;
            else delete next[id];
            return next;
          }),
        onPause: setPaused,
      }),
    [perchedKey, reduced],
  );

  const targets: { bird: FlockBird; box: Box }[] = [
    ...(sleeper ? [{ bird: sleeper, box: layout.sleeperBox }] : []),
    ...(away ? [{ bird: away, box: layout.outTagBox }] : []),
    ...perched.map(({ bird, slot }) => ({ bird, box: layout.slots[slot] })),
  ];
  const coopArt = `translate(${coop.x} ${coop.y}) scale(${coop.scale}) translate(${-coop.art.x} ${-coop.art.y})`;
  const backdrop = `translate(0 ${parapetY - 196})`;

  return (
    <div className={styles.loft} data-paused={paused ? "" : undefined}>
      <svg
        className={styles.scene}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={describeScene(
          perched.map((p) => p.bird),
          sleeper,
          away,
          layout.slots.length - perched.length,
        )}
      >
        <g transform={backdrop}>
          <g fill="#A9DDF7">
            <rect x="20" y="132" width="34" height="64" />
            <path d="M120 196 V118 H132 V100 L139 84 L146 100 V118 H158 V196 Z" />
            <rect x="214" y="126" width="30" height="70" />
            <rect x="330" y="122" width="40" height="74" />
          </g>
          <g fill="#8CCDEE">
            <rect x="0" y="150" width="46" height="80" />
            <rect x="52" y="118" width="38" height="112" />
            <rect x="188" y="134" width="54" height="96" />
            <rect x="250" y="110" width="40" height="120" />
            <rect x="298" y="142" width="92" height="88" />
          </g>
          <g fill={CREAM}>
            <rect x="60" y="128" width="8" height="10" />
            <rect x="74" y="146" width="8" height="10" />
            <rect x="198" y="146" width="8" height="10" />
            <rect x="260" y="122" width="8" height="10" />
            <rect x="272" y="150" width="8" height="10" />
          </g>
        </g>
        {CLOUDS.map((cloud) => (
          <image
            key={cloud.x}
            data-cloud=""
            href={`${ILLUSTRATIONS}/cloud.svg`}
            x={reduced ? cloud.x : -cloud.w}
            y={cloud.y}
            width={cloud.w}
            height={cloud.h}
            style={reduced ? undefined : cloudMotion(cloud, width)}
          />
        ))}
        <image
          href={`${ILLUSTRATIONS}/water-tower.svg`}
          x={layout.waterTower.x}
          y={layout.waterTower.y}
          width={layout.waterTower.w}
          height={layout.waterTower.h}
        />
        {layout.rack && (
          <g
            data-perch-rack=""
            fill={TAN}
            stroke={INK}
            strokeWidth="2.5"
            strokeLinejoin="round"
          >
            <rect
              x={layout.rack.x + 6}
              y={layout.rack.beamY}
              width="8"
              height={parapetY - layout.rack.beamY}
            />
            <rect
              x={layout.rack.x + layout.rack.w - 14}
              y={layout.rack.beamY}
              width="8"
              height={parapetY - layout.rack.beamY}
            />
            <rect
              x={layout.rack.x}
              y={layout.rack.beamY}
              width={layout.rack.w}
              height="9"
              rx="2"
            />
          </g>
        )}
        <rect
          x="-6"
          y={parapetY}
          width="402"
          height="50"
          fill="#F08A6B"
          stroke={INK}
          strokeWidth="2.5"
        />
        <path
          d={`M-6 ${parapetY + 16} H396 ${[40, 120, 200, 280, 360].map((x) => `M${x} ${parapetY + 6} V${parapetY + 16}`).join(" ")} ${[80, 160, 240, 320].map((x) => `M${x} ${parapetY + 16} V${parapetY + 50}`).join(" ")}`}
          stroke={INK}
          strokeWidth="1.6"
          opacity=".45"
          fill="none"
        />
        <rect
          x="-6"
          y={parapetY - 2}
          width="402"
          height="8"
          rx="3"
          fill={CREAM}
          stroke={INK}
          strokeWidth="2.5"
        />
        <g transform={coopArt}>
          <image
            href={`${ILLUSTRATIONS}/coop.svg`}
            x="6"
            y="54"
            width="186"
            height="148"
          />
          <path
            d="M150 66 V44 H162 V70"
            fill="#FFC93C"
            stroke={INK}
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {sleeper && (
            <g data-sleeper="">
              <circle
                cx="66"
                cy="176"
                r="17"
                fill="#7A7396"
                stroke={CREAM}
                strokeWidth="2"
              />
              <path
                d="M68 174 q5 4 10 0"
                stroke={CREAM}
                strokeWidth="2.4"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d="M82 175 L93 179 L82 183 Z"
                fill="#FFC93C"
                stroke={CREAM}
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <text x="84" y="150" className={styles.snooze}>
                z
              </text>
              <text
                x="74"
                y="160"
                className={`${styles.snooze} ${styles.snoozeLate}`}
              >
                z
              </text>
            </g>
          )}
          {away && (
            <g>
              <path
                d="M132 124 V140"
                stroke={INK}
                strokeWidth="2"
                fill="none"
              />
              <g transform="rotate(-6 132 147)">
                <rect
                  x="114"
                  y="138"
                  width="36"
                  height="18"
                  rx="4"
                  fill="#FFFBF0"
                  stroke={INK}
                  strokeWidth="2"
                />
                <text x="132" y="151" className={styles.tag}>
                  OUT
                </text>
              </g>
            </g>
          )}
        </g>
        {layout.planks.map((plank, i) => (
          <rect
            key={i}
            data-perch=""
            x={plank.x}
            y={plank.y}
            width={plank.w}
            height={plank.h}
            rx="3"
            fill={TAN}
            stroke={INK}
            strokeWidth="2"
          />
        ))}
        {perched.map(({ bird, slot }) => {
          const box = layout.slots[slot];
          const gesture = reduced ? undefined : gestures[bird.id];
          return (
            <g key={bird.id}>
              <ellipse
                cx={box.x + box.w / 2}
                cy={box.y + box.h - 3}
                rx={box.w * 0.32}
                ry="3"
                fill={INK}
                opacity=".18"
              />
              <g
                data-ledge-bird=""
                data-slot={slot}
                transform={`translate(${box.x} ${box.y}) scale(${BIRD_SCALE})`}
              >
                <g
                  data-idle={gesture}
                  style={
                    gesture
                      ? {
                          transformBox: "fill-box",
                          transformOrigin: "50% 100%",
                          animation: gestureAnimation(gesture),
                        }
                      : undefined
                  }
                >
                  <Bird
                    look={bird.look as Look}
                    breed={bird.breed}
                    gear={bird.gear as GearId[]}
                    size={BIRD_SIZE}
                    animated={!reduced}
                  />
                </g>
              </g>
            </g>
          );
        })}
      </svg>
      {targets.map(({ bird, box }) => (
        <Link
          key={bird.id}
          href={`/birds/${bird.id}`}
          aria-label={`Open ${bird.name}`}
          data-scene-bird=""
          className={styles.birdLink}
          style={{
            left: pct(box.x + box.w / 2, width),
            top: pct(box.y + box.h / 2, height),
            width: pct(box.w, width),
            height: pct(box.h, height),
          }}
        />
      ))}
    </div>
  );
}
