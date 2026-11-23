import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SUPABASE = join(process.cwd(), "supabase");
const MIGRATIONS = join(SUPABASE, "migrations");
const BACKFILL = "0008_claim_resolved_guest_links.sql";
const read = (dir: string, file: string) =>
  readFileSync(join(dir, file), "utf8");

const TABLES = [
  "guest_links",
  "flights",
  "notes",
  "visits",
  "friendships",
  "bird_meetings",
  "notifications",
  "events",
];

type Send = {
  phone?: string;
  expiresAt?: string;
  landed?: boolean;
  visit?: boolean;
};

let pg: PGlite;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const {
    rows: [row],
  } = await pg.query<T>(sql, params);
  return row;
}

async function user(name: string, phone: string | null = null) {
  const { id } = await one<{ id: string }>(
    "insert into auth.users (phone) values ($1) returning id",
    [phone],
  );
  const handle = name.toLowerCase().replace(/\W/g, "") + id.slice(0, 4);
  await pg.query(
    "insert into profiles (id, name, handle, invite_code) values ($1, $2, $3, $3)",
    [id, name, handle],
  );
  return id;
}

async function friends(x: string, y: string, status = "accepted") {
  const [a, b] = [x, y].sort();
  await pg.query(
    "insert into friendships (a_id, b_id, status, blocked_by) values ($1, $2, $3, case when $3 = 'blocked' then $1::uuid end)",
    [a, b, status],
  );
}

async function send(sender: string, recipientName: string, opts: Send = {}) {
  const { id: link } = await one<{ id: string }>(
    `insert into guest_links (token_hash, sender_id, recipient_name, dest_lat, dest_lon, dest_label, notify_phone, expires_at)
     values (gen_random_uuid()::text, $1, $2, 39.95, -75.17, 'Rittenhouse', $3, $4) returning id`,
    [sender, recipientName, opts.phone ?? null, opts.expiresAt ?? null],
  );
  const { id: bird } = await one<{ id: string }>(
    "insert into birds (owner_id, name, speed_mph, focus, navigation) values ($1, 'Brenda', 45, 2, 4) returning id",
    [sender],
  );
  const { id: note } = await one<{ id: string }>(
    "insert into notes (sender_id, guest_link_id, body) values ($1, $2, 'coo') returning id",
    [sender, link],
  );
  const { id: flight } = await one<{ id: string }>(
    `insert into flights (kind, bird_id, owner_id, guest_link_id, note_id, from_lat, from_lon, from_label,
                          to_lat, to_lon, to_label, status, release_at, arrive_at, landed_at)
     values ('delivery', $1, $2, $3, $4, 40.73, -73.99, 'East Village', 39.95, -75.17, 'Rittenhouse',
             $5, now() - interval '2 hours', now() + interval '1 hour', $6) returning id`,
    [
      bird,
      sender,
      link,
      note,
      opts.landed ? "landed" : "flying",
      opts.landed ? new Date().toISOString() : null,
    ],
  );
  if (opts.visit)
    await pg.query(
      `insert into visits (flight_id, bird_id, guest_link_id, note_id, arrived_at, leaves_at)
       values ($1, $2, $3, $4, now() - interval '1 hour', now() + interval '1 day')`,
      [flight, bird, link, note],
    );
  return { link, bird, note, flight };
}

async function snapshot() {
  const out: Record<string, unknown[]> = {};
  for (const table of TABLES)
    out[table] = (await pg.query(`select * from ${table} order by 1, 2`)).rows;
  return out;
}

async function link(id: string) {
  return one<{ status: string; claimed_by: string | null }>(
    "select status, claimed_by from guest_links where id = $1",
    [id],
  );
}

async function delivery(flight: string) {
  return one<Record<string, unknown>>(
    `select f.counterpart_id, n.recipient_id, f.to_lat, f.to_lon, f.to_label, f.arrive_at, f.plan
       from flights f join notes n on n.id = f.note_id where f.id = $1`,
    [flight],
  );
}

async function friendship(x: string, y: string) {
  const [a, b] = [x, y].sort();
  return one<{ status: string; via: string } | undefined>(
    "select status, via from friendships where a_id = $1 and b_id = $2",
    [a, b],
  );
}

async function met(userId: string, bird: string) {
  const row = await one<{ n: number }>(
    "select count(*)::int as n from bird_meetings where user_id = $1 and bird_id = $2",
    [userId, bird],
  );
  return row.n === 1;
}

describe(`supabase/migrations/${BACKFILL}`, () => {
  beforeEach(async () => {
    pg = await PGlite.create();
    await pg.exec(read(join(SUPABASE, "test"), "auth-stub.sql"));
    const before = readdirSync(MIGRATIONS)
      .filter(
        (f) => f.endsWith(".sql") && f < BACKFILL && f !== "0002_cron.sql",
      )
      .sort();
    for (const file of before) await pg.exec(read(MIGRATIONS, file));
  });

  afterEach(async () => {
    await pg.close();
  });

  it("claims leftover links by verified phone or unique friend name, and a second apply changes nothing", async () => {
    const sam = await user("Sam");
    const ethan = await user("Ethan", "15550000001");
    const priya = await user("Priya");
    const bob = await user("Bob", "15550000002");
    const gail = await user("Gail", "15550000003");
    const dana = await user("Dana");
    const lee = await user("Lee");
    const kimA = await user("Kim");
    const kimB = await user("kim");
    await friends(sam, priya);
    await friends(sam, bob, "blocked");
    await friends(sam, dana);
    await friends(sam, lee);
    await friends(sam, kimA);
    await friends(sam, kimB);

    const byPhone = await send(sam, "E", { phone: "+1 (555) 000-0001" });
    const byName = await send(sam, "  priya ", { landed: true, visit: true });
    const blocked = await send(sam, "Bob", { phone: "+15550000002" });
    const expired = await send(sam, "Gail", {
      phone: "+15550000003",
      landed: true,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const danaOne = await send(sam, "Dana", { landed: true });
    const danaTwo = await send(sam, "dana", { landed: true });
    const leah = await send(sam, "Leah", { landed: true });
    const kim = await send(sam, "Kim", { landed: true });
    const destinations = await Promise.all(
      [byPhone, byName].map((s) => delivery(s.flight)),
    );
    const rowsBefore = await snapshot();

    await pg.exec(read(MIGRATIONS, BACKFILL));

    expect(await link(byPhone.link)).toEqual({
      status: "claimed",
      claimed_by: ethan,
    });
    expect(await friendship(sam, ethan)).toEqual({
      status: "accepted",
      via: "guest_link",
    });
    expect(await delivery(byPhone.flight)).toEqual({
      ...destinations[0],
      counterpart_id: ethan,
      recipient_id: ethan,
    });
    expect(await met(ethan, byPhone.bird)).toBe(true);

    expect(await link(byName.link)).toEqual({
      status: "claimed",
      claimed_by: priya,
    });
    expect(await delivery(byName.flight)).toEqual({
      ...destinations[1],
      counterpart_id: priya,
      recipient_id: priya,
    });
    expect(
      await one("select host_id from visits where guest_link_id = $1", [
        byName.link,
      ]),
    ).toEqual({ host_id: priya });
    expect(await met(priya, byName.bird)).toBe(true);
    expect(await friendship(sam, priya)).toEqual({
      status: "accepted",
      via: "invite",
    });

    for (const left of [blocked, expired, danaOne, danaTwo, leah, kim]) {
      expect(await link(left.link)).toEqual({
        status: "active",
        claimed_by: null,
      });
      expect(await delivery(left.flight)).toMatchObject({
        counterpart_id: null,
        recipient_id: null,
      });
    }
    expect(await friendship(sam, bob)).toEqual({
      status: "blocked",
      via: "invite",
    });
    expect(await friendship(sam, gail)).toBeUndefined();

    const rowsAfter = await snapshot();
    for (const table of TABLES)
      expect(rowsAfter[table].length, `${table} keeps every row`).toBe(
        rowsBefore[table].length +
          (table === "friendships" ? 1 : 0) +
          (table === "bird_meetings" ? 2 : 0),
      );
    expect(rowsAfter.notifications).toEqual([]);
    expect(rowsAfter.events).toEqual([]);

    await pg.exec(read(MIGRATIONS, BACKFILL));

    expect(await snapshot()).toEqual(rowsAfter);
  });

  it("claims a second same-name link once the phone phase has claimed the first", async () => {
    const sam = await user("Sam");
    const ethan = await user("Ethan", "15550000001");
    const first = await send(sam, "Ethan", { phone: "+15550000001" });
    const second = await send(sam, "Ethan", { landed: true });

    await pg.exec(read(MIGRATIONS, BACKFILL));
    const rows = await snapshot();
    await pg.exec(read(MIGRATIONS, BACKFILL));

    expect(await link(first.link)).toEqual({
      status: "claimed",
      claimed_by: ethan,
    });
    expect(await link(second.link)).toEqual({
      status: "claimed",
      claimed_by: ethan,
    });
    expect(await snapshot()).toEqual(rows);
  });
});
