import { Loader } from "@/components/Loader";
import type { NotesPage } from "@/server/services/notes";
import { NoteCard } from "./NoteCard";
import { ShoeboxTop, type ShoeboxTopProps } from "./ShoeboxTop";
import styles from "./Shoebox.module.css";

export type List =
  | { kind: "loading" }
  | { kind: "failed" }
  | ({ kind: "ready"; loadingMore: boolean } & NotesPage);

export type ShoeboxViewProps = {
  list: List;
  friends: ShoeboxTopProps["friends"];
  selected: ShoeboxTopProps["selected"];
  timeZone: string;
  onSelect: ShoeboxTopProps["onSelect"];
  onMore: () => void;
};

export function ShoeboxView({
  list,
  friends,
  selected,
  timeZone,
  onSelect,
  onMore,
}: ShoeboxViewProps) {
  if (list.kind === "loading") return <Loader />;
  return (
    <div className={styles.screen}>
      {list.kind === "ready" && (
        <>
          <ShoeboxTop
            total={list.total}
            friends={friends}
            selected={selected}
            onSelect={onSelect}
          />
          {list.notes.length === 0 ? (
            <p className={styles.empty}>
              No notes yet. Send one and it lives here.
            </p>
          ) : (
            <div className={styles.list}>
              {list.notes.map((note, index) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  index={index}
                  timeZone={timeZone}
                />
              ))}
            </div>
          )}
          {list.nextCursor && (
            <button
              type="button"
              className={styles.more}
              disabled={list.loadingMore}
              onClick={onMore}
            >
              More notes
            </button>
          )}
        </>
      )}
    </div>
  );
}
