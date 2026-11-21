"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import emptyStates from "../../../../assets/copy/empty-states.json";
import { Bird, type GearId, type Look } from "@/components/Bird";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { duration } from "@/lib/format";
import type { SyncVisit } from "@/server/services/visits/syncRead";
import styles from "./Sill.module.css";

const EMPTY_LINE = emptyStates.find((s) => s.state === "Empty sill")!.text;

function OpenVisit({ id }: { id: string }) {
  const router = useRouter();
  useEffect(() => router.replace(`/sill/${id}`), [router, id]);
  return null;
}

function WaitingList({
  visits,
  nowMs,
}: {
  visits: SyncVisit[];
  nowMs: number;
}) {
  return (
    <section className={styles.sill}>
      <h1 className={styles.title}>On your sill</h1>
      <ul className={styles.rows}>
        {visits.map((v) => (
          <li key={v.id}>
            <Link href={`/sill/${v.id}`} className={styles.row}>
              <span className={styles.avatar}>
                <Bird
                  look={v.bird.look as Look}
                  breed={v.bird.breed}
                  gear={v.bird.gear as GearId[]}
                  animated={false}
                  size={72}
                />
              </span>
              <span className={styles.rowText}>
                <span className={styles.rowName}>{v.bird.name}</span>
                <span className={styles.rowLine}>
                  From {v.owner.name}. Leaves in {duration(v.leavesAt - nowMs)}.
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptySill() {
  return (
    <section className={styles.sill}>
      <h1 className={styles.title}>On your sill</h1>
      <p className={styles.empty}>{EMPTY_LINE}</p>
      <Link href="/send" className={styles.send}>
        Send a note
      </Link>
    </section>
  );
}

export default function SillPage() {
  const { data } = useSync();
  if (!data) return <Loader />;
  const visits = data.visits.toSorted((a, b) => a.leavesAt - b.leavesAt);
  if (visits.length === 1) return <OpenVisit id={visits[0].id} />;
  if (visits.length === 0) return <EmptySill />;
  return <WaitingList visits={visits} nowMs={data.serverNow} />;
}
