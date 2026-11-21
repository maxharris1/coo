import { z } from "zod";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import type { UserId } from "@/server/ports/auth";

const PAGE_SIZE = 30;
const FORMER_FRIEND = "a former friend";

export type ShoeboxNote = {
  id: string;
  direction: "sent" | "received";
  state: "in_the_air" | "delivered" | "returned";
  body: string;
  with: { id: string | null; name: string; handle: string | null };
  bird: { id: string; name: string; look: string } | null;
  trip: { distanceMi: number | null; durationMs: number | null } | null;
  createdAt: number;
  deliveredAt: number | null;
};

export type NotesPage = {
  notes: ShoeboxNote[];
  nextCursor: string | null;
  total: number;
};

type NoteRow = {
  id: string;
  sender_id: string;
  body: string;
  created_at: Date;
  delivered_at: Date | null;
  returned_at: Date | null;
  sort_key: string;
  with_id: string | null;
  with_name: string | null;
  with_handle: string | null;
  guest_name: string | null;
  bird_id: string | null;
  bird_name: string | null;
  bird_look: string | null;
  distance_mi: number | null;
  release_at: Date | null;
  end_at: Date | null;
};

const MAX_BIGINT = 9223372036854775807n;

const CURSOR = z.object({
  t: z
    .string()
    .regex(/^\d{1,19}$/)
    .refine((t) => BigInt(t) <= MAX_BIGINT),
  id: z.uuid(),
});
type Cursor = z.infer<typeof CURSOR>;

const encodeCursor = (c: Cursor) =>
  Buffer.from(JSON.stringify(c)).toString("base64url");

function decodeCursor(raw: string): Cursor {
  try {
    return CURSOR.parse(
      JSON.parse(Buffer.from(raw, "base64url").toString("utf8")),
    );
  } catch {
    throw new AppError("invalid", "cursor: not a cursor");
  }
}

const SORT_KEY =
  "(extract(epoch from coalesce(n.delivered_at, n.created_at)) * 1000000)::bigint";

const VISIBLE = `
  ((n.sender_id = $1)
    or (n.recipient_id = $1 and n.delivered_at is not null and n.returned_at is null))
  and ($2::uuid is null
    or (n.sender_id = $1 and n.recipient_id = $2)
    or (n.sender_id = $2 and n.recipient_id = $1))`;

function toNote(r: NoteRow, me: UserId): ShoeboxNote {
  const sent = r.sender_id === me;
  return {
    id: r.id,
    direction: sent ? "sent" : "received",
    state: r.returned_at
      ? "returned"
      : r.delivered_at
        ? "delivered"
        : "in_the_air",
    body: r.body,
    with: r.with_name
      ? { id: r.with_id, name: r.with_name, handle: r.with_handle }
      : { id: null, name: r.guest_name ?? FORMER_FRIEND, handle: null },
    bird:
      r.bird_id && r.bird_name && r.bird_look
        ? { id: r.bird_id, name: r.bird_name, look: r.bird_look }
        : null,
    trip: r.release_at
      ? {
          distanceMi: r.distance_mi,
          durationMs: r.end_at
            ? r.end_at.getTime() - r.release_at.getTime()
            : null,
        }
      : null,
    createdAt: r.created_at.getTime(),
    deliveredAt: r.delivered_at?.getTime() ?? null,
  };
}

export async function listNotes(
  deps: Deps,
  me: UserId,
  { friendId, cursor }: { friendId?: string; cursor?: string },
): Promise<NotesPage> {
  const after = cursor ? decodeCursor(cursor) : null;
  const rows = await deps.db.query<NoteRow>(
    `select n.id, n.sender_id, n.body, n.created_at, n.delivered_at, n.returned_at,
       ${SORT_KEY}::text as sort_key,
       p.id as with_id, p.name as with_name, p.handle as with_handle,
       case when g.status = 'claimed' then null else g.recipient_name end as guest_name,
       b.id as bird_id, b.name as bird_name, b.look as bird_look,
       f.distance_mi, f.release_at, coalesce(f.landed_at, f.arrive_at) as end_at
     from notes n
     left join lateral (
       select * from flights
       where note_id = n.id and kind = 'delivery'
       order by created_at desc limit 1
     ) f on true
     left join birds b on b.id = f.bird_id
     left join profiles p
       on p.id = case when n.sender_id = $1 then n.recipient_id else n.sender_id end
     left join guest_links g on g.id = n.guest_link_id
     where ${VISIBLE}
       and ($3::bigint is null or (${SORT_KEY}, n.id) < ($3::bigint, $4::uuid))
     order by ${SORT_KEY} desc, n.id desc
     limit ${PAGE_SIZE + 1}`,
    [me, friendId ?? null, after?.t ?? null, after?.id ?? null],
  );
  const [{ total }] = await deps.db.query<{ total: number }>(
    `select count(*)::int as total from notes n where ${VISIBLE}`,
    [me, friendId ?? null],
  );
  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    notes: page.map((r) => toNote(r, me)),
    nextCursor:
      rows.length > PAGE_SIZE && last
        ? encodeCursor({ t: last.sort_key, id: last.id })
        : null,
    total,
  };
}
