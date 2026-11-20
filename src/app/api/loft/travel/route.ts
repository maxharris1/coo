import { jsonRoute } from "@/server/http";
import { loftTravelPost } from "./post";

export const POST = loftTravelPost(jsonRoute);
