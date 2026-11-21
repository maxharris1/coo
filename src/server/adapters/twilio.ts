import { z } from "zod";
import { SmsError, type Sms } from "../ports/sms";

const errorSchema = z.object({ code: z.number().int() });

export function twilio(opts: {
  accountSid: string;
  authToken: string;
  from: string;
}): Sms {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${opts.accountSid}/Messages.json`;
  const authorization = `Basic ${Buffer.from(`${opts.accountSid}:${opts.authToken}`).toString("base64")}`;
  return {
    async send(to, body) {
      const res = await fetch(url, {
        method: "POST",
        headers: { authorization },
        body: new URLSearchParams({ To: to, From: opts.from, Body: body }),
      });
      if (res.ok) {
        await res.body?.cancel().catch(() => {});
        return;
      }
      const parsed = errorSchema.safeParse(
        await res.json().catch(() => undefined),
      );
      throw new SmsError(parsed.success ? parsed.data.code : res.status);
    },
  };
}
