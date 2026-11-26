import type { StyleSpecification } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAP_STYLES, absoluteSprites, loadMapStyle } from "./mapStyle";

const ORIGIN = "https://preview.example.test";
const LIBERTY_SPRITE = "https://tiles.openfreemap.org/sprites/ofm_f384/ofm";

const style = (sprite?: StyleSpecification["sprite"]): StyleSpecification => ({
  version: 8,
  sources: {},
  layers: [],
  ...(sprite !== undefined && { sprite }),
});

describe("absoluteSprites", () => {
  it("makes a root-relative sprite absolute against the origin", () => {
    expect(absoluteSprites(style("/map/sprite/coo"), ORIGIN).sprite).toBe(
      `${ORIGIN}/map/sprite/coo`,
    );
  });

  it("leaves an absolute sprite alone", () => {
    expect(absoluteSprites(style(LIBERTY_SPRITE), ORIGIN).sprite).toBe(
      LIBERTY_SPRITE,
    );
  });

  it("leaves a protocol-relative sprite alone", () => {
    expect(absoluteSprites(style("//cdn.test/s"), ORIGIN).sprite).toBe(
      "//cdn.test/s",
    );
  });

  it("rewrites only the relative entry of a two-sprite array", () => {
    const out = absoluteSprites(
      style([
        { id: "default", url: LIBERTY_SPRITE },
        { id: "coo", url: "/map/sprite/coo" },
      ]),
      ORIGIN,
    );
    expect(out.sprite).toEqual([
      { id: "default", url: LIBERTY_SPRITE },
      { id: "coo", url: `${ORIGIN}/map/sprite/coo` },
    ]);
  });

  it("returns a style with no sprite unchanged", () => {
    const s = style();
    expect(absoluteSprites(s, ORIGIN)).toBe(s);
  });
});

describe("loadMapStyle", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { location: { origin: ORIGIN } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the style and absolutises its sprites", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify(
            style([
              { id: "default", url: LIBERTY_SPRITE },
              { id: "coo", url: "/map/sprite/coo" },
            ]),
          ),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const loaded = await loadMapStyle(MAP_STYLES.day);
    expect(fetchMock).toHaveBeenCalledWith("/map/coo-day.style.json");
    expect(loaded.sprite).toEqual([
      { id: "default", url: LIBERTY_SPRITE },
      { id: "coo", url: `${ORIGIN}/map/sprite/coo` },
    ]);
  });

  it("rejects when the style cannot be fetched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("gone", { status: 404 })),
    );
    await expect(loadMapStyle(MAP_STYLES.night)).rejects.toThrow(
      "Map style /map/coo-night.style.json answered 404",
    );
  });

  it("rejects when the network fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    await expect(loadMapStyle(MAP_STYLES.day)).rejects.toThrow("offline");
  });
});
