import { noteLimit, validateNote, type Note } from "@/lib/game/notes";
import type { Wearer } from "@/lib/game/seeds";
import { AppError } from "@/server/errors";

export type NoteInput = { body: string; doodle?: unknown };

export function readyNote(
  input: NoteInput,
  bird: Wearer,
  birdName?: string,
): Note {
  const checked = validateNote(input, noteLimit(bird));
  if (checked.ok) return { body: checked.body, doodle: checked.doodle };
  switch (checked.reason) {
    case "empty":
      throw new AppError("invalid", "body: write a note or add a doodle");
    case "too_long":
      throw new AppError(
        "invalid",
        birdName === undefined
          ? `body: ${checked.length} of ${checked.limit} characters`
          : `body: ${birdName} can carry ${checked.limit} characters, this note has ${checked.length}`,
      );
    case "doodle":
      throw new AppError("invalid", "doodle: that doodle can't be sent");
  }
}

export function doodleParam(note: Note): string | null {
  return note.doodle === null ? null : JSON.stringify(note.doodle);
}
