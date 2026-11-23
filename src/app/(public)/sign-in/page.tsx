import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { config } from "@/lib/config";
import styles from "../auth.module.css";
import { LegalLinks } from "../LegalLinks";
import { PhoneForm } from "./PhoneForm";

export const metadata: Metadata = { title: "What's your number?" };

const legal = config.copy.legal;
const links: Record<string, React.ReactNode> = {
  terms: <Link href="/terms">{legal.terms.title}</Link>,
  privacy: <Link href="/privacy">{legal.privacy.title}</Link>,
};

function Consent() {
  const parts = legal.consent.signIn.split(/\{(terms|privacy)\}/);
  return (
    <p className={styles.consent}>
      {parts.map((part, i) => (
        <Fragment key={i}>{i % 2 ? links[part] : part}</Fragment>
      ))}
    </p>
  );
}

export default function PhonePage() {
  return (
    <main className={styles.page}>
      <div className={styles.brand}>
        <p className={styles.logo}>{config.app.name.toLowerCase()}</p>
        <p className={styles.tagline}>{config.app.tagline}</p>
      </div>
      <h1 className={styles.title}>What&apos;s your number?</h1>
      <PhoneForm />
      <Consent />
      <LegalLinks />
    </main>
  );
}
