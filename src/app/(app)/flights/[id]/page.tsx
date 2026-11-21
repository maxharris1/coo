"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { Tracker } from "@/components/Tracker";
import { FlightError } from "./FlightError";
import { type FlightResult, loadFlight } from "./flightApi";

export default function FlightPage() {
  const { id } = useParams<{ id: string }>();
  const { offsetMs } = useSync();
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
  return (
    <Tracker
      flight={result.flight}
      offsetMs={offsetMs}
      timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
    />
  );
}
