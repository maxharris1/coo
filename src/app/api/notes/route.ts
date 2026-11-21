import { jsonRoute } from "@/server/http";
import { notesGet } from "./get";

export const GET = notesGet(jsonRoute);
