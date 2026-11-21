import type { NextRequest } from "next/server";
import { z } from "zod";
import { AppError } from "@/server/errors";
import type { createJsonRoute } from "@/server/http";
import { getFlight } from "@/server/services/flights/get";

const FLIGHT_ID = z.uuid();

function flightIdFrom(req: NextRequest): string {
  const segments = req.nextUrl.pathname.split("/");
  const parsed = FLIGHT_ID.safeParse(segments[segments.indexOf("flights") + 1]);
  if (!parsed.success) throw new AppError("not_found", "No such flight");
  return parsed.data;
}

export function flightGet(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", {}, async ({ deps, caller, req }) => ({
    flight: await getFlight(deps, caller.userId, flightIdFrom(req)),
  }));
}
