"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import { config } from "@/lib/config";
import { asUnits } from "@/lib/format";
import type { RecipientQuote } from "@/server/services/flights/quote";
import { clearDraft, readDraft } from "./draft";
import { departures, forecastModel } from "./forecast";
import { quoteAt, send } from "./forecastApi";
import { ForecastView } from "./ForecastView";

type Quoted = { key: string; leg: RecipientQuote; now: number };

const HOUR_MS = 3_600_000;
const LATENCY_LEAD_MS = 60_000;
const { forecastHours, maxHoursAhead } = config.game.schedule;

const leadNow = (offsetMs: number) => Date.now() + offsetMs + LATENCY_LEAD_MS;

function Forecast() {
  const friendId = useSearchParams().get("to") ?? "";
  const router = useRouter();
  const toast = useToast();
  const { data, offsetMs } = useSync();
  const [draft] = useState(() => readDraft(friendId));
  const [quoted, setQuoted] = useState<Quoted | null>(null);
  const [selectedAt, setSelectedAt] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  const back = `/send/write?to=${encodeURIComponent(friendId)}`;
  const flock = data?.birds ?? [];
  const bird =
    flock.find((b) => b.id === draft?.birdId) ?? flock.find((b) => b.canFly);
  const tz = data?.me.timezone;
  const key = JSON.stringify([friendId, bird?.id, tz]);

  useEffect(() => {
    const [to, birdId, zone] = JSON.parse(key) as [string, string?, string?];
    if (!birdId || !zone) return;
    const now = leadNow(offsetMs);
    const at = departures(
      now,
      zone,
      forecastHours,
      maxHoursAhead * HOUR_MS - LATENCY_LEAD_MS,
    ).map((d) => d.at);
    let live = true;
    void quoteAt(fetch, to, birdId, at).then((r) => {
      if (!live) return;
      if (r.ok) {
        setQuoted({ key, leg: r.quote, now });
        return;
      }
      toast(r.message);
      router.replace(back);
    });
    return () => {
      live = false;
    };
  }, [key, offsetMs, toast, router, back]);

  if (!data || !bird || quoted?.key !== key) return <Loader />;

  const model = forecastModel(
    quoted.leg,
    bird,
    selectedAt ?? quoted.now,
    quoted.now,
    data.me.timezone,
    asUnits(data.me.units),
  );

  const release = async (releaseAt: number | undefined) => {
    if (!draft) {
      router.push(back);
      return;
    }
    setSending(true);
    const r = await send(fetch, draft, releaseAt);
    if (r.ok) {
      clearDraft(friendId);
      router.push(
        releaseAt === undefined
          ? `/send/takeoff/${r.flightId}`
          : `/flights/${r.flightId}`,
      );
      return;
    }
    setSending(false);
    toast(r.message);
  };

  return (
    <ForecastView
      model={model}
      backHref={back}
      sending={sending}
      onPick={setSelectedAt}
      onSchedule={(at) => void release(at)}
      onSend={(releaseAt) => void release(releaseAt)}
    />
  );
}

export default function ForecastPage() {
  return (
    <Suspense fallback={<Loader />}>
      <Forecast />
    </Suspense>
  );
}
