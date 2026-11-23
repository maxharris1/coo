import { describe, expect, it } from "vitest";
import { LAST_PAGE_KEY, lastPage, rememberPage } from "./lastPage";

function fakeStorage(seed: Record<string, string> = {}) {
  const items = new Map(Object.entries(seed));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe("rememberPage", () => {
  it("stores the pathname under the one key", () => {
    const store = fakeStorage();
    rememberPage("/flights", store);
    expect([...store.items]).toEqual([[LAST_PAGE_KEY, "/flights"]]);
  });

  it.each([
    ["/flights?x=1#y", "/flights"],
    ["/flights/f1?token=abc", "/flights/f1"],
    ["/sill#top", "/sill"],
    ["/shop#a?b=1", "/shop"],
  ])("stores %s as %s, with no query or hash", (path, stored) => {
    const store = fakeStorage();
    rememberPage(path, store);
    expect(store.getItem(LAST_PAGE_KEY)).toBe(stored);
  });

  it.each(["/more", "/more/report-bug", "/more/anything/else", "/more?x=1"])(
    "leaves the earlier page in place on %s",
    (path) => {
      const store = fakeStorage({ [LAST_PAGE_KEY]: "/flights" });
      rememberPage(path, store);
      expect(store.getItem(LAST_PAGE_KEY)).toBe("/flights");
    },
  );

  it("still stores a page that only starts with the letters of more", () => {
    const store = fakeStorage();
    rememberPage("/morel", store);
    expect(store.getItem(LAST_PAGE_KEY)).toBe("/morel");
  });
});

describe("lastPage", () => {
  it("gives the stored page", () => {
    expect(lastPage(fakeStorage({ [LAST_PAGE_KEY]: "/sill" }))).toBe("/sill");
  });

  it("falls back to /more when nothing is stored", () => {
    expect(lastPage(fakeStorage())).toBe("/more");
  });

  it("round-trips through rememberPage", () => {
    const store = fakeStorage();
    rememberPage("/birds/b1?tab=closet", store);
    rememberPage("/more/report-bug", store);
    expect(lastPage(store)).toBe("/birds/b1");
  });
});
