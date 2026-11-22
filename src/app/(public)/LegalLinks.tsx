import Link from "next/link";
import { config } from "@/lib/config";
import styles from "./LegalLinks.module.css";

export function LegalLinks() {
  return (
    <nav aria-label="Legal" className={styles.links}>
      <Link href="/privacy">{config.copy.legal.privacy.title}</Link>
      <Link href="/terms">{config.copy.legal.terms.title}</Link>
    </nav>
  );
}
