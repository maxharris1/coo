import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { foundObjectFor, offersFor } from "@/lib/game/jobs";
import { localDate } from "@/lib/game/time";

const DAY = 86_400_000;
const seeds = Array.from({ length: 200 }, (_, i) => ({
  userId: `user-${i % 17}`,
  date: localDate(Date.UTC(2026, 0, 1) + i * DAY, "UTC"),
}));
const jobIds = config.jobs.jobs.map((j) => j.id);
const objectIds = config.foundObjects.objects.map((o) => o.id);

describe("offersFor", () => {
  it("offers two distinct catalog jobs", () => {
    for (const { userId, date } of seeds) {
      const ids = offersFor(userId, date).map((j) => j.id);
      expect(ids).toHaveLength(2);
      expect(new Set(ids).size).toBe(2);
      for (const id of ids) expect(jobIds).toContain(id);
    }
  });

  it("offers every catalog job on some day", () => {
    const offered = new Set(
      seeds.flatMap(({ userId, date }) =>
        offersFor(userId, date).map((j) => j.id),
      ),
    );
    expect([...offered].sort()).toEqual([...jobIds].sort());
  });

  it("gives equal outputs for equal inputs", () => {
    for (const { userId, date } of seeds) {
      expect(offersFor(userId, date)).toEqual(offersFor(userId, date));
    }
  });
});

describe("foundObjectFor", () => {
  const ids = Array.from({ length: 2000 }, (_, i) => `job-${i}`);

  it("never finds anything at chance 0 and always finds a catalog object at 1", () => {
    for (const id of ids.slice(0, 200)) {
      expect(foundObjectFor(id, 0)).toBeNull();
      expect(objectIds).toContain(foundObjectFor(id, 1)?.id);
    }
  });

  it("finds every catalog object for some source", () => {
    const found = new Set(ids.map((id) => foundObjectFor(id, 1)?.id));
    expect([...found].sort()).toEqual([...objectIds].sort());
  });

  it("finds an object about one time in four at chance 0.25", () => {
    const hits = ids.filter((id) => foundObjectFor(id, 0.25) !== null).length;
    expect(hits / ids.length).toBeGreaterThanOrEqual(0.2);
    expect(hits / ids.length).toBeLessThanOrEqual(0.3);
  });

  it("gives equal outputs for equal inputs", () => {
    for (const id of ids.slice(0, 200)) {
      expect(foundObjectFor(id, 0.25)).toEqual(foundObjectFor(id, 0.25));
    }
  });
});
