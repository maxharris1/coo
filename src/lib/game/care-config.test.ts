import { afterEach, expect, it, vi } from "vitest";
import { config } from "@/lib/config";

afterEach(() => {
  vi.doUnmock("@/lib/config");
  vi.resetModules();
});

it("reads the care maximum from config for the clamp and the bath", async () => {
  vi.resetModules();
  vi.doMock("@/lib/config", () => ({
    config: {
      ...config,
      game: { ...config.game, care: { ...config.game.care, full: 90 } },
    },
  }));
  const { bathDone, careAt, feed } = await import("@/lib/game/care");
  const at = Date.UTC(2026, 10, 19, 17, 0);
  const bird = {
    belly: 80,
    feathers: 12,
    energy: 85,
    careAtMs: at,
    lastFedAtMs: at,
    hungryNotified: false,
    status: "home" as const,
  };
  const owner = { hasBirdbath: false };
  expect(bathDone(bird, at, owner).feathers).toBe(90);
  expect(feed(bird, at, owner).belly).toBe(90);
  expect(careAt(bird, at + 3_600_000, owner).energy).toBe(90);
});
