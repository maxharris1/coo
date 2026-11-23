import { afterEach, expect, it, vi } from "vitest";
import { config } from "@/lib/config";

afterEach(() => {
  vi.doUnmock("@/lib/config");
  vi.resetModules();
});

async function loftRoomsWith(rooms: {
  perFloor: number;
  topFloorMinRooms: number;
}) {
  vi.resetModules();
  vi.doMock("@/lib/config", () => ({
    config: {
      ...config,
      loft: { ...config.loft, rooms: { ...config.loft.rooms, ...rooms } },
    },
  }));
  const { loftRooms } = await import("./flockRows");
  return (perches: number) =>
    loftRooms([], perches, null).filter((r) => r.kind === "tolet").length;
}

it("builds the rooms to let from the configured floor size", async () => {
  const toLet = await loftRoomsWith({ perFloor: 4, topFloorMinRooms: 3 });
  expect([3, 4, 5, 6, 7, 8, 9].map(toLet)).toEqual([0, 0, 2, 1, 0, 0, 2]);
});

it("lets no room when a lone top room is allowed", async () => {
  const toLet = await loftRoomsWith({ perFloor: 3, topFloorMinRooms: 1 });
  expect([3, 4, 5].map(toLet)).toEqual([0, 0, 0]);
});
