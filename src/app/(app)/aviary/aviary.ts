import { config } from "@/lib/config";
import type { Aviary } from "@/server/services/eggs";

export type EggCard =
  | { kind: "incubating"; toGo: number; done: number; span: number }
  | { kind: "ready" }
  | { kind: "waiting" };

export type AviaryTop = { perches: string; egg: EggCard | null };

export type AviaryState =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; top: AviaryTop };

const UNREACHABLE = "We could not reach the loft. Try again.";

function eggCard(a: Aviary): EggCard | null {
  const { egg } = a;
  if (!egg) return null;
  if (egg.status === "ready") {
    return egg.waitingForPerch ? { kind: "waiting" } : { kind: "ready" };
  }
  const { firstAtDeliveries, everyDeliveries } = config.game.eggs;
  const hatchedBefore = a.breeds.some((b) => b.hatchable && b.owned);
  const span = hatchedBefore ? everyDeliveries : firstAtDeliveries;
  const toGo = egg.deliveriesToGo;
  return { kind: "incubating", toGo, done: Math.max(0, span - toGo), span };
}

export function aviaryTop(a: Aviary): AviaryTop {
  const { total, free } = a.perches;
  return { perches: `${total - free} of ${total} perches`, egg: eggCard(a) };
}

export async function loadAviary(
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; data: Aviary } | { ok: false; message: string }> {
  try {
    const res = await fetchImpl("/api/aviary", { cache: "no-store" });
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json as Aviary };
    const message = (json as { error?: { message?: unknown } } | null)?.error
      ?.message;
    return {
      ok: false,
      message: typeof message === "string" && message ? message : UNREACHABLE,
    };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}
