"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Bird, type GearId, type Look } from "@/components/Bird";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import { postCare } from "../../feed";
import {
  feedThenRefresh,
  flockRow,
  type FlightLite,
  type Visiting,
} from "../../flockRows";
import styles from "./page.module.css";
import {
  levelLine,
  metersFor,
  moodLine,
  poseFor,
  pronounLines,
  tripOf,
} from "./pigeon";

function BackLink() {
  return (
    <Link href="/" aria-label="Back to the loft" className={styles.back}>
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M15 5 L8 12 L15 19"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}

export default function PigeonPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, refresh } = useSync();
  const toast = useToast();
  if (!data) {
    if (!error) return <Loader />;
    return (
      <main className={styles.missing}>
        <BackLink />
        <p role="alert" className={styles.mood}>
          {error}
        </p>
        <button type="button" className={styles.retry} onClick={refresh}>
          Try again
        </button>
      </main>
    );
  }

  const bird = data.birds.find((b) => b.id === id);
  if (!bird) {
    return (
      <main className={styles.missing}>
        <BackLink />
        <p className={styles.mood}>Could not find that bird.</p>
      </main>
    );
  }

  const lines = pronounLines(bird);
  const trip = tripOf(bird, data);
  const away =
    bird.status === "home"
      ? null
      : flockRow(bird, {
          timezone: data.me.timezone,
          nowMs: data.serverNow,
          flights: data.flights as unknown as FlightLite[],
          myVisiting: data.myVisiting as unknown as Visiting[],
        }).line;

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.topRow}>
          <BackLink />
          <div className={styles.level}>{levelLine(bird)}</div>
        </div>
        <div className={styles.heroBody}>
          <div className={styles.intro}>
            <h1 className={styles.name}>{bird.name}</h1>
            <p className={styles.mood}>{moodLine(bird, trip)}</p>
            <Link href={`/birds/${bird.id}/closet`} className={styles.closet}>
              {lines.closet}
            </Link>
          </div>
          <div className={styles.portrait}>
            <Bird
              look={bird.look as Look}
              breed={bird.breed}
              gear={bird.gear as GearId[]}
              pose={poseFor(bird, trip)}
              size={168}
              title={bird.name}
            />
          </div>
        </div>
      </section>
      <main className={styles.body}>
        <section className={styles.care}>
          <h2 className={styles.heading}>{lines.doing}</h2>
          {away && <p className={styles.away}>{away}</p>}
          {metersFor(bird).map((m) => (
            <div key={m.action} className={styles.meter}>
              <span className={styles.label}>{m.label}</span>
              <div role="img" aria-label={m.ariaLabel} className={styles.track}>
                <div
                  className={m.low ? styles.low : styles.good}
                  style={{ width: `${m.percent}%` }}
                />
              </div>
              <button
                type="button"
                className={m.primary ? styles.primary : styles.secondary}
                disabled={away !== null}
                onClick={() =>
                  void feedThenRefresh(
                    bird.id,
                    (birdId) => postCare(birdId, m.action),
                    refresh,
                    toast,
                  )
                }
              >
                {m.button}
              </button>
            </div>
          ))}
          <p className={styles.sulk}>{lines.sulk}</p>
        </section>
      </main>
    </>
  );
}
