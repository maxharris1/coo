import type { OnboardedCaller } from "@/server/auth";
import type { Deps } from "@/server/deps";

export type JobOffer = {
  id: string;
  text: string;
  minutes: number;
  pay: number;
};
export type JobOffers = { offers: JobOffer[]; leftToday: number };

export const jobOffers: (
  deps: Deps,
  caller: OnboardedCaller,
) => Promise<JobOffers> = async () => ({ offers: [], leftToday: 0 });
