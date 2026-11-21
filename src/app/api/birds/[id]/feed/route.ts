import { jsonRoute } from "@/server/http";
import { birdCarePost } from "../carePost";

export const POST = birdCarePost(jsonRoute, "feed");
