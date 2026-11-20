import { jsonRoute } from "@/server/http";
import { syncGet } from "./get";

export const GET = syncGet(jsonRoute);
