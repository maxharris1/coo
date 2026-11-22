import { getEnv } from "@/env";
import { jsonRoute } from "@/server/http";
import { guestGet } from "../[token]/get";
import { guestNotifyPost } from "../[token]/notify/post";

const pepper = () => getEnv().LINK_TOKEN_PEPPER;

export const GET = guestGet(jsonRoute, pepper);
export const POST = guestNotifyPost(jsonRoute, pepper);
