import type { Metadata } from "next";
import { config } from "@/lib/config";
import { OfflineLine } from "../../OfflineBanner";
import styles from "../auth.module.css";

export const metadata: Metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className={styles.page}>
      <div className={styles.brand}>
        <h1 className={styles.logo}>{config.app.name.toLowerCase()}</h1>
        <p className={styles.tagline}>{config.app.tagline}</p>
      </div>
      <OfflineLine />
    </main>
  );
}
