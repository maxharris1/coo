import { PERCH_VB } from "@/components/Bird";
import { config } from "@/lib/config";

const { scene, rooms: room, roof } = config.loft;
const { start: minPerches, max: maxPerches } = config.game.perches;
const CX = Math.floor(scene.width / 2);
const [, VB_Y, VB_W, VB_H] = PERCH_VB.split(" ").map(Number);

export type Box = { x: number; y: number; w: number; h: number };
export type Room = Box & { toLet: boolean };
export type LoftLayout = {
  perches: 3 | 4 | 5;
  floors: 1 | 2;
  rooms: Room[];
  roof: { x0: number; x1: number; eave: number; peak: number };
};

const rowsFor = (perches: number) => {
  const rows: number[] = [];
  for (let left = perches; left > 0; left -= room.perFloor)
    rows.push(Math.min(room.perFloor, left));
  if (rows.length > 1)
    rows[rows.length - 1] = Math.max(
      rows[rows.length - 1],
      room.topFloorMinRooms,
    );
  return rows;
};

export function loftLayout(perches: number): LoftLayout {
  const owned = Math.min(maxPerches, Math.max(minPerches, Math.floor(perches)));
  const rows = rowsFor(owned);
  const top = rows[rows.length - 1];
  const eave = scene.floorY - rows.length * room.height;
  const half = (top * room.width) / 2 + roof.overhang;
  return {
    perches: owned as LoftLayout["perches"],
    floors: rows.length as LoftLayout["floors"],
    rooms: rows.flatMap((n, r) =>
      Array.from({ length: n }, (_, c) => ({
        x: CX - (n * room.width) / 2 + c * room.width,
        y: scene.floorY - (r + 1) * room.height,
        w: room.width,
        h: room.height,
        toLet: r * room.perFloor + c >= owned,
      })),
    ),
    roof: {
      x0: CX - half,
      x1: CX + half,
      eave,
      peak:
        eave -
        (top === room.perFloor ? roof.riseThreeRooms : roof.riseTwoRooms),
    },
  };
}

export function birdBox({ x, y }: Box): Box {
  const k = room.bird.width / VB_W;
  return {
    x: x + room.bird.offsetX,
    y: y + room.bird.feetY - (room.bird.feetYInBirdViewBox - VB_Y) * k,
    w: room.bird.width,
    h: VB_H * k,
  };
}

export const artHeight = (screenWidth: number) =>
  Math.round(
    ((scene.height - scene.skyBandHeight) * screenWidth) / scene.width,
  );
