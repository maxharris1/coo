import type { WaitingGuestLink } from "@/server/services/friends";
import styles from "./Friends.module.css";

export function GuestLinksWaiting({ links }: { links: WaitingGuestLink[] }) {
  if (links.length === 0) return null;
  return (
    <section className={styles.list} aria-labelledby="waiting-title">
      <div className={styles.listHead}>
        <h2 id="waiting-title" className={styles.count}>
          Waiting on a link
        </h2>
      </div>
      <ul className={styles.rows}>
        {links.map((link) => (
          <li key={link.id} className={`${styles.row} ${styles.waiting}`}>
            <span
              aria-hidden="true"
              className={`${styles.avatar} ${styles.peach}`}
            >
              {link.name.charAt(0).toUpperCase()}
            </span>
            <span className={styles.who}>
              <span className={styles.name}>{link.name}</span>
              <span className={styles.line}>
                Link sent. Flying to {link.where}.
              </span>
            </span>
            <span className={styles.pending}>Pending</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
