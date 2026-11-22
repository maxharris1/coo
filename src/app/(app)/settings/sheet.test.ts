import { describe, expect, it, vi } from "vitest";
import type { Me } from "@/server/rows";
import {
  CLOSED,
  nameProblem,
  sheetReducer,
  submitName,
  type Sheet,
  type SheetAction,
} from "./sheet";

const SETTINGS = {
  notifyLandedIn: true,
  notifyLandedOut: true,
  notifyDelays: true,
  notifyHungry: false,
  quietOn: true,
  quietStart: 22,
  quietEnd: 7,
  smsFallback: false,
} as Me["settings"];

const run = (state: Sheet, ...actions: SheetAction[]) =>
  actions.reduce(sheetReducer, state);

const nameSheet = (text: string): Sheet => ({
  kind: "name",
  text,
  error: null,
  busy: false,
});

describe("sheetReducer", () => {
  it("opens the quiet sheet with a draft of the saved quiet hours", () => {
    expect(run(CLOSED, { type: "openQuiet", settings: SETTINGS })).toEqual({
      kind: "quiet",
      draft: { quietOn: true, quietStart: 22, quietEnd: 7 },
    });
  });

  it("edits the quiet draft one field at a time", () => {
    const state = run(
      CLOSED,
      { type: "openQuiet", settings: SETTINGS },
      { type: "editQuiet", change: { quietOn: false } },
      { type: "editQuiet", change: { quietStart: 21 } },
    );
    expect(state).toEqual({
      kind: "quiet",
      draft: { quietOn: false, quietStart: 21, quietEnd: 7 },
    });
  });

  it("opens the name sheet with the current name", () => {
    expect(run(CLOSED, { type: "openName", name: "Max" })).toEqual(
      nameSheet("Max"),
    );
  });

  it("typing clears the error, a failure keeps the text", () => {
    const failed = run(
      nameSheet("Max"),
      { type: "type", text: "Maxine" },
      { type: "submitting" },
      { type: "failed", error: "Nope." },
    );
    expect(failed).toEqual({
      kind: "name",
      text: "Maxine",
      error: "Nope.",
      busy: false,
    });
    expect(run(failed, { type: "type", text: "Maxi" })).toEqual(
      nameSheet("Maxi"),
    );
  });

  it("marks the name sheet busy while submitting", () => {
    expect(run(nameSheet("Max"), { type: "submitting" })).toMatchObject({
      busy: true,
    });
  });

  it("closes from any sheet", () => {
    expect(run(nameSheet("Max"), { type: "close" })).toEqual(CLOSED);
    expect(
      run(CLOSED, { type: "openQuiet", settings: SETTINGS }, { type: "close" }),
    ).toEqual(CLOSED);
  });

  it("ignores a late name result once the sheet is closed", () => {
    expect(run(CLOSED, { type: "failed", error: "Nope." })).toEqual(CLOSED);
  });
});

describe("nameProblem", () => {
  const error = "Use 1 to 30 characters.";

  it("rejects an empty or blank name", () => {
    expect(nameProblem("")).toBe(error);
    expect(nameProblem("   ")).toBe(error);
  });

  it("allows 30 characters and rejects 31", () => {
    expect(nameProblem("a".repeat(30))).toBeNull();
    expect(nameProblem(` ${"a".repeat(30)} `)).toBeNull();
    expect(nameProblem("a".repeat(31))).toBe(error);
  });

  it("counts an emoji as one character", () => {
    expect("🐦".repeat(30).length).toBe(60);
    expect(nameProblem("🐦".repeat(30))).toBeNull();
    expect(nameProblem("🐦".repeat(31))).toBe(error);
  });
});

describe("submitName", () => {
  const start = (text: string) => {
    let state = nameSheet(text);
    const dispatch = (action: SheetAction) => {
      state = sheetReducer(state, action);
    };
    return { dispatch, state: () => state };
  };

  it("does not call the server for an invalid name, and keeps the text", async () => {
    const sheet = start("   ");
    const onRename = vi.fn(async () => null);
    await submitName("   ", onRename, sheet.dispatch);
    expect(onRename).not.toHaveBeenCalled();
    expect(sheet.state()).toEqual({
      kind: "name",
      text: "   ",
      error: "Use 1 to 30 characters.",
      busy: false,
    });
  });

  it("keeps the text and shows the server's message", async () => {
    const sheet = start("Bad word");
    await submitName(
      "Bad word",
      async () => "name: Invalid input",
      sheet.dispatch,
    );
    expect(sheet.state()).toEqual({
      kind: "name",
      text: "Bad word",
      error: "name: Invalid input",
      busy: false,
    });
  });

  it("is busy while the server answers", async () => {
    const sheet = start("Maxine");
    let busy: boolean | undefined;
    await submitName(
      "Maxine",
      async () => {
        busy = (sheet.state() as { busy: boolean }).busy;
        return null;
      },
      sheet.dispatch,
    );
    expect(busy).toBe(true);
  });

  it("sends the trimmed name and closes on success", async () => {
    const sheet = start("  Maxine ");
    const onRename = vi.fn(async () => null);
    await submitName("  Maxine ", onRename, sheet.dispatch);
    expect(onRename).toHaveBeenCalledWith("Maxine");
    expect(sheet.state()).toEqual(CLOSED);
  });
});
