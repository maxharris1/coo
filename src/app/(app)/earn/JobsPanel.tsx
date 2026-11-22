"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSync } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import { useToast } from "@/components/Toasts";
import { clockTime } from "@/lib/format";
import type { Earn } from "@/server/services/earn";
import { startJob, tradeFound, type Result, type Started } from "./earn";
import styles from "./Earn.module.css";

type Bird = Pick<
  SyncPayload["birds"][number],
  "id" | "name" | "status" | "busyKind" | "busyUntil" | "jobId"
>;

export type RunningJob = {
  birdId: string;
  name: string;
  until: number | null;
  jobId: string | null;
};

export const onJob = (b: Pick<Bird, "status" | "busyKind">) =>
  b.status === "busy" && b.busyKind === "job";

export const runningJobs = (birds: Bird[]): RunningJob[] =>
  birds.filter(onJob).map((b) => ({
    birdId: b.id,
    name: b.name,
    until: b.busyUntil,
    jobId: b.jobId,
  }));

export async function sendJob(
  jobId: string,
  birdId: string,
  start: (jobId: string, birdId: string) => Promise<Result<Started>>,
  refresh: () => void,
  onChanged: () => Promise<void>,
  toast: (message: string) => void,
  open: (path: string) => void,
): Promise<void> {
  const result = await start(jobId, birdId);
  refresh();
  if (result.ok) return open(`/jobs/${result.data.job.id}`);
  toast(result.message);
  await onChanged();
}

export async function tradeAndReload(
  trade: () => Promise<Result<unknown>>,
  refresh: () => void,
  onChanged: () => Promise<void>,
  toast: (message: string) => void,
): Promise<void> {
  const result = await trade();
  if (!result.ok) toast(result.message);
  refresh();
  await onChanged();
}

export function foundRows(
  found: Earn["found"],
  birds: Pick<Bird, "id" | "name">[],
): { lines: string[]; sum: number } {
  const counts = new Map<string | null, number>();
  for (const item of found)
    counts.set(item.birdId, (counts.get(item.birdId) ?? 0) + 1);
  const names = new Map(birds.map((b) => [b.id, b.name]));
  return {
    lines: [...counts].map(
      ([birdId, n]) =>
        `${(birdId && names.get(birdId)) ?? "A bird"} brought back ${n} ${n === 1 ? "thing" : "things"}.`,
    ),
    sum: found.reduce((total, item) => total + item.value, 0),
  };
}

export function FoundList({
  found,
  birds,
  trading,
  onTrade,
}: {
  found: Earn["found"];
  birds: Pick<Bird, "id" | "name">[];
  trading: boolean;
  onTrade: () => void;
}) {
  if (found.length === 0) return null;
  const { lines, sum } = foundRows(found, birds);
  return (
    <section aria-labelledby="earn-found" className={styles.jobs}>
      <h2 id="earn-found" className={styles.payTitle}>
        Found on the way home
      </h2>
      <div className={styles.found}>
        <div className={styles.foundText}>
          {lines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
        <button
          type="button"
          className={styles.trade}
          disabled={trading}
          onClick={onTrade}
        >
          {`Trade for ${sum}`}
        </button>
      </div>
    </section>
  );
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
      {runningJobs(birds).map((job) => {
        const text =
          job.until === null
            ? `${job.name} is out on an odd job.`
            : `${job.name} is out on an odd job. Home at ${clockTime(new Date(job.until), timeZone)}.`;
        return job.jobId === null ? (
          <div key={job.birdId} className={styles.running}>
            {text}
          </div>
        ) : (
          <Link
            key={job.birdId}
            href={`/jobs/${job.jobId}`}
            className={styles.running}
          >
            {text}
          </Link>
        );
      })}
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
  found,
  onChanged,
}: {
  jobs: Earn["jobs"];
  found: Earn["found"];
  onChanged: () => Promise<void>;
}) {
  const { data, refresh } = useSync();
  const toast = useToast();
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const onSend = (jobId: string, birdId: string) => {
    setSending(true);
    void sendJob(jobId, birdId, startJob, refresh, onChanged, toast, (path) =>
      router.push(path),
    ).finally(() => setSending(false));
  };
  const [trading, setTrading] = useState(false);
  const onTrade = () => {
    setTrading(true);
    void tradeAndReload(tradeFound, refresh, onChanged, toast).finally(() =>
      setTrading(false),
    );
  };
  const birds = data?.birds ?? [];
  return (
    <>
      <JobsList
        jobs={jobs}
        birds={birds}
        timeZone={data?.me.timezone ?? "UTC"}
        sending={sending}
        onSend={onSend}
      />
      <FoundList
        found={found}
        birds={birds}
        trading={trading}
        onTrade={onTrade}
      />
    </>
  );
}
