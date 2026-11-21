import { jsonRoute } from "@/server/http";
import { flightSearchPartyPost } from "./post";

export const POST = flightSearchPartyPost(jsonRoute);
