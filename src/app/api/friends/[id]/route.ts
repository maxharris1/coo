import { jsonRoute } from "@/server/http";
import { friendDelete } from "./delete";
import { friendPatch } from "./patch";

export const DELETE = friendDelete(jsonRoute);
export const PATCH = friendPatch(jsonRoute);
