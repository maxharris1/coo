import { BODY_MAX } from "@/lib/bugReportLimits";
import type { SendFailure } from "./submit";

export const COPY = {
  back: "Back to the post office",
  heading: "Report a bug",
  lead: "Something's off? Tell us what happened.",
  label: "What happened, and what did you expect?",
  placeholder: "I tapped Send and the bird stayed home.",
  privacy: "Please don't put passwords, addresses or note text in here.",
  send: "Send the report",
  sending: "Sending",
  sentHeading: "Report sent.",
  sentThanks: "A pigeon has it. Thank you for the details.",
  include: (route: string) =>
    `We'll include: the page you came from (${route}), your app version, your device and screen size, and your time zone.`,
  count: (n: number) => `${n} of ${BODY_MAX}`,
};

export const ERRORS: Record<SendFailure, string> = {
  rate_limited: "That is a lot of reports. Try again in an hour.",
  invalid: `That will not fit. Keep it under ${BODY_MAX} characters.`,
  offline: "You are offline. Birds keep flying. Try again when you are back.",
  unknown: "Something went sideways. Nothing was lost. Try again.",
};
