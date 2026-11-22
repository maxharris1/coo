"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import type { Flight } from "@/server/services/flights/shape";
import { FlightError } from "../../../flights/[id]/FlightError";
import { type FlightResult, loadFlight } from "../../../flights/[id]/flightApi";
import { TRACKER_AFTER_MS } from "../../../send/takeoff/[flightId]/takeoffCopy";
import { TakeoffView } from "../../../send/takeoff/[flightId]/TakeoffView";
import { readHandoff, type TakeoffHandoff } from "../reply/takeoffHandoff";
import { homeCopy } from "./homeCopy";

const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function TakeoffHomeScreen({
  flight,
  handoff,
  timeZone,
}: {
  flight: Flight;
  handoff: TakeoffHandoff;
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

  const { watch, birdTitle, ...copy } = homeCopy(
    flight,
    handoff.pronoun,
    timeZone,
  );
  return (
    <TakeoffView
      flightId={flight.id}
      bird={{ ...flight.bird, breed: handoff.breed }}
      copy={copy}
      watchLabel={watch}
      birdTitle={birdTitle}
      animate={animate}
    />
  );
}

export default function TakeoffHomePage() {
  const { visitId } = useParams<{ visitId: string }>();
  const router = useRouter();
  const { data } = useSync();
  const [loaded, setLoaded] = useState<{
    handoff: TakeoffHandoff;
    result: FlightResult;
  } | null>(null);

  useEffect(() => {
    const handoff = readHandoff(visitId);
    if (!handoff) {
      router.replace(`/sill/${visitId}`);
      return;
    }
    let live = true;
    void loadFlight(fetch, handoff.flightId).then((result) => {
      if (live) setLoaded({ handoff, result });
    });
    return () => {
      live = false;
    };
  }, [visitId, router]);

  if (!loaded) return <Loader />;
  const { handoff, result } = loaded;
  if (!result.ok) return <FlightError code={result.code} />;
  if (!data) return <Loader />;
  return (
    <TakeoffHomeScreen
      flight={result.flight}
      handoff={handoff}
      timeZone={data.me.timezone}
    />
  );
}
