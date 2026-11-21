"use client";

import Link from "next/link";
import styles from "../../auth.module.css";
import { rememberReturn } from "../returnTo";

export function GetAPigeon({ code }: { code: string }) {
  return (
    <Link
      href="/sign-in"
      className={styles.primary}
      onClick={() => rememberReturn(code)}
    >
      Get a pigeon
    </Link>
  );
}
