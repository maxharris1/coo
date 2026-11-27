"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bird, type GearId, type Look } from "@/components/Bird";
import { MapView, type MapViewProps } from "@/components/MapView";
import { isDaylight, positionAt } from "@/lib/flight/engine";
import { fuzzyWhen } from "@/lib/format";
import { type JobLegs, jobLegs, legAt } from "@/lib/game/jobDest";
import type { JobView } from "@/server/services/jobs/get";
import styles from "./JobTracker.module.css";

export type JobMap = Pick<
  MapViewProps,
  | "flightId"
  | "from"
  | "to"
  | "plan"
  | "distanceMi"
  | "night"
  | "loftLabel"
  | "sillLabel"
>;

export type JobTrackerView =
  | { state: "home"; headline: string }
  | {
      state: "out" | "back";
      headline: string;
      sub: string;
      map: JobMap | null;
    };

const HEADLINES = { out: "On an odd job", back: "Heading home" } as const;
const YOUR_LOFT = "Your loft";
const CARD_OVERLAP_PX = 28;

export function jobView(
  job: JobView,
  legs: JobLegs | null,
  nowMs: number,
  timeZone: string,
): JobTrackerView {
  const startMs = Date.parse(job.startedAt);
  const endMs = Date.parse(job.endsAt);
  if (job.status === "done" || nowMs >= endMs) {
    return { state: "home", headline: `${job.bird.name} is home.` };
  }
  const sub = `Home ${fuzzyWhen(endMs, nowMs, timeZone)}`;
  if (!job.map || !legs) {
    const state = nowMs < startMs + (endMs - startMs) / 2 ? "out" : "back";
    return { state, headline: HEADLINES[state], sub, map: null };
  }
  const { loft, dest } = job.map;
  const leg = legAt(legs, nowMs);
  const ends =
    leg.dir === "out"
      ? { from: loft, to: dest, loftLabel: YOUR_LOFT, sillLabel: dest.label }
      : { from: dest, to: loft, loftLabel: dest.label, sillLabel: YOUR_LOFT };
  return {
    state: leg.dir,
    headline: HEADLINES[leg.dir],
    sub,
    map: {
      ...ends,
      flightId: `${job.id}:${leg.dir}`,
      plan: leg.plan,
      distanceMi: leg.distanceMi,
      night: !isDaylight(
        nowMs,
        positionAt(leg.plan, ends.from, ends.to, nowMs),
      ),
    },
  };
}

function Avatar({ job }: { job: JobView }) {
  return (
    <span className={styles.avatar}>
      <Bird
        look={job.bird.look as Look}
        gear={job.bird.gear as GearId[]}
        animated={false}
        size={44}
      />
    </span>
  );
}

export function JobTracker({
  job,
  offsetMs,
  timeZone,
}: {
  job: JobView;
  offsetMs: number;
  timeZone: string;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now() + offsetMs);
  const legs = useMemo(
    () =>
      job.map &&
      jobLegs(
        job.map.loft,
        job.map.dest,
        Date.parse(job.startedAt),
        Date.parse(job.endsAt),
      ),
    [job],
  );
  const view = jobView(job, legs, nowMs, timeZone);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now() + offsetMs), 1000);
    return () => clearInterval(timer);
  }, [offsetMs]);

  if (view.state === "home") {
    return (
      <section className={styles.home}>
        <Avatar job={job} />
        <h1 className={styles.headline}>{view.headline}</h1>
        <Link href="/earn" className={styles.button}>
          Back to Earn
        </Link>
      </section>
    );
  }

  const card = (
    <div className={styles.card}>
      <div className={styles.who}>
        <Avatar job={job} />
        <div className={styles.words}>
          <h1 className={styles.headline}>{view.headline}</h1>
          <p className={styles.sub}>{view.sub}</p>
        </div>
      </div>
      <p className={styles.job}>{job.text}</p>
    </div>
  );

  if (!view.map) return <section className={styles.plain}>{card}</section>;

  return (
    <section
      className={styles.tracker}
      data-night={view.map.night ? "true" : "false"}
    >
      <div className={styles.map}>
        <MapView
          {...view.map}
          bird={job.bird}
          offsetMs={offsetMs}
          bottomPadding={CARD_OVERLAP_PX}
          findBelowHeader
        />
      </div>
      <header className={styles.top}>
        <Link href="/earn" aria-label="Back to Earn" className={styles.back}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M15 5l-7 7 7 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <div className={styles.title}>
          <span className={styles.name}>{job.bird.name}</span>
          <span className={styles.chip}>Working</span>
        </div>
      </header>
      {card}
    </section>
  );
}
