import { jsonRoute } from "@/server/http";
import { friendBlockPost } from "./post";

export const POST = friendBlockPost(jsonRoute);
