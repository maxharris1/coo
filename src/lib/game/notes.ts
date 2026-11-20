import { config } from "@/lib/config";
import type { Wearer } from "@/lib/game/seeds";

export type BodyCheck =
  | { ok: true; body: string; length: number }
  | { ok: false; reason: "empty" }
  | { ok: false; reason: "too_long"; length: number; limit: number };

const notes = config.game.notes;

export function noteLimit(bird: Wearer): number {
  const limit = bird.gear.includes("tube") ? notes.tubeLimit : notes.baseLimit;
  return limit * (bird.breed === "pouter" ? notes.pouterMultiplier : 1);
}

export function validateBody(text: string, limit: number): BodyCheck {
  const body = text.trim();
  const length = [...body].length;
  if (length === 0) return { ok: false, reason: "empty" };
  if (length > limit) return { ok: false, reason: "too_long", length, limit };
  return { ok: true, body, length };
}
