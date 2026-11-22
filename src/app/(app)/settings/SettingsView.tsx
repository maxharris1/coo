import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import { config } from "@/lib/config";
import type { Units } from "@/lib/format";
import type { Me } from "@/server/rows";
import type { SettingsInput } from "@/server/services/settings";
import type { PlaceResult } from "../welcome/loft/roost";
import styles from "./Settings.module.css";

type SwitchKey =
  | "notifyLandedIn"
  | "notifyLandedOut"
  | "notifyDelays"
  | "notifyHungry"
  | "smsFallback";

export type Change = Partial<Pick<SettingsInput, SwitchKey | "units">>;

export type Sheet = "travel" | "delete" | null;

export type SettingsViewProps = {
  me: Me;
  sheet: Sheet;
  places: PlaceResult[];
  onSave: (change: Change) => void;
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

export function SettingsView({
  me,
  sheet,
  places,
  onSave,
  onSignOut,
  onSheet,
  onTravel,
  onSearch,
  onPlace,
  onDelete,
}: SettingsViewProps) {
  const travelling = me.loft?.travelling ?? false;
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
        <Row
          title="Quiet hours"
          sub="Birds still land. Your phone stays quiet."
          value={quietHours(me.settings)}
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
        <Row title="Name" value={me.name} />
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
    </div>
  );
}
