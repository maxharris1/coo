import { sendNotification, WebPushError, type VapidKeys } from "web-push";
import { PushError, type Push } from "../ports/push";

export function webPush(opts: {
  vapid: VapidKeys & { subject: string };
  send?: typeof sendNotification;
}): Push {
  const send = opts.send ?? sendNotification;
  return {
    async send({ endpoint, p256dh, auth }, { title, body, url, tag }) {
      try {
        await send(
          { endpoint, keys: { p256dh, auth } },
          JSON.stringify({ title, body, url, tag }),
          { vapidDetails: opts.vapid },
        );
      } catch (err) {
        if (err instanceof WebPushError) throw new PushError(err.statusCode);
        throw err;
      }
    },
  };
}
