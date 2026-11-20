import { describe, expect, it } from "vitest";
import {
  CODE_LENGTH,
  RESEND_AFTER_MS,
  canResend,
  code,
  initialCode,
  isComplete,
  type CodeAction,
  type CodeState,
} from "./code";

const SENT_AT = 1_000_000;

const run = (...actions: CodeAction[]): CodeState =>
  actions.reduce(code, initialCode(SENT_AT));

const typed = (index: number, text: string): CodeAction => ({
  type: "typed",
  index,
  text,
});

describe("code entry", () => {
  it("starts with six empty boxes, no message and not complete", () => {
    const state = initialCode(SENT_AT);
    expect(CODE_LENGTH).toBe(6);
    expect(state.digits).toEqual(["", "", "", "", "", ""]);
    expect(state.message).toBeNull();
    expect(isComplete(state)).toBe(false);
  });

  it("fills one box per typed digit and completes only at the sixth", () => {
    let state = initialCode(SENT_AT);
    for (const [index, digit] of [..."12345"].entries()) {
      state = code(state, typed(index, digit));
      expect(isComplete(state)).toBe(false);
    }
    state = code(state, typed(5, "6"));
    expect(state.digits).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(isComplete(state)).toBe(true);
  });

  it("ignores anything that is not a digit", () => {
    expect(run(typed(0, "a")).digits).toEqual(["", "", "", "", "", ""]);
    expect(run(typed(0, " ")).digits[0]).toBe("");
  });

  it("spreads a pasted code across the boxes from the one pasted into", () => {
    const state = run(typed(0, "123456"));
    expect(state.digits).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(isComplete(state)).toBe(true);
  });

  it("drops spaces and dashes from a paste and stops at the last box", () => {
    expect(run(typed(0, "123-456")).digits.join("")).toBe("123456");
    expect(run(typed(0, " 12 34 56 ")).digits.join("")).toBe("123456");
    expect(run(typed(3, "98765")).digits).toEqual(["", "", "", "9", "8", "7"]);
  });

  it("replaces the digit already in a box", () => {
    expect(run(typed(2, "4"), typed(2, "7")).digits[2]).toBe("7");
  });

  it("erases one box and is no longer complete", () => {
    const state = run(typed(0, "123456"), { type: "erased", index: 3 });
    expect(state.digits).toEqual(["1", "2", "3", "", "5", "6"]);
    expect(isComplete(state)).toBe(false);
  });

  it("is not complete while the code is being checked, and ignores typing then", () => {
    const checking = run(typed(0, "123456"), { type: "checking" });
    expect(isComplete(checking)).toBe(false);
    expect(code(checking, typed(0, "9"))).toBe(checking);
    expect(code(checking, { type: "erased", index: 0 })).toBe(checking);
  });

  it("clears the digits and keeps the message after a failed check", () => {
    const message = "That's not it. Try once more.";
    const failed = run(
      typed(0, "123456"),
      { type: "checking" },
      { type: "failed", message },
    );
    expect(failed.digits).toEqual(["", "", "", "", "", ""]);
    expect(failed.message).toBe(message);
    expect(isComplete(failed)).toBe(false);

    const retyping = code(failed, typed(0, "1"));
    expect(retyping.message).toBe(message);

    const again = code(retyping, typed(1, "23456"));
    expect(isComplete(again)).toBe(true);
  });

  it("drops the old message when the next try is checked", () => {
    const state = run(
      typed(0, "123456"),
      { type: "checking" },
      { type: "failed", message: "That's not it. Try once more." },
      typed(0, "000000"),
      { type: "checking" },
    );
    expect(state.message).toBeNull();
  });
});

describe("resending the code", () => {
  it("waits 30 seconds, from docs/07", () => {
    expect(RESEND_AFTER_MS).toBe(30_000);
  });

  it("allows a resend at 30 000 ms after sending, not at 29 999 ms", () => {
    const state = initialCode(SENT_AT);
    expect(canResend(state, SENT_AT)).toBe(false);
    expect(canResend(state, SENT_AT + 29_999)).toBe(false);
    expect(canResend(state, SENT_AT + 30_000)).toBe(true);
    expect(canResend(state, SENT_AT + 90_000)).toBe(true);
  });

  it("restarts the wait and clears the boxes and message when the code is sent again", () => {
    const resentAt = SENT_AT + 45_000;
    const state = run(
      typed(0, "12"),
      { type: "checking" },
      { type: "failed", message: "That's not it. Try once more." },
      typed(0, "12"),
      { type: "resent", now: resentAt },
    );
    expect(state.digits).toEqual(["", "", "", "", "", ""]);
    expect(state.message).toBeNull();
    expect(canResend(state, resentAt + 29_999)).toBe(false);
    expect(canResend(state, resentAt + 30_000)).toBe(true);
  });
});
