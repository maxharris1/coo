import { jsonRoute } from "@/server/http";
import { birdWakePost } from "./post";

export const POST = birdWakePost(jsonRoute);
