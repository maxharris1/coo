import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import { rateLimit } from "@/server/rateLimit";
import {
  FLIGHT_SELECT,
  toFlight,
  type BirdLite,
  type Flight,
  type FlightRow,
} from "@/server/services/flights/shape";
import { hashToken } from "./create";

export const NO_SUCH_LINK = "No bird is flying on that link";

export type GuestView = {
  senderName: string;
  recipientName: string;
  bird: Omit<BirdLite, "id">;
  flight: Pick<
    Flight,
    | "status"
    | "releaseAt"
    | "arriveAt"
    | "plan"
    | "input"
    | "from"
    | "to"
    | "placeNames"
  >;
  note?: { body: string; createdAt: number };
};

export type LiveLink = {
  id: string;
  recipient_name: string;
  sender_name: string;
};

export function guestIpLimit(
  deps: Pick<Deps, "db" | "clock" | "config">,
  ip: string,
) {
  return rateLimit(
    deps.db,
    deps.clock,
    `guest-ip:${ip}`,
    deps.config.game.limits.guestViewsPerMinutePerIp,
    60,
  );
}

export async function findLiveLink(
  deps: Pick<Deps, "config">,
  db: Db,
  pepper: string,
  token: string,
  now: number,
  opts: { lock?: boolean } = {},
): Promise<LiveLink> {
  const shape = new RegExp(
    `^[A-Za-z0-9]{${deps.config.game.guestLinks.tokenChars}}$`,
  );
  if (!shape.test(token)) throw new AppError("not_found", NO_SUCH_LINK);
  const [link] = await db.query<
    LiveLink & { status: string; expires_at: Date | null }
  >(
    `select g.id, g.status, g.expires_at, g.recipient_name, p.name as sender_name
     from guest_links g join profiles p on p.id = g.sender_id
     where g.token_hash = $1${opts.lock ? " for update of g" : ""}`,
    [hashToken(pepper, token)],
  );
  if (!link || link.status === "reported")
    throw new AppError("not_found", NO_SUCH_LINK);
  if (
    link.status === "expired" ||
    (link.expires_at && link.expires_at.getTime() <= now)
  )
    throw new AppError("gone", "This link has expired");
  return {
    id: link.id,
    recipient_name: link.recipient_name,
    sender_name: link.sender_name,
  };
}

export async function getGuestLink(
  deps: Deps,
  pepper: string,
  ip: string,
  token: string,
): Promise<GuestView> {
  await guestIpLimit(deps, ip);
  const now = deps.clock.now();
  const view = await deps.db.tx(async (db) => {
    await db.query("set transaction isolation level repeatable read");
    return readGuestView(deps, db, pepper, token, now);
  });
  await deps.db.query(
    "update guest_links set opened_at = $2 where id = $1 and opened_at is null",
    [view.linkId, new Date(now).toISOString()],
  );
  return view.guest;
}

async function readGuestView(
  deps: Deps,
  db: Db,
  pepper: string,
  token: string,
  now: number,
): Promise<{ linkId: string; guest: GuestView }> {
  const link = await findLiveLink(deps, db, pepper, token, now);
  const [row] = await db.query<FlightRow>(
    `${FLIGHT_SELECT} where f.guest_link_id = $1 and f.kind = 'delivery'`,
    [link.id],
  );
  if (!row) throw new AppError("not_found", NO_SUCH_LINK);
  const flight = toFlight(row, "");

  const view: GuestView = {
    senderName: link.sender_name.trim().split(/\s+/)[0],
    recipientName: link.recipient_name,
    bird: {
      name: flight.bird.name,
      look: flight.bird.look,
      gear: flight.bird.gear,
    },
    flight: {
      status: flight.status,
      releaseAt: flight.releaseAt,
      arriveAt: flight.arriveAt,
      plan: flight.plan,
      input: flight.input,
      from: flight.from,
      to: flight.to,
      placeNames: flight.placeNames,
    },
  };
  if (flight.status !== "landed") return { linkId: link.id, guest: view };

  const [note] = await db.query<{ body: string; created_at: Date }>(
    `select n.body, n.created_at from flights f join notes n on n.id = f.note_id
     where f.id = $1`,
    [flight.id],
  );
  return {
    linkId: link.id,
    guest: note
      ? {
          ...view,
          note: { body: note.body, createdAt: note.created_at.getTime() },
        }
      : view,
  };
}
