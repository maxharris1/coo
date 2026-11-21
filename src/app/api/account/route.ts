import { jsonRoute } from "@/server/http";
import { accountDelete } from "./delete";

export const DELETE = accountDelete(jsonRoute);
