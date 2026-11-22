import type { Metadata } from "next";
import { headers } from "next/headers";
import { getEnv } from "@/env";
import { clientIp } from "@/server/clientIp";
import { makeDeps } from "@/server/deps";
import { loftTimeZone } from "@/server/loftTimeZone";
import { getGuestLink } from "@/server/services/guestLinks/get";
import { headersJar } from "@/server/supabase/cookies";
import { GuestExpired } from "./GuestExpired";
import { isMember, loadGuestPage } from "./guestPage";
import { GuestView } from "./GuestView";

export const metadata: Metadata = {
  title: "A pigeon is on its way",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

export default async function GuestPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const deps = await makeDeps();
  const ip = clientIp(
    new Request("http://guest", { headers: await headers() }),
  );
  const page = await loadGuestPage(
    (token) => getGuestLink(deps, getEnv().LINK_TOKEN_PEPPER, ip, token),
    slug,
  );
  if (page.kind !== "live") return <GuestExpired kind={page.kind} />;
  const member = await isMember({
    auth: deps.auth(await headersJar()),
    db: deps.db,
  });
  return (
    <GuestView
      guest={page.guest}
      token={page.token}
      serverNow={deps.clock.now()}
      timeZone={loftTimeZone(page.guest.flight.to)}
      member={member}
    />
  );
}
