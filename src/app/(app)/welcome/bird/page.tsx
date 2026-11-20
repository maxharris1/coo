import type { Metadata } from "next";
import { config } from "@/lib/config";
import { FirstBird } from "./FirstBird";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Meet your first bird" };

export default function FirstBirdPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <p className={styles.logo}>{config.app.name.toLowerCase()}</p>
          <p className={styles.tagline}>{config.app.tagline}</p>
        </div>
        <p className={styles.pill}>Step 2 of 3</p>
      </header>
      <h1 className={styles.title}>Meet your first bird</h1>
      <FirstBird />
    </main>
  );
}
