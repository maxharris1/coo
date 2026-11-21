import { jsonRoute } from "@/server/http";
import { jobsPost } from "./post";

export const POST = jobsPost(jsonRoute);
