import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { placeNames } from "./placeNames";

const BROOKLYN = { lat: 40.6782, lon: -73.9442 };
const PHILADELPHIA = { lat: 39.9526, lon: -75.1652 };

let deps: TestDeps;

beforeEach(async () => {
  deps = await makeTestDeps();
});

describe("placeNames", () => {
  it("names no places and asks the geocoder nothing", async () => {
    const search = vi.spyOn(deps.geocoder, "search");
    const reverse = vi.spyOn(deps.geocoder, "reverse");

    const names = await placeNames(deps, BROOKLYN, PHILADELPHIA);

    expect(names).toEqual({ deciles: [], events: {}, dest: null });
    expect(search).not.toHaveBeenCalled();
    expect(reverse).not.toHaveBeenCalled();
  });
});
