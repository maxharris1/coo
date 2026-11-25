import type { SyncPayload } from "@/components/sync";
import { config } from "@/lib/config";
import { isGearId } from "@/lib/game/gear";
import { gearSlots, type GearId, type GearSlot } from "@/lib/game/types";
import type { Outfit } from "@/server/rows";

export type ClosetBird = Pick<
  SyncPayload["birds"][number],
  "id" | "name" | "gear"
>;

export type Wardrobe = {
  bird: ClosetBird;
  closet: readonly string[];
};

type CellBase = { item: GearId; name: string; slot: GearSlot };

export type Cell =
  | (CellBase & { kind: "wearing" })
  | (CellBase & { kind: "owned" })
  | (CellBase & { kind: "store"; price: number });

type CatalogEntry = {
  id: GearId;
  slot: GearSlot;
  name: string;
  price: number;
  effect: string;
  available: boolean;
};

const slotOf = (v: string) => gearSlots.find((s) => s === v);

const catalog = new Map<string, CatalogEntry>(
  config.gear.items.flatMap(({ id, slot, name, price, effect, available }) => {
    const gearSlot = slotOf(slot);
    return isGearId(id) && gearSlot
      ? [[id, { id, slot: gearSlot, name, price, effect, available }] as const]
      : [];
  }),
);

function cellOf(w: Wardrobe, entry: CatalogEntry, owned: boolean): Cell {
  const base = { item: entry.id, name: entry.name, slot: entry.slot };
  if (w.bird.gear.includes(entry.id)) return { kind: "wearing", ...base };
  return owned
    ? { kind: "owned", ...base }
    : { kind: "store", ...base, price: entry.price };
}

export function closetCells(w: Wardrobe): Cell[] {
  return [...catalog.values()].flatMap((entry) => {
    const owned = w.closet.includes(entry.id);
    return entry.available || owned ? [cellOf(w, entry, owned)] : [];
  });
}

const wear = (worn: readonly GearId[], { item, slot }: Cell): GearId[] => [
  ...worn.filter((i) => catalog.get(i)?.slot !== slot),
  item,
];

export function pick(worn: readonly GearId[], cell: Cell): GearId[] | null {
  switch (cell.kind) {
    case "wearing":
      return worn.filter((i) => i !== cell.item);
    case "owned":
      return wear(worn, cell);
    case "store":
      return null;
  }
}

export function applyOutfit(w: Wardrobe, outfit: Outfit): GearId[] {
  const slots = new Set<GearSlot>();
  const items: GearId[] = [];
  for (const raw of outfit.items) {
    const entry = catalog.get(raw);
    if (!entry?.available || !w.closet.includes(entry.id)) continue;
    if (slots.has(entry.slot)) continue;
    slots.add(entry.slot);
    items.push(entry.id);
  }
  return items;
}

export function skippedNote(
  birdName: string,
  skipped: readonly string[],
): string | null {
  const names = skipped.map((id) => catalog.get(id)?.name ?? id);
  const last = names.pop();
  if (!last) return null;
  const list = names.length > 0 ? `${names.join(", ")} and ${last}` : last;
  return `${birdName} has the outfit on without the ${list}.`;
}

export const effectsFor = (worn: readonly GearId[]): string[] =>
  worn
    .flatMap((id) => catalog.get(id) ?? [])
    .sort((a, b) => gearSlots.indexOf(a.slot) - gearSlots.indexOf(b.slot))
    .map((entry) => entry.effect);
