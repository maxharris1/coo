import type { Deps } from "@/server/deps";
import { log } from "@/server/log";
import { findLiveLink, guestIpLimit } from "./get";

export async function reportGuestLink(
  deps: Deps,
  pepper: string,
  ip: string,
  token: string,
  reason: string,
): Promise<Record<string, never>> {
  await guestIpLimit(deps, ip);
  const now = deps.clock.now();
  const linkId = await deps.db.tx(async (db) => {
    const link = await findLiveLink(deps, db, pepper, token, now, {
      lock: true,
    });
    await db.query("update guest_links set status = 'reported' where id = $1", [
      link.id,
    ]);
    await db.query(
      `insert into reports (reporter_id, guest_link_id, reason, created_at)
       values (null, $1, $2, $3)`,
      [link.id, reason, new Date(now).toISOString()],
    );
    return link.id;
  });
  log.info("guest.reported", { guestLinkId: linkId });
  return {};
}
