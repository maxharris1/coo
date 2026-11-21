import { describe, expect, it, vi } from "vitest";
import type { Aviary } from "@/server/services/eggs";
import { aviaryTop, loadAviary } from "./aviary";

const BREEDS: Aviary["breeds"] = [
  {
    id: "city",
    name: "City",
    note: "",
    trait: "",
    hatchable: false,
    owned: true,
  },
  {
    id: "fantail",
    name: "Fantail",
    note: "",
    trait: "",
    hatchable: true,
    owned: false,
  },
  {
    id: "pouter",
    name: "Pouter",
    note: "",
    trait: "",
    hatchable: true,
    owned: false,
  },
];

function aviary(
  egg: Aviary["egg"],
  { total = 5, free = 1, hatched = true } = {},
): Aviary {
  return {
    perches: { total, free, birds: [] },
    egg,
    breeds: BREEDS.map((b) =>
      b.id === "pouter" ? { ...b, owned: hatched } : b,
    ),
  };
}

const egg = (
  status: "incubating" | "ready",
  deliveriesToGo: number,
  waitingForPerch = false,
) => ({ id: "egg-1", status, deliveriesToGo, waitingForPerch });

describe("aviaryTop", () => {
  it("counts used perches out of the total", () => {
    expect(aviaryTop(aviary(null, { total: 5, free: 1 })).perches).toBe(
      "4 of 5 perches",
    );
    expect(aviaryTop(aviary(null, { total: 3, free: 3 })).perches).toBe(
      "0 of 3 perches",
    );
  });

  it("spans a later egg over every 25 deliveries", () => {
    expect(aviaryTop(aviary(egg("incubating", 6))).egg).toEqual({
      kind: "incubating",
      toGo: 6,
      done: 19,
      span: 25,
    });
  });

  it("spans the first egg over the first 5 deliveries", () => {
    expect(
      aviaryTop(aviary(egg("incubating", 3), { hatched: false })).egg,
    ).toEqual({ kind: "incubating", toGo: 3, done: 2, span: 5 });
  });

  it("offers a hatch when the egg is ready and a perch is free", () => {
    expect(aviaryTop(aviary(egg("ready", 0))).egg).toEqual({ kind: "ready" });
  });

  it("waits for a perch when the egg is ready and none is free", () => {
    expect(
      aviaryTop(aviary(egg("ready", 0, true), { total: 5, free: 0 })).egg,
    ).toEqual({ kind: "waiting" });
  });

  it("draws no egg card when there is no open egg", () => {
    expect(aviaryTop(aviary(null)).egg).toBeNull();
  });
});

describe("loadAviary", () => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status });

  it("reads GET /api/aviary", async () => {
    const data = aviary(egg("ready", 0));
    const fetchImpl = vi.fn(async () => json(200, data));
    await expect(loadAviary(fetchImpl)).resolves.toEqual({ ok: true, data });
    expect(fetchImpl).toHaveBeenCalledWith("/api/aviary", {
      cache: "no-store",
    });
  });

  it("hands back the API's message when the load fails", async () => {
    const fetchImpl = async () =>
      json(401, { error: { code: "unauthorized", message: "Sign in first." } });
    await expect(loadAviary(fetchImpl)).resolves.toEqual({
      ok: false,
      message: "Sign in first.",
    });
  });

  it("says the loft is unreachable when the network fails", async () => {
    const fetchImpl = async (): Promise<Response> => {
      throw new TypeError("offline");
    };
    await expect(loadAviary(fetchImpl)).resolves.toEqual({
      ok: false,
      message: "We could not reach the loft. Try again.",
    });
  });
});
