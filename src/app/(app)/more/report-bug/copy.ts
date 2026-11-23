import type { SendFailure } from "./submit";

export const ERRORS: Record<SendFailure, string> = {
  rate_limited: "That is a lot of reports. Try again in an hour.",
  invalid: "That will not fit. Keep it under 2000 characters.",
  offline: "You are offline. Birds keep flying. Try again when you are back.",
  unknown: "Something went sideways. Nothing was lost. Try again.",
};
