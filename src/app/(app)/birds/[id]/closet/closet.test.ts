import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import {
  applyOutfit,
  closetCells,
  effectsFor,
  pick,
  type Cell,
  type ClosetBird,
  type Wardrobe,
} from "./closet";

const gerald: ClosetBird = {
  id: "g",
  name: "Gerald",
  gear: ["goggles", "bow"],
};

const wardrobe = (over: Partial<Wardrobe> = {}): Wardrobe => ({
  bird: gerald,
  closet: ["goggles", "bow", "bell", "band", "scarf", "beanie"],
  ...over,
});

const cellFor = (cells: Cell[], item: string) => {
  const cell = cells.find((c) => c.item === item);
  if (!cell) throw new Error(`no cell for ${item}`);
  return cell;
};

describe("closetCells (ac-1)", () => {
  const cells = closetCells(wardrobe());

  it("marks what this bird wears as Wearing", () => {
    expect(cellFor(cells, "goggles")).toMatchObject({
      kind: "wearing",
      name: "Aviator goggles",
      slot: "head",
    });
    expect(cellFor(cells, "bow").kind).toBe("wearing");
  });

  it("marks owned items nobody wears as Owned", () => {
    expect(cellFor(cells, "bell").kind).toBe("owned");
    expect(cellFor(cells, "beanie").kind).toBe("owned");
  });

  it("shows unowned items for sale at their config price", () => {
    const rainhat = config.gear.items.find((i) => i.id === "rainhat");
    expect(cellFor(cells, "rainhat")).toEqual({
      kind: "store",
      item: "rainhat",
      name: "Rain hat",
      slot: "head",
      price: rainhat?.price,
    });
  });

  it("lists available items in catalog order and leaves out unowned unavailable ones", () => {
    expect(cells.map((c) => c.item)).toEqual(
      config.gear.items.filter((i) => i.available).map((i) => i.id),
    );
  });
});

describe("pick (ac-1)", () => {
  const cells = closetCells(wardrobe());
  const tap = (item: string) => pick(gerald.gear, cellFor(cells, item));

  it("takes off an item the bird is wearing", () => {
    expect(tap("goggles")).toEqual(["bow"]);
  });

  it("puts on an owned item in an empty slot", () => {
    expect(tap("bell")).toEqual(["goggles", "bow", "bell"]);
  });

  it("swaps a second item in the same slot", () => {
    expect(tap("beanie")).toEqual(["bow", "beanie"]);
  });

  it("swaps the aviator goggles for owned night-vision goggles", () => {
    const owned = closetCells(
      wardrobe({ closet: [...wardrobe().closet, "nightgoggles"] }),
    );
    const cell = cellFor(owned, "nightgoggles");
    expect(cell).toMatchObject({
      kind: "owned",
      name: "Night-vision goggles",
      slot: "head",
    });
    expect(pick(gerald.gear, cell)).toEqual(["bow", "nightgoggles"]);
  });

  it("refuses a store item", () => {
    expect(tap("rainhat")).toBeNull();
  });
});

describe("applyOutfit (ac-2)", () => {
  const outfit = (items: string[]) => ({ id: "o", name: "Cold snap", items });

  it("selects the owned, free items in the outfit", () => {
    expect(applyOutfit(wardrobe(), outfit(["beanie", "bell"]))).toEqual([
      "beanie",
      "bell",
    ]);
  });

  it("keeps owned items in different slots", () => {
    expect(applyOutfit(wardrobe(), outfit(["goggles", "band"]))).toEqual([
      "goggles",
      "band",
    ]);
  });

  it("skips unowned items and unknown ids", () => {
    expect(
      applyOutfit(
        wardrobe(),
        outfit(["rainhat", "scarf", "bell", "backpack", "nope"]),
      ),
    ).toEqual(["scarf", "bell"]);
  });

  it("keeps the first item per slot", () => {
    expect(applyOutfit(wardrobe(), outfit(["beanie", "goggles"]))).toEqual([
      "beanie",
    ]);
  });
});

describe("effectsFor (ac-2)", () => {
  const effect = (id: string) =>
    config.gear.items.find((i) => i.id === id)?.effect;

  it("lists each worn item's effect from config/gear.json", () => {
    expect(effectsFor(["goggles", "bow"])).toEqual([
      effect("goggles"),
      effect("bow"),
    ]);
  });

  it("orders effects by slot", () => {
    expect(effectsFor(["band", "scarf", "beanie"])).toEqual([
      effect("beanie"),
      effect("scarf"),
      effect("band"),
    ]);
  });

  it("is empty when nothing is worn", () => {
    expect(effectsFor([])).toEqual([]);
  });
});
