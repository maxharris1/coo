import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { log } from "@/server/log";
import { delayNotices } from "./tick/delayNotices";
import { endVisits } from "./tick/endVisits";
import { expireGuestLinks } from "./tick/expireGuestLinks";
import { finishJobs } from "./tick/finishJobs";
import { flushQuietHours } from "./tick/flushQuietHours";
import { hungryNotices } from "./tick/hungryNotices";
import { landDeliveries } from "./tick/landDeliveries";
import { landReturns } from "./tick/landReturns";
import { roostNotices } from "./tick/roostNotices";
import { scheduleReleases } from "./tick/scheduleReleases";
import { wakeBirds } from "./tick/wakeBirds";

export type StepContext = {
  deps: Deps;
  userId?: string;
  limit: number;
  timeUp: () => boolean;
};

export type Step = (
  ctx: StepContext,
) => Promise<{ count: number; failed?: number }>;

const ROW_LIMIT = 50;
const BUDGET_MS = 20_000;

const STEPS = {
  scheduleReleases,
  landDeliveries,
  endVisits,
  landReturns,
  delayNotices,
  roostNotices,
  finishJobs,
  wakeBirds,
  hungryNotices,
  expireGuestLinks,
  flushQuietHours,
} satisfies Record<string, Step>;

export type StepName = keyof typeof STEPS;

export type TickResult = {
  counts: Partial<Record<StepName, number>>;
  failed: Partial<Record<StepName, number>>;
  ms: number;
  timedOut: boolean;
};

export async function eachRow<T>(
  ctx: StepContext,
  step: StepName,
  ids: string[],
  work: (tx: Db, id: string) => Promise<T | null>,
): Promise<{ done: T[]; failed: number }> {
  const done: T[] = [];
  let failed = 0;
  for (const id of ids) {
    if (ctx.timeUp()) break;
    try {
      const out = await ctx.deps.db.tx((tx) => work(tx, id));
      if (out !== null) done.push(out);
    } catch (error) {
      failed++;
      log.error("tick.row_failed", { step, rowId: id, error });
    }
  }
  return { done, failed };
}

export async function tick(
  deps: Deps,
  { userId }: { userId?: string } = {},
): Promise<TickResult> {
  const startedAt = deps.clock.now();
  const deadline = startedAt + BUDGET_MS;
  const timeUp = () => deps.clock.now() >= deadline;
  const counts: TickResult["counts"] = {};
  const failed: TickResult["failed"] = {};
  const result = (timedOut: boolean): TickResult => ({
    counts,
    failed,
    ms: deps.clock.now() - startedAt,
    timedOut,
  });
  for (const [name, step] of Object.entries(STEPS) as [StepName, Step][]) {
    if (timeUp()) return result(true);
    try {
      const out = await step({ deps, userId, limit: ROW_LIMIT, timeUp });
      counts[name] = out.count;
      if (out.failed) failed[name] = out.failed;
    } catch (error) {
      failed[name] = 1;
      log.error("tick.step_failed", { step: name, error });
    }
  }
  return result(false);
}
