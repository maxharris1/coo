import { jsonRoute } from "@/server/http";
import { friendsJoinPost } from "./post";

export const POST = friendsJoinPost(jsonRoute);
