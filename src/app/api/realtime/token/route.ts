import { jsonRoute } from "@/server/http";
import { realtimeTokenGet } from "./get";

export const GET = realtimeTokenGet(jsonRoute);
