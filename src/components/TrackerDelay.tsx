import Link from "next/link";
import { majorDelayOpen } from "@/app/(app)/flights/[id]/incident/incident";
import { config } from "@/lib/config";
import { fill } from "@/lib/format";
import type { Flight } from "@/server/services/flights/shape";
import styles from "./TrackerDelay.module.css";

const { title } = config.copy.notifications.delayed;

export function TrackerDelay({
  flight,
  nowMs,
}: {
  flight: Flight;
  nowMs: number;
}) {
  if (!majorDelayOpen(flight, nowMs)) return null;
  return (
    <Link href={`/flights/${flight.id}/incident`} className={styles.banner}>
      <span className={styles.title}>
        {fill(title, { bird: flight.bird.name })}.
      </span>{" "}
      <span className={styles.action}>Read the incident report.</span>
    </Link>
  );
}
