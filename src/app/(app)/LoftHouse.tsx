"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Bird, type GearId, type Look } from "@/components/Bird";
import type { SyncPayload } from "@/components/sync";
import { config } from "@/lib/config";
import { describeLoft, loftRooms, ROOM_LINK, type Room } from "./flockRows";
import { LoftArt, type LoftItem, type LoftRoom } from "./loftArt";
import { gestureAnimation, startLoftIdle, type Gesture } from "./loftIdle";
import { birdBox, loftLayout, type Box } from "./loftLayout";
import styles from "./LoftHouse.module.css";

type FlockBird = SyncPayload["birds"][number];

const ROOM_ART: {
  [K in Room["kind"]]: (room: Extract<Room, { kind: K }>) => LoftRoom;
} = {
  home: () => "home",
  away: ({ bird }) => `away:${bird.look as Look}`,
  roommate: () => "roommate",
  egg: ({ ready }) => (ready ? "ready" : "egg"),
  empty: () => "empty",
  tolet: () => "empty",
};

const { scene, slots } = config.loft;

const BIRDBATH: Box = {
  x: slots.birdbath.centerX - slots.birdbath.width / 2,
  y: scene.floorY - slots.birdbath.height,
  w: slots.birdbath.width,
  h: slots.birdbath.height,
};

export const BIRD_SIZE = 120;
const REDUCE = "(prefers-reduced-motion: reduce)";

const pct = (n: number, of: number) => `${(n / of) * 100}%`;

function subscribeReducedMotion(onChange: () => void) {
  const query = globalThis.matchMedia?.(REDUCE);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

const prefersReducedMotion = () =>
  globalThis.matchMedia?.(REDUCE).matches ?? false;

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

const tabHidden = () => document.hidden;
const serverTabHidden = () => false;

export type LoftMotion = {
  reduced: boolean;
  paused: boolean;
  gestures: Readonly<Record<string, Gesture>>;
};

export const awakeIds = (rooms: readonly Room[]): string[] =>
  rooms.flatMap((room) =>
    room.kind === "home" && !room.asleep ? [room.bird.id] : [],
  );

export function useLoftMotion(awake: readonly string[]): LoftMotion {
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    prefersReducedMotion,
  );
  const [gestures, setGestures] = useState<Record<string, Gesture>>({});
  const paused = useSyncExternalStore(
    subscribeVisibility,
    tabHidden,
    serverTabHidden,
  );
  const key = awake.join(" ");

  useEffect(
    () =>
      startLoftIdle({
        birdIds: key ? key.split(" ") : [],
        reducedMotion: reduced,
        doc: document,
        onGesture: (id, gesture) =>
          setGestures((all) => {
            const next = { ...all };
            if (gesture) next[id] = gesture;
            else delete next[id];
            return next;
          }),
        onPause: () => {},
      }),
    [key, reduced],
  );

  return { reduced, paused, gestures };
}

function HomeBird({
  bird,
  asleep,
  box,
  room,
  motion,
}: {
  bird: FlockBird;
  asleep: boolean;
  box: Box;
  room: number;
  motion: LoftMotion;
}) {
  const gesture =
    motion.reduced || asleep ? undefined : motion.gestures[bird.id];
  return (
    <g
      data-room={room}
      transform={`translate(${box.x} ${box.y}) scale(${box.w / BIRD_SIZE})`}
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
          pose={asleep ? "sleep" : "perched"}
          animated={!motion.reduced}
        />
      </g>
    </g>
  );
}

function SceneLink({
  href,
  label,
  box,
}: {
  href: string;
  label: string;
  box: Box;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={styles.link}
      style={{
        left: pct(box.x, scene.width),
        top: pct(box.y, scene.height),
        width: pct(box.w, scene.width),
        height: pct(box.h, scene.height),
      }}
    />
  );
}

export function LoftHouseView({
  rooms,
  perches,
  items,
  motion,
}: {
  rooms: readonly Room[];
  perches: number;
  items: readonly LoftItem[];
  motion: LoftMotion;
}) {
  const layout = loftLayout(perches);

  return (
    <div className={styles.loft} data-paused={motion.paused ? "" : undefined}>
      <LoftArt
        perches={perches}
        rooms={rooms.map((room) => ROOM_ART[room.kind](room as never))}
        items={items}
        label={describeLoft(rooms)}
      />
      <svg
        className={styles.birds}
        viewBox={`0 0 ${scene.width} ${scene.height}`}
        aria-hidden
        data-birds=""
      >
        {rooms.map(
          (room, i) =>
            room.kind === "home" && (
              <HomeBird
                key={room.bird.id}
                bird={room.bird}
                asleep={room.asleep}
                box={birdBox(layout.rooms[i])}
                room={i}
                motion={motion}
              />
            ),
        )}
      </svg>
      {rooms.map((room, i) => {
        const link = ROOM_LINK[room.kind](room as never);
        return (
          link && (
            <SceneLink
              key={i}
              href={link.href}
              label={link.label}
              box={layout.rooms[i]}
            />
          )
        );
      })}
      {items.includes("birdbath") && (
        <SceneLink
          href="/shop"
          label="Birdbath. Open the shop"
          box={BIRDBATH}
        />
      )}
    </div>
  );
}

export function LoftHouse({
  birds,
  perches,
  egg,
  items,
}: {
  birds: readonly FlockBird[];
  perches: number;
  egg: { status: string } | null;
  items: readonly LoftItem[];
}) {
  const rooms = loftRooms(birds, perches, egg);
  const motion = useLoftMotion(awakeIds(rooms));
  return (
    <LoftHouseView
      rooms={rooms}
      perches={perches}
      items={items}
      motion={motion}
    />
  );
}
