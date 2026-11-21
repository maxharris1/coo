import type { Metadata } from "next";
import Link from "next/link";
import { config } from "@/lib/config";
import { LegalPage } from "../LegalPage";
import legal from "../legal.module.css";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  const terms = config.copy.legal.terms;
  return (
    <LegalPage
      doc={terms}
      footer={
        <Link href="/privacy" className={legal.link}>
          {terms.privacyLink}
        </Link>
      }
    />
  );
}
