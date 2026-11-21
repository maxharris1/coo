import { jsonRoute } from "@/server/http";
import { foundTradePost } from "./post";

export const POST = foundTradePost(jsonRoute);
