import { jsonRoute } from "@/server/http";
import { authRoutes } from "../handlers";

export const GET = authRoutes(jsonRoute).session;
