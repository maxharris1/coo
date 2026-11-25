import { config } from "@/lib/config";
import {
  gearIds,
  gearSlots,
  type GearId,
  type GearSlot,
} from "@/lib/game/types";

export type GearProblem =
  | { kind: "unknown"; item: string }
  | { kind: "duplicate"; item: GearId }
  | { kind: "slot_taken"; item: GearId; slot: GearSlot; by: GearId }
  | { kind: "not_owned"; item: GearId }
  | { kind: "unavailable"; item: GearId };

export type OutfitResult =
  | { ok: true; items: GearId[] }
  | { ok: false; problems: [GearProblem, ...GearProblem[]] };

type CatalogEntry = { id: GearId; slot: GearSlot; available: boolean };

export const isGearId = (v: string): v is GearId =>
  (gearIds as readonly string[]).includes(v);
const isGearSlot = (v: string): v is GearSlot =>
  (gearSlots as readonly string[]).includes(v);

const catalog = new Map<string, CatalogEntry>(
  config.gear.items.flatMap(({ id, slot, available }) =>
    isGearId(id) && isGearSlot(slot)
      ? [[id, { id, slot, available }] as const]
      : [],
  ),
);

export function validateOutfit(
  items: readonly string[],
  closet: readonly GearId[],
): OutfitResult {
  const problems: GearProblem[] = [];
  const valid: GearId[] = [];
  const seen = new Set<GearId>();
  const slots = new Map<GearSlot, GearId>();

  for (const raw of items) {
    const entry = catalog.get(raw);
    if (!entry) {
      problems.push({ kind: "unknown", item: raw });
      continue;
    }
    const { id: item, slot } = entry;
    if (seen.has(item)) {
      problems.push({ kind: "duplicate", item });
      continue;
    }
    seen.add(item);
    const before = problems.length;
    const by = slots.get(slot);
    if (by) problems.push({ kind: "slot_taken", item, slot, by });
    else slots.set(slot, item);
    if (!entry.available) problems.push({ kind: "unavailable", item });
    if (!closet.includes(item)) problems.push({ kind: "not_owned", item });
    if (problems.length === before) valid.push(item);
  }

  const [first, ...rest] = problems;
  return first
    ? { ok: false, problems: [first, ...rest] }
    : { ok: true, items: valid };
}
