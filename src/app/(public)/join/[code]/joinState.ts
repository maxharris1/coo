import { notFound } from "next/navigation";
import type { Session } from "@/server/auth";
import { AppError } from "@/server/errors";
import { inviterFor } from "@/server/services/friends";
import { INVITE_CODE } from "../returnTo";

export async function joinState(
  { auth, db }: Session,
  code: string,
): Promise<{ name: string; signedIn: boolean }> {
  if (!INVITE_CODE.test(code)) notFound();
  const { name } = await inviterFor(db, code).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  });
  return { name, signedIn: (await auth.currentUserId()) !== null };
}
