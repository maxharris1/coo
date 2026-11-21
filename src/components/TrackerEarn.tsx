"use client";

import { useEffect, useState } from "react";
import { loadEarn } from "@/app/(app)/earn/earn";
import type { Earn } from "@/server/services/earn";
import type { Flight } from "@/server/services/flights/shape";
import styles from "./TrackerEarn.module.css";

type Reason = NonNullable<Earn["earned"]>["lines"][number]["reason"];

const LABELS: Record<Reason, string> = {
  delivery: "Delivery",
  new_city: "New city",
  punch_card: "Punch card",
};

export type Earned = {
  total: number;
  lines: { label: string; seeds: number }[];
};

function toEarned(earned: Earn["earned"]): Earned | null {
  if (!earned?.lines.length) return null;
  const lines = earned.lines.map(({ reason, seeds }) => ({
    label: LABELS[reason],
    seeds,
  }));
  return { total: lines.reduce((sum, line) => sum + line.seeds, 0), lines };
}

export function useEarned(flight: Flight): Earned | null {
  const [loaded, setLoaded] = useState<{
    flightId: string;
    earned: Earned | null;
  } | null>(null);
  const { id } = flight;
  const eligible =
    flight.role === "mine" &&
    flight.kind === "delivery" &&
    flight.status === "landed";

  useEffect(() => {
    if (!eligible) return;
    let live = true;
    loadEarn(undefined, id).then((res) => {
      if (live)
        setLoaded({
          flightId: id,
          earned: res.ok ? toEarned(res.data.earned) : null,
        });
    });
    return () => {
      live = false;
    };
  }, [eligible, id]);

  return eligible && loaded?.flightId === id ? loaded.earned : null;
}

export function EarnedCard({ total, lines }: Earned) {
  return (
    <section className={styles.earned}>
      <h2 className={styles.heading}>You earned {total} seeds</h2>
      <dl className={styles.lines}>
        {lines.map((line) => (
          <div key={line.label} className={styles.line}>
            <dt className={styles.label}>{line.label}</dt>
            <dd className={styles.seeds}>{line.seeds}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function TrackerEarn({ flight }: { flight: Flight; nowMs: number }) {
  const earned = useEarned(flight);
  return earned && <EarnedCard {...earned} />;
}
