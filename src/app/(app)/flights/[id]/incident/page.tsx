"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { GearId, Look } from "@/components/Bird";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import { asUnits } from "@/lib/format";
import type { Flight } from "@/server/services/flights/shape";
import { FlightError } from "../FlightError";
import styles from "../FlightError.module.css";
import { loadFlight } from "../flightApi";
import { incidentReport } from "./incident";
import { delayedCount, sendSearchParty } from "./incidentApi";
import { IncidentView } from "./IncidentView";

type Load =
  { ok: false; code: string } | { ok: true; flight: Flight; count: number };

async function loadIncident(id: string): Promise<Load> {
  const [flight, count] = await Promise.all([
    loadFlight(fetch, id),
    delayedCount(fetch),
  ]);
  if (!flight.ok) return flight;
  if (flight.flight.role !== "mine") return { ok: false, code: "not_found" };
  if (!count.ok) return { ok: false, code: "unreachable" };
  return { ok: true, flight: flight.flight, count: count.count };
}

export default function IncidentPage() {
  const { id } = useParams<{ id: string }>();
  const { data, offsetMs } = useSync();
  const toast = useToast();
  const [load, setLoad] = useState<Load | null>(null);
  const [searching, setSearching] = useState(false);
  const [openedAt] = useState(Date.now);

  useEffect(() => {
    let live = true;
    void loadIncident(id).then((l) => {
      if (live) setLoad(l);
    });
    return () => {
      live = false;
    };
  }, [id]);

  if (!load) return <Loader />;
  if (!load.ok) return <FlightError code={load.code} />;

  const { flight, count } = load;
  const birds = data?.birds ?? [];
  const report = incidentReport(flight, {
    birds,
    delayedCount: count,
    nowMs: openedAt + offsetMs,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    units: asUnits(data?.me.units),
  });

  if (!report) {
    return (
      <div className={styles.page}>
        <p className={styles.message}>
          {flight.bird.name} is not running late. Nothing to report.
        </p>
        <Link href={`/flights/${flight.id}`} className={styles.back}>
          Back to the flight
        </Link>
      </div>
    );
  }

  async function search() {
    if (searching) return;
    setSearching(true);
    const result = await sendSearchParty(fetch, id);
    setSearching(false);
    if (result.ok) setLoad({ ok: true, flight: result.flight, count });
    else toast(result.message);
  }

  return (
    <IncidentView
      flightId={flight.id}
      report={report}
      bird={{
        name: flight.bird.name,
        look: flight.bird.look as Look,
        breed: birds.find((b) => b.id === flight.bird.id)?.breed,
        gear: flight.bird.gear as GearId[],
      }}
      searching={searching}
      onSearch={() => void search()}
    />
  );
}
