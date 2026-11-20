const PHONE_LIKE = /\+?\d(?:[\s.\-()]{0,2}\d){6,}/g;

export function redact(text: string): string {
  return text.replace(PHONE_LIKE, "[redacted]");
}

function redacting(_key: string, value: unknown): unknown {
  if (typeof value === "string") return redact(value);
  if (typeof value === "number") {
    return redact(String(value)) === String(value) ? value : "[redacted]";
  }
  if (value instanceof Error)
    return { name: value.name, message: value.message };
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
