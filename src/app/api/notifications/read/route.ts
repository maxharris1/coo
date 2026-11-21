import { jsonRoute } from "@/server/http";
import { notificationsReadPost } from "./post";

export const POST = notificationsReadPost(jsonRoute);
