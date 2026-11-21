"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { Tracker } from "@/components/Tracker";
import { asUnits } from "@/lib/format";
import type { Flight } from "@/server/services/flights/shape";
import { FlightError } from "./FlightError";
import { type FlightResult, loadFlight } from "./flightApi";

const STAGE: Record<Flight["status"], number> = {
  scheduled: 0,
  flying: 1,
  landed: 2,
  cancelled: 2,
};

function revision(flight: Flight): number {
  return STAGE[flight.status] * 2 + (flight.searchParty ? 1 : 0);
}

export default function FlightPage() {
  const { id } = useParams<{ id: string }>();
  const { data, offsetMs } = useSync();
  const [result, setResult] = useState<FlightResult | null>(null);

  useEffect(() => {
    let live = true;
    void loadFlight(fetch, id).then((r) => {
      if (live) setResult(r);
    });
    return () => {
      live = false;
    };
  }, [id]);

  if (!result) return <Loader />;
  if (!result.ok) return <FlightError code={result.code} />;
  const synced = data?.flights.find((f) => f.id === result.flight.id);
  const flight =
    synced && revision(synced) >= revision(result.flight)
      ? synced
      : result.flight;
  return (
    <Tracker
      flight={flight}
      offsetMs={offsetMs}
      timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
      units={asUnits(data?.me.units)}
    />
  );
}
