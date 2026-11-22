import { snap, type Point } from "@/lib/game/privacy";
import type { PlaceResult } from "../../welcome/loft/roost";
import { PREFILL_NAME_KEY } from "../recipients";
import { pinKey } from "../write/guest";

export const NAME_MAX = 30;

export const HELPER: Record<PlaceResult["kind"], string> = {
  neighbourhood: "A neighborhood is plenty",
  city: "Anywhere in the city",
  address: "Shown to nobody. Rounded to the nearest roost.",
};

export type Guest = { name: string; placeId: string };

export type Spot = { start: Point; pin: Point };

export type Picked = { placeId: string; label: string; spot: Spot | null };

export type Search =
  | { kind: "idle" }
  | { kind: "loading"; query: string }
  | { kind: "results"; query: string; results: PlaceResult[] }
  | { kind: "failed"; query: string };

export type Settled = Extract<Search, { kind: "results" | "failed" }>;

export function takePrefillName(
  storage: Pick<Storage, "getItem" | "removeItem">,
): string {
  const name = storage.getItem(PREFILL_NAME_KEY);
  storage.removeItem(PREFILL_NAME_KEY);
  return (name ?? "").trim().slice(0, NAME_MAX);
}

export function canGoNext(name: string, placeId: string | null): boolean {
  return name.trim() !== "" && placeId !== null;
}

export function nextHref({ name, placeId }: Guest): string {
  return `/send/write?${new URLSearchParams({ guest: name.trim(), place: placeId })}`;
}

export function savePin(
  storage: Pick<Storage, "setItem" | "removeItem">,
  placeId: string,
  { start, pin }: Spot,
): void {
  const from = snap(start.lat, start.lon);
  const to = snap(pin.lat, pin.lon);
  if (to.lat === from.lat && to.lon === from.lon) {
    storage.removeItem(pinKey(placeId));
  } else {
    storage.setItem(pinKey(placeId), JSON.stringify(to));
  }
}

export function steps(name: string): { heading: string; lines: string[] } {
  const who = name.trim();
  return {
    heading: who ? `How ${who} gets it` : "How they get it",
    lines: [
      "You write the note and release a bird, same as always.",
      "We hand you a private link to text them.",
      "They watch the flight. The note opens when the bird lands.",
    ],
  };
}

export function searchFor(query: string, settled: Settled | null): Search {
  const q = query.trim();
  if (!q) return { kind: "idle" };
  return settled?.query === q ? settled : { kind: "loading", query: q };
}

export function keepResultsFor(
  settled: Settled | null,
  label: string,
): Settled | null {
  return settled?.kind === "results"
    ? { ...settled, query: label.trim() }
    : settled;
}
