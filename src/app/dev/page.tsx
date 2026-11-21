import type { Metadata } from "next";
import { SyncProvider } from "@/components/SyncProvider";
import { DevPanel } from "./DevPanel";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Dev" };

export default function DevPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Dev</h1>
      <SyncProvider>
        <DevPanel />
      </SyncProvider>
    </main>
  );
}
