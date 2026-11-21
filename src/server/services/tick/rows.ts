import type { Db } from "@/server/db";
import { log } from "@/server/log";
import type { StepContext, StepName } from "../tick";

export async function tryRow(
  step: StepName,
  rowId: string,
  work: () => Promise<unknown>,
): Promise<boolean> {
  try {
    await work();
    return true;
  } catch (error) {
    log.error("tick.row_failed", { step, rowId, error });
    return false;
  }
}

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
    const ok = await tryRow(step, id, async () => {
      const out = await ctx.deps.db.tx((tx) => work(tx, id));
      if (out !== null) done.push(out);
    });
    if (!ok) failed++;
  }
  return { done, failed };
}
