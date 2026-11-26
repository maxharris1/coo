import { afterEach, expect, it, vi } from "vitest";
import { config } from "@/lib/config";

const STAR = /<path [^>]*fill="#FFFBF0" style="animation: coo-twinkle /g;

afterEach(() => {
  vi.doUnmock("@/lib/config");
  vi.resetModules();
});

async function nightSkyWith(loft: typeof config.loft) {
  vi.resetModules();
  vi.doMock("@/lib/config", () => ({ config: { ...config, loft } }));
  const { sky } = await import("./loftArt");
  return sky(loft.times.night, false);
}

it("draws as many night stars as the loft config lists", async () => {
  const markup = await nightSkyWith({
    ...config.loft,
    stars: [...config.loft.stars, { x: 310, y: 100 }],
    times: {
      ...config.loft.times,
      night: { ...config.loft.times.night, stars: 13 },
    },
  });
  expect([...markup.matchAll(STAR)]).toHaveLength(13);
  expect(markup).toContain('<path d="M310 ');
});

it("places night stars at the configured positions", async () => {
  const [first, ...rest] = config.loft.stars;
  const markup = await nightSkyWith({
    ...config.loft,
    stars: [{ ...first, x: 121 }, ...rest],
  });
  expect(markup).toContain('<path d="M121 ');
  expect(markup).not.toContain('<path d="M120 ');
});
