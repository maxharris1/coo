import { jsonRoute } from "@/server/http";
import { devClockPost } from "./post";

export const POST = devClockPost(jsonRoute);
