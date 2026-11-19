import type { Metadata } from "next";
import { TokensPanel } from "./TokensPanel";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Components" };

export default function ComponentsPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Components</h1>
      <TokensPanel />
    </main>
  );
}
