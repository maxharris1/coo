import { jsonRoute } from "@/server/http";
import { inviteGet } from "./get";

export const GET = inviteGet(jsonRoute);
