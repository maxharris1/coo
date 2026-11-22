import { describe, expect, it } from "vitest";
import type { PlaceResult } from "../../welcome/loft/roost";
import { PREFILL_NAME_KEY } from "../recipients";
import {
  canGoNext,
  HELPER,
  nextHref,
  searchFor,
  steps,
  takePrefillName,
  type Settled,
} from "./newRecipient";

const fakeStorage = (seed: Record<string, string> = {}) => {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    removeItem: (key: string) => void map.delete(key),
  };
};

const FISHTOWN: PlaceResult = {
  placeId: "p1",
  label: "Fishtown, Philadelphia",
  sublabel: "Philadelphia, PA",
  kind: "neighbourhood",
};

describe("takePrefillName (ac-4)", () => {
  it("returns the handed-off name trimmed and clears the key", () => {
    const storage = fakeStorage({ [PREFILL_NAME_KEY]: "  Maya Okafor " });
    expect(takePrefillName(storage)).toBe("Maya Okafor");
    expect(storage.getItem(PREFILL_NAME_KEY)).toBeNull();
  });

  it("returns an empty name when nothing was handed off", () => {
    expect(takePrefillName(fakeStorage())).toBe("");
  });

  it("cuts a long contact name to the 30 characters the server keeps", () => {
    const storage = fakeStorage({ [PREFILL_NAME_KEY]: "x".repeat(40) });
    expect(takePrefillName(storage)).toBe("x".repeat(30));
  });
});

describe("HELPER", () => {
  it("draws the mock's helper line for each kind of place", () => {
    expect(HELPER).toEqual({
      neighbourhood: "A neighborhood is plenty",
      city: "Anywhere in the city",
      address: "Shown to nobody. Rounded to the nearest roost.",
    });
  });
});

describe("canGoNext", () => {
  it("needs a name and a picked place", () => {
    expect(canGoNext("Maya", "p1")).toBe(true);
    expect(canGoNext("   ", "p1")).toBe(false);
    expect(canGoNext("Maya", null)).toBe(false);
  });
});

describe("nextHref", () => {
  it("carries the guest's name and place into Compose", () => {
    expect(nextHref({ name: "Maya", placeId: "p1" })).toBe(
      "/send/write?guest=Maya&place=p1",
    );
  });

  it("trims and encodes the name", () => {
    expect(nextHref({ name: " Maya Okafor ", placeId: "p 1" })).toBe(
      "/send/write?guest=Maya+Okafor&place=p+1",
    );
  });
});

describe("steps", () => {
  it("names the guest in the heading and speaks of them as they", () => {
    expect(steps("Maya")).toEqual({
      heading: "How Maya gets it",
      lines: [
        "You write the note and release a bird, same as always.",
        "We hand you a private link to text them.",
        "They watch the flight. The note opens when the bird lands.",
      ],
    });
  });

  it("falls back to they when no name is typed yet", () => {
    expect(steps("  ").heading).toBe("How they get it");
  });
});

describe("searchFor", () => {
  it("is idle with nothing to search", () => {
    expect(searchFor("  ", null)).toEqual({ kind: "idle" });
  });

  it("is loading until the answer for this query lands", () => {
    expect(searchFor("Fish", null)).toEqual({
      kind: "loading",
      query: "Fish",
    });
    expect(
      searchFor("Fishtown", {
        kind: "results",
        query: "Fish",
        results: [FISHTOWN],
      }),
    ).toEqual({ kind: "loading", query: "Fishtown" });
  });

  it("shows the answer that matches the trimmed query", () => {
    const found: Settled = {
      kind: "results",
      query: "Fish",
      results: [FISHTOWN],
    };
    expect(searchFor(" Fish ", found)).toEqual(found);
    const failed: Settled = { kind: "failed", query: "Fish" };
    expect(searchFor("Fish", failed)).toEqual(failed);
  });
});
