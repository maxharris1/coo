import { jsonRoute } from "@/server/http";
import { shopGet } from "./get";

export const GET = shopGet(jsonRoute);
