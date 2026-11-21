import Link from "next/link";
import type { FriendRow } from "@/server/services/friends";
import styles from "./ShoeboxTop.module.css";

type FriendId = FriendRow["id"];

export type ShoeboxTopProps = {
  total: number;
  friends: Pick<FriendRow, "id" | "name">[];
  selected: FriendId | null;
  onSelect: (id: FriendId | null) => void;
};

const INK = "#2A2140";

export function ShoeboxTop({
  total,
  friends,
  selected,
  onSelect,
}: ShoeboxTopProps) {
  const chips: { id: FriendId | null; name: string }[] = [
    { id: null, name: "Everyone" },
    ...friends,
  ];

  return (
    <>
      <header className={styles.header}>
        <Link
          href="/more"
          aria-label="Back to the post office"
          className={styles.back}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M15 5 L8 12 L15 19"
              fill="none"
              stroke={INK}
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <h1 className={styles.title}>Shoebox</h1>
        <p className={styles.count}>
          {total} {total === 1 ? "note" : "notes"}
        </p>
      </header>
      <div className={styles.chips}>
        {chips.map((chip) => (
          <button
            key={chip.id ?? "everyone"}
            type="button"
            aria-pressed={chip.id === selected}
            className={styles.chip}
            onClick={() => onSelect(chip.id)}
          >
            {chip.name}
          </button>
        ))}
      </div>
    </>
  );
}
