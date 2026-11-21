import { jsonRoute } from "@/server/http";
import { flightCancelPost } from "./post";

export const POST = flightCancelPost(jsonRoute);
