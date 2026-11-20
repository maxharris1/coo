import type { Metadata } from "next";
import { config } from "@/lib/config";
import { Loft } from "./Loft";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Where should birds find you?" };

export default function LoftPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.logo}>{config.app.name.toLowerCase()}</p>
        <p className={styles.pill}>Step 3 of 3</p>
      </header>
      <h1 className={styles.title}>Where should birds find you?</h1>
      <Loft />
    </main>
  );
}
