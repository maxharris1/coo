import type { Deps } from "@/server/deps";

export type SyncVisit = Record<string, never>;

export type MyVisiting = { birdId: string; hostName: string; leavesAt: number };

export const syncVisits: (
  deps: Deps,
  userId: string,
) => Promise<{ visits: SyncVisit[]; myVisiting: MyVisiting[] }> = async () => ({
  visits: [],
  myVisiting: [],
});
