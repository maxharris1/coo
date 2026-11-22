import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { snap, type Point } from "@/lib/game/privacy";
import { photon } from "@/server/adapters/photon";
import type { UserId } from "@/server/ports/auth";
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
});
