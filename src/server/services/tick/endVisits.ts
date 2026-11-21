import { randomUUID } from "node:crypto";
import {
  computeFlightPlan,
  hazardsFor,
  interpolate,
  type LatLon,
  type WeatherSample,
} from "@/lib/flight/engine";
import { activeLoft, type Shows } from "@/lib/game/privacy";
import { isWeekend } from "@/lib/game/time";
import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { log } from "@/server/log";
import { pair, toBirdRecord, type Row } from "@/server/rows";
import { LOFT_COLUMNS, loftsOf, type LoftColumns } from "../friends";
import { quoteInput } from "../flights/quote";
import { sampleWeather } from "../weather";
import type { Step, StepContext } from "../tick";
import { tryRow } from "./rows";

const ROUTE_ATTEMPTS = 3;

type Endpoint = { point: LatLon; label: string };

export type ReturnLeg = {
  from: Endpoint;
  to: Endpoint;
  timezone: string;
  hasBirdbath: boolean;
  weather: [WeatherSample, WeatherSample, WeatherSample];
};

type VisitLegRow = LoftColumns & {
  from_lat: number;
  from_lon: number;
  from_label: string;
  timezone: string;
  has_birdbath: boolean;
  owner_shows: Shows;
};

const OWNER_LOFT = LOFT_COLUMNS.map((c) => `o.${c}`).join(", ");

function returnEndpoint(
  shows: Shows,
  lofts: ReturnType<typeof loftsOf>,
): Endpoint | null {
  const loft = activeLoft(lofts);
  if (!loft) return null;
  if (shows === "block") return { point: loft.roost, label: loft.label };
  for (const candidate of [loft, lofts.home]) {
    if (candidate?.cityCentre)
      return { point: candidate.cityCentre, label: candidate.city };
  }
  return null;
}

export type ReturnRoute = Omit<ReturnLeg, "weather">;

export async function returnRoute(
  db: Db,
  visitId: string,
): Promise<ReturnRoute | null> {
  const [row] = await db.query<VisitLegRow>(
    `select f.to_lat as from_lat, f.to_lon as from_lon,
       f.to_label as from_label, o.timezone, o.has_birdbath, ${OWNER_LOFT},
       case when v.host_id is null then 'block'
         when fr.a_id = o.id then fr.a_shows
         when fr.b_id = o.id then fr.b_shows
         else 'city' end as owner_shows
     from visits v
     join flights f on f.id = v.flight_id
     join profiles o on o.id = f.owner_id
     left join friendships fr
       on (fr.a_id = o.id and fr.b_id = v.host_id)
       or (fr.a_id = v.host_id and fr.b_id = o.id)
     where v.id = $1`,
    [visitId],
  );
  if (!row) return null;
  const to = returnEndpoint(row.owner_shows, loftsOf(row));
  if (!to) return null;
  return {
    from: {
      point: { lat: row.from_lat, lon: row.from_lon },
      label: row.from_label,
    },
    to,
    timezone: row.timezone,
    hasBirdbath: row.has_birdbath,
  };
}

export async function withWeather(
  deps: Deps,
  route: ReturnRoute,
  nowMs: number,
): Promise<ReturnLeg> {
  const { samples } = await sampleWeather(
    deps,
    deps.config.game.weather.sampleFractions.map((f) => ({
      ...interpolate(route.from.point, route.to.point, f),
      atMs: nowMs,
    })),
  );
  return { ...route, weather: samples as ReturnLeg["weather"] };
}

export const sameRoute = (a: ReturnRoute | null, b: ReturnRoute | null) =>
  JSON.stringify(a) === JSON.stringify(b);

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

async function endOne(
  tx: Db,
  nowMs: number,
  visitId: string,
  route: ReturnRoute | null,
  leg: ReturnLeg | null,
) {
  const [owner] = await tx.query<{ owner_id: string; host_id: string | null }>(
    `select b.owner_id, v.host_id from visits v
     join birds b on b.id = v.bird_id
     where v.id = $1`,
    [visitId],
  );
  if (!owner) return null;
  await tx.query("select 1 from profiles where id = $1 for share", [
    owner.owner_id,
  ]);
  if (owner.host_id) {
    await tx.query(
      "select 1 from friendships where a_id = $1 and b_id = $2 for share",
      pair(owner.owner_id, owner.host_id),
    );
  }
  if (!sameRoute(await returnRoute(tx, visitId), route)) return "changed";
  const [visit] = await tx.query<{
    bird_id: string;
    host_id: string | null;
    guest_link_id: string | null;
  }>(
    `update visits set status = 'left'
     where id = $1 and status = 'waiting' and leaves_at <= $2
     returning bird_id, host_id, guest_link_id`,
    [visitId, new Date(nowMs).toISOString()],
  );
  if (!visit) return null;
  if (!leg) {
    await tx.query("update birds set status = 'home' where id = $1", [
      visit.bird_id,
    ]);
    return visit;
  }
  const flightId = await startReturn(tx, nowMs, leg, visit, null);
  await tx.query("update visits set return_flight_id = $2 where id = $1", [
    visitId,
    flightId,
  ]);
  return visit;
}

export const endVisits: Step = async (ctx) => {
  let count = 0;
  let failed = 0;
  for (const id of await dueIds(ctx)) {
    if (ctx.timeUp()) break;
    const ok = await tryRow("endVisits", id, async () => {
      for (let attempt = 0; attempt < ROUTE_ATTEMPTS; attempt++) {
        const nowMs = ctx.deps.clock.now();
        const route = await returnRoute(ctx.deps.db, id);
        const leg = route && (await withWeather(ctx.deps, route, nowMs));
        const ended = await ctx.deps.db.tx((tx) =>
          endOne(tx, nowMs, id, route, leg),
        );
        if (ended === "changed") continue;
        if (!ended) return;
        count++;
        if (!leg) {
          log.warn("endVisits.noReturnEndpoint", {
            visitId: id,
            birdId: ended.bird_id,
          });
        }
        return;
      }
    });
    if (!ok) failed++;
  }
  return { count, failed };
};
