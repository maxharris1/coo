import Link from "next/link";
import {
  useEffect,
  useId,
  useReducer,
  useRef,
  type Dispatch,
  type FormEvent,
  type ReactNode,
} from "react";
import { config } from "@/lib/config";
import type { Units } from "@/lib/format";
import type { Me } from "@/server/rows";
import type { SettingsInput } from "@/server/services/settings";
import type { PlaceResult } from "../welcome/loft/roost";
import styles from "./Settings.module.css";
import sheetStyles from "./SettingsSheet.module.css";
import {
  CLOSED,
  sheetReducer,
  submitName,
  type Quiet,
  type Sheet as EditSheet,
  type SheetAction,
} from "./sheet";

type SwitchKey =
  | "notifyLandedIn"
  | "notifyLandedOut"
  | "notifyDelays"
  | "notifyHungry"
  | "smsFallback";

export type Change = Partial<
  Pick<SettingsInput, SwitchKey | "units" | keyof Quiet>
>;

export type Sheet = "travel" | "delete" | null;

export type SettingsViewProps = {
  me: Me;
  sheet: Sheet;
  places: PlaceResult[];
  onSave: (change: Change) => void;
  onRename: (name: string) => Promise<string | null>;
  onSignOut: () => void;
  onSheet: (sheet: Sheet) => void;
  onTravel: (on: boolean) => void;
  onSearch: (query: string) => void;
  onPlace: (placeId: string) => void;
  onDelete: (handle: string) => void;
};

const SWITCHES: readonly { key: SwitchKey; label: string }[] = [
  { key: "notifyLandedIn", label: "A bird lands on my sill" },
  { key: "notifyLandedOut", label: "My bird lands" },
  { key: "notifyDelays", label: "A bird is delayed or roosting" },
  { key: "notifyHungry", label: "A bird is hungry" },
  { key: "smsFallback", label: "Text me when a push can't reach me" },
];

const QUIET_LINE = "Birds still land. Your phone stays quiet.";

const HOURS = Array.from({ length: 24 }, (_, h) => h);

const UNITS: readonly { units: Units; label: string }[] = [
  { units: "mi", label: "Miles" },
  { units: "km", label: "Kilometres" },
];

function hour(h: number): string {
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}`;
}

function quietHours({ quietOn, quietStart, quietEnd }: Me["settings"]) {
  return quietOn ? `${hour(quietStart)} to ${hour(quietEnd)}` : "Off";
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 5 L16 12 L9 19"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{title}</h2>
      <div className={styles.card}>{children}</div>
    </section>
  );
}

function Label({ title, sub }: { title: string; sub?: string }) {
  return (
    <span className={styles.label}>
      <span className={styles.title}>{title}</span>
      {sub && <span className={styles.sub}>{sub}</span>}
    </span>
  );
}

function Row({
  title,
  sub,
  value,
}: {
  title: string;
  sub?: string;
  value: string;
}) {
  return (
    <div className={styles.row}>
      <Label title={title} sub={sub} />
      <span className={styles.value}>{value}</span>
    </div>
  );
}

function ButtonRow({
  title,
  sub,
  value,
  onClick,
}: {
  title: string;
  sub?: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.row} onClick={onClick}>
      <Label title={title} sub={sub} />
      <span className={styles.value}>
        {value}
        <Chevron />
      </span>
    </button>
  );
}

function Switch({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={styles.row}
      onClick={onToggle}
    >
      <Label title={label} />
      <span className={styles.track} aria-hidden="true">
        <span className={styles.knob} />
      </span>
    </button>
  );
}

function Dialog({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <div aria-hidden="true" className={styles.scrim} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={styles.sheet}
      >
        <h2 className={styles.sheetTitle}>{label}</h2>
        {children}
      </div>
    </>
  );
}

function TravelSheet({
  places,
  onTravel,
  onSearch,
  onPlace,
  onSheet,
}: Pick<
  SettingsViewProps,
  "places" | "onTravel" | "onSearch" | "onPlace" | "onSheet"
>) {
  const search = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSearch(String(new FormData(e.currentTarget).get("q") ?? ""));
  };
  return (
    <Dialog label="I'm away from home">
      <p className={styles.sheetNote}>
        You can switch this once every 12 hours.
      </p>
      <p className={styles.sheetNote}>
        Your flock comes with you. Birds already flying land where they were
        sent.
      </p>
      <form role="search" className={styles.sheetForm} onSubmit={search}>
        <label htmlFor="travel-search" className={styles.sheetNote}>
          Pick a place
        </label>
        <input
          type="search"
          id="travel-search"
          name="q"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Back Bay, Boston"
          className={styles.input}
        />
      </form>
      {places.length > 0 && (
        <ul className={styles.results}>
          {places.map((p) => (
            <li key={p.placeId}>
              <button
                type="button"
                className={styles.result}
                onClick={() => onPlace(p.placeId)}
              >
                <span className={styles.resultLabel}>{p.label}</span>
                <span className={styles.resultSub}>{p.sublabel}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.answers}>
        <button
          type="button"
          className={styles.go}
          onClick={() => onTravel(true)}
        >
          Use my location
        </button>
        <button
          type="button"
          className={styles.cancel}
          onClick={() => onSheet(null)}
        >
          Cancel
        </button>
      </div>
    </Dialog>
  );
}

function DeleteSheet({
  handle,
  onDelete,
  onSheet,
}: { handle: string } & Pick<SettingsViewProps, "onDelete" | "onSheet">) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onDelete(String(new FormData(e.currentTarget).get("handle") ?? ""));
  };
  return (
    <Dialog label="Delete my account">
      <form className={styles.sheetForm} onSubmit={submit}>
        <label htmlFor="delete-handle" className={styles.sheetNote}>
          Type your handle to delete
        </label>
        <input
          type="text"
          id="delete-handle"
          name="handle"
          placeholder={handle}
          autoComplete="off"
          className={styles.input}
        />
        <div className={styles.answers}>
          <button type="submit" className={styles.destroy}>
            Delete my account
          </button>
          <button
            type="button"
            className={styles.cancel}
            onClick={() => onSheet(null)}
          >
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function SheetFrame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dialog.current?.contains(document.activeElement)) {
      dialog.current?.focus();
    }
  }, []);

  return (
    <div className={sheetStyles.layer}>
      <button
        type="button"
        aria-label="Close"
        className={sheetStyles.scrim}
        onClick={onClose}
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={sheetStyles.sheet}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <span aria-hidden="true" className={sheetStyles.grab} />
        <h2 id={titleId} className={sheetStyles.title}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

function HourSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (hour: number) => void;
}) {
  const id = useId();
  return (
    <div className={styles.row}>
      <label htmlFor={id} className={styles.title}>
        {label}
      </label>
      <select
        id={id}
        className={sheetStyles.select}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {hour(h)}
          </option>
        ))}
      </select>
    </div>
  );
}

export function QuietSheet({
  draft,
  onEdit,
  onSave,
  onClose,
}: {
  draft: Quiet;
  onEdit: (change: Partial<Quiet>) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <SheetFrame title="Quiet hours" onClose={onClose}>
      <p className={sheetStyles.line}>{QUIET_LINE}</p>
      <div className={styles.card}>
        <Switch
          label="Quiet hours"
          on={draft.quietOn}
          onToggle={() => onEdit({ quietOn: !draft.quietOn })}
        />
        <HourSelect
          label="Start"
          value={draft.quietStart}
          disabled={!draft.quietOn}
          onChange={(quietStart) => onEdit({ quietStart })}
        />
        <HourSelect
          label="End"
          value={draft.quietEnd}
          disabled={!draft.quietOn}
          onChange={(quietEnd) => onEdit({ quietEnd })}
        />
      </div>
      <div className={sheetStyles.actions}>
        <button
          type="button"
          className={`${sheetStyles.button} ${sheetStyles.confirm}`}
          onClick={onSave}
        >
          Save
        </button>
        <button type="button" className={sheetStyles.button} onClick={onClose}>
          Cancel
        </button>
      </div>
    </SheetFrame>
  );
}

export function NameSheet({
  text,
  error,
  busy,
  onType,
  onSave,
  onClose,
}: {
  text: string;
  error: string | null;
  busy: boolean;
  onType: (text: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const fieldId = useId();
  const errorId = useId();
  return (
    <SheetFrame title="Your name" onClose={onClose}>
      <form
        className={sheetStyles.actions}
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <label htmlFor={fieldId} className={sheetStyles.label}>
          Name
        </label>
        <input
          id={fieldId}
          className={sheetStyles.field}
          autoComplete="nickname"
          autoFocus
          value={text}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => onType(e.target.value)}
        />
        {error && (
          <p id={errorId} role="alert" className={sheetStyles.error}>
            {error}
          </p>
        )}
        <button
          type="submit"
          className={`${sheetStyles.button} ${sheetStyles.confirm}`}
          disabled={busy}
        >
          Save
        </button>
        <button type="button" className={sheetStyles.button} onClick={onClose}>
          Cancel
        </button>
      </form>
    </SheetFrame>
  );
}

function OpenSheet({
  sheet,
  dispatch,
  onSave,
  onRename,
}: {
  sheet: EditSheet;
  dispatch: Dispatch<SheetAction>;
} & Pick<SettingsViewProps, "onSave" | "onRename">) {
  const close = () => dispatch({ type: "close" });
  switch (sheet.kind) {
    case "closed":
      return null;
    case "quiet":
      return (
        <QuietSheet
          draft={sheet.draft}
          onEdit={(change) => dispatch({ type: "editQuiet", change })}
          onSave={() => {
            onSave(sheet.draft);
            close();
          }}
          onClose={close}
        />
      );
    case "name":
      return (
        <NameSheet
          text={sheet.text}
          error={sheet.error}
          busy={sheet.pending !== null}
          onType={(text) => dispatch({ type: "type", text })}
          onSave={() => void submitName(sheet.text, onRename, dispatch)}
          onClose={close}
        />
      );
  }
}

export function SettingsView({
  me,
  sheet,
  places,
  onSave,
  onRename,
  onSignOut,
  onSheet,
  onTravel,
  onSearch,
  onPlace,
  onDelete,
}: SettingsViewProps) {
  const travelling = me.loft?.travelling ?? false;
  const [edit, dispatch] = useReducer(sheetReducer, CLOSED);
  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <Link
          href="/more"
          className={styles.back}
          aria-label="Back to the post office"
        >
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
        <h1 className={styles.screenTitle}>Settings</h1>
      </header>

      <Section title="Tell me when">
        {SWITCHES.map(({ key, label }) => (
          <Switch
            key={key}
            label={label}
            on={me.settings[key]}
            onToggle={() => onSave({ [key]: !me.settings[key] })}
          />
        ))}
        <ButtonRow
          title="Quiet hours"
          sub={QUIET_LINE}
          value={quietHours(me.settings)}
          onClick={() => dispatch({ type: "openQuiet", settings: me.settings })}
        />
      </Section>

      <Section title="Where birds find me">
        <Link href="/friends" className={styles.row}>
          <Label title="Friends see" sub="Change it per friend in Friends" />
          <span className={styles.value}>
            Per friend
            <Chevron />
          </span>
        </Link>
        <Row
          title="Home roost"
          sub="Your address is never stored or shown"
          value={me.loft?.label ?? "Not set"}
        />
        <Switch
          label="I'm away from home"
          on={travelling}
          onToggle={() => (travelling ? onTravel(false) : onSheet("travel"))}
        />
      </Section>

      <Section title="App">
        <div className={styles.row}>
          <Label title="Distances" />
          <span
            className={styles.choices}
            role="radiogroup"
            aria-label="Distances"
          >
            {UNITS.map(({ units, label }) => (
              <button
                key={units}
                type="button"
                role="radio"
                aria-checked={me.units === units}
                className={styles.choice}
                onClick={() => me.units !== units && onSave({ units })}
              >
                {label}
              </button>
            ))}
          </span>
        </div>
        <Row title="On your home screen" value={me.installed ? "Yes" : "No"} />
      </Section>

      <Section title="Account">
        <ButtonRow
          title="Name"
          value={me.name}
          onClick={() => dispatch({ type: "openName", name: me.name })}
        />
        {me.phoneLast4 && (
          <Row title="Phone" value={`Ends in ${me.phoneLast4}`} />
        )}
        <button
          type="button"
          className={`${styles.row} ${styles.delete}`}
          onClick={() => onSheet("delete")}
        >
          <Label title="Delete my account" />
        </button>
      </Section>

      <button type="button" className={styles.signOut} onClick={onSignOut}>
        Sign out
      </button>

      <footer className={styles.footer}>
        <p className={styles.credit}>{config.app.mapAttribution}</p>
        <p className={styles.credit}>{config.app.weatherAttribution}</p>
        <p className={styles.links}>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </p>
      </footer>

      {sheet === "travel" && (
        <TravelSheet
          places={places}
          onTravel={onTravel}
          onSearch={onSearch}
          onPlace={onPlace}
          onSheet={onSheet}
        />
      )}
      {sheet === "delete" && (
        <DeleteSheet handle={me.handle} onDelete={onDelete} onSheet={onSheet} />
      )}
      <OpenSheet
        sheet={edit}
        dispatch={dispatch}
        onSave={onSave}
        onRename={onRename}
      />
    </div>
  );
}
