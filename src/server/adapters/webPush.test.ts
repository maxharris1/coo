import { WebPushError } from "web-push";
import { describe, expect, it } from "vitest";
import { PushError } from "../ports/push";
import { webPush } from "./webPush";

const vapid = {
  subject: "mailto:ops@example.com",
  publicKey: "vapid-public",
  privateKey: "vapid-private",
};

const sub = {
  endpoint: "https://push.example/abc",
  p256dh: "p256dh-key",
  auth: "auth-secret",
};

const payload = {
  title: "A note landed",
  body: "Pip is home",
  url: "/notes/1",
  tag: "landing",
};

function rejecting(err: unknown) {
  return async () => {
    throw err;
  };
}

function webPushError(status: number) {
  return new WebPushError("failed", status, {}, "", sub.endpoint);
}

describe("webPush", () => {
  it("sends the payload as JSON to the subscription with the VAPID details", async () => {
    const calls: unknown[][] = [];
    const push = webPush({
      vapid,
      send: async (...args) => {
        calls.push(args);
        return { statusCode: 201, body: "", headers: {} };
      },
    });

    await push.send(sub, payload);

    expect(calls).toHaveLength(1);
    const [subscription, body, options] = calls[0];
    expect(subscription).toEqual({
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    });
    expect(JSON.parse(body as string)).toEqual(payload);
    expect(options).toEqual({ vapidDetails: vapid });
  });

  it("sends only title, body, url and tag", async () => {
    let body = "";
    const push = webPush({
      vapid,
      send: async (_sub, sent) => {
        body = sent as string;
        return { statusCode: 201, body: "", headers: {} };
      },
    });

    await push.send(sub, { ...payload, extra: "x" } as typeof payload);

    expect(Object.keys(JSON.parse(body)).sort()).toEqual([
      "body",
      "tag",
      "title",
      "url",
    ]);
  });

  it.each([404, 410, 500])(
    "surfaces a %i from the push service as PushError",
    async (status) => {
      const push = webPush({ vapid, send: rejecting(webPushError(status)) });

      const err = await push.send(sub, payload).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(PushError);
      expect((err as PushError).status).toBe(status);
    },
  );

  it("rethrows errors that carry no push service status", async () => {
    const network = new Error("ECONNRESET");
    const push = webPush({ vapid, send: rejecting(network) });

    await expect(push.send(sub, payload)).rejects.toBe(network);
  });
});
