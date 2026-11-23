import Link from "next/link";
import { Bird, type GearId, type Look } from "@/components/Bird";
import type { SyncPayload } from "@/components/sync";
import { fuzzyWhen } from "@/lib/format";
import { jobLegs } from "@/lib/game/jobDest";
import type { JobView } from "@/server/services/jobs/get";
import { onJob } from "../earn/JobsPanel";
import { jobView } from "../jobs/[id]/JobTracker";
import { JobMapPreview } from "./FlightMapPreview";
import styles from "./Flights.module.css";

export type JobBird = Pick<
  SyncPayload["birds"][number],
  | "id"
  | "name"
  | "look"
  | "gear"
  | "status"
  | "busyKind"
  | "busyUntil"
  | "jobId"
>;

export type Jobs = ReadonlyMap<string, JobView>;

function jobMap(job: JobView | undefined, nowMs: number, timeZone: string) {
  if (!job?.map) return null;
  const legs = jobLegs(
    job.map.loft,
    job.map.dest,
    Date.parse(job.startedAt),
    Date.parse(job.endsAt),
  );
  const view = jobView(job, legs, nowMs, timeZone);
  return view.state === "home" ? null : view.map;
}

export function jobCards({
  birds,
  jobs,
  timeZone,
  nowMs,
  offsetMs,
}: {
  birds: JobBird[];
  jobs: Jobs;
  timeZone: string;
  nowMs: number;
  offsetMs: number;
}) {
  return birds.filter(onJob).map((b) => {
    const job = b.jobId ? jobs.get(b.jobId) : undefined;
    const map = jobMap(job, nowMs, timeZone);
    const words = (
      <>
        <span className={styles.airTop}>
          <span className={styles.rowTitle}>{`${b.name}, on an odd job`}</span>
          <span className={`${styles.chip} ${styles.chipLilac}`}>Working</span>
        </span>
        {b.busyUntil !== null && (
          <span className={styles.line}>
            {`Home ${fuzzyWhen(b.busyUntil, nowMs, timeZone)}`}
          </span>
        )}
      </>
    );
    if (!job || !map) {
      return (
        <div key={b.id} className={styles.card}>
          <span className={styles.top}>
            <span className={styles.avatar}>
              <span className={styles.avatarBird}>
                <Bird
                  look={b.look as Look}
                  gear={b.gear as GearId[]}
                  animated={false}
                  size={86}
                />
              </span>
            </span>
            <span className={styles.text}>{words}</span>
          </span>
        </div>
      );
    }
    return (
      <Link key={b.id} href={`/jobs/${job.id}`} className={styles.airCard}>
        <div className={styles.preview}>
          <JobMapPreview map={map} bird={job.bird} offsetMs={offsetMs} />
        </div>
        <div className={styles.airBody}>{words}</div>
      </Link>
    );
  });
}
