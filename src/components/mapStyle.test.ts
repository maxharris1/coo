import type { StyleSpecification } from "maplibre-gl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { absoluteSprites, loadMapStyle } from "./mapStyle";

const ORIGIN = "https://coo.example";
const LIBERTY_SPRITE = "https://tiles.openfreemap.org/sprites/ofm_f384/ofm";

function style(sprite: StyleSpecification["sprite"]): StyleSpecification {
  return { version: 8, sources: {}, layers: [], ...(sprite && { sprite }) };
}

function serve(body: unknown, status = 200) {
  const fetch = vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => {
  vi.stubGlobal("window", { location: { origin: ORIGIN } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("makes a relative sprite URL absolute against the page origin", () => {
  expect(absoluteSprites(style("/map/sprite/coo"), ORIGIN).sprite).toBe(
    `${ORIGIN}/map/sprite/coo`,
  );
});

it("leaves an absolute sprite URL alone", () => {
  expect(absoluteSprites(style(LIBERTY_SPRITE), ORIGIN).sprite).toBe(
    LIBERTY_SPRITE,
  );
});

it("rewrites only the relative entry of a two-sprite array", () => {
  const sprites = [
    { id: "default", url: LIBERTY_SPRITE },
    { id: "coo", url: "/map/sprite/coo" },
  ];
  expect(absoluteSprites(style(sprites), ORIGIN).sprite).toEqual([
    { id: "default", url: LIBERTY_SPRITE },
    { id: "coo", url: `${ORIGIN}/map/sprite/coo` },
  ]);
});

it("keeps a style with no sprite as it is", () => {
  expect(absoluteSprites(style(undefined), ORIGIN)).toEqual(style(undefined));
});

it("fetches the style at the path and absolutises its sprites", async () => {
  const fetch = serve(style([{ id: "coo", url: "/map/sprite/coo" }]));
  const loaded = await loadMapStyle("/map/coo-night.style.json");
  expect(fetch).toHaveBeenCalledWith("/map/coo-night.style.json");
  expect(loaded.sprite).toEqual([
    { id: "coo", url: `${ORIGIN}/map/sprite/coo` },
  ]);
});

it("rejects when the style cannot be fetched", async () => {
  serve({}, 404);
  await expect(loadMapStyle("/map/missing.json")).rejects.toThrow(
    "map style /map/missing.json: 404",
  );
});
