import { jsonRoute } from "@/server/http";
import { visitSnackPost } from "./post";

export const POST = visitSnackPost(jsonRoute);
