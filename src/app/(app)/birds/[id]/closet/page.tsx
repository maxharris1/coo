"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { Bird, type GearId, type Look } from "@/components/Bird";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import { ClosetTile } from "./ClosetTile";
import {
  applyOutfit,
  closetCells,
  effectsFor,
  pick,
  skippedNote,
  type Cell,
  type Wardrobe,
} from "./closet";
import styles from "./page.module.css";
import { putGear, type GearBody } from "./wear";

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

type Picked = {
  birdId: string;
  worn: GearId[];
  done: Promise<void>;
  savedAt: number | null;
};

const byShelf = (cells: Cell[]) => [
  ...cells.filter((c) => c.kind !== "store"),
  ...cells.filter((c) => c.kind === "store"),
];

export default function ClosetPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, offsetMs, refresh } = useSync();
  const toast = useToast();
  const [picked, setPicked] = useState<Picked | null>(null);
  const latest = useRef<Picked | null>(null);
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

  const fetchedAt = data.serverNow - offsetMs;
  const held = (p: Picked | null) =>
    p?.birdId === bird.id && (p.savedAt === null || fetchedAt <= p.savedAt)
      ? p.worn
      : null;
  const worn = held(picked) ?? (bird.gear as GearId[]);
  const wardrobeFor = (gear: GearId[]): Wardrobe => ({
    bird: { ...bird, gear },
    birds: data.birds,
    closet: data.closet,
    now: data.serverNow,
  });
  const cells = closetCells(wardrobeFor(worn));
  const effects = effectsFor(worn);
  const pin = (p: Picked) => {
    latest.current = p;
    setPicked(p);
  };
  const selection = () => held(latest.current) ?? worn;
  const save = (next: GearId[], body: GearBody = { items: next }) => {
    const base = selection();
    const done: Promise<void> = (latest.current?.done ?? Promise.resolve())
      .then(() => putGear(bird.id, body))
      .then(
        (skipped) => {
          const note = skippedNote(bird.name, skipped);
          if (note) toast(note);
          return next;
        },
        (err: unknown) => {
          toast(err instanceof Error ? err.message : String(err));
          return base;
        },
      )
      .then((worn) => {
        if (latest.current?.done !== done) return;
        pin({ birdId: bird.id, worn, done, savedAt: Date.now() });
        refresh();
      });
    pin({ birdId: bird.id, worn: next, done, savedAt: null });
  };
  const dress = (item: GearId) => {
    const current = selection();
    const cell = closetCells(wardrobeFor(current)).find((c) => c.item === item);
    const next = cell && pick(current, cell);
    if (next) save(next);
  };
  const outfits = data.outfits.map((outfit) => {
    const gear = applyOutfit(wardrobeFor(worn), outfit);
    const wearing =
      gear.length > 0 &&
      gear.length === worn.length &&
      gear.every((item) => worn.includes(item));
    return { outfit, gear, wearing };
  });

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
      {outfits.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionTop}>
            <h2 className={styles.heading}>Saved outfits</h2>
          </div>
          <div className={styles.chips}>
            {outfits.map(({ outfit, gear, wearing }) => (
              <button
                key={outfit.id}
                type="button"
                className={styles.chip}
                aria-pressed={wearing}
                disabled={gear.length === 0}
                onClick={() => save(gear, { outfitId: outfit.id })}
              >
                {outfit.name}
              </button>
            ))}
          </div>
        </section>
      )}
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
