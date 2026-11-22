import { z } from "zod";
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

export const DOODLE_COLORS = [
  "ink",
  "stamp",
  "tomato",
  "sun",
  "sky",
  "mint",
] as const;
export const DOODLE_WIDTHS = ["fine", "marker"] as const;

const limits = notes.doodle;

const coordinate = (max: number) => z.number().int().min(0).max(max);

const doodleSchema = z.strictObject({
  v: z.literal(1),
  w: z.literal(limits.width),
  h: z.literal(limits.height),
  strokes: z
    .array(
      z.strictObject({
        color: z.enum(DOODLE_COLORS),
        width: z.enum(DOODLE_WIDTHS),
        points: z
          .array(z.tuple([coordinate(limits.width), coordinate(limits.height)]))
          .min(1),
      }),
    )
    .min(1),
});

export type Doodle = z.infer<typeof doodleSchema>;

export type DoodleCheck =
  | { ok: true; doodle: Doodle }
  | {
      ok: false;
      reason: "invalid" | "too_big" | "too_many_strokes" | "too_many_points";
    };

export type NoteCheck =
  | { ok: true; body: string; length: number; doodle: Doodle | null }
  | { ok: false; reason: "empty" }
  | { ok: false; reason: "too_long"; length: number; limit: number }
  | {
      ok: false;
      reason: "doodle";
      doodle: Extract<DoodleCheck, { ok: false }>["reason"];
    };

function jsonBytes(input: unknown): number | null {
  try {
    const json = JSON.stringify(input);
    return json === undefined ? null : new TextEncoder().encode(json).length;
  } catch {
    return null;
  }
}

export function validateDoodle(input: unknown): DoodleCheck {
  const bytes = jsonBytes(input);
  if (bytes === null) return { ok: false, reason: "invalid" };
  if (bytes > limits.maxBytes) return { ok: false, reason: "too_big" };
  const parsed = doodleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { strokes } = parsed.data;
  if (strokes.length > limits.maxStrokes) {
    return { ok: false, reason: "too_many_strokes" };
  }
  const points = strokes.reduce((n, s) => n + s.points.length, 0);
  if (points > limits.maxPoints)
    return { ok: false, reason: "too_many_points" };
  return { ok: true, doodle: parsed.data };
}

export function validateNote(
  note: { body: string; doodle?: unknown },
  limit: number,
): NoteCheck {
  let doodle: Doodle | null = null;
  if (note.doodle !== undefined && note.doodle !== null) {
    const check = validateDoodle(note.doodle);
    if (!check.ok) return { ok: false, reason: "doodle", doodle: check.reason };
    doodle = check.doodle;
  }
  const body = note.body.trim();
  const length = [...body].length;
  if (length === 0 && doodle === null) return { ok: false, reason: "empty" };
  if (length > limit) return { ok: false, reason: "too_long", length, limit };
  return { ok: true, body, length, doodle };
}
