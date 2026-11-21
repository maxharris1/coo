import { jsonRoute } from "@/server/http";
import { pushSubscribePost } from "./post";

export const POST = pushSubscribePost(jsonRoute);
