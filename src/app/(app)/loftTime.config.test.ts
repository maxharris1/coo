import { afterEach, expect, it, vi } from "vitest";
import { config } from "@/lib/config";

afterEach(() => {
  vi.doUnmock("@/lib/config");
  vi.resetModules();
});

async function loftTimeWith(noLoftNight: {
  fromHour: number;
  untilHour: number;
}) {
  vi.resetModules();
  vi.doMock("@/lib/config", () => ({
    config: {
      ...config,
      loft: {
        ...config.loft,
        times: { ...config.loft.times, noLoftNight },
      },
    },
  }));
  const { loftTime } = await import("./loftTime");
  return (hour: number, minute: number) =>
    loftTime(Date.UTC(2026, 10, 25, hour, minute), null, "UTC");
}

it("reads the no-loft night hours from the loft time config", async () => {
  const lookAt = await loftTimeWith({ fromHour: 20, untilHour: 7 });
  expect([lookAt(19, 59), lookAt(20, 0), lookAt(6, 59), lookAt(7, 0)]).toEqual([
    "day",
    "night",
    "night",
    "day",
  ]);
});
