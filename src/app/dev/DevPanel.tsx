"use client";

import { useRef, useState } from "react";
import { useSync } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import { DevPanelView, type DevButton, type Post } from "./DevPanelView";
import { nextLanding } from "./nextLanding";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const GRANT_SEEDS = 500;

const UNREACHABLE = "We could not reach the loft. Try again.";

const clock = (body: Post["body"]): Post => ({ url: "/api/dev/clock", body });

function devButtons(data: SyncPayload | null): DevButton[] {
  const landing = data && nextLanding(data.flights);
  return [
    { label: "+10 min", run: clock({ addMs: 10 * MINUTE_MS }) },
    { label: "+1 hour", run: clock({ addMs: HOUR_MS }) },
    { label: "+1 day", run: clock({ addMs: DAY_MS }) },
    {
      label: "Jump to next landing",
      run: landing && clock({ toFlight: landing.id }),
    },
    { label: "Reset clock", run: clock({ reset: true }) },
    {
      label: `+${GRANT_SEEDS} seeds`,
      run: { url: "/api/dev/grant", body: { seeds: GRANT_SEEDS } },
    },
    { label: "Run tick", run: "refresh" },
  ];
}

async function send({ url, body }: Post, ref: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, ref }),
    });
    if (res.ok) return null;
    const json: unknown = await res.json().catch(() => null);
    const message = (json as { error?: { message?: unknown } } | null)?.error
      ?.message;
    return typeof message === "string" && message ? message : UNREACHABLE;
  } catch {
    return UNREACHABLE;
  }
}

export function DevPanel() {
  const { data, refresh } = useSync();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const failed = useRef<{ key: string; ref: string } | null>(null);

  async function run({ run }: DevButton) {
    if (busy || !run) return;
    setError(null);
    if (run === "refresh") return refresh();
    const key = JSON.stringify(run);
    const ref =
      failed.current?.key === key ? failed.current.ref : crypto.randomUUID();
    setBusy(true);
    const failure = await send(run, ref);
    setBusy(false);
    failed.current = failure ? { key, ref } : null;
    setError(failure);
    refresh();
  }

  return (
    <DevPanelView
      serverNow={data?.serverNow ?? null}
      buttons={devButtons(data)}
      busy={busy}
      error={error}
      onRun={(button) => void run(button)}
    />
  );
}
