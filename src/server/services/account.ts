import type { OnboardedCaller } from "@/server/auth";
import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import { forgetPlaces } from "./places";
import {
  returnRoute,
  sameRoute,
  startReturn,
  withWeather,
  type ReturnLeg,
  type ReturnRoute,
} from "./tick/endVisits";

const ATTEMPTS = 3;

type Planned = {
  visitId: string;
  route: ReturnRoute | null;
  leg: ReturnLeg | null;
};

const SILL_SQL = `select id from visits
  where host_id = $1 and status = 'waiting'
  order by id`;

async function planReturns(
  deps: Deps,
  userId: string,
  nowMs: number,
): Promise<Map<string, Planned>> {
  const sill = await deps.db.query<{ id: string }>(SILL_SQL, [userId]);
  const planned = new Map<string, Planned>();
  for (const { id } of sill) {
    const route = await returnRoute(deps.db, id);
    const leg = route && (await withWeather(deps, route, nowMs));
    planned.set(id, { visitId: id, route, leg });
  }
  return planned;
}

async function sendHome(tx: Db, nowMs: number, { visitId, leg }: Planned) {
  const [visit] = await tx.query<{
    bird_id: string;
    host_id: string | null;
    guest_link_id: string | null;
  }>(
    `update visits set status = 'left'
     where id = $1 and status = 'waiting'
     returning bird_id, host_id, guest_link_id`,
    [visitId],
  );
  if (!visit) return;
  if (!leg) {
    await tx.query("update birds set status = 'home' where id = $1", [
      visit.bird_id,
    ]);
    return;
  }
  const flightId = await startReturn(tx, nowMs, leg, visit, null);
  await tx.query("update visits set return_flight_id = $2 where id = $1", [
    visitId,
    flightId,
  ]);
}

async function tryDelete(
  deps: Deps,
  userId: string,
  nowMs: number,
  planned: Map<string, Planned>,
): Promise<boolean> {
  return deps.db.tx(async (tx) => {
    const owners = await tx.query<{ owner_id: string }>(
      `select distinct b.owner_id from visits v
       join birds b on b.id = v.bird_id
       where v.host_id = $1 and v.status = 'waiting'`,
      [userId],
    );
    await tx.query(
      "select id from profiles where id = any($1::uuid[]) order by id for update",
      [[userId, ...owners.map((o) => o.owner_id)]],
    );
    await tx.query(
      "select 1 from friendships where a_id = $1 or b_id = $1 order by a_id, b_id for update",
      [userId],
    );
    const sill = await tx.query<{ id: string }>(`${SILL_SQL} for update`, [
      userId,
    ]);
    if (sill.length !== planned.size || sill.some((v) => !planned.has(v.id))) {
      return false;
    }
    for (const visit of planned.values()) {
      if (!sameRoute(await returnRoute(tx, visit.visitId), visit.route))
        return false;
    }
    for (const visit of planned.values()) await sendHome(tx, nowMs, visit);
    await tx.query(
      `insert into events (user_id, kind, created_at)
       select case when a_id = $1 then b_id else a_id end, 'friends', $2
       from friendships where a_id = $1 or b_id = $1`,
      [userId, new Date(nowMs).toISOString()],
    );
    await forgetPlaces(tx, userId);
    await tx.query("delete from auth.users where id = $1", [userId]);
    return true;
  });
}

export async function deleteAccount(
  deps: Deps,
  caller: OnboardedCaller,
): Promise<{ deleted: true }> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const nowMs = deps.clock.now();
    const planned = await planReturns(deps, caller.userId, nowMs);
    if (await tryDelete(deps, caller.userId, nowMs, planned)) {
      return { deleted: true };
    }
  }
  throw new AppError("conflict", "Try again.");
}
