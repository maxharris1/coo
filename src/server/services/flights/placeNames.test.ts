import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { placeNames } from "./placeNames";

const EAST_VILLAGE = { lat: 40.7306, lon: -73.9866 };
const PHILADELPHIA = { lat: 39.9526, lon: -75.1652 };
const EMPTY = { deciles: [], events: {}, dest: null };

let deps: TestDeps;

beforeEach(async () => {
  deps = await makeTestDeps();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("placeNames", () => {
  it("names all eleven deciles and the destination of a New York to Philadelphia flight", async () => {
    const names = await placeNames(deps, EAST_VILLAGE, PHILADELPHIA);

    expect(names.deciles).toHaveLength(11);
    for (const name of names.deciles) expect(name).toEqual(expect.any(String));
    expect(names.deciles[0]).toBe("New York, NY");
    expect(names.deciles[10]).toBe("Philadelphia, PA");
    expect(names.dest).toEqual({
      city: "Philadelphia",
      region: "PA",
      country: "United States",
    });
    expect(names.events).toEqual({});
    expect(JSON.parse(JSON.stringify(names))).toEqual(names);
  });

  it("returns the empty result when the geocoder is down", async () => {
    vi.spyOn(deps.geocoder, "reverse").mockRejectedValue(new Error("down"));

    await expect(
      placeNames(deps, EAST_VILLAGE, PHILADELPHIA),
    ).resolves.toEqual(EMPTY);
  });

  it("returns the empty result after two seconds when the geocoder hangs", async () => {
    vi.useFakeTimers();
    vi.spyOn(deps.geocoder, "reverse").mockReturnValue(new Promise(() => {}));

    const names = placeNames(deps, EAST_VILLAGE, PHILADELPHIA);
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(names).resolves.toEqual(EMPTY);
  });

  it("leaves out only the points whose lookup failed", async () => {
    const reverse = deps.geocoder.reverse.bind(deps.geocoder);
    let call = 0;
    vi.spyOn(deps.geocoder, "reverse").mockImplementation((lat, lon) =>
      call++ % 2 === 1 ? Promise.reject(new Error("down")) : reverse(lat, lon),
    );

    const names = await placeNames(deps, EAST_VILLAGE, PHILADELPHIA);

    expect(names.deciles).toHaveLength(11);
    names.deciles.forEach((name, i) => {
      if (i % 2 === 1) expect(name).toBeNull();
      else expect(name).toEqual(expect.any(String));
    });
    expect(names.dest?.city).toBe("Philadelphia");
  });
});
