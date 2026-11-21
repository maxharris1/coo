import type { Deps } from "@/server/deps";

export type SyncFlight = Record<string, never>;

export const syncFlights: (
  deps: Deps,
  userId: string,
) => Promise<SyncFlight[]> = async () => [];
