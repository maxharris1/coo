import { getEnv } from "@/env";
import { jsonRoute } from "@/server/http";
import { guestGet } from "./get";
import { guestReportPost } from "./report/post";

const pepper = () => getEnv().LINK_TOKEN_PEPPER;

export const GET = guestGet(jsonRoute, pepper);
export const POST = guestReportPost(jsonRoute, pepper);
