import { jsonRoute } from "@/server/http";
import { shopBuyPost } from "./post";

export const POST = shopBuyPost(jsonRoute);
