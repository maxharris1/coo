import { jsonRoute } from "@/server/http";
import { pushUnsubscribePost } from "./post";

export const POST = pushUnsubscribePost(jsonRoute);
