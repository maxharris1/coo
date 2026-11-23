import type { Metadata } from "next";
import { inviteMetadata } from "@/lib/inviteCopy";
import { makeDeps } from "@/server/deps";
import { headersJar } from "@/server/supabase/cookies";
import { joinState } from "./joinState";
import { JoinView } from "./JoinView";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

async function lookup(params: Props["params"]) {
  const { code } = await params;
  const deps = await makeDeps();
  const state = await joinState(
    { auth: deps.auth(await headersJar()), db: deps.db },
    code,
  );
  return { code, ...state };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await lookup(params);
  return inviteMetadata(name);
}

export default async function JoinPage({ params }: Props) {
  const { code, name, signedIn } = await lookup(params);
  return <JoinView name={name} code={code} signedIn={signedIn} />;
}
