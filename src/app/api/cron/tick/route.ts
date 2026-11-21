import { getEnv } from "@/env";
import { jsonRoute } from "@/server/http";
import { cronTickPost } from "./post";

export const POST = cronTickPost(jsonRoute, () => getEnv().CRON_SECRET);
