import type { ReactElement } from "react";
import { GearIcon } from "@/components/GearIcon";
import { isGearId } from "@/lib/game/gear";
import type { BuyRow, ShopRow } from "./shop";
import styles from "./ShopItems.module.css";
import { INK, SUN, SeedIcon } from "./ShopTop";

const CARD = "#FFFBF0";
const WOOD = "#D99A6C";
const TOMATO = "#F4623F";
const MINT = "#86D9A0";
const ROSE = "#F59C8E";

export type SeedBurst = { itemId: string; seq: number };

type Tint = "sky" | "lilac" | "sun" | "peach";

const TINTS: Partial<Record<string, Tint>> = {
  goggles: "sky",
  nightgoggles: "lilac",
  rainhat: "sky",
  cap: "lilac",
  tube: "sun",
  booties: "peach",
  birdbath: "sky",
  perch: "sun",
  espresso: "peach",
  "flower-boxes": "peach",
  weathervane: "sky",
  "espresso-cart": "lilac",
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

function CupIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 32 32">
      <path
        d="M7 13 H22 V20 Q22 26 14.5 26 Q7 26 7 20 Z"
        fill={CARD}
        stroke={INK}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M22 15 H24.5 Q27 15 27 17.5 Q27 20 24.5 20 H22"
        fill="none"
        stroke={INK}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M9.4 15.6 H19.6"
        stroke="#D99A6C"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M5 29 H24"
        stroke={INK}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M11 10 q2 -2.5 0 -5 M16 10 q2 -2.5 0 -5"
        fill="none"
        stroke={INK}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FlowerBoxIcon() {
  const flowers = [TOMATO, CARD, ROSE, SUN];
  return (
    <svg width="38" height="38" viewBox="0 0 32 32">
      <g stroke={INK} strokeWidth="2" strokeLinejoin="round">
        {[8, 13.3, 18.6, 24].map((cx) => (
          <circle key={cx} cx={cx} cy="17" r="3.6" fill={MINT} />
        ))}
        {flowers.map((fill, i) => (
          <circle
            key={i}
            cx={8.5 + i * 5}
            cy={12.5 + (i % 2)}
            r="2.8"
            fill={fill}
            strokeWidth="1.6"
          />
        ))}
        <rect x="3" y="19" width="26" height="9" rx="2.5" fill={WOOD} />
      </g>
      <path
        d="M5 23 H27"
        stroke={INK}
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity=".6"
      />
    </svg>
  );
}

function WeathervaneIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 32 32">
      <g
        stroke={INK}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M16 13 V29 M11 29 H21" fill="none" />
        <path d="M6 13 H24" fill="none" />
        <path d="M23 9 L29 13 L23 17 Z" fill={SUN} />
        <path d="M7 9 L3 13 L7 17 Z" fill={SUN} />
        <path
          d="M11 13 Q11 7 16 7 Q19 3.5 21.5 6.5 L24.5 7.3 L21.5 8.7 Q21.5 13 16 13 Z"
          fill={CARD}
          strokeWidth="2"
        />
        <circle cx="16" cy="21" r="2.4" fill={SUN} strokeWidth="1.8" />
      </g>
      <circle cx="19" cy="7.6" r=".9" fill={INK} />
    </svg>
  );
}

function EspressoCartIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 32 32">
      <g
        stroke={INK}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 10 V18 M25 10 V18" fill="none" />
        {[5, 10.5, 16, 21.5].map((x, i) => (
          <path
            key={x}
            d={`M${x} 6 h5.5 v3.5 a2.75 2.75 0 0 1 -5.5 0 Z`}
            fill={i % 2 === 0 ? TOMATO : CARD}
          />
        ))}
        <rect x="4" y="3" width="24" height="4" rx="2" fill={TOMATO} />
        <path d="M13.5 11.5 H19 L18.3 16 H14.2 Z" fill={CARD} />
        <rect x="5" y="18" width="22" height="7" rx="2" fill={CARD} />
        <rect x="4" y="16" width="24" height="3" rx="1.5" fill={WOOD} />
        <circle cx="10" cy="27" r="3" fill={CARD} />
        <circle cx="22" cy="27" r="3" fill={CARD} />
      </g>
    </svg>
  );
}

const LOFT_ICONS: Partial<Record<string, () => ReactElement>> = {
  birdbath: BirdbathIcon,
  perch: PerchIcon,
  espresso: CupIcon,
  "flower-boxes": FlowerBoxIcon,
  weathervane: WeathervaneIcon,
  "espresso-cart": EspressoCartIcon,
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
  orphan = null,
  onBuy,
}: {
  rows: ShopRow[];
  burst: SeedBurst | null;
  orphan?: SeedBurst | null;
  onBuy: (row: BuyRow) => void;
}) {
  const items = rows.map((row) => (
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
        <div className={styles.effect}>
          {row.effect}
          {row.held !== undefined && (
            <span className={styles.held}>{row.held} owned</span>
          )}
        </div>
      </div>
      <Action row={row} onBuy={onBuy} />
      {burst?.itemId === row.itemId && <Burst key={burst.seq} />}
    </li>
  ));
  if (orphan)
    items.push(
      <li key={orphan.itemId} aria-hidden="true" className={styles.vacated}>
        <Burst key={orphan.seq} />
      </li>,
    );
  return <ul className={styles.rows}>{items}</ul>;
}

export function ShopItems({
  gear,
  loft,
  burst,
  onBuy,
}: {
  gear: ShopRow[];
  loft: ShopRow[];
  burst: SeedBurst | null;
  onBuy: (row: BuyRow) => void;
}) {
  const orphan =
    burst && ![...gear, ...loft].some((row) => row.itemId === burst.itemId)
      ? burst
      : null;
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
      <Rows rows={loft} burst={burst} orphan={orphan} onBuy={onBuy} />
    </main>
  );
}
