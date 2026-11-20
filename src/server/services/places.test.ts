import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors";
import type { UserId } from "@/server/ports/auth";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { resolvePlace, searchPlaces } from "./places";

const ME = "11111111-1111-4111-8111-111111111111" as UserId;
const OTHER = "22222222-2222-4222-8222-222222222222" as UserId;

let deps: TestDeps;

beforeEach(async () => {
  deps = await makeTestDeps();
});

async function expectInvalid(promise: Promise<unknown>) {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await expect(promise).rejects.toMatchObject({ code: "invalid" });
}

describe("resolvePlace (ac-3)", () => {
  it("returns the held place with its snapped roost", async () => {
    const { results } = await searchPlaces(deps, ME, "Williamsburg");
    const place = await resolvePlace(deps, ME, results[0].placeId);
    expect(place).toMatchObject({
      roost: { lat: 40.708, lon: -73.9575 },
      label: "Williamsburg",
      sublabel: "Brooklyn, New York, NY",
      kind: "neighbourhood",
      city: "New York",
      region: "NY",
      countryCode: "US",
    });
  });

  it("stores only snapped coordinates in geo_cache", async () => {
    await searchPlaces(deps, ME, "Williamsburg");
    const rows = await deps.db.query<{ payload: unknown }>(
      "select payload from geo_cache",
    );
    expect(JSON.stringify(rows)).not.toMatch(/40\.7081|-73\.9571/);
  });

  it.each(["33333333-3333-4333-8333-333333333333", "not-a-uuid", ""])(
    "refuses the unknown placeId %j as invalid",
    async (placeId) => {
      await expectInvalid(resolvePlace(deps, ME, placeId));
    },
  );

  it("refuses someone else's placeId as invalid", async () => {
    const { results } = await searchPlaces(deps, OTHER, "Boston");
    await expectInvalid(resolvePlace(deps, ME, results[0].placeId));
  });

  it("holds a place for 10 minutes", async () => {
    const { results } = await searchPlaces(deps, ME, "Boston");
    deps.clock.advance(10 * 60_000);
    await expect(
      resolvePlace(deps, ME, results[0].placeId),
    ).resolves.toMatchObject({ label: "Boston" });
    deps.clock.advance(1);
    await expectInvalid(resolvePlace(deps, ME, results[0].placeId));
  });
});
