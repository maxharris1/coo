import { jsonRoute } from "@/server/http";
import { settingsPatch } from "./patch";

export const PATCH = settingsPatch(jsonRoute);
