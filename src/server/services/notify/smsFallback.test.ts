import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { toE164 } from "@/lib/phone";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import {
  insertPlannedDelivery,
  type PlannedDelivery,
} from "@/test/fixtures/plannedFlight";
import { seedWorld, type Person, type World } from "@/test/seedWorld";
import { notify } from "../notify";
import { tick } from "../tick";
import { deliver } from "./deliver";
import { smsText } from "./smsFallback";

const MINUTE_MS = 60_000;
const NOON_NY = Date.UTC(2026, 10, 19, 17);
const STOP = config.app.sms.stopLine;

let deps: TestDeps;
let world: World;
let flight: PlannedDelivery;

beforeEach(async () => {
  deps = await makeTestDeps();
  deps.clock.set(NOON_NY);
  world = await seedWorld(deps.db, deps.clock.now());
  flight = await insertPlannedDelivery(deps.db, world, deps.clock.now());
});

async function land() {
  deps.clock.set(flight.arriveAtMs + 5 * MINUTE_MS);
  await tick(deps);
}

async function phoneOf(person: Person) {
  const [{ phone }] = await deps.db.query<{ phone: string }>(
    "select phone from auth.users where id = $1",
    [person.id],
  );
  return toE164(phone);
}

async function landedIn() {
  const [row] = await deps.db.query<{ id: string; sms_sent_at: Date | null }>(
    "select id, sms_sent_at from notifications where kind = 'landed-in' and user_id = $1",
    [world.priya.id],
  );
  return row;
}

async function subscribe(person: Person) {
  await deps.db.query(
    "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'p', 'a')",
    [person.id, `https://push.example/${person.handle}`],
  );
}

describe("SMS fallback", () => {
  it("a recipient with no push gets one short landed-in text ending with the stop line", async () => {
    await land();

    expect(deps.sms.sent).toHaveLength(1);
    const [text] = deps.sms.sent;
    expect(text.to).toBe(await phoneOf(world.priya));
    expect(text.body.length).toBeLessThan(160);
    expect(text.body.endsWith(STOP)).toBe(true);
    expect(text.body).toContain(world.max.name);
    const row = await landedIn();
    expect(text.body).toContain(`${config.app.domain}/sill/`);
    expect(row.sms_sent_at).toEqual(new Date(deps.clock.now()));
  });

  it("no text carries the note body", async () => {
    await land();

    const [{ body }] = await deps.db.query<{ body: string }>(
      "select body from notes where id = $1",
      [flight.noteId],
    );
    expect(deps.sms.sent).not.toHaveLength(0);
    for (const text of deps.sms.sent) expect(text.body).not.toContain(body);
  });

  it("a recipient with a working push gets no text", async () => {
    await subscribe(world.priya);

    await land();

    expect(deps.push.sent).toHaveLength(1);
    expect(deps.sms.sent).toEqual([]);
    expect((await landedIn()).sms_sent_at).toBeNull();
  });

  it("delivering the same landing again sends no second text", async () => {
    await land();
    const { id } = await landedIn();

    await deliver(deps, id);

    expect(deps.sms.sent).toHaveLength(1);
  });

  it("a recipient with the fallback switched off gets no text", async () => {
    await deps.db.query(
      "update profiles set sms_fallback = false where id = $1",
      [world.priya.id],
    );

    await land();

    expect(deps.sms.sent).toEqual([]);
  });

  it.each(["hungry", "delayed"])("%s never produces a text", async (kind) => {
    const refId = crypto.randomUUID();
    await notify(deps, {
      userId: world.priya.id,
      kind,
      refId,
      title: "Gerald",
      body: "Something happened.",
      url: `/birds/${refId}`,
    });

    expect(deps.sms.sent).toEqual([]);
  });

  it("stays under 160 characters with the longest names", () => {
    const text = smsText("landed-in", {
      bird: "B".repeat(24),
      friend: "F".repeat(30),
      url: `https://${config.app.domain}/sill/${crypto.randomUUID()}`,
    });

    expect(text.length).toBeLessThan(160);
    expect(text.endsWith(STOP)).toBe(true);
  });
});
