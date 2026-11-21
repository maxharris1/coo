import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db";
import { config } from "@/lib/config";
import { testDb } from "../testDb";
import { seedWorld, type World } from "../seedWorld";
import { insertFlyingDelivery } from "./flights";
import { insertWaitingVisit } from "./visits";
import { insertDeliveredNote, insertInAirNote } from "./notes";
import { insertNotification } from "./notifications";

const NOW = Date.UTC(2026, 10, 19, 15, 0, 0);

type NoteRow = {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  created_at: Date;
  delivered_at: Date | null;
};
type FlightRow = {
  id: string;
  kind: string;
  bird_id: string;
  owner_id: string;
  counterpart_id: string | null;
  note_id: string | null;
  from_lat: number;
  from_lon: number;
  from_label: string;
  to_lat: number;
  to_lon: number;
  to_label: string;
  status: string;
  release_at: Date;
  arrive_at: Date | null;
  landed_at: Date | null;
};
type Loft = { home_lat: number; home_lon: number; home_label: string };

describe("game state fixtures", () => {
  let db: Db;
  let world: World;

  beforeEach(async () => {
    db = await testDb();
    world = await seedWorld(db, NOW);
  });

  const loft = async (id: string) =>
    (
      await db.query<Loft>(
        "select home_lat, home_lon, home_label from profiles where id = $1",
        [id],
      )
    )[0];
  const birdStatus = async (id: string) =>
    (
      await db.query<{ status: string }>(
        "select status from birds where id = $1",
        [id],
      )
    )[0].status;
  const flight = async (id: string) =>
    (await db.query<FlightRow>("select * from flights where id = $1", [id]))[0];
  const note = async (id: string) =>
    (await db.query<NoteRow>("select * from notes where id = $1", [id]))[0];

  it("inserts a flying delivery joined to an in-air note, with the bird flying", async () => {
    const { flightId, noteId, birdId } = await insertFlyingDelivery(
      db,
      world,
      NOW,
    );
    const gerald = world.max.birds[0].id;
    expect(birdId).toBe(gerald);

    const flights = await db.query<FlightRow>("select * from flights");
    expect(flights).toHaveLength(1);
    const f = flights[0];
    expect(f).toMatchObject({
      id: flightId,
      kind: "delivery",
      status: "flying",
      bird_id: gerald,
      owner_id: world.max.id,
      counterpart_id: world.priya.id,
      note_id: noteId,
      landed_at: null,
    });
    const [from, to] = [await loft(world.max.id), await loft(world.priya.id)];
    expect([f.from_lat, f.from_lon, f.from_label]).toEqual([
      from.home_lat,
      from.home_lon,
      from.home_label,
    ]);
    expect([f.to_lat, f.to_lon, f.to_label]).toEqual([
      to.home_lat,
      to.home_lon,
      to.home_label,
    ]);
    expect(f.release_at.getTime()).toBe(NOW);
    expect(f.arrive_at!.getTime()).toBeGreaterThan(NOW);

    expect(await note(noteId)).toMatchObject({
      sender_id: world.max.id,
      recipient_id: world.priya.id,
      delivered_at: null,
    });
    expect(await birdStatus(gerald)).toBe("flying");
  });

  it("inserts a waiting visit joined to a landed flight and a delivered note", async () => {
    const { visitId, flightId, noteId, birdId } = await insertWaitingVisit(
      db,
      world,
      NOW,
    );
    const brenda = world.max.birds[1].id;
    expect(birdId).toBe(brenda);

    const visits = await db.query<{
      id: string;
      flight_id: string;
      bird_id: string;
      host_id: string | null;
      note_id: string | null;
      status: string;
      arrived_at: Date;
      leaves_at: Date;
    }>("select * from visits");
    expect(visits).toHaveLength(1);
    const v = visits[0];
    expect(v).toMatchObject({
      id: visitId,
      flight_id: flightId,
      bird_id: brenda,
      host_id: world.priya.id,
      note_id: noteId,
      status: "waiting",
    });
    expect(v.arrived_at.getTime()).toBe(NOW);
    expect(v.leaves_at.getTime() - v.arrived_at.getTime()).toBe(
      config.game.visits.waitMinutes * 60_000,
    );

    const f = await flight(flightId);
    expect(f).toMatchObject({
      kind: "delivery",
      status: "landed",
      bird_id: brenda,
      owner_id: world.max.id,
      counterpart_id: world.priya.id,
      note_id: noteId,
    });
    expect(f.arrive_at!.getTime()).toBe(NOW);
    expect(f.landed_at!.getTime()).toBe(NOW);

    const n = await note(noteId);
    expect(n).toMatchObject({
      sender_id: world.max.id,
      recipient_id: world.priya.id,
    });
    expect(n.delivered_at!.getTime()).toBe(NOW);
    expect(await birdStatus(brenda)).toBe("visiting");
  });

  it("inserts an in-air note and a delivered note", async () => {
    const inAir = await insertInAirNote(db, world, NOW);
    const delivered = await insertDeliveredNote(db, world, NOW, {
      from: world.priya,
      to: world.max,
    });

    const notes = await db.query<NoteRow>(
      "select * from notes order by delivered_at nulls first",
    );
    expect(notes.map((n) => n.id)).toEqual([inAir.noteId, delivered.noteId]);
    expect(notes[0]).toMatchObject({
      sender_id: world.max.id,
      recipient_id: world.priya.id,
      delivered_at: null,
    });
    expect(notes[1]).toMatchObject({
      sender_id: world.priya.id,
      recipient_id: world.max.id,
    });
    expect(notes[1].delivered_at!.getTime()).toBe(NOW);
    for (const n of notes) expect(n.created_at.getTime()).toBe(NOW);
  });

  it("inserts a notification with the given kind, ref and user", async () => {
    const { noteId } = await insertInAirNote(db, world, NOW);
    const { notificationId } = await insertNotification(db, world, NOW, {
      userId: world.priya.id,
      kind: "landed_in",
      refId: noteId,
    });

    const rows = await db.query<{
      id: string;
      user_id: string;
      kind: string;
      ref_id: string | null;
      created_at: Date;
      read_at: Date | null;
    }>("select * from notifications");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: notificationId,
      user_id: world.priya.id,
      kind: "landed_in",
      ref_id: noteId,
      read_at: null,
    });
    expect(rows[0].created_at.getTime()).toBe(NOW);
  });

  it("allows one active flight per bird across a shared world", async () => {
    const first = await insertFlyingDelivery(db, world, NOW);
    const kevin = world.priya.birds[0].id;
    const second = await insertFlyingDelivery(db, world, NOW, {
      from: world.priya,
      to: world.max,
      birdId: kevin,
    });
    expect(second.flightId).not.toBe(first.flightId);
    expect(second.noteId).not.toBe(first.noteId);
    expect((await flight(second.flightId)).owner_id).toBe(world.priya.id);
    expect(await birdStatus(kevin)).toBe("flying");

    await expect(insertFlyingDelivery(db, world, NOW)).rejects.toThrow(
      /flights_one_active_per_bird/,
    );
    expect(await db.query("select id from flights")).toHaveLength(2);
    expect(await db.query("select id from notes")).toHaveLength(2);
  });
});
