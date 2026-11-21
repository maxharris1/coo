import type { OnboardedCaller } from "@/server/auth";
import type { Deps } from "@/server/deps";

export type FoundItem = {
  id: string;
  objectId: string;
  name: string;
  value: number;
  birdId: string | null;
};

export const foundObjects: (
  deps: Deps,
  caller: OnboardedCaller,
) => Promise<FoundItem[]> = async () => [];
