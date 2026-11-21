import type { Deps } from "@/server/deps";
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

export type Step = (ctx: StepContext) => Promise<{ count: number }>;

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

export async function tick(
  deps: Deps,
  { userId }: { userId?: string } = {},
): Promise<{ counts: Partial<Record<StepName, number>>; timedOut: boolean }> {
  const deadline = deps.clock.now() + BUDGET_MS;
  const timeUp = () => deps.clock.now() >= deadline;
  const counts: Partial<Record<StepName, number>> = {};
  for (const [name, step] of Object.entries(STEPS) as [StepName, Step][]) {
    if (timeUp()) return { counts, timedOut: true };
    counts[name] = (
      await step({ deps, userId, limit: ROW_LIMIT, timeUp })
    ).count;
  }
  return { counts, timedOut: false };
}
