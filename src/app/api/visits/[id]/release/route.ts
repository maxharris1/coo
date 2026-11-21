import { jsonRoute } from "@/server/http";
import { visitReleasePost } from "./post";

export const POST = visitReleasePost(jsonRoute);
