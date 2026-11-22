import Link from "next/link";
import styles from "./JobError.module.css";

const MESSAGES: Record<string, string> = {
  not_found: "We could not find this job.",
};
const UNREACHABLE = "We could not reach the loft. Try again.";

export function JobError({ code }: { code: string }) {
  return (
    <div className={styles.page} role="alert">
      <p className={styles.message}>{MESSAGES[code] ?? UNREACHABLE}</p>
      <Link href="/earn" className={styles.back}>
        Back to Earn
      </Link>
    </div>
  );
}
