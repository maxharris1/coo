import { config } from "@/lib/config";
import { fill, type Pronoun } from "@/lib/format";

export function shareMessage(url: string, pronoun: Pronoun): string {
  return fill(config.copy.sms["share-template"], { url }, pronoun);
}

export function smsHref(message: string): string {
  return `sms:?&body=${encodeURIComponent(message)}`;
}
