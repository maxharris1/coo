import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DevMapPage from "./page";
import { MODES, PLACES, ZOOMS } from "./views";

const render = async (params: Record<string, string | undefined>) =>
  renderToStaticMarkup(
    await DevMapPage({ searchParams: Promise.resolve(params) }),
  ).replaceAll("&amp;", "&");

const links = (html: string) =>
  [...html.matchAll(/<a ([^>]*)>([^<]*)<\/a>/g)].map(([, attrs, text]) => ({
    href: attrs.match(/href="([^"]*)"/)?.[1],
    current: attrs.includes('aria-current="true"'),
    text,
  }));

describe("/dev/map", () => {
  it("offers the three test places, six test zooms, day and night", () => {
    expect(PLACES.map((p) => p.label)).toEqual([
      "New York",
      "Rural Pennsylvania",
      "Cape Cod",
    ]);
    expect(ZOOMS).toEqual([3, 6, 9, 12, 15, 17]);
    expect(MODES).toEqual(["day", "night"]);
  });

  it("links every place, zoom and mode while keeping the rest of the view", async () => {
    const html = await render({ place: "cape-cod", zoom: "15", mode: "night" });
    expect(links(html).map((l) => [l.text, l.href])).toEqual([
      ["New York", "/dev/map?place=new-york&zoom=15&mode=night"],
      ["Rural Pennsylvania", "/dev/map?place=rural-pa&zoom=15&mode=night"],
      ["Cape Cod", "/dev/map?place=cape-cod&zoom=15&mode=night"],
      ...ZOOMS.map((z) => [
        `${z}`,
        `/dev/map?place=cape-cod&zoom=${z}&mode=night`,
      ]),
      ["Day", "/dev/map?place=cape-cod&zoom=15&mode=day"],
      ["Night", "/dev/map?place=cape-cod&zoom=15&mode=night"],
    ]);
  });

  it("marks the chosen place, zoom and mode as current", async () => {
    const html = await render({ place: "rural-pa", zoom: "9", mode: "night" });
    expect(
      links(html)
        .filter((l) => l.current)
        .map((l) => l.text),
    ).toEqual(["Rural Pennsylvania", "9", "Night"]);
  });

  it("falls back to New York at zoom 3 by day for missing or unknown params", async () => {
    for (const params of [{}, { place: "mars", zoom: "8", mode: "dusk" }]) {
      const current = links(await render(params)).filter((l) => l.current);
      expect(current.map((l) => l.text)).toEqual(["New York", "3", "Day"]);
    }
  });

  it("names the view on the map", async () => {
    const html = await render({ place: "cape-cod", zoom: "17" });
    expect(html).toContain('aria-label="Day map of Cape Cod at zoom 17"');
    const night = await render({
      place: "cape-cod",
      zoom: "17",
      mode: "night",
    });
    expect(night).toContain('aria-label="Night map of Cape Cod at zoom 17"');
  });
});
