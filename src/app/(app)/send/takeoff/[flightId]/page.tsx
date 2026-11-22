"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import type { Pronoun } from "@/lib/format";
import type { Flight } from "@/server/services/flights/shape";
import type { BirdView } from "@/server/services/sync";
import { FlightError } from "../../../flights/[id]/FlightError";
import { type FlightResult, loadFlight } from "../../../flights/[id]/flightApi";
import { holdLink, takeLink } from "../../share/[flightId]/linkHandoff";
import { TRACKER_AFTER_MS, takeoffCopy } from "./takeoffCopy";
import { TakeoffView } from "./TakeoffView";

const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function TakeoffScreen({
  flight,
  bird,
  timeZone,
  link,
}: {
  flight: Flight;
  bird: BirdView | undefined;
  timeZone: string;
  link: string | undefined;
}) {
  const router = useRouter();
  const [animate] = useState(() => !reducedMotion());
  const next =
    flight.guestName === undefined
      ? `/flights/${flight.id}`
      : `/send/share/${flight.id}`;
  const handOn = useCallback(() => {
    if (link) holdLink(flight.id, link);
  }, [flight.id, link]);

  useEffect(() => {
    if (!animate) return;
    const timer = setTimeout(() => {
      handOn();
      router.replace(next);
    }, TRACKER_AFTER_MS);
    return () => clearTimeout(timer);
  }, [animate, router, next, handOn]);

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
      href={next}
      onGo={handOn}
    />
  );
}

export default function TakeoffPage() {
  const { flightId } = useParams<{ flightId: string }>();
  const { data } = useSync();
  const [link] = useState(() => takeLink(flightId));
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
      link={link}
    />
  );
}
