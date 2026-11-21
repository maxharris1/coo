import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { fill } from "@/lib/format";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { insertFlyingDelivery } from "@/test/fixtures/flights";
import { seedWorld, type Person, type World } from "@/test/seedWorld";
import { notify } from "../notify";
import { deliver } from "./deliver";

const NOON_NY = Date.UTC(2026, 10, 19, 17);
const ELEVEN_PM_NY = Date.UTC(2026, 10, 20, 4);

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  deps.clock.set(NOON_NY);
  world = await seedWorld(deps.db, deps.clock.now());
});

async function subscribe(person: Person, name: string) {
  const sub = {
    endpoint: `https://push.example/${person.handle}/${name}`,
    p256dh: `p256dh-${name}`,
    auth: `auth-${name}`,
  };
  await deps.db.query(
    "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, $3, $4)",
    [person.id, sub.endpoint, sub.p256dh, sub.auth],
  );
  return sub;
}

async function endpoints(person: Person) {
  const rows = await deps.db.query<{ endpoint: string }>(
    "select endpoint from push_subscriptions where user_id = $1 order by endpoint",
    [person.id],
  );
  return rows.map((r) => r.endpoint);
}

async function stored(id: string) {
  const [row] = await deps.db.query<{ push_sent_at: Date | null }>(
    "select push_sent_at from notifications where id = $1",
    [id],
  );
  return row;
}

function landing(refId = crypto.randomUUID()) {
  return {
    userId: world.priya.id,
    kind: "landed-in",
    refId,
    title: "Gerald has landed",
    body: "There is a note from Max on your sill.",
    url: `/sill/${refId}`,
  };
}

describe("deliver", () => {
  it("a landing pushes once to each of the recipient's subscriptions", async () => {
    const phone = await subscribe(world.priya, "a-phone");
    const tablet = await subscribe(world.priya, "b-tablet");
    const elsewhere = await subscribe(world.max, "phone");
    const row = landing();

    const { id } = (await notify(deps, row))!;

    expect(deps.push.sent).toEqual([
      {
        sub: phone,
        payload: {
          title: row.title,
          body: row.body,
          url: row.url,
          tag: `landed-in:${row.refId}`,
        },
      },
      {
        sub: tablet,
        payload: {
          title: row.title,
          body: row.body,
          url: row.url,
          tag: `landed-in:${row.refId}`,
        },
      },
    ]);
    expect(deps.push.sent.map((s) => s.sub.endpoint)).not.toContain(
      elsewhere.endpoint,
    );
    expect((await stored(id)).push_sent_at).toEqual(new Date(NOON_NY));
    const okAt = await deps.db.query<{ endpoint: string; last_ok_at: Date }>(
      "select endpoint, last_ok_at from push_subscriptions where user_id = $1 order by endpoint",
      [world.priya.id],
    );
    expect(okAt.map((r) => r.last_ok_at)).toEqual([
      new Date(NOON_NY),
      new Date(NOON_NY),
    ]);
  });

  it("delivering the same notification again sends nothing more", async () => {
    await subscribe(world.priya, "phone");
    const { id } = (await notify(deps, landing()))!;

    expect(await deliver(deps, id)).toEqual({
      pushed: false,
      reason: "claimed",
    });
    expect(deps.push.sent).toHaveLength(1);
  });

  it("a recipient with no subscription is not marked pushed", async () => {
    const { id } = (await notify(deps, landing()))!;

    expect(await deliver(deps, id)).toEqual({
      pushed: false,
      reason: "no-subscription",
      sms: { texted: false, reason: "missing" },
    });
    expect((await stored(id)).push_sent_at).toBeNull();
  });

  it("an unknown id pushes nothing", async () => {
    expect(await deliver(deps, crypto.randomUUID())).toEqual({
      pushed: false,
      reason: "missing",
    });
  });

  it("a read notification is not pushed", async () => {
    await subscribe(world.priya, "phone");
    deps.clock.set(ELEVEN_PM_NY);
    const { id } = (await notify(deps, landing()))!;
    await deps.db.query("update notifications set read_at = $2 where id = $1", [
      id,
      new Date(ELEVEN_PM_NY).toISOString(),
    ]);
    deps.clock.set(NOON_NY + 24 * 60 * 60_000);

    expect(await deliver(deps, id)).toEqual({ pushed: false, reason: "read" });
    expect(deps.push.sent).toEqual([]);
  });

  it("a kind switched off is not pushed but stays in the in-app list", async () => {
    await subscribe(world.priya, "phone");
    await deps.db.query(
      "update profiles set notify_landed_in = false where id = $1",
      [world.priya.id],
    );

    const { id } = (await notify(deps, landing()))!;

    expect(await deliver(deps, id)).toEqual({
      pushed: false,
      reason: "setting-off",
    });
    expect(deps.push.sent).toEqual([]);
    const inApp = await deps.db.query<{ id: string; read_at: Date | null }>(
      "select id, read_at from notifications where user_id = $1",
      [world.priya.id],
    );
    expect(inApp).toEqual([{ id, read_at: null }]);
    expect((await stored(id)).push_sent_at).toBeNull();
  });

  it("a kind with no setting pushes even with every switch off", async () => {
    await subscribe(world.priya, "phone");
    await deps.db.query(
      `update profiles set notify_landed_in = false, notify_landed_out = false,
         notify_delays = false, notify_hungry = false where id = $1`,
      [world.priya.id],
    );

    await notify(deps, {
      userId: world.priya.id,
      kind: "hatched",
      refId: crypto.randomUUID(),
      title: "Your egg hatched",
      body: "Come meet whoever this is.",
      url: "/aviary",
    });

    expect(deps.push.sent).toHaveLength(1);
  });

  it("nothing is pushed during quiet hours", async () => {
    await subscribe(world.priya, "phone");
    deps.clock.set(ELEVEN_PM_NY);

    const { id } = (await notify(deps, landing()))!;

    expect(await deliver(deps, id)).toEqual({ pushed: false, reason: "quiet" });
    expect(deps.push.sent).toEqual([]);
    expect((await stored(id)).push_sent_at).toBeNull();
  });

  it("quiet hours follow the recipient's own time zone and switch", async () => {
    await subscribe(world.priya, "phone");
    await subscribe(world.max, "phone");
    await deps.db.query(
      "update profiles set timezone = 'America/Los_Angeles' where id = $1",
      [world.priya.id],
    );
    await deps.db.query("update profiles set quiet_on = false where id = $1", [
      world.max.id,
    ]);
    deps.clock.set(ELEVEN_PM_NY);

    await notify(deps, landing());
    await notify(deps, { ...landing(), userId: world.max.id });

    expect(deps.push.sent.map((s) => s.sub.endpoint)).toEqual([
      "https://push.example/priya/phone",
      "https://push.example/max/phone",
    ]);
  });

  it.each([410, 404])(
    "a %i from the push service deletes that subscription",
    async (status) => {
      await subscribe(world.priya, "a-dead");
      const live = await subscribe(world.priya, "b-live");
      deps.push.failNext(status);

      const { id } = (await notify(deps, landing()))!;

      expect(await endpoints(world.priya)).toEqual([live.endpoint]);
      expect(deps.push.sent.map((s) => s.sub)).toEqual([live]);
      expect(await deliver(deps, id)).toEqual({
        pushed: false,
        reason: "claimed",
      });
    },
  );

  it("reports what it sent and removed", async () => {
    await subscribe(world.priya, "a-dead");
    await subscribe(world.priya, "b-live");
    await deps.db.query(
      "update profiles set notify_landed_in = false where id = $1",
      [world.priya.id],
    );
    const { id } = (await notify(deps, landing()))!;
    await deps.db.query(
      "update profiles set notify_landed_in = true where id = $1",
      [world.priya.id],
    );
    deps.push.failNext(410);

    expect(await deliver(deps, id)).toEqual({
      pushed: true,
      sent: 1,
      removed: 1,
    });
  });

  it("any other push failure keeps the subscription", async () => {
    const phone = await subscribe(world.priya, "phone");
    deps.push.failNext(500);

    await notify(deps, landing());

    expect(await endpoints(world.priya)).toEqual([phone.endpoint]);
    expect(deps.push.sent).toEqual([]);
  });

  const kinds = Object.entries(config.copy.notifications).flatMap(
    ([kind, copy]) => (typeof copy === "string" ? [] : [{ kind, copy }]),
  );

  it.each(kinds)(
    "the $kind payload never contains the note body",
    async ({ kind, copy }) => {
      await subscribe(world.priya, "phone");
      const { flightId, noteId, birdId } = await insertFlyingDelivery(
        deps.db,
        world,
        deps.clock.now(),
        { from: world.max, to: world.priya },
      );
      const secret = `secret-note-body-${crypto.randomUUID()}`;
      await deps.db.query("update notes set body = $2 where id = $1", [
        noteId,
        secret,
      ]);
      const vars = {
        bird: "Gerald",
        friend: "Max",
        fromCity: "New York",
        eta: "3:40 pm",
        distance: "81 miles",
        duration: "2 hours",
        seeds: 12,
        lastSeen: "over Trenton",
        place: "Trenton",
        sunrise: "6:52 am",
        name: "Priya",
        flightId,
        visitId: noteId,
        birdId,
        friendId: world.max.id,
      };

      await notify(deps, {
        userId: world.priya.id,
        kind,
        refId: flightId,
        title: fill(copy.title, vars, "he"),
        body: fill(copy.body, vars, "he"),
        url: fill(copy.url, vars),
      });

      expect(deps.push.sent).toHaveLength(1);
      const [{ payload }] = deps.push.sent;
      expect(Object.keys(payload).sort()).toEqual([
        "body",
        "tag",
        "title",
        "url",
      ]);
      expect(payload.tag).toBe(`${kind}:${flightId}`);
      expect(JSON.stringify(payload)).not.toContain(secret);
    },
  );
});
