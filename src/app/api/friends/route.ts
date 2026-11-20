import { jsonRoute } from "@/server/http";
import { friendsGet } from "./get";

export const GET = friendsGet(jsonRoute);
