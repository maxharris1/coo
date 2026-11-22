import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { snap, type Point } from "@/lib/game/privacy";
import { photon } from "@/server/adapters/photon";
import type { UserId } from "@/server/ports/auth";
import type { Geocoder } from "@/server/ports/geocoder";
import { getGuestLink } from "@/server/services/guestLinks/get";
import { searchPlaces } from "@/server/services/places";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import { getFlight } from "./get";
import type { GuestSendResult } from "./guestSend";
import { listFlights } from "./list";
import { quote } from "./quote";
import { send } from "./send";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: PEPPER }),
}));

const PEPPER = "test-pepper";
const IP = "203.0.113.7";
const BODY = "Come see the new loft";
const WILLIAMSBURG_ROOST = { lat: 40.708, lon: -73.9575 };
const EAST_VILLAGE_PIN: Point = { lat: 40.731234567, lon: -73.986543219 };
const PIN_DIGITS = ["731234", "986543"];
const BOSTON_PIN: Point = { lat: 42.351234567, lon: -71.081234567 };

let deps: TestDeps;
let world: World;
let max: UserId;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  max = world.max.id as UserId;
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function heldPlace(): Promise<string> {
  const { results } = await searchPlaces(deps, max, "Williamsburg");
  return results[0].placeId;
}

async function sendTo(placeId: string, pin?: Point) {
  const result = (await send(deps, max, {
    body: BODY,
    sends: [
      {
        guest: { name: "Sam", placeId, ...(pin && { pin }) },
        birdId: world.max.birds[0].id,
      },
    ],
  })) as GuestSendResult;
  const url = result.guestLinks[0].url;
  return {
    flight: result.flights[0],
    token: url.slice(url.lastIndexOf("-") + 1),
  };
}

async function storedDestination(flightId: string) {
  const [row] = await deps.db.query<{
    to_lat: number;
    to_lon: number;
    to_label: string;
  }>("select to_lat, to_lon, to_label from flights where id = $1", [flightId]);
  return row;
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { code: string }).code;
  }
  return "resolved";
}

describe("a destination pin the sender places by hand", () => {
  it("stores the flight's destination exactly at the pin (ac-1)", async () => {
    const { flight } = await sendTo(await heldPlace(), EAST_VILLAGE_PIN);

    const stored = await storedDestination(flight.id);
    expect(stored.to_lat).toBe(EAST_VILLAGE_PIN.lat);
    expect(stored.to_lon).toBe(EAST_VILLAGE_PIN.lon);
    expect(flight.to).toEqual({ ...EAST_VILLAGE_PIN, label: "East Village" });
  });

  it("still flies to the snapped held place without a pin (ac-1)", async () => {
    const { flight } = await sendTo(await heldPlace());

    expect(await storedDestination(flight.id)).toEqual({
      to_lat: WILLIAMSBURG_ROOST.lat,
      to_lon: WILLIAMSBURG_ROOST.lon,
      to_label: "Williamsburg",
    });
  });

  it("quotes to the pin, labelled by the snapped pin's neighbourhood (ac-1, ac-2)", async () => {
    const placeId = await heldPlace();
    const pinned = await quote(deps, max, {
      recipients: [{ place: { placeId, pin: EAST_VILLAGE_PIN } }],
    });
    const held = await quote(deps, max, {
      recipients: [{ place: { placeId } }],
    });

    expect(pinned.recipients[0].to).toEqual({ label: "East Village" });
    expect(held.recipients[0].to).toEqual({ label: "Williamsburg" });
    expect(pinned.recipients[0].distanceMi).not.toBe(
      held.recipients[0].distanceMi,
    );
  });

  it("asks the geocoder only about the snapped pin (ac-2)", async () => {
    const reverse = vi.spyOn(deps.geocoder, "reverse");

    await sendTo(await heldPlace(), EAST_VILLAGE_PIN);

    const asked = reverse.mock.calls.map(([lat, lon]) => `${lat},${lon}`);
    const snapped = snap(EAST_VILLAGE_PIN.lat, EAST_VILLAGE_PIN.lon);
    expect(asked).toContain(`${snapped.lat},${snapped.lon}`);
    for (const point of asked)
      for (const digits of PIN_DIGITS) expect(point).not.toContain(digits);
  });

  it("keeps the pin's digits out of every log line and geo_cache row (ac-3)", async () => {
    const urls: string[] = [];
    deps.geocoder = photon({
      baseUrl: "https://photon.test",
      fetch: (async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return Response.json({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [-73.9866, 40.7306] },
              properties: {
                osm_key: "place",
                osm_value: "suburb",
                type: "district",
                name: "East Village",
                city: "New York",
                state: "New York",
                country: "United States",
                countrycode: "US",
              },
            },
          ],
        });
      }) as typeof fetch,
    })(deps.db, deps.clock) as TestDeps["geocoder"];
    const lines: string[] = [];
    for (const level of ["log", "info", "warn", "error", "debug"] as const)
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      });

    const placeId = (await searchPlaces(deps, max, "East Village")).results[0]
      .placeId;
    await quote(deps, max, {
      recipients: [{ place: { placeId, pin: EAST_VILLAGE_PIN } }],
    });
    const { flight } = await sendTo(placeId, EAST_VILLAGE_PIN);

    expect((await storedDestination(flight.id)).to_lat).toBe(
      EAST_VILLAGE_PIN.lat,
    );
    const cache = await deps.db.query<{ key: string; payload: unknown }>(
      "select key, payload from geo_cache",
    );
    expect(cache.length).toBeGreaterThan(0);
    const seen = [
      ...lines,
      ...urls,
      ...cache.map((row) => row.key + JSON.stringify(row.payload)),
    ].join("\n");
    for (const digits of PIN_DIGITS) expect(seen).not.toContain(digits);
  });

  it("labels the snapped pin, not a cached neighbour in the same reverse cell (ac-2)", async () => {
    const NEARBY_PIN: Point = { lat: 40.742123456, lon: -73.987654321 };
    const district = (name: string, lat: number, lon: number) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        osm_key: "place",
        osm_value: "suburb",
        type: "district",
        name,
        city: "New York",
        state: "New York",
        country: "United States",
        countrycode: "US",
      },
    });
    const urls: string[] = [];
    deps.geocoder = photon({
      baseUrl: "https://photon.test",
      fetch: (async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        urls.push(url.pathname + url.search);
        const lat = url.searchParams.get("lat");
        const feature =
          url.pathname === "/api"
            ? district("East Village", 40.7306, -73.9866)
            : lat === "40.742"
              ? district("Nearby District", 40.742, -73.9875)
              : district("Pin District", 40.732, -73.9875);
        return Response.json({
          type: "FeatureCollection",
          features: [feature],
        });
      }) as typeof fetch,
    })(deps.db, deps.clock) as TestDeps["geocoder"];
    const lines: string[] = [];
    for (const level of ["log", "info", "warn", "error", "debug"] as const)
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      });
    const placeId = (await searchPlaces(deps, max, "East Village")).results[0]
      .placeId;
    const quoteTo = async (pin: Point) =>
      (await quote(deps, max, { recipients: [{ place: { placeId, pin } }] }))
        .recipients[0].to;

    expect(await quoteTo(NEARBY_PIN)).toEqual({ label: "Nearby District" });
    expect(await quoteTo(EAST_VILLAGE_PIN)).toEqual({ label: "Pin District" });
    expect(urls.filter((u) => u.startsWith("/reverse"))).toEqual([
      "/reverse?lat=40.742&lon=-73.9875&limit=1&lang=en",
      "/reverse?lat=40.732&lon=-73.9875&limit=1&lang=en",
    ]);
    const { flight } = await sendTo(placeId, EAST_VILLAGE_PIN);

    expect(await storedDestination(flight.id)).toEqual({
      to_lat: EAST_VILLAGE_PIN.lat,
      to_lon: EAST_VILLAGE_PIN.lon,
      to_label: "Pin District",
    });
    const cache = await deps.db.query<{ key: string; payload: unknown }>(
      "select key, payload from geo_cache",
    );
    const seen = [
      ...lines,
      ...urls,
      ...cache.map((row) => row.key + JSON.stringify(row.payload)),
    ].join("\n");
    for (const digits of [...PIN_DIGITS, "742123", "987654"])
      expect(seen).not.toContain(digits);
  });

  it("shows the exact destination to the sender and the link holder only (ac-3)", async () => {
    const { flight, token } = await sendTo(await heldPlace(), EAST_VILLAGE_PIN);
    const exact = { ...EAST_VILLAGE_PIN, label: "East Village" };

    expect((await getFlight(deps, max, flight.id)).to).toEqual(exact);
    expect((await getGuestLink(deps, PEPPER, IP, token)).flight.to).toEqual(
      exact,
    );

    const friend = world.priya.id as UserId;
    const stranger = world.rosa.id as UserId;
    await deps.db.query(
      "delete from friendships where $1 in (a_id, b_id) and $2 in (a_id, b_id)",
      [max, stranger],
    );
    for (const viewer of [friend, stranger]) {
      expect(await refusal(getFlight(deps, viewer, flight.id))).toBe(
        "not_found",
      );
      const page = await listFlights(deps, {
        userId: viewer,
        timezone: "America/New_York",
      });
      expect(JSON.stringify(page)).not.toContain(flight.id);
      for (const digits of PIN_DIGITS)
        expect(JSON.stringify(page)).not.toContain(digits);
    }
  });

  describe.each<[string, Geocoder["reverse"], string]>([
    ["has no answer", async () => null, "invalid"],
    [
      "names only a country",
      async () => ({ country: "United States", countryCode: "US" }),
      "invalid",
    ],
    [
      "fails",
      async () => {
        throw new Error("photon down");
      },
      "unavailable",
    ],
  ])(
    "refuses a pin whose neighbourhood the geocoder %s (ac-2)",
    (_, reverse, code) => {
      beforeEach(() => {
        vi.spyOn(deps.geocoder, "reverse").mockImplementation(reverse);
      });

      it("refuses the quote rather than borrow the held place's label", async () => {
        const placeId = await heldPlace();

        expect(
          await refusal(
            quote(deps, max, {
              recipients: [{ place: { placeId, pin: BOSTON_PIN } }],
            }),
          ),
        ).toBe(code);
      });

      it("refuses the send and stores no flight", async () => {
        const placeId = await heldPlace();

        expect(await refusal(sendTo(placeId, BOSTON_PIN))).toBe(code);
        expect(
          await deps.db.query("select id from flights where to_lat = $1", [
            BOSTON_PIN.lat,
          ]),
        ).toEqual([]);
      });
    },
  );
});
