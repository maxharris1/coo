import { describe, expect, it, vi } from "vitest";
import { holdLink, takeLink } from "./linkHandoff";

describe("link handoff", () => {
  it("hands a held link over once", () => {
    holdLink("f1", "https://x/b/abc");
    expect(takeLink("f1")).toBe("https://x/b/abc");
    expect(takeLink("f1")).toBeUndefined();
  });

  it("keeps links for different flights apart", () => {
    holdLink("f1", "https://x/b/one");
    holdLink("f2", "https://x/b/two");
    expect(takeLink("f2")).toBe("https://x/b/two");
    expect(takeLink("f1")).toBe("https://x/b/one");
  });

  it("has nothing for a flight it never held", () => {
    expect(takeLink("nope")).toBeUndefined();
  });

  it("never writes the link to session storage", () => {
    const setItem = vi.fn();
    vi.stubGlobal("sessionStorage", { setItem, getItem: vi.fn() });
    holdLink("f3", "https://x/b/abc");
    takeLink("f3");
    expect(setItem).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
