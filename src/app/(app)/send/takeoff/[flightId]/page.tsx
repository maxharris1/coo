"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import type { Pronoun } from "@/lib/format";
import type { Flight } from "@/server/services/flights/shape";
import type { BirdView } from "@/server/services/sync";
import { FlightError } from "../../../flights/[id]/FlightError";
import { type FlightResult, loadFlight } from "../../../flights/[id]/flightApi";
import { TRACKER_AFTER_MS, takeoffCopy } from "./takeoffCopy";
import { TakeoffView } from "./TakeoffView";

const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function TakeoffScreen({
  flight,
  bird,
  timeZone,
}: {
  flight: Flight;
  bird: BirdView | undefined;
  timeZone: string;
}) {
  const router = useRouter();
  const [animate] = useState(() => !reducedMotion());
  const tracker = `/flights/${flight.id}`;

  useEffect(() => {
    if (!animate) return;
    const timer = setTimeout(() => router.replace(tracker), TRACKER_AFTER_MS);
    return () => clearTimeout(timer);
  }, [animate, router, tracker]);

  return (
    <TakeoffView
      flightId={flight.id}
      bird={{ ...flight.bird, breed: bird?.breed }}
      copy={takeoffCopy(
        flight,
        (bird?.pronoun as Pronoun | undefined) ?? "they",
        timeZone,
      )}
      animate={animate}
    />
  );
}

export default function TakeoffPage() {
  const { flightId } = useParams<{ flightId: string }>();
  const { data } = useSync();
  const [result, setResult] = useState<FlightResult | null>(null);

  useEffect(() => {
    let live = true;
    void loadFlight(fetch, flightId).then((r) => {
      if (live) setResult(r);
    });
    return () => {
      live = false;
    };
  }, [flightId]);

  if (result && !result.ok) return <FlightError code={result.code} />;
  if (!result || !data) return <Loader />;
  return (
    <TakeoffScreen
      flight={result.flight}
      bird={data.birds.find((b) => b.id === result.flight.bird.id)}
      timeZone={data.me.timezone}
    />
  );
}
