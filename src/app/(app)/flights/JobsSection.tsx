import { Bird, type GearId, type Look } from "@/components/Bird";
import type { SyncPayload } from "@/components/sync";
import { clockTime } from "@/lib/format";
import { onJob } from "../earn/JobsPanel";
import styles from "./Flights.module.css";

type JobBird = Pick<
  SyncPayload["birds"][number],
  "id" | "name" | "look" | "gear" | "status" | "busyKind" | "busyUntil"
>;

export function JobsSection({
  birds,
  timeZone,
}: {
  birds: JobBird[];
  timeZone: string;
}) {
  const working = birds.filter(onJob);
  if (working.length === 0) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>On odd jobs</h2>
      {working.map((b) => (
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
            <span className={styles.text}>
              <span
                className={styles.rowTitle}
              >{`${b.name}, on an odd job`}</span>
              {b.busyUntil !== null && (
                <span className={styles.line}>
                  {`Home at ${clockTime(new Date(b.busyUntil), timeZone)}`}
                </span>
              )}
            </span>
            <span className={`${styles.chip} ${styles.chipLilac}`}>
              Working
            </span>
          </span>
        </div>
      ))}
    </section>
  );
}
