import { PHONE_SEPARATORS } from "@/lib/phone";

const PHONE_LIKE = new RegExp(
  `\\+?\\(?\\d(?:[${PHONE_SEPARATORS}]*\\d){6,}`,
  "g",
);

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function redact(text: string): string {
  if (UUID.test(text)) return text;
  return text.replace(PHONE_LIKE, "[redacted]");
}

function redacting(_key: string, value: unknown): unknown {
  if (typeof value === "string") return redact(value);
  if (typeof value === "number") {
    return redact(String(value)) === String(value) ? value : "[redacted]";
  }
  if (value instanceof Error)
    return { name: value.name, message: value.message };
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, field]) => [redact(key), field]),
    );
  }
  return value;
}

type Fields = Record<string, unknown>;

function write(level: "info" | "warn" | "error", sink: (line: string) => void) {
  return (event: string, fields?: Fields) =>
    sink(JSON.stringify({ level, event, ...fields }, redacting));
}

export const log = {
  info: write("info", (line) => console.log(line)),
  warn: write("warn", (line) => console.warn(line)),
  error: write("error", (line) => console.error(line)),
};
