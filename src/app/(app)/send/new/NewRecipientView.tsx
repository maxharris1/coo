import Link from "next/link";
import emptyStates from "../../../../../assets/copy/empty-states.json";
import type { PlaceResult } from "../../welcome/loft/roost";
import {
  canGoNext,
  HELPER,
  NAME_MAX,
  nextHref,
  steps,
  type Search,
} from "./newRecipient";
import styles from "./NewRecipient.module.css";

export type NewRecipientViewProps = {
  name: string;
  query: string;
  search: Search;
  pickedId: string | null;
  onName: (name: string) => void;
  onQuery: (query: string) => void;
  onPick: (place: PlaceResult) => void;
};

const PLACE_NOT_FOUND =
  emptyStates.find((s) => s.state === "Place not found")?.text ?? "";

function Places({
  search,
  pickedId,
  onPick,
}: Pick<NewRecipientViewProps, "search" | "pickedId" | "onPick">) {
  switch (search.kind) {
    case "idle":
    case "failed":
      return null;
    case "loading":
      return (
        <p role="status" aria-busy="true" className={styles.empty}>
          Looking for that place.
        </p>
      );
    case "results":
      if (search.results.length === 0)
        return (
          <p role="status" className={styles.empty}>
            {PLACE_NOT_FOUND}
          </p>
        );
      return search.results.map((place) => {
        const picked = place.placeId === pickedId;
        return (
          <button
            key={place.placeId}
            type="button"
            aria-pressed={picked}
            className={styles.place}
            onClick={() => onPick(place)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 21 C7 15 5 12 5 9 a7 7 0 0 1 14 0 c0 3 -2 6 -7 12 Z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            <span className={styles.placeText}>
              <span className={styles.placeLabel}>{place.label}</span>
              <span className={styles.helper}>{HELPER[place.kind]}</span>
            </span>
            {picked && (
              <span className={styles.check}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M5 12.5 L10 17.5 L19 7" />
                </svg>
              </span>
            )}
          </button>
        );
      });
  }
}

export function NewRecipientView({
  name,
  query,
  search,
  pickedId,
  onName,
  onQuery,
  onPick,
}: NewRecipientViewProps) {
  const { heading, lines } = steps(name);
  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <Link
          href="/send"
          aria-label="Back to the list"
          className={styles.back}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5 L8 12 L15 19" />
          </svg>
        </Link>
        <h1 className={styles.title}>Someone new</h1>
      </header>

      <div className={styles.field}>
        <label htmlFor="r-name" className={styles.label}>
          Their name
        </label>
        <input
          id="r-name"
          type="text"
          autoComplete="off"
          maxLength={NAME_MAX}
          className={styles.input}
          value={name}
          onChange={(e) => onName(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="r-place" className={styles.label}>
          Where should the bird fly?
        </label>
        <input
          id="r-place"
          type="text"
          autoComplete="off"
          className={styles.input}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
        <Places search={search} pickedId={pickedId} onPick={onPick} />
      </div>

      <section className={styles.field}>
        <h2 className={styles.label}>{heading}</h2>
        <ol className={styles.steps}>
          {lines.map((line, i) => (
            <li key={line} className={styles.step}>
              <span aria-hidden="true" className={styles.number}>
                {i + 1}
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className={styles.footer}>
        {pickedId !== null && canGoNext(name, pickedId) ? (
          <Link
            href={nextHref({ name, placeId: pickedId })}
            className={styles.next}
          >
            Next: write the note
          </Link>
        ) : (
          <span role="link" aria-disabled="true" className={styles.next}>
            Next: write the note
          </span>
        )}
      </div>
    </main>
  );
}
