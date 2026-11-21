import { jsonRoute } from "@/server/http";
import { aviaryGet } from "./get";

export const GET = aviaryGet(jsonRoute);
