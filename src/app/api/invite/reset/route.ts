import { jsonRoute } from "@/server/http";
import { inviteResetPost } from "./post";

export const POST = inviteResetPost(jsonRoute);
