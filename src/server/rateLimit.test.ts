import { beforeEach, describe, expect, it } from "vitest";
import { rateLimit } from "./rateLimit";
import { AppError } from "./errors";
import { FakeClock } from "@/test/fakes/clock";
import { testDb } from "@/test/testDb";
import type { Db } from "./db";

const WINDOW_START = 1_800_000_000_000 - (1_800_000_000_000 % 60_000);

describe("rateLimit", () => {
  let db: Db;
  let clock: FakeClock;
  const hit = (key = "sms:+15550001111") => rateLimit(db, clock, key, 3, 60);

  beforeEach(async () => {
    db = await testDb();
    clock = new FakeClock(WINDOW_START + 1_000);
  });

  it("allows limit calls in a window and refuses the next", async () => {
    await hit();
    await hit();
    await hit();
    const refused = await hit().catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(AppError);
    expect(refused).toMatchObject({ code: "rate_limited", status: 429 });
  });

  it("counts each key on its own", async () => {
    for (let i = 0; i < 3; i++) await hit("a");
    await expect(hit("a")).rejects.toBeInstanceOf(AppError);
    await expect(hit("b")).resolves.toBeUndefined();
  });

  it("allows again in the next window", async () => {
    for (let i = 0; i < 3; i++) await hit();
    await expect(hit()).rejects.toBeInstanceOf(AppError);
    clock.advance(59_000);
    await expect(hit()).resolves.toBeUndefined();
  });

  it("keeps the same window until its boundary", async () => {
    for (let i = 0; i < 3; i++) await hit();
    clock.advance(58_999);
    await expect(hit()).rejects.toBeInstanceOf(AppError);
  });
});
