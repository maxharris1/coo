"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Bird, type GearId, type Look } from "@/components/Bird";
import { GearIcon } from "@/components/GearIcon";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import { feedThenRefresh } from "../../../flockRows";
import {
  closetCells,
  effectsFor,
  pick,
  type Cell,
  type Wardrobe,
} from "./closet";
import styles from "./page.module.css";
import { putGear } from "./wear";

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} aria-label={label} className={styles.back}>
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M15 5 L8 12 L15 19"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}

const statusOf = (cell: Exclude<Cell, { kind: "store" }>) => {
  switch (cell.kind) {
    case "wearing":
      return "Wearing";
    case "owned":
      return "Owned";
    case "on":
      return `On ${cell.birdName}`;
  }
};

const byShelf = (cells: Cell[]) => [
  ...cells.filter((c) => c.kind !== "store"),
  ...cells.filter((c) => c.kind === "store"),
];

function tile(
  cell: Cell,
  next: GearId[] | null,
  dress: (items: GearId[]) => void,
) {
  const icon = <GearIcon id={cell.item} size={40} />;
  if (cell.kind === "store") {
    return (
      <Link
        key={cell.item}
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
      key={cell.item}
      type="button"
      aria-pressed={cell.kind === "wearing"}
      className={`${styles.tile} ${cell.kind === "wearing" ? styles.wearing : styles.owned}`}
      disabled={next === null}
      onClick={() => next && dress(next)}
    >
      {icon}
      <span className={styles.tileName}>{cell.name}</span>
      <span className={styles.tileStatus}>{statusOf(cell)}</span>
    </button>
  );
}

export default function ClosetPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, refresh } = useSync();
  const toast = useToast();
  if (!data) {
    if (!error) return <Loader />;
    return (
      <main className={styles.screen}>
        <BackLink href="/" label="Back to the loft" />
        <p role="alert">{error}</p>
        <button type="button" className={styles.retry} onClick={refresh}>
          Try again
        </button>
      </main>
    );
  }

  const bird = data.birds.find((b) => b.id === id);
  if (!bird) {
    return (
      <main className={styles.screen}>
        <BackLink href="/" label="Back to the loft" />
        <p>Could not find that bird.</p>
      </main>
    );
  }

  const wardrobe: Wardrobe = {
    bird,
    birds: data.birds,
    closet: data.closet,
    now: data.serverNow,
  };
  const worn = bird.gear as GearId[];
  const effects = effectsFor(worn);
  const dress = (items: GearId[]) =>
    void feedThenRefresh(
      bird.id,
      (birdId) => putGear(birdId, items),
      refresh,
      toast,
    );

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <BackLink href={`/birds/${bird.id}`} label={`Back to ${bird.name}`} />
        <h1 className={styles.title}>Flock closet</h1>
        <Link href="/shop" className={styles.storeLink}>
          Store
        </Link>
      </header>
      <section className={styles.stand}>
        <Bird
          look={bird.look as Look}
          breed={bird.breed}
          gear={worn}
          pose="perched"
          size={176}
          title={`${bird.name} wearing the outfit you picked`}
        />
        <div className={styles.effects}>
          <h2 className={styles.effectsHeading}>What it does</h2>
          {effects.length === 0 ? (
            <p className={styles.effect}>Nothing on yet.</p>
          ) : (
            <ul className={styles.effectList}>
              {effects.map((effect) => (
                <li key={effect} className={styles.effect}>
                  {effect}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <section className={styles.section}>
        <div className={styles.sectionTop}>
          <h2 className={styles.heading}>Closet</h2>
          <p className={styles.hint}>
            {`Shared by every bird. Tap to dress ${bird.name}.`}
          </p>
        </div>
        <div className={styles.grid}>
          {byShelf(closetCells(wardrobe)).map((cell) =>
            tile(cell, pick(worn, cell), dress),
          )}
        </div>
      </section>
    </main>
  );
}
