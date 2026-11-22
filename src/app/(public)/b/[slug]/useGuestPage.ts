import { useCallback, useEffect, useState } from "react";
import type { GuestView } from "@/server/services/guestLinks/get";

export const TICK_MS = 10_000;

export type GuestShown =
  | { kind: "live"; guest: GuestView }
  | { kind: "expired" | "missing" | "reported" };

const REFUSED: Record<number, GuestShown> = {
  404: { kind: "missing" },
  410: { kind: "expired" },
};

const guestUrl = (token: string) => `/api/guest/${encodeURIComponent(token)}`;

async function readGuest(token: string): Promise<GuestShown | null> {
  const res = await fetch(guestUrl(token), { cache: "no-store" }).catch(
    () => null,
  );
  if (!res) return null;
  if (!res.ok) return REFUSED[res.status] ?? null;
  const guest: GuestView = await res.json();
  return { kind: "live", guest };
}

export async function sendReport(
  token: string,
  reason: string,
): Promise<boolean> {
  const res = await fetch(`${guestUrl(token)}/report`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason }),
  }).catch(() => null);
  return res?.ok ?? false;
}

export function useGuestPage(
  guest: GuestView,
  token: string,
  serverNow: number,
) {
  const [shown, setShown] = useState<GuestShown>({ kind: "live", guest });
  const [clock, setClock] = useState({ nowMs: serverNow, offsetMs: 0 });
  const live = shown.kind === "live";

  useEffect(() => {
    if (!live) return;
    let stopped = false;
    const offsetMs = serverNow - Date.now();
    const tick = () => setClock({ nowMs: Date.now() + offsetMs, offsetMs });
    const refresh = async () => {
      const next = await readGuest(token);
      if (stopped || !next) return;
      setShown((now) => (now.kind === "live" ? next : now));
    };
    tick();
    const timer = setInterval(() => {
      tick();
      void refresh();
    }, TICK_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [live, serverNow, token]);

  const reported = useCallback(() => setShown({ kind: "reported" }), []);

  return { shown, clock, reported };
}
