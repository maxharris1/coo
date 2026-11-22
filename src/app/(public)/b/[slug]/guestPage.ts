import { AppError } from "@/server/errors";
import type { GuestView } from "@/server/services/guestLinks/get";

export type GuestPage =
  | { kind: "live"; token: string; guest: GuestView }
  | { kind: "expired" | "missing" };

export function tokenFromSlug(slug: string): string {
  return slug.slice(slug.lastIndexOf("-") + 1);
}

export async function loadGuestPage(
  read: (token: string) => Promise<GuestView>,
  slug: string,
): Promise<GuestPage> {
  const token = tokenFromSlug(slug);
  try {
    return { kind: "live", token, guest: await read(token) };
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    if (err.code === "gone") return { kind: "expired" };
    if (err.code === "not_found") return { kind: "missing" };
    throw err;
  }
}
