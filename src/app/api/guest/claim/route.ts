import { getEnv } from "@/env";
import { jsonRoute } from "@/server/http";
import { guestClaimPost } from "../[token]/claim/post";
import { guestGet } from "../[token]/get";

const pepper = () => getEnv().LINK_TOKEN_PEPPER;

export const GET = guestGet(jsonRoute, pepper);
export const POST = guestClaimPost(jsonRoute, pepper);
