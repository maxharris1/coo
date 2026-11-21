import { getEnv } from "@/env";
import { jsonRoute } from "@/server/http";
import { guestNotifyPost } from "./post";

export const POST = guestNotifyPost(
  jsonRoute,
  () => getEnv().LINK_TOKEN_PEPPER,
);
