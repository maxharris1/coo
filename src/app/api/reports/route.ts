import { getEnv } from "@/env";
import { jsonRoute } from "@/server/http";
import { reportsPost } from "./post";

export const POST = reportsPost(jsonRoute, () => getEnv().LINK_TOKEN_PEPPER);
