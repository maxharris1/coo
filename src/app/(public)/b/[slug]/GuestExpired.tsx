import Link from "next/link";
import { Bird } from "@/components/Bird";
import { config } from "@/lib/config";
import styles from "./Guest.module.css";

const COPY = {
  expired: {
    title: "This link has expired",
    body: "Guest links last seven days after the bird lands. The note is safe with whoever sent it. Ask them to send another pigeon.",
  },
  reported: {
    title: "Thanks for telling us",
    body: "This link is closed and we will look at it.",
  },
  missing: {
    title: "No bird is flying on that link",
    body: "Check the link in the text you were sent. If it is right, this pigeon is not flying any more.",
  },
} as const;

export function GuestExpired({ kind }: { kind: keyof typeof COPY }) {
  const copy = COPY[kind];
  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <p className={styles.logo}>{config.app.name.toLowerCase()}</p>
        <span className={styles.chip}>No app needed</span>
      </header>
      <div className={styles.head}>
        <h1 className={styles.title}>{copy.title}</h1>
        <p className={styles.lede}>{copy.body}</p>
      </div>
      <div className={styles.empty} aria-hidden="true">
        <Bird look="gerald" pose="perched" size={160} />
      </div>
      <div className={styles.actions}>
        <Link href="/welcome" className={styles.cta}>
          Get your own pigeon
        </Link>
        <Link href="/welcome" className={styles.link}>
          What is this?
        </Link>
      </div>
    </main>
  );
}
