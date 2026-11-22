import { jsonRoute } from "@/server/http";
import { birdsRoommatePost } from "./post";

export const POST = birdsRoommatePost(jsonRoute);
