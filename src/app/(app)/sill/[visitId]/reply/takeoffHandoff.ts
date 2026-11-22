import type { Pronoun } from "@/lib/format";

export type TakeoffHandoff = { flightId: string; pronoun: Pronoun };

const isPronoun = (v: unknown): v is Pronoun =>
  v === "he" || v === "she" || v === "they";
const key = (visitId: string) => `coo.sill.takeoff.${visitId}`;

export function saveHandoff(visitId: string, h: TakeoffHandoff): void {
  try {
    sessionStorage.setItem(key(visitId), JSON.stringify(h));
  } catch {
    return;
  }
}

export function readHandoff(visitId: string): TakeoffHandoff | null {
  try {
    const raw = sessionStorage.getItem(key(visitId));
    const h = raw ? (JSON.parse(raw) as Partial<TakeoffHandoff>) : null;
    return h && typeof h.flightId === "string" && isPronoun(h.pronoun)
      ? { flightId: h.flightId, pronoun: h.pronoun }
      : null;
  } catch {
    return null;
  }
}
