import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MapViewProps } from "@/components/MapView";
import { parseFake } from "./fakeFlight";
import DevMapPage from "./page";

const seen: MapViewProps[] = [];

vi.mock("@/components/MapView", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/MapView")>()),
  MapView: (props: MapViewProps) => {
    seen.push(props);
    return <div data-testid="map" />;
  },
}));

const render = async (params: Record<string, string | undefined>) =>
  renderToStaticMarkup(
    await DevMapPage({
      searchParams: Promise.resolve({ flight: "1", ...params }),
    }),
  );

const percent = (html: string) =>
  Number(html.match(/aria-valuenow="(\d+)"/)?.[1]);

beforeEach(() => {
  seen.length = 0;
});

describe("/dev/map?flight=1", () => {
  it("renders the real tracker 40% of the way from Brooklyn to Philadelphia by day", async () => {
    const html = await render({});
    expect(html).toContain('data-night="false"');
    expect(html).toContain('data-state="flying"');
    expect(percent(html)).toBe(40);
    expect(seen).toHaveLength(1);
    const map = seen[0];
    expect(map.preview).toBeFalsy();
    expect(map.from).toMatchObject({ lat: 40.6782, lon: -73.9442 });
    expect(map.to).toMatchObject({ lat: 39.9526, lon: -75.1652 });
    expect(map.loftLabel).toBe("Your loft");
    expect(map.sillLabel).toBe("Priya, Philadelphia");
    expect(map.bottomPadding).toBe(260);
    expect(map.controlsBottom, "the credit clears the card").toBe(260);
    expect(map.night).toBe(false);
    expect(map.bubbleLines).toEqual([
      "Flew over New Brunswick. Nobody waved.",
      "Making good time and knows it.",
      "Released from your loft. Looked back once.",
    ]);
  });

  it("forces night and moves the bird from the query", async () => {
    const html = await render({ night: "1", progress: "0.75" });
    expect(html).toContain('data-night="true"');
    expect(percent(html)).toBe(75);
    expect(seen[0].night).toBe(true);
  });

  it("renders the flights-list preview with preview=1", async () => {
    const html = await render({ preview: "1" });
    expect(html).not.toContain("<section");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      preview: true,
      bottomPadding: 0,
      night: false,
    });
  });

  it("clamps progress and falls back to 40% when it isn't a number", () => {
    expect(parseFake({ progress: "2" }).progress).toBe(1);
    expect(parseFake({ progress: "-1" }).progress).toBe(0);
    expect(parseFake({ progress: "soon" }).progress).toBe(0.4);
    expect(parseFake({ progress: "" }).progress).toBe(0.4);
  });
});
