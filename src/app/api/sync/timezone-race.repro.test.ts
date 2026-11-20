import { NextRequest } from "next/server";
import { expect, it } from "vitest";
import { toE164 } from "@/lib/phone";
import type { Db } from "@/server/db";
import { createJsonRoute } from "@/server/http";
import { makeTestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { seedWorld } from "@/test/seedWorld";
import { syncGet } from "./get";

it("overlapping syncs using the same new timezone both return its current week", async () => {
  const deps = await makeTestDeps();
  const world = await seedWorld(deps.db, deps.clock.now());
  deps.clock.advance(Date.UTC(2026, 10, 23, 1) - deps.clock.now());
  await deps.db.query(
    "insert into punch_cards (user_id, week_start, deliveries, paid) values ($1, '2026-11-16', 7, false), ($1, '2026-11-23', 2, false)",
    [world.max.id],
  );
  const jar = new FakeJar();
  const phone = toE164("+15550000001");
  if (!phone) throw new Error("bad fixture phone");
  await deps.auth(jar).verifyCode(phone, "000000");
  const cookie = jar
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");

  let profileReads = 0;
  let releaseReads: () => void = () => {};
  const bothRead = new Promise<void>((resolve) => {
    releaseReads = resolve;
  });
  const db: Db = {
    async query<T>(sql: string, params?: unknown[]) {
      const rows = await deps.db.query<T>(sql, params);
      // Both requests have read the original caller profile before either update.
      if (/^select \* from profiles where id/.test(sql)) {
        profileReads += 1;
        if (profileReads === 2) releaseReads();
        await bothRead;
      }
      return rows;
    },
    tx: (fn) => deps.db.tx(fn),
  };
  const handler = syncGet(createJsonRoute(async () => ({ ...deps, db })));
  const request = () =>
    handler(
      new NextRequest("https://coo.test/api/sync", {
        headers: { cookie, "x-timezone": "Europe/London" },
      }),
    );
  const responses = await Promise.all([request(), request()]);
  const bodies = await Promise.all(responses.map((r) => r.json()));
  const [stored] = await deps.db.query<{ timezone: string }>(
    "select timezone from profiles where id = $1",
    [world.max.id],
  );
  expect(stored.timezone).toBe("Europe/London");
  for (const [i, body] of bodies.entries()) {
    expect(responses[i].status).toBe(200);
    expect(body.me.timezone).toBe("Europe/London");
    expect(body.punchCard).toMatchObject({
      weekStart: "2026-11-23",
      deliveries: 2,
    });
  }
});
