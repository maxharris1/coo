import { jsonRoute } from "@/server/http";
import { friendPatch } from "./patch";

export const PATCH = friendPatch(jsonRoute);
