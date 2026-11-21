import { getEnv } from "@/env";
import { jsonRoute } from "@/server/http";
import { guestReportPost } from "./post";

export const POST = guestReportPost(
  jsonRoute,
  () => getEnv().LINK_TOKEN_PEPPER,
);
