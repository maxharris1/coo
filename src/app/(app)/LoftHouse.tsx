"use client";

import Link from "next/link";
import type { Look } from "@/components/Bird";
import type { SyncPayload } from "@/components/sync";
import { config } from "@/lib/config";
import { describeLoft, loftRooms, ROOM_LINK, type Room } from "./flockRows";
import { LoftArt, type LoftItem, type LoftRoom } from "./loftArt";
import { loftLayout, type Box } from "./loftLayout";
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

const pct = (n: number, of: number) => `${(n / of) * 100}%`;

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
  const layout = loftLayout(perches);

  return (
    <div className={styles.loft}>
      <LoftArt
        perches={perches}
        rooms={rooms.map((room) => ROOM_ART[room.kind](room as never))}
        items={items}
        label={describeLoft(rooms)}
      />
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
