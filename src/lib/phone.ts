export type E164 = string & { readonly __brand: "E164" };

export function toE164(raw: string, defaultCountry = "1"): E164 | null {
  const compact = raw.replace(/[\s.\-()]/g, "");
  const match = /^(\+?)(\d+)$/.exec(compact);
  if (!match) return null;
  const [, plus, digits] = match;
  if (plus) {
    return /^[1-9]\d{7,14}$/.test(digits) ? (`+${digits}` as E164) : null;
  }
  if (digits.length === 10) return `+${defaultCountry}${digits}` as E164;
  if (
    digits.length === defaultCountry.length + 10 &&
    digits.startsWith(defaultCountry)
  ) {
    return `+${digits}` as E164;
  }
  return null;
}

export function last4(phone: E164): string {
  return phone.slice(-4);
}
