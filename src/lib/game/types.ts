export const breedIds = [
  "city",
  "fantail",
  "pouter",
  "frillback",
  "jacobin",
  "king",
  "tumbler",
] as const;
export type BreedId = (typeof breedIds)[number];

export const gearIds = [
  "goggles",
  "beanie",
  "rainhat",
  "cap",
  "party",
  "earmuffs",
  "nightgoggles",
  "scarf",
  "bow",
  "bandana",
  "band",
  "bell",
  "tube",
  "booties",
  "backpack",
] as const;
export type GearId = (typeof gearIds)[number];

export const gearSlots = ["head", "neck", "leg", "back"] as const;
export type GearSlot = (typeof gearSlots)[number];

export type BirdStatus = "home" | "scheduled" | "flying" | "visiting" | "busy";
