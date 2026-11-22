import type { Pronoun } from "@/lib/format";
import styles from "./PronounChips.module.css";

const PRONOUNS: readonly { value: Pronoun; label: string }[] = [
  { value: "he", label: "he/him" },
  { value: "she", label: "she/her" },
  { value: "they", label: "they/them" },
];

export function PronounChips({
  name,
  value,
  onChange,
}: {
  name: string;
  value: Pronoun;
  onChange: (pronoun: Pronoun) => void;
}) {
  return (
    <fieldset className={styles.pronouns}>
      <legend className={styles.legend}>Pronoun</legend>
      <div className={styles.chips}>
        {PRONOUNS.map((p) => (
          <label key={p.value} className={styles.chip}>
            <input
              type="radio"
              name={name}
              value={p.value}
              checked={value === p.value}
              onChange={() => onChange(p.value)}
            />
            {p.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
