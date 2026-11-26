import Link from "next/link";
import type { GearId } from "@/components/Bird";
import { GearIcon } from "@/components/GearIcon";
import type { Cell } from "./closet";
import styles from "./page.module.css";

const statusOf = (cell: Exclude<Cell, { kind: "store" }>) => {
  switch (cell.kind) {
    case "wearing":
      return "Wearing";
    case "owned":
      return "Owned";
  }
};

export function ClosetTile({
  cell,
  enabled,
  dress,
}: {
  cell: Cell;
  enabled: boolean;
  dress: (item: GearId) => void;
}) {
  const icon = <GearIcon id={cell.item} size={40} />;
  if (cell.kind === "store") {
    return (
      <Link
        href="/shop"
        aria-label={`${cell.name}, ${cell.price} seeds in the store`}
        className={`${styles.tile} ${styles.store}`}
      >
        {icon}
        <span className={styles.tileName}>{cell.name}</span>
        <span className={styles.tileStatus}>{`${cell.price} seeds`}</span>
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={cell.kind === "wearing"}
      className={`${styles.tile} ${cell.kind === "wearing" ? styles.wearing : styles.owned}`}
      disabled={!enabled}
      onClick={() => dress(cell.item)}
    >
      {icon}
      <span className={styles.tileName}>{cell.name}</span>
      <span className={styles.tileStatus}>{statusOf(cell)}</span>
    </button>
  );
}
