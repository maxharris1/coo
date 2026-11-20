import { careAt, type CareOwner } from "@/lib/game/care";
import { levelFor } from "@/lib/game/levels";
import { noteLimit } from "@/lib/game/notes";
import type { BirdStatus } from "@/lib/game/types";
import type { BirdRecord } from "@/server/rows";

export type CannotFly = "away" | "busy" | "tired";

const blockedBy: Record<BirdStatus, CannotFly | null> = {
  home: null,
  flying: "away",
  visiting: "away",
  busy: "busy",
  scheduled: "busy",
};

export function toBirdView(b: BirdRecord, nowMs: number, owner: CareOwner) {
  const care = careAt(
    {
      belly: b.belly,
      feathers: b.feathers,
      energy: b.energy,
      careAtMs: b.careAt,
      lastFedAtMs: b.lastFedAt,
      hungryNotified: b.hungryNotified,
      status: b.status,
    },
    nowMs,
    owner,
  );
  const reason = blockedBy[b.status] ?? (care.canFly ? null : "tired");
  return {
    id: b.id,
    name: b.name,
    breed: b.breed,
    look: b.look,
    pronoun: b.pronoun,
    speedMph: b.speedMph,
    focus: b.focus,
    navigation: b.navigation,
    quirks: b.quirks,
    level: levelFor(b.miles),
    miles: b.miles,
    deliveries: b.deliveries,
    detours: b.detours,
    belly: care.belly,
    feathers: care.feathers,
    energy: care.energy,
    hungry: care.hungry,
    scruffy: care.scruffy,
    tired: care.tired,
    sulking: care.sulking,
    status: b.status,
    busyKind: b.busyKind,
    busyUntil: b.busyUntil,
    gear: b.gear,
    noteLimit: noteLimit(b),
    canFly: reason === null,
    ...(reason === null ? {} : { cannotFlyReason: reason }),
  };
}
export type BirdView = ReturnType<typeof toBirdView>;
