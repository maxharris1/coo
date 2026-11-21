import { jsonRoute } from "@/server/http";
import { flightsGet } from "./get";
import { flightsPost } from "./post";

export const POST = flightsPost(jsonRoute);
export const GET = flightsGet(jsonRoute);
