import styles from "./DevPanel.module.css";

export type Post = {
  url: "/api/dev/clock" | "/api/dev/grant";
  body: Record<string, string | number | boolean>;
};

export type DevButton = {
  label: string;
  run: Post | "refresh" | null;
};

export type DevPanelViewProps = {
  serverNow: number | null;
  buttons: DevButton[];
  busy: boolean;
  error: string | null;
  onRun: (button: DevButton) => void;
};

export function DevPanelView({
  serverNow,
  buttons,
  busy,
  error,
  onRun,
}: DevPanelViewProps) {
  return (
    <section className={styles.panel} aria-busy={busy}>
      {serverNow !== null && (
        <p className={styles.now}>
          Server time{" "}
          <time dateTime={new Date(serverNow).toISOString()}>
            {new Date(serverNow).toLocaleString()}
          </time>
        </p>
      )}
      <div className={styles.buttons}>
        {buttons.map((button) => (
          <button
            key={button.label}
            type="button"
            className={styles.button}
            disabled={busy || button.run === null}
            onClick={() => onRun(button)}
          >
            {button.label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}
