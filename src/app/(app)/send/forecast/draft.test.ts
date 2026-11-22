import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDraft, readDraft, saveDraft } from "./draft";

const store = new Map<string, string>();
const DRAFT = { friendId: "u2", birdId: "b1", body: "Dinner Saturday?" };

beforeEach(() => {
  store.clear();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("forecast draft", () => {
  it("round-trips per friend", () => {
    saveDraft(DRAFT);
    expect(readDraft("u2")).toEqual(DRAFT);
    expect(readDraft("u3")).toBeNull();
  });

  it("keeps the latest note", () => {
    saveDraft(DRAFT);
    saveDraft({ ...DRAFT, birdId: "b2", body: "Lunch instead?" });
    expect(readDraft("u2")).toEqual({
      friendId: "u2",
      birdId: "b2",
      body: "Lunch instead?",
    });
  });

  it("clears only that friend's draft", () => {
    saveDraft(DRAFT);
    saveDraft({ ...DRAFT, friendId: "u3" });
    clearDraft("u2");
    expect(readDraft("u2")).toBeNull();
    expect(readDraft("u3")).toEqual({ ...DRAFT, friendId: "u3" });
  });

  it("ignores a garbled or mismatched entry", () => {
    saveDraft(DRAFT);
    const [k] = store.keys();
    store.set(k, "{nope");
    expect(readDraft("u2")).toBeNull();
    store.set(k, '{"friendId":"u2","birdId":1,"body":"x"}');
    expect(readDraft("u2")).toBeNull();
    store.set(k, '{"friendId":"u3","birdId":"b1","body":"x"}');
    expect(readDraft("u2")).toBeNull();
  });

  it("is best-effort when storage is blocked", () => {
    const blocked = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    vi.stubGlobal("sessionStorage", {
      getItem: blocked,
      setItem: blocked,
      removeItem: blocked,
    });
    expect(() => saveDraft(DRAFT)).not.toThrow();
    expect(() => clearDraft("u2")).not.toThrow();
    expect(readDraft("u2")).toBeNull();
  });

  it("is best-effort when there is no storage at all", () => {
    vi.unstubAllGlobals();
    expect(() => saveDraft(DRAFT)).not.toThrow();
    expect(readDraft("u2")).toBeNull();
  });
});
