import type { Metadata } from "next";
import { config } from "@/lib/config";
import { LegalPage } from "../LegalPage";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return <LegalPage doc={config.copy.legal.privacy} />;
}
