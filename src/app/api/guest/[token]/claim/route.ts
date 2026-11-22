import { getEnv } from "@/env";
import { jsonRoute } from "@/server/http";
import { guestClaimPost } from "./post";

export const POST = guestClaimPost(jsonRoute, () => getEnv().LINK_TOKEN_PEPPER);
