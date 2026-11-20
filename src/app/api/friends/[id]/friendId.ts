import type { NextRequest } from "next/server";
import { z } from "zod";
import { AppError } from "@/server/errors";
import type { UserId } from "@/server/ports/auth";

const FRIEND_ID = z.uuid();

export function friendIdFrom(req: NextRequest): UserId {
  const segments = req.nextUrl.pathname.split("/");
  const parsed = FRIEND_ID.safeParse(segments[segments.indexOf("friends") + 1]);
  if (!parsed.success) throw new AppError("not_found", "No such friend");
  return parsed.data as UserId;
}
