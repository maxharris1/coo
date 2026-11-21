import { jsonRoute } from "@/server/http";
import { notificationsGet } from "./get";

export const GET = notificationsGet(jsonRoute);
