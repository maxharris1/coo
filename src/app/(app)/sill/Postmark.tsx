import styles from "./Landed.module.css";

type PostmarkProps = { date: string; place: string | null; label: string };

export function Postmark({ date, place, label }: PostmarkProps) {
  return (
    <svg
      className={styles.postmark}
      width="72"
      height="72"
      viewBox="0 0 84 84"
      role="img"
      aria-label={label}
    >
      <circle className={styles.stampRing} cx="42" cy="42" r="38" />
      <circle
        className={styles.stampDash}
        cx="42"
        cy="42"
        r="31"
        strokeDasharray="3 3"
      />
      <text className={styles.stampSmall} x="42" y="30">
        PIGEON POST
      </text>
      <text className={styles.stampDate} x="42" y="49">
        {date}
      </text>
      {place !== null && (
        <text className={styles.stampSmall} x="42" y="62">
          {place}
        </text>
      )}
    </svg>
  );
}
