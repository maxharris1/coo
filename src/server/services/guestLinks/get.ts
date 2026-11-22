import type { Pronoun } from "@/lib/format";
import type { Doodle } from "@/lib/game/notes";
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
const EXPIRED = "This link has expired";

export type GuestView = {
  senderName: string;
  recipientName: string;
  bird: Omit<BirdLite, "id"> & { pronoun: Pronoun };
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
  note?: { body: string; doodle: Doodle | null; createdAt: number };
};

export type LiveLink = {
  id: string;
  recipient_name: string;
  sender_name: string;
};

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0];
}

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
    throw new AppError("gone", EXPIRED);
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
  await recordOpening(deps.db, view.linkId, now);
  return view.guest;
}

async function recordOpening(db: Db, linkId: string, now: number) {
  const opened = await db.query<{ id: string }>(
    `update guest_links set opened_at = coalesce(opened_at, $2)
     where id = $1 and status in ('active', 'claimed') returning id`,
    [linkId, new Date(now).toISOString()],
  );
  if (opened.length > 0) return;
  const [link] = await db.query<{ status: string }>(
    "select status from guest_links where id = $1",
    [linkId],
  );
  if (link?.status === "expired") throw new AppError("gone", EXPIRED);
  throw new AppError("not_found", NO_SUCH_LINK);
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
  const [bird] = await db.query<{ pronoun: Pronoun }>(
    "select pronoun from birds where id = $1",
    [flight.bird.id],
  );

  const view: GuestView = {
    senderName: firstName(link.sender_name),
    recipientName: link.recipient_name,
    bird: {
      name: flight.bird.name,
      look: flight.bird.look,
      gear: flight.bird.gear,
      pronoun: bird.pronoun,
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

  const [note] = await db.query<{
    body: string;
    doodle: Doodle | null;
    created_at: Date;
  }>(
    `select n.body, n.doodle, n.created_at from flights f join notes n on n.id = f.note_id
     where f.id = $1`,
    [flight.id],
  );
  return {
    linkId: link.id,
    guest: note
      ? {
          ...view,
          note: {
            body: note.body,
            doodle: note.doodle,
            createdAt: note.created_at.getTime(),
          },
        }
      : view,
  };
}
