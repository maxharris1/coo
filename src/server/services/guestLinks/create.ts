import { createHash, randomInt } from "node:crypto";
import { getEnv } from "@/env";
import { startOfLocalDayMs, startOfNextLocalDayMs } from "@/lib/game/time";
import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import type { UserId } from "@/server/ports/auth";
import type { Endpoint } from "@/server/services/flights/quote";

export type GuestLinkDraft = {
  senderId: UserId;
  recipientName: string;
  dest: Endpoint;
  birdName: string;
  timezone: string;
  now: number;
};

export type CreatedGuestLink = { id: string; url: string };

const TOKEN_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function linkPepper(): string {
  return getEnv().LINK_TOKEN_PEPPER;
}

export function hashToken(pepper: string, token: string): string {
  return createHash("sha256")
    .update(pepper + token)
    .digest("hex");
}

function newToken(length: number): string {
  return Array.from(
    { length },
    () => TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)],
  ).join("");
}

function slugOf(birdName: string): string {
  const slug = birdName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "bird";
}

export async function createGuestLink(
  deps: Pick<Deps, "config">,
  tx: Db,
  pepper: string,
  draft: GuestLinkDraft,
): Promise<CreatedGuestLink> {
  const { app, game } = deps.config;
  const [{ count: madeToday }] = await tx.query<{ count: number }>(
    `select count(*)::int from guest_links
     where sender_id = $1 and created_at >= $2 and created_at < $3`,
    [
      draft.senderId,
      new Date(startOfLocalDayMs(draft.now, draft.timezone)).toISOString(),
      new Date(startOfNextLocalDayMs(draft.now, draft.timezone)).toISOString(),
    ],
  );
  if (madeToday >= game.guestLinks.perDay)
    throw new AppError("rate_limited", "Too many requests. Try again later.");

  const token = newToken(game.guestLinks.tokenChars);
  const [{ id }] = await tx.query<{ id: string }>(
    `insert into guest_links (token_hash, sender_id, recipient_name,
       dest_lat, dest_lon, dest_label, created_at)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [
      hashToken(pepper, token),
      draft.senderId,
      draft.recipientName,
      draft.dest.point.lat,
      draft.dest.point.lon,
      draft.dest.label,
      new Date(draft.now).toISOString(),
    ],
  );
  return {
    id,
    url: `https://${app.domain}${app.paths.guestLink}${slugOf(draft.birdName)}-${token}`,
  };
}
