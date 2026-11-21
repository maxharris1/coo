import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DevMapPage from "./page";
import { PLACES, ZOOMS } from "./views";

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
  it("offers the three test places and six test zooms", () => {
    expect(PLACES.map((p) => p.label)).toEqual([
      "New York",
      "Rural Pennsylvania",
      "Cape Cod",
    ]);
    expect(ZOOMS).toEqual([3, 6, 9, 12, 15, 17]);
  });

  it("links every place at the chosen zoom and every zoom at the chosen place", async () => {
    const html = await render({ place: "cape-cod", zoom: "15" });
    expect(links(html).map((l) => [l.text, l.href])).toEqual([
      ["New York", "/dev/map?place=new-york&zoom=15"],
      ["Rural Pennsylvania", "/dev/map?place=rural-pa&zoom=15"],
      ["Cape Cod", "/dev/map?place=cape-cod&zoom=15"],
      ...ZOOMS.map((z) => [`${z}`, `/dev/map?place=cape-cod&zoom=${z}`]),
    ]);
  });

  it("marks the chosen place and zoom as current", async () => {
    const html = await render({ place: "rural-pa", zoom: "9" });
    expect(
      links(html)
        .filter((l) => l.current)
        .map((l) => l.text),
    ).toEqual(["Rural Pennsylvania", "9"]);
  });

  it("falls back to New York at zoom 3 for missing or unknown params", async () => {
    for (const params of [{}, { place: "mars", zoom: "8" }]) {
      const current = links(await render(params)).filter((l) => l.current);
      expect(current.map((l) => l.text)).toEqual(["New York", "3"]);
    }
  });

  it("names the view on the map", async () => {
    const html = await render({ place: "cape-cod", zoom: "17" });
    expect(html).toContain('aria-label="Day map of Cape Cod at zoom 17"');
  });
});
