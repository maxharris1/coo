import {
  bathDone,
  napDone,
  type CareSnapshot,
  type feed,
} from "@/lib/game/care";
import type { BirdRecord } from "@/server/rows";

export const wakeEffect: Record<"bath" | "nap", typeof feed> = {
  bath: bathDone,
  nap: napDone,
};

export function careSnapshot(bird: BirdRecord): CareSnapshot {
  return {
    belly: bird.belly,
    feathers: bird.feathers,
    energy: bird.energy,
    careAtMs: bird.careAt,
    lastFedAtMs: bird.lastFedAt,
    hungryNotified: bird.hungryNotified,
    status: bird.status,
  };
}
