import { randomUUID } from "node:crypto";
import {
  computeFlightPlan,
  hazardsFor,
  interpolate,
  type LatLon,
  type WeatherSample,
} from "@/lib/flight/engine";
import { activeLoft } from "@/lib/game/privacy";
import { isWeekend } from "@/lib/game/time";
import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { toBirdRecord, type Row } from "@/server/rows";
import { LOFT_COLUMNS, loftsOf, type LoftColumns } from "../friends";
import { quoteInput } from "../flights/quote";
import { sampleWeather } from "../weather";
import type { Step, StepContext } from "../tick";

export type ReturnLeg = {
  visitId: string;
  from: { point: LatLon; label: string };
  to: { point: LatLon; label: string };
  timezone: string;
  hasBirdbath: boolean;
  weather: [WeatherSample, WeatherSample, WeatherSample];
};

type VisitLegRow = LoftColumns & {
  visit_id: string;
  from_lat: number;
  from_lon: number;
  from_label: string;
  timezone: string;
  has_birdbath: boolean;
};

const OWNER_LOFT = LOFT_COLUMNS.map((c) => `o.${c}`).join(", ");

export async function returnLeg(
  deps: Deps,
  visitId: string,
  nowMs: number,
): Promise<ReturnLeg | null> {
  const [row] = await deps.db.query<VisitLegRow>(
    `select v.id as visit_id, f.to_lat as from_lat, f.to_lon as from_lon,
       f.to_label as from_label, o.timezone, o.has_birdbath, ${OWNER_LOFT}
     from visits v
     join flights f on f.id = v.flight_id
     join profiles o on o.id = f.owner_id
     where v.id = $1`,
    [visitId],
  );
  const loft = row && activeLoft(loftsOf(row));
  if (!loft) return null;
  const from = {
    point: { lat: row.from_lat, lon: row.from_lon },
    label: row.from_label,
  };
  const to = { point: loft.roost, label: loft.label };
  const { samples } = await sampleWeather(
    deps,
    deps.config.game.weather.sampleFractions.map((f) => ({
      ...interpolate(from.point, to.point, f),
      atMs: nowMs,
    })),
  );
  return {
    visitId,
    from,
    to,
    timezone: row.timezone,
    hasBirdbath: row.has_birdbath,
    weather: samples as ReturnLeg["weather"],
  };
}

export async function startReturn(
  tx: Db,
  nowMs: number,
  leg: ReturnLeg,
  visit: {
    bird_id: string;
    host_id: string | null;
    guest_link_id: string | null;
  },
  noteId: string | null,
): Promise<string> {
  const [birdRow] = await tx.query<Row<"birds">>(
    "select * from birds where id = $1 for update",
    [visit.bird_id],
  );
  const bird = toBirdRecord(birdRow);
  const id = randomUUID();
  const quoted = quoteInput(
    bird,
    { hasBirdbath: leg.hasBirdbath },
    leg.from.point,
    leg.to.point,
    nowMs,
    leg.weather,
    hazardsFor(
      nowMs,
      leg.from.point,
      leg.to.point,
      isWeekend(nowMs, leg.timezone),
    ),
  );
  const input = { ...quoted, flightId: id, delayEndOverrideMs: undefined };
  const plan = computeFlightPlan(input);
  await tx.query(
    `insert into flights (id, kind, bird_id, owner_id, counterpart_id, guest_link_id, note_id,
       from_lat, from_lon, from_label, to_lat, to_lon, to_label,
       status, release_at, arrive_at, distance_mi, odds, delay_kind, input, plan, created_at)
     values ($1, 'return', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
       'flying', $13, $14, $15, $16, $17, $18, $19, $13)`,
    [
      id,
      bird.id,
      bird.ownerId,
      visit.host_id,
      visit.guest_link_id,
      noteId,
      leg.from.point.lat,
      leg.from.point.lon,
      leg.from.label,
      leg.to.point.lat,
      leg.to.point.lon,
      leg.to.label,
      new Date(nowMs).toISOString(),
      new Date(plan.arriveAtMs).toISOString(),
      plan.distanceMi,
      plan.onTimeOdds,
      plan.delayKind,
      JSON.stringify(input),
      JSON.stringify(plan),
    ],
  );
  await tx.query("update birds set status = 'flying' where id = $1", [bird.id]);
  return id;
}

async function dueIds(ctx: StepContext): Promise<string[]> {
  const found = await ctx.deps.db.query<{ id: string }>(
    `select v.id from visits v
     where v.status = 'waiting' and v.leaves_at <= $1
       and ($2::uuid is null or v.host_id = $2
         or exists (select 1 from birds b where b.id = v.bird_id and b.owner_id = $2))
     order by v.leaves_at limit $3`,
    [
      new Date(ctx.deps.clock.now()).toISOString(),
      ctx.userId ?? null,
      ctx.limit,
    ],
  );
  return found.map((r) => r.id);
}

async function endOne(tx: Db, nowMs: number, leg: ReturnLeg) {
  const [visit] = await tx.query<{
    bird_id: string;
    host_id: string | null;
    guest_link_id: string | null;
  }>(
    `update visits set status = 'left'
     where id = $1 and status = 'waiting' and leaves_at <= $2
     returning bird_id, host_id, guest_link_id`,
    [leg.visitId, new Date(nowMs).toISOString()],
  );
  if (!visit) return false;
  const flightId = await startReturn(tx, nowMs, leg, visit, null);
  await tx.query("update visits set return_flight_id = $2 where id = $1", [
    leg.visitId,
    flightId,
  ]);
  return true;
}

export const endVisits: Step = async (ctx) => {
  let count = 0;
  for (const id of await dueIds(ctx)) {
    if (ctx.timeUp()) break;
    const nowMs = ctx.deps.clock.now();
    const leg = await returnLeg(ctx.deps, id, nowMs);
    if (!leg) continue;
    if (await ctx.deps.db.tx((tx) => endOne(tx, nowMs, leg))) count++;
  }
  return { count };
};
