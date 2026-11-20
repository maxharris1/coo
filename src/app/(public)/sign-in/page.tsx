import type { Metadata } from "next";
import { config } from "@/lib/config";
import styles from "../auth.module.css";
import { PhoneForm } from "./PhoneForm";

export const metadata: Metadata = { title: "What's your number?" };

export default function PhonePage() {
  return (
    <main className={styles.page}>
      <div className={styles.brand}>
        <p className={styles.logo}>{config.app.name.toLowerCase()}</p>
        <p className={styles.tagline}>{config.app.tagline}</p>
      </div>
      <h1 className={styles.title}>What&apos;s your number?</h1>
      <PhoneForm />
    </main>
  );
}
