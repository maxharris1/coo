import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import {
  FIRST_BIRD,
  firstBird,
  initialFirstBird,
  onboardingBody,
  PRONOUNS,
  roommateLook,
  submitOnboarding,
} from "./choices";
import { sameBirdName } from "@/lib/birdName";

const start = initialFirstBird();

describe("first bird choices", () => {
  it("offers the three starter looks from config with their names", () => {
    expect(FIRST_BIRD.looks.map((l) => l.look)).toEqual(
      config.game.start.looks,
    );
    expect(FIRST_BIRD.looks.map((l) => l.name)).toEqual([
      "Gerald",
      "Brenda",
      "Kevin",
    ]);
  });

  it("describes the first bird from config, not from the look", () => {
    expect(FIRST_BIRD.breed).toBe("City pigeon");
    expect(FIRST_BIRD.tags).toEqual(["45 mph", "Loyal", "Bread-motivated"]);
  });

  it("starts on Gerald, named Gerald", () => {
    expect(start).toMatchObject({ index: 0, name: "Gerald" });
  });

  it("offers he, she and they", () => {
    expect(PRONOUNS.map((p) => p.value)).toEqual(["he", "she", "they"]);
  });
});

describe("firstBird reducer", () => {
  it("steps through the looks and wraps both ways", () => {
    const next = firstBird(start, { type: "step", by: 1 });
    expect(next).toMatchObject({ index: 1, name: "Brenda" });
    const wrapped = firstBird(start, { type: "step", by: -1 });
    expect(wrapped).toMatchObject({ index: 2, name: "Kevin" });
    expect(firstBird(wrapped, { type: "step", by: 1 }).index).toBe(0);
  });

  it("keeps a typed name when the look changes", () => {
    const typed = firstBird(start, { type: "rename", name: "Pigeonface" });
    expect(firstBird(typed, { type: "step", by: 1 })).toMatchObject({
      index: 1,
      name: "Pigeonface",
    });
  });

  it("follows the look again once the name is cleared", () => {
    const cleared = firstBird(start, { type: "rename", name: "" });
    expect(firstBird(cleared, { type: "step", by: 1 }).name).toBe("Brenda");
  });

  it("shuffles to a different suggested name and keeps it across looks", () => {
    const names = config.quirks.defaultNames;
    for (const pick of [0, 0.25, 0.5, 0.999]) {
      const shuffled = firstBird(start, { type: "shuffle", pick });
      expect(names).toContain(shuffled.name);
      expect(shuffled.name).not.toBe("Gerald");
      expect(firstBird(shuffled, { type: "step", by: 1 }).name).toBe(
        shuffled.name,
      );
    }
  });

  it("picks a pronoun", () => {
    expect(firstBird(start, { type: "pronoun", pronoun: "she" }).pronoun).toBe(
      "she",
    );
  });
});

const adopted = (state = start) => firstBird(state, { type: "adopt" });

describe("roommate panel (ac-5)", () => {
  it("opens after the first panel with the next look, prefilled with its name", () => {
    const next = adopted();
    expect(next.panel).toBe("roommate");
    expect(roommateLook(next)).toEqual({ look: "brenda", name: "Brenda" });
    expect(next.roommate).toEqual({
      name: "Brenda",
      pronoun: "they",
      named: false,
    });
  });

  it("pairs the last look with the first, as the server does", () => {
    const onKevin = firstBird(start, { type: "step", by: -1 });
    expect(roommateLook(adopted(onKevin)).look).toBe("gerald");
    expect(adopted(onKevin).roommate.name).toBe("Gerald");
  });

  it("keeps a typed roommate name when going back and changing look", () => {
    const typed = firstBird(adopted(), { type: "roommate", name: "Pidge" });
    const back = firstBird(typed, { type: "back" });
    expect(back.panel).toBe("bird");
    const again = adopted(firstBird(back, { type: "step", by: 1 }));
    expect(again.roommate.name).toBe("Pidge");
  });

  it("keeps everything typed when the request fails, and shows the error", () => {
    let s = adopted(firstBird(start, { type: "rename", name: "Gerry" }));
    s = firstBird(s, { type: "yourName", name: "Max" });
    s = firstBird(s, { type: "send" });
    expect(s.sending).toBe(true);
    const failed = firstBird(s, { type: "failed", message: "name" });
    expect(failed).toMatchObject({
      panel: "roommate",
      name: "Gerry",
      yourName: "Max",
      roommate: { name: "Brenda" },
      sending: false,
      error: "name",
    });
    expect(firstBird(failed, { type: "yourName", name: "Maxi" }).error).toBe(
      "name",
    );
    expect(firstBird(failed, { type: "dismiss" }).error).toBeNull();
  });
});

describe("onboardingBody (ac-1)", () => {
  it("sends you and the first bird, with no roommate", () => {
    let s = firstBird(start, { type: "rename", name: "  Gerry " });
    s = firstBird(s, { type: "pronoun", pronoun: "he" });
    s = firstBird(s, { type: "yourName", name: " Max " });
    expect(onboardingBody(s, "America/New_York")).toEqual({
      name: "Max",
      timezone: "America/New_York",
      bird: { name: "Gerry", look: "gerald", pronoun: "he" },
    });
  });
});

describe("submitOnboarding (ac-1)", () => {
  const body = onboardingBody(adopted(), "UTC");

  it("posts the body as JSON to /api/onboarding", async () => {
    const calls: [string, RequestInit][] = [];
    const result = await submitOnboarding(body, async (url, init) => {
      calls.push([String(url), init ?? {}]);
      return Response.json({ me: {}, birds: [] });
    });
    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0];
    expect(url).toBe("/api/onboarding");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(JSON.parse(String(init.body))).toEqual(body);
    expect(JSON.parse(String(init.body))).not.toHaveProperty("secondBird");
  });

  it("returns the API's error message", async () => {
    const result = await submitOnboarding(body, async () =>
      Response.json(
        { error: { code: "invalid", message: "name" } },
        { status: 400 },
      ),
    );
    expect(result).toEqual({ ok: false, message: "name" });
  });

  it("returns a fallback message when the request cannot be made", async () => {
    const result = await submitOnboarding(body, async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(result.ok).toBe(false);
    expect(result.ok || result.message).toMatch(/\S/);
  });
});

describe("the roommate never shares the first bird's name (#695)", () => {
  const onLook = (index: number) =>
    Array.from({ length: index }).reduce<typeof start>(
      (s) => firstBird(s, { type: "step", by: 1 }),
      start,
    );

  it("starting on Kevin with the first bird named Gerald gives a roommate that is not Gerald", () => {
    const kevin = firstBird(start, { type: "step", by: -1 });
    expect(kevin.index).toBe(2);
    const named = firstBird(kevin, { type: "rename", name: "Gerald" });

    const adopted = firstBird(named, { type: "adopt" });

    expect(adopted.name).toBe("Gerald");
    expect(sameBirdName(adopted.roommate.name, "Gerald")).toBe(false);
    expect(adopted.roommate.name.trim()).not.toBe("");
  });

  it.each(FIRST_BIRD.looks.map((_, i) => i))(
    "on look %i, naming the first bird after the roommate look gives a different roommate",
    (index) => {
      const onIt = onLook(index);
      expect(onIt.index).toBe(index);
      const clash = roommateLook(onIt).name.toUpperCase();
      const named = firstBird(onIt, { type: "rename", name: ` ${clash} ` });

      const adopted = firstBird(named, { type: "adopt" });

      expect(sameBirdName(adopted.roommate.name, clash)).toBe(false);
    },
  );

  it("keeps the roommate look's name when it does not clash", () => {
    const adopted = firstBird(start, { type: "adopt" });
    expect(adopted.roommate.name).toBe(roommateLook(start).name);
  });

  it("shuffle never lands on the roommate's name or the current name", () => {
    const withRoommate = firstBird(start, { type: "roommate", name: "pickle" });
    for (let i = 0; i < 200; i++) {
      const pick = i / 200;
      const { name } = firstBird(withRoommate, { type: "shuffle", pick });
      expect(sameBirdName(name, "Pickle")).toBe(false);
      expect(sameBirdName(name, start.name)).toBe(false);
    }
  });
});
