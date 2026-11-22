import { describe, expect, it, vi } from "vitest";
import {
  STOCK_STYLE,
  initialLoft,
  loft,
  lookHere,
  saveLoft,
  searchPlaces,
  snappedPosition,
  townCentre,
} from "./roost";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const BROOKLYN = {
  lat: 40.714,
  lon: -73.9625,
  label: "Williamsburg",
  city: "Brooklyn, NY",
};

describe("loft state", () => {
  it("starts with nothing chosen", () => {
    expect(initialLoft()).toEqual({
      query: "",
      results: [],
      roost: null,
      pending: null,
      busy: false,
      error: null,
    });
  });

  it("keeps the typed search and clears old results when it changes", () => {
    const found = loft(initialLoft(), {
      type: "results",
      results: [
        {
          placeId: "p",
          label: "Williamsburg",
          sublabel: "Brooklyn, NY",
          kind: "neighbourhood",
        },
      ],
    });
    expect(found.results).toHaveLength(1);
    expect(loft(found, { type: "query", query: "Bush" })).toMatchObject({
      query: "Bush",
      results: [],
    });
  });

  it("shows a located roost and what 'This is home' will save", () => {
    const state = loft(loft(initialLoft(), { type: "busy" }), {
      type: "located",
      roost: BROOKLYN,
      pending: { lat: 40.714, lon: -73.9625 },
    });
    expect(state).toMatchObject({
      roost: BROOKLYN,
      pending: { lat: 40.714, lon: -73.9625 },
      busy: false,
      results: [],
    });
  });

  it("keeps the chosen roost and shows the error when a step fails", () => {
    const located = loft(initialLoft(), {
      type: "located",
      roost: BROOKLYN,
      pending: null,
    });
    const failed = loft(loft(located, { type: "busy" }), {
      type: "failed",
      message: "Nope",
    });
    expect(failed).toMatchObject({
      roost: BROOKLYN,
      busy: false,
      error: "Nope",
    });
    expect(loft(failed, { type: "dismiss" }).error).toBeNull();
  });
});

describe("snappedPosition", () => {
  it("snaps the browser's exact position before it leaves the page", () => {
    expect(
      snappedPosition({ latitude: 40.71427, longitude: -73.96143 }),
    ).toEqual({
      lat: 40.714,
      lon: -73.9625,
    });
  });
});

describe("loft api calls", () => {
  it("asks /api/geo/here with only the snapped position", async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, { place: { label: "Williamsburg", city: "Brooklyn, NY" } }),
    );
    const result = await lookHere({ lat: 40.714, lon: -73.9625 }, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/geo/here?lat=40.714&lon=-73.9625",
    );
    expect(result).toEqual({
      ok: true,
      data: { place: { label: "Williamsburg", city: "Brooklyn, NY" } },
    });
  });

  it("searches places by the typed text", async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, { results: [], message: "Could not find that place" }),
    );
    const result = await searchPlaces("Williams burg", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("/api/geo/search?q=Williams+burg");
    expect(result).toEqual({
      ok: true,
      data: { results: [], message: "Could not find that place" },
    });
  });

  it("passes on the try-again message when place search is unavailable", async () => {
    const message =
      "The map is slow to answer right now. Try again in a moment.";
    const fetchImpl = vi.fn(async () =>
      json(503, { error: { code: "unavailable", message } }),
    );
    expect(await searchPlaces("123 Bedford Avenue", fetchImpl)).toEqual({
      ok: false,
      message,
    });
  });

  it("posts the loft and returns the saved roost", async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, { loft: { ...BROOKLYN, travelling: false } }),
    );
    const result = await saveLoft({ placeId: "p" }, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("/api/loft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ placeId: "p" }),
    });
    expect(result).toEqual({ ok: true, data: { ...BROOKLYN, placeId: "p" } });
  });

  it("passes the API's error message through", async () => {
    const fetchImpl = vi.fn(async () =>
      json(400, {
        error: { code: "invalid", message: "placeId: unknown place" },
      }),
    );
    expect(await saveLoft({ placeId: "p" }, fetchImpl)).toEqual({
      ok: false,
      message: "placeId: unknown place",
    });
  });

  it("says the loft is unreachable when the network fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("offline");
    });
    expect(await lookHere({ lat: 1, lon: 1 }, fetchImpl)).toEqual({
      ok: false,
      message: "We could not reach the loft. Try again.",
    });
  });
});

describe("townCentre", () => {
  const LA_SOURCE = {
    lat: -20.902,
    lon: 55.48,
    label: "La Source",
    city: "Saint-Denis, France",
  };

  it("asks the loft for the selected roost's own town centre, never a city search", async () => {
    const fetchImpl = vi.fn<
      (url: string, init?: RequestInit) => Promise<Response>
    >(async () =>
      json(200, {
        loft: {
          lat: -20.8823,
          lon: 55.4504,
          label: "Saint-Denis",
          city: "Saint-Denis, France",
          travelling: false,
        },
      }),
    );
    const result = await townCentre(LA_SOURCE, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith("/api/loft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lat: -20.902, lon: 55.48, centre: true }),
    });
    expect(result).toEqual({
      ok: true,
      data: {
        lat: -20.8823,
        lon: 55.4504,
        label: "Saint-Denis",
        city: "Saint-Denis, France",
      },
    });
  });

  it("asks for the town centre of the place picked from search by its placeId", async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, { loft: { ...LA_SOURCE, travelling: false } }),
    );
    const picked = await saveLoft({ placeId: "p" }, fetchImpl);
    if (!picked.ok) throw new Error(picked.message);
    await townCentre(picked.data, fetchImpl);
    expect(fetchImpl).toHaveBeenLastCalledWith("/api/loft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ placeId: "p", centre: true }),
    });
  });

  it("passes the loft's message through when the town has no centre", async () => {
    const fetchImpl = vi.fn(async () =>
      json(400, {
        error: { code: "invalid", message: "Could not find that place" },
      }),
    );
    expect(await townCentre(LA_SOURCE, fetchImpl)).toEqual({
      ok: false,
      message: "Could not find that place",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("map preview", () => {
  it("uses OpenFreeMap's stock style", () => {
    expect(STOCK_STYLE).toBe("https://tiles.openfreemap.org/styles/liberty");
  });
});
