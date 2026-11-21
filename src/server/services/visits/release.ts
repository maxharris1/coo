import { z } from "zod";
import type { OnboardedCaller } from "@/server/auth";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";

const VISIT_ID = z.uuid();

type VisitRow = { host_id: string | null; status: string; leaves_at: Date };

export async function releaseVisit(
  deps: Deps,
  caller: OnboardedCaller,
  visitId: string,
): Promise<{ leavesAt: number }> {
  const missing = new AppError("not_found", "Could not find that visit.");
  if (!VISIT_ID.safeParse(visitId).success) throw missing;
  const now = deps.clock.now();
  return deps.db.tx(async (db) => {
    const [row] = await db.query<VisitRow>(
      "select host_id, status, leaves_at from visits where id = $1 for update",
      [visitId],
    );
    if (!row || row.host_id !== caller.userId) throw missing;
    if (row.status !== "waiting") {
      throw new AppError("conflict", "The visit is over.");
    }
    const leavesAt = row.leaves_at.getTime();
    if (leavesAt <= now) return { leavesAt };
    await db.query(
      "update visits set leaves_at = to_timestamp($2 / 1000.0) where id = $1",
      [visitId, now],
    );
    return { leavesAt: now };
  });
}
