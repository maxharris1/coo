import { beforeEach, describe, expect, it, vi } from "vitest";
import { log } from "@/server/log";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { geoHereGet } from "./get";

let deps: TestDeps;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  client = geoClient(deps, geoHereGet, "/api/geo/here");
});

describe("GET /api/geo/here", () => {
  it("refuses a request without a session", async () => {
    const { status, json } = await client.get({
      lat: "40.71427",
      lon: "-73.96143",
    });
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });

  it.each([
    [{ lat: "40.7", lon: "" }],
    [{ lat: "91", lon: "0" }],
    [{ lat: "0", lon: "-181" }],
    [{ lat: "north", lon: "0" }],
  ])("answers %j with 400 invalid", async (query) => {
    const { jar } = await client.signIn("(555) 123-4567");
    const { status, json } = await client.get(query, jar);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
  });

  it.each([
    [{ lat: "-16.8", lon: "-179.9975" }],
    [{ lat: "-16.8", lon: "179.9975" }],
  ])("answers the wrapped date-line point %j with 200", async (query) => {
    const { jar } = await client.signIn("(555) 123-4567");
    const { status } = await client.get(query, jar);
    expect(status).toBe(200);
  });

  it("returns the roost label and city, giving the geocoder only the snapped point", async () => {
    const reverse = vi.spyOn(deps.geocoder, "reverse");
    const logged = vi.spyOn(log, "info");
    const { jar } = await client.signIn("(555) 123-4567");
    const { status, json } = await client.get(
      { lat: "40.71427", lon: "-73.96143" },
      jar,
    );
    expect(status).toBe(200);
    expect(json).toEqual({
      place: { label: "Williamsburg", city: "New York, NY" },
      serverNow: deps.clock.now(),
    });
    expect(reverse).toHaveBeenCalledWith(40.714, -73.9625);
    expect(JSON.stringify(logged.mock.calls)).not.toMatch(/71427|96143/);
  });

  it("answers 200 with no place and the not-found message when the geocoder fails or knows nothing", async () => {
    const { jar } = await client.signIn("(555) 123-4567");
    const nowhere = await client.get({ lat: "0", lon: "0" }, jar);
    expect(nowhere.status).toBe(200);
    expect(nowhere.json).toMatchObject({
      place: null,
      message: "Could not find that place. Try a neighborhood or a city.",
    });

    vi.spyOn(deps.geocoder, "reverse").mockRejectedValue(new Error("down"));
    const failed = await client.get({ lat: "40.71427", lon: "-73.96143" }, jar);
    expect(failed.status).toBe(200);
    expect(failed.json.place).toBeNull();
  });
});
