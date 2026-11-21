import type { Db } from "@/server/db";
import { aroundTheBlock } from "./badges/aroundTheBlock";
import { century } from "./badges/century";
import { cherAmi } from "./badges/cherAmi";
import { earlyBird } from "./badges/earlyBird";
import { firstFlight } from "./badges/firstFlight";
import { fullCard } from "./badges/fullCard";
import { fullHouse } from "./badges/fullHouse";
import { longHaul } from "./badges/longHaul";
import { nightOwl } from "./badges/nightOwl";
import { postmaster } from "./badges/postmaster";
import { rfc1149 } from "./badges/rfc1149";
import { searchAndRescue } from "./badges/searchAndRescue";

export type BadgeEvent = {
  kind: "delivery-landed" | "return-landed";
  flightId: string;
  ownerId: string;
};

export type BadgeRule = { apply(db: Db, event: BadgeEvent): Promise<void> };

export const badgeRules = {
  "first-flight": firstFlight,
  "night-owl": nightOwl,
  "cher-ami": cherAmi,
  "rfc-1149": rfc1149,
  "around-the-block": aroundTheBlock,
  century,
  "long-haul": longHaul,
  "full-card": fullCard,
  "early-bird": earlyBird,
  "search-and-rescue": searchAndRescue,
  "full-house": fullHouse,
  postmaster,
} satisfies Record<string, BadgeRule>;
