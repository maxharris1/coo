import { jsonRoute } from "@/server/http";
import { visitReplyPost } from "./post";

export const POST = visitReplyPost(jsonRoute);
