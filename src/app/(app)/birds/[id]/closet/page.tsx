"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { Bird, type GearId, type Look } from "@/components/Bird";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import { useToast } from "@/components/Toasts";
import { ClosetTile } from "./ClosetTile";
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

const byShelf = (cells: Cell[]) => [
  ...cells.filter((c) => c.kind !== "store"),
  ...cells.filter((c) => c.kind === "store"),
];

export default function ClosetPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, refresh } = useSync();
  const toast = useToast();
  const [shown, setShown] = useState<{
    data: SyncPayload;
    birdId: string;
    worn: GearId[];
  } | null>(null);
  const saving = useRef<{
    birdId: string;
    worn: GearId[];
    done: Promise<void>;
  } | null>(null);
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

  const worn =
    shown?.data === data && shown.birdId === bird.id
      ? shown.worn
      : (bird.gear as GearId[]);
  const wardrobeFor = (gear: GearId[]): Wardrobe => ({
    bird: { ...bird, gear },
    birds: data.birds,
    closet: data.closet,
    now: data.serverNow,
  });
  const cells = closetCells(wardrobeFor(worn));
  const effects = effectsFor(worn);
  const dress = (item: GearId) => {
    const current =
      saving.current?.birdId === bird.id ? saving.current.worn : worn;
    const cell = closetCells(wardrobeFor(current)).find((c) => c.item === item);
    const next = cell && pick(current, cell);
    if (!next) return;
    setShown({ data, birdId: bird.id, worn: next });
    const done = (saving.current?.done ?? Promise.resolve())
      .then(() => putGear(bird.id, next))
      .catch((err: unknown) => {
        setShown(null);
        toast(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (saving.current?.done !== done) return;
        saving.current = null;
        refresh();
      });
    saving.current = { birdId: bird.id, worn: next, done };
  };

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
          {byShelf(cells).map((cell) => (
            <ClosetTile
              key={cell.item}
              cell={cell}
              enabled={pick(worn, cell) !== null}
              dress={dress}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
