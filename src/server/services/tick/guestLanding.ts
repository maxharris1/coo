import { config } from "@/lib/config";
import type { Db } from "@/server/db";
import { log } from "@/server/log";
import { smsText } from "../notify/smsFallback";
import type { StepContext } from "../tick";

export type GuestText = {
  flightId: string;
  phone: string;
  bird: string;
  friend: string;
};

const EXPIRE_MS = config.game.guestLinks.expireDays * 86_400_000;

export async function landGuestLink(
  tx: Db,
  linkId: string,
  arriveMs: number,
): Promise<string | null> {
  const [link] = await tx.query<{ phone: string | null }>(
    `with link as (
       select id, notify_phone from guest_links
       where id = $1 and expires_at is null for update
     )
     update guest_links g set expires_at = $2, notify_phone = null
     from link where g.id = link.id
     returning link.notify_phone as phone`,
    [linkId, new Date(arriveMs + EXPIRE_MS).toISOString()],
  );
  return link?.phone ?? null;
}

export async function guestLanding(
  ctx: StepContext,
  texts: GuestText[],
): Promise<number> {
  let failed = 0;
  for (const t of texts)
    try {
      await ctx.deps.sms.send(
        t.phone,
        smsText("guest-landed", {
          bird: t.bird,
          friend: t.friend,
          url: `https://${ctx.deps.config.app.domain}`,
        }),
      );
    } catch (error) {
      failed++;
      log.warn("guest.landing_text_failed", {
        flightId: t.flightId,
        error: error instanceof Error ? error.name : typeof error,
      });
    }
  return failed;
}
