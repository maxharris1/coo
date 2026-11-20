import { jsonRoute } from "@/server/http";
import { authRoutes } from "../handlers";

export const POST = authRoutes(jsonRoute).signOut;
