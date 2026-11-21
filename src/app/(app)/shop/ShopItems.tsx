import type { ReactElement } from "react";
import { GearIcon } from "@/components/GearIcon";
import { isGearId } from "@/lib/game/gear";
import type { BuyRow, ShopRow } from "./shop";
import styles from "./ShopItems.module.css";
import { INK, SUN, SeedIcon } from "./ShopTop";

const CARD = "#FFFBF0";

type Tint = "sky" | "lilac" | "sun" | "peach";

const TINTS: Partial<Record<string, Tint>> = {
  goggles: "sky",
  rainhat: "sky",
  cap: "lilac",
  tube: "sun",
  booties: "peach",
  birdbath: "sky",
  perch: "sun",
};

function BirdbathIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 32 32">
      <path
        d="M6 20 Q16 30 26 20 Z"
        fill={CARD}
        stroke={INK}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M9 21.4 Q16 26 23 21.4"
        fill="none"
        stroke="#A9DDF7"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M16 25 V30 M11 30 H21"
        stroke={INK}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M12 14 q2 -3 0 -6 M17 15 q2 -3 0 -6 M22 14 q2 -3 0 -6"
        fill="none"
        stroke={INK}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PerchIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 32 32">
      <path
        d="M4 12 H28"
        stroke={INK}
        strokeWidth="6.4"
        strokeLinecap="round"
      />
      <path
        d="M4 12 H28"
        stroke="#D99A6C"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M8 11 H14"
        stroke={CARD}
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity=".7"
      />
      <path
        d="M16 14 V29 M10 29 H22"
        stroke={INK}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

const LOFT_ICONS: Partial<Record<string, () => ReactElement>> = {
  birdbath: BirdbathIcon,
  perch: PerchIcon,
};

function ItemIcon({ itemId }: { itemId: string }) {
  const Loft = LOFT_ICONS[itemId];
  if (Loft) return <Loft />;
  return isGearId(itemId) ? <GearIcon id={itemId} size={38} /> : null;
}

function Action({
  row,
  onBuy,
}: {
  row: ShopRow;
  onBuy: (row: BuyRow) => void;
}) {
  const { name, action } = row;
  switch (action.kind) {
    case "owned":
      return <div className={styles.chip}>{action.label}</div>;
    case "buy":
      return (
        <button
          type="button"
          aria-label={`Buy ${name} for ${action.price} seeds`}
          className={styles.price}
          onClick={() => onBuy({ ...row, action })}
        >
          <SeedIcon size={16} fill={CARD} />
          <span>{action.price}</span>
        </button>
      );
    case "short":
      return (
        <div className={styles.short}>
          <div className={styles.shortPrice}>
            <SeedIcon size={16} fill={SUN} />
            <span>{action.price}</span>
          </div>
          <div className={styles.toGo}>{action.toGo} to go</div>
        </div>
      );
  }
}

function Burst() {
  return (
    <span aria-hidden="true" className={styles.burst}>
      <span className={styles.seed}>
        <SeedIcon size={16} fill={SUN} />
      </span>
      <span className={`${styles.seed} ${styles.seedL}`}>
        <SeedIcon size={16} fill={SUN} />
      </span>
      <span className={`${styles.seed} ${styles.seedU}`}>
        <SeedIcon size={16} fill={SUN} />
      </span>
    </span>
  );
}

function Rows({
  rows,
  burst,
  onBuy,
}: {
  rows: ShopRow[];
  burst: string | null;
  onBuy: (row: BuyRow) => void;
}) {
  return (
    <ul className={styles.rows}>
      {rows.map((row) => (
        <li key={row.itemId} className={styles.row}>
          <div
            aria-hidden="true"
            className={styles.tile}
            style={{ background: `var(--coo-${TINTS[row.itemId] ?? "sky"})` }}
          >
            <ItemIcon itemId={row.itemId} />
          </div>
          <div className={styles.text}>
            <div className={styles.name}>{row.name}</div>
            <div className={styles.effect}>{row.effect}</div>
          </div>
          <Action row={row} onBuy={onBuy} />
          {burst === row.itemId && <Burst />}
        </li>
      ))}
    </ul>
  );
}

export function ShopItems({
  gear,
  loft,
  burst,
  onBuy,
}: {
  gear: ShopRow[];
  loft: ShopRow[];
  burst: string | null;
  onBuy: (row: BuyRow) => void;
}) {
  return (
    <main className={styles.list}>
      <div className={styles.head}>
        <h2 className={styles.heading}>Gear for the flock</h2>
        <div className={styles.hint}>Any bird can wear it</div>
      </div>
      <Rows rows={gear} burst={burst} onBuy={onBuy} />
      <div className={`${styles.head} ${styles.loftHead}`}>
        <h2 className={styles.heading}>For the loft</h2>
      </div>
      <Rows rows={loft} burst={burst} onBuy={onBuy} />
    </main>
  );
}
