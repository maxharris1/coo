import { z } from "zod";
import { startOfLocalDayMs } from "@/lib/game/time";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import type { UserId } from "@/server/ports/auth";
import { FLIGHT_SELECT, toFlight, type Flight, type FlightRow } from "./shape";

export type FlightSections = {
  yours: Flight[];
  incoming: Flight[];
  landedToday: Flight[];
};
export type FlightsPage = FlightSections & {
  earlier: Flight[];
  nextCursor: string | null;
};

const PAGE_SIZE = 30;

type CurrentStatus = Exclude<Flight["status"], "cancelled">;

const SECTION: Record<
  CurrentStatus,
  Record<Flight["role"], keyof FlightSections>
> = {
  scheduled: { mine: "yours", incoming: "incoming" },
  flying: { mine: "yours", incoming: "incoming" },
  landed: { mine: "landedToday", incoming: "landedToday" },
};

type Cursor = { releaseUs: number; id: string };

const CURSOR = /^(-?\d+):(.+)$/;
const UUID = z.uuid();

function encodeCursor({ releaseUs, id }: Cursor): string {
  return Buffer.from(`${releaseUs}:${id}`).toString("base64url");
}

function decodeCursor(cursor: string): Cursor {
  const match = CURSOR.exec(Buffer.from(cursor, "base64url").toString());
  if (!match) throw new AppError("invalid", "cursor: malformed");
  const releaseUs = Number(match[1]);
  if (!Number.isSafeInteger(releaseUs)) {
    throw new AppError("invalid", "cursor: bad time");
  }
  if (!UUID.safeParse(match[2]).success) {
    throw new AppError("invalid", "cursor: bad id");
  }
  return { releaseUs, id: match[2] };
}

async function currentSections(
  deps: Deps,
  userId: UserId,
  midnight: string,
): Promise<FlightSections> {
  const rows = await deps.db.query<FlightRow & { status: CurrentStatus }>(
    `${FLIGHT_SELECT}
     where (f.owner_id = $1 or f.counterpart_id = $1)
       and (f.status in ('scheduled', 'flying')
         or (f.status = 'landed' and f.landed_at >= $2))
     order by f.status = 'landed',
       case when f.status <> 'landed' then coalesce(f.arrive_at, f.release_at) end,
       case when f.status <> 'landed' then f.id end,
       f.landed_at desc, f.id desc`,
    [userId, midnight],
  );
  const sections: FlightSections = { yours: [], incoming: [], landedToday: [] };
  for (const row of rows) {
    const flight = toFlight(row, userId);
    sections[SECTION[row.status][flight.role]].push(flight);
  }
  return sections;
}

async function earlierPage(
  deps: Deps,
  userId: UserId,
  midnight: string,
  cursor: Cursor | undefined,
): Promise<Pick<FlightsPage, "earlier" | "nextCursor">> {
  const rows = await deps.db.query<FlightRow & { release_us: string }>(
    `select p.*,
       (extract(epoch from p.release_at) * 1000000)::bigint::text as release_us
     from (${FLIGHT_SELECT}
       where (f.owner_id = $1 or f.counterpart_id = $1)
         and ((f.status = 'landed' and f.landed_at < $2)
           or (f.status = 'cancelled' and f.owner_id = $1))
         and ($3::bigint is null
           or (f.release_at, f.id)
             < (timestamptz 'epoch' + $3::bigint * interval '1 microsecond', $4::uuid))
       order by f.release_at desc, f.id desc
       limit ${PAGE_SIZE + 1}) p
     order by p.release_at desc, p.id desc`,
    [userId, midnight, cursor?.releaseUs ?? null, cursor?.id ?? null],
  );
  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    earlier: page.map((r) => toFlight(r, userId)),
    nextCursor:
      rows.length > PAGE_SIZE && last
        ? encodeCursor({ releaseUs: Number(last.release_us), id: last.id })
        : null,
  };
}

export async function listFlights(
  deps: Deps,
  viewer: { userId: UserId; timezone: string },
  cursor?: string,
): Promise<FlightsPage> {
  const after = cursor === undefined ? undefined : decodeCursor(cursor);
  const midnight = new Date(
    startOfLocalDayMs(deps.clock.now(), viewer.timezone),
  ).toISOString();
  const [sections, page] = await Promise.all([
    currentSections(deps, viewer.userId, midnight),
    earlierPage(deps, viewer.userId, midnight, after),
  ]);
  return { ...sections, ...page };
}
