import { getEnv } from "@/env";
import { jsonRoute } from "@/server/http";
import { guestGet } from "./get";

export const GET = guestGet(jsonRoute, () => getEnv().LINK_TOKEN_PEPPER);
