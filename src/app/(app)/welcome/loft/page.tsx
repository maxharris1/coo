import type { Metadata } from "next";
import { config } from "@/lib/config";
import { welcomeStep } from "../steps";
import { Loft } from "./Loft";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Where should birds find you?" };

const { number, total } = welcomeStep("/welcome/loft");

export default function LoftPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.logo}>{config.app.name.toLowerCase()}</p>
        <p className={styles.pill}>{`Step ${number} of ${total}`}</p>
      </header>
      <h1 className={styles.title}>Where should birds find you?</h1>
      <Loft />
    </main>
  );
}
