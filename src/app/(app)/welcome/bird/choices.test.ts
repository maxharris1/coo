import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import {
  FIRST_BIRD,
  firstBird,
  initialFirstBird,
  onboardingBody,
  PRONOUNS,
  submitOnboarding,
} from "./choices";

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

  it("keeps everything typed when the request fails, and shows the error", () => {
    let s = firstBird(start, { type: "rename", name: "Gerry" });
    s = firstBird(s, { type: "yourName", name: "Max" });
    s = firstBird(s, { type: "send" });
    expect(s.sending).toBe(true);
    const failed = firstBird(s, { type: "failed", message: "name" });
    expect(failed).toMatchObject({
      name: "Gerry",
      yourName: "Max",
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
  it("sends only you and the first bird", () => {
    let s = firstBird(start, { type: "rename", name: "  Gerry " });
    s = firstBird(s, { type: "pronoun", pronoun: "he" });
    s = firstBird(s, { type: "yourName", name: " Max " });
    expect(onboardingBody(s, "America/New_York")).toEqual({
      name: "Max",
      timezone: "America/New_York",
      bird: { name: "Gerry", look: "gerald", pronoun: "he" },
    });
  });

  it("names a blank pigeon after the current look", () => {
    const blank = firstBird(start, { type: "rename", name: "   " });
    expect(onboardingBody(blank, "UTC").bird).toMatchObject({
      name: "Gerald",
      look: "gerald",
    });
    const onBrenda = firstBird(blank, { type: "step", by: 1 });
    expect(onboardingBody(onBrenda, "UTC").bird).toMatchObject({
      name: "Brenda",
      look: "brenda",
    });
  });
});

describe("submitOnboarding (ac-1)", () => {
  const body = onboardingBody(start, "UTC");

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
