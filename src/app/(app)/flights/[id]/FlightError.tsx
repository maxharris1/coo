import Link from "next/link";
import styles from "./FlightError.module.css";

const MESSAGES: Record<string, string> = {
  not_found: "We could not find this flight.",
};
const UNREACHABLE = "We could not reach the loft. Try again.";

export function FlightError({ code }: { code: string }) {
  return (
    <div className={styles.page} role="alert">
      <p className={styles.message}>{MESSAGES[code] ?? UNREACHABLE}</p>
      <Link href="/flights" className={styles.back}>
        Back to flights
      </Link>
    </div>
  );
}
