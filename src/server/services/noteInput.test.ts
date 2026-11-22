import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { AppError } from "@/server/errors";
import { readyNote, type NoteInput } from "./noteInput";

const limits = config.game.notes.doodle;
const plain = { breed: "city", gear: [] } as const;
const DOODLE = {
  v: 1,
  w: limits.width,
  h: limits.height,
  strokes: [
    {
      color: "ink",
      width: "fine",
      points: [
        [1, 2],
        [3, 4],
      ],
    },
  ],
};

function refusal(input: NoteInput, birdName?: string): AppError {
  try {
    readyNote(input, plain, birdName);
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error("expected readyNote to refuse");
}

describe("readyNote", () => {
  it.each<[string, NoteInput, { body: string; doodle: unknown }]>([
    ["text only", { body: "  hi  " }, { body: "hi", doodle: null }],
    [
      "text with a null doodle",
      { body: "hi", doodle: null },
      { body: "hi", doodle: null },
    ],
    ["doodle only", { body: "", doodle: DOODLE }, { body: "", doodle: DOODLE }],
    [
      "text and doodle",
      { body: "hi", doodle: DOODLE },
      { body: "hi", doodle: DOODLE },
    ],
  ])("readies %s", (_, input, note) => {
    expect(readyNote(input, plain)).toEqual(note);
  });

  it("refuses blank text with no doodle", () => {
    const error = refusal({ body: "  \n" });
    expect(error.code).toBe("invalid");
    expect(error.message).toBe("body: write a note or add a doodle");
  });

  it("counts characters against the bird's limit", () => {
    expect(refusal({ body: "a".repeat(141) }).message).toBe(
      "body: 141 of 140 characters",
    );
  });

  it("names the bird when given one", () => {
    expect(refusal({ body: "a".repeat(141) }, "Gerald").message).toBe(
      "body: Gerald can carry 140 characters, this note has 141",
    );
  });

  it.each<[string, unknown]>([
    ["an extra key", { ...DOODLE, extra: true }],
    [
      "a point off the canvas",
      {
        ...DOODLE,
        strokes: [{ ...DOODLE.strokes[0], points: [[limits.width + 1, 0]] }],
      },
    ],
    ["too many bytes", { ...DOODLE, pad: "x".repeat(limits.maxBytes) }],
  ])("refuses a doodle with %s without quoting it", (_, doodle) => {
    const error = refusal({ body: "secret words", doodle });
    expect(error.code).toBe("invalid");
    expect(error.message).toBe("doodle: that doodle can't be sent");
  });
});
