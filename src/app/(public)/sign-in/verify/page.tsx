import type { Metadata } from "next";
import { config } from "@/lib/config";
import styles from "../../auth.module.css";
import { CodeForm } from "./CodeForm";

export const metadata: Metadata = { title: "What's the code?" };

export default function CodePage() {
  return (
    <main className={styles.page}>
      <div className={styles.brand}>
        <p className={styles.logo}>{config.app.name.toLowerCase()}</p>
        <p className={styles.tagline}>{config.app.tagline}</p>
      </div>
      <h1 className={styles.title}>What&apos;s the code?</h1>
      <CodeForm />
    </main>
  );
}
