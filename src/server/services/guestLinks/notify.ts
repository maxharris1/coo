import { NOT_A_PHONE, toE164 } from "@/lib/phone";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import { rateLimit } from "@/server/rateLimit";
import { findLiveLink, guestIpLimit } from "./get";

const ONE_BUCKET_SECONDS = 1000 * 365 * 86_400;

export async function setLandingText(
  deps: Deps,
  pepper: string,
  ip: string,
  token: string,
  input: { phone: string; consent: true },
): Promise<Record<string, never>> {
  await guestIpLimit(deps, ip);
  const now = deps.clock.now();
  const link = await findLiveLink(deps, deps.db, pepper, token, now);
  await rateLimit(
    deps.db,
    deps.clock,
    `guest-notify:${link.id}`,
    deps.config.game.guestLinks.notifyAttemptsPerLink,
    ONE_BUCKET_SECONDS,
  );
  const phone = toE164(input.phone);
  if (!phone) throw new AppError("invalid", NOT_A_PHONE);

  await deps.db.tx(async (db) => {
    const { id } = await findLiveLink(deps, db, pepper, token, now, {
      lock: true,
    });
    const [current] = await db.query<{
      notify_phone: string | null;
      expires_at: Date | null;
    }>("select notify_phone, expires_at from guest_links where id = $1", [id]);
    if (current.expires_at)
      throw new AppError("conflict", "The bird has already landed");
    if (current.notify_phone !== null && current.notify_phone !== phone)
      throw new AppError("conflict", "A number is already set for this link");
    await db.query("update guest_links set notify_phone = $2 where id = $1", [
      id,
      phone,
    ]);
  });
  return {};
}
