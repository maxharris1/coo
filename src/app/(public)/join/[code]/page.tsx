import type { Metadata } from "next";
import { makeDeps } from "@/server/deps";
import { headersJar } from "@/server/supabase/cookies";
import { joinState } from "./joinState";
import { JoinView } from "./JoinView";

export const metadata: Metadata = { title: "Join" };

export const dynamic = "force-dynamic";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const deps = await makeDeps();
  const { name, signedIn } = await joinState(
    { auth: deps.auth(await headersJar()), db: deps.db },
    code,
  );
  return <JoinView name={name} code={code} signedIn={signedIn} />;
}
