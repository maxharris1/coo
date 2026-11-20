import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { requireUser } from "@/server/auth";
import { Install } from "./Install";

export const metadata: Metadata = {
  title: `Put ${config.app.name} on your home screen`,
};

export const dynamic = "force-dynamic";

export default async function InstallPage() {
  const { profile } = await requireUser();
  if (profile?.onboarded_at) redirect("/");
  return <Install />;
}
