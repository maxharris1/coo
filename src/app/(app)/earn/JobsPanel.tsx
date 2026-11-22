"use client";

import { useState } from "react";
import { useSync } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import { useToast } from "@/components/Toasts";
import { clockTime } from "@/lib/format";
import type { Earn } from "@/server/services/earn";
import { startJob, type Result } from "./earn";
import styles from "./Earn.module.css";

type Bird = Pick<
  SyncPayload["birds"][number],
  "id" | "name" | "status" | "busyKind" | "busyUntil"
>;

export type RunningJob = { birdId: string; name: string; until: number | null };

export const runningJobs = (birds: Bird[]): RunningJob[] =>
  birds
    .filter((b) => b.status === "busy" && b.busyKind === "job")
    .map((b) => ({ birdId: b.id, name: b.name, until: b.busyUntil }));

export async function sendJob(
  jobId: string,
  birdId: string,
  start: (jobId: string, birdId: string) => Promise<Result<unknown>>,
  refresh: () => void,
  onChanged: () => Promise<void>,
  toast: (message: string) => void,
): Promise<void> {
  const result = await start(jobId, birdId);
  if (!result.ok) toast(result.message);
  refresh();
  await onChanged();
}

export function JobsList({
  jobs,
  birds,
  timeZone,
  sending,
  onSend,
}: {
  jobs: Earn["jobs"];
  birds: Bird[];
  timeZone: string;
  sending: boolean;
  onSend: (jobId: string, birdId: string) => void;
}) {
  const sender = birds.find((b) => b.status === "home");
  const reason =
    jobs.leftToday === 0
      ? "That's all the odd jobs for today."
      : sender
        ? null
        : "No bird is home right now.";
  return (
    <section aria-labelledby="earn-jobs" className={styles.jobs}>
      <div className={styles.jobsHead}>
        <h2 id="earn-jobs" className={styles.payTitle}>
          Odd jobs
        </h2>
        <div className={styles.jobsSub}>For birds with nothing to do</div>
      </div>
      {runningJobs(birds).map((job) => (
        <div key={job.birdId} className={styles.running}>
          {job.until === null
            ? `${job.name} is out on an odd job.`
            : `${job.name} is out on an odd job. Home at ${clockTime(new Date(job.until), timeZone)}.`}
        </div>
      ))}
      {jobs.offers.map((offer) => (
        <div key={offer.id} className={styles.offer}>
          <div className={styles.offerText}>
            <div className={styles.offerTitle}>{offer.text}</div>
            <div className={styles.offerMeta}>
              {`${offer.minutes} minutes, pays ${offer.pay} seeds`}
            </div>
          </div>
          <button
            type="button"
            className={styles.send}
            disabled={sending || reason !== null}
            onClick={() => sender && onSend(offer.id, sender.id)}
          >
            {sender ? `Send ${sender.name}` : "Send"}
          </button>
        </div>
      ))}
      {reason && <p className={styles.jobsReason}>{reason}</p>}
    </section>
  );
}

export function JobsPanel({
  jobs,
  onChanged,
}: {
  jobs: Earn["jobs"];
  found: Earn["found"];
  onChanged: () => Promise<void>;
}) {
  const { data, refresh } = useSync();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const onSend = (jobId: string, birdId: string) => {
    setSending(true);
    void sendJob(jobId, birdId, startJob, refresh, onChanged, toast).finally(
      () => setSending(false),
    );
  };
  return (
    <JobsList
      jobs={jobs}
      birds={data?.birds ?? []}
      timeZone={data?.me.timezone ?? "UTC"}
      sending={sending}
      onSend={onSend}
    />
  );
}
