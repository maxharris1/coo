import type { Metadata } from "next";
import Link from "next/link";
import { Bird } from "@/components/Bird";
import { HatchScene } from "@/components/HatchScene";
import { config } from "@/lib/config";
import styles from "../auth.module.css";

export const metadata: Metadata = { title: "Hello" };

export default function HelloPage() {
  return (
    <main className={styles.page}>
      <div className={styles.brand}>
        <h1 className={styles.logo}>{config.app.name.toLowerCase()}</h1>
        <p className={styles.tagline}>{config.app.tagline}</p>
      </div>
      <div
        className={styles.hero}
        role="img"
        aria-label="A grey city pigeon, freshly hatched, standing between two halves of an eggshell and staring at you."
      >
        <HatchScene className={styles.scene} />
        <div className={styles.bird}>
          <Bird look="gerald" size={203} />
        </div>
      </div>
      <p className={styles.lede}>
        Write a note. Tie it to a pigeon. It flies there for real, on a real
        map, at pigeon speed.
      </p>
      <div className={styles.actions}>
        <Link href="/sign-in" className={styles.primary}>
          Get a pigeon
        </Link>
        <Link href="/sign-in" className={styles.secondary}>
          I already have a loft
        </Link>
      </div>
    </main>
  );
}
