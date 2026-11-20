import { jsonRoute } from "@/server/http";
import { loftPost } from "./post";

export const POST = loftPost(jsonRoute);
