import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SmsError } from "../ports/sms";
import { twilio } from "./twilio";

const OPTS = {
  accountSid: "AC123",
  authToken: "secret-token",
  from: "+15555550100",
};

function stubFetch(reply: () => Response) {
  const requests: Request[] = [];
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return reply();
    },
  );
  return requests;
}

beforeEach(() => {
  vi.stubGlobal("fetch", () => {
    throw new Error("tests must not call the network");
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("twilio", () => {
  it("posts one Messages API request with basic auth and To, From, Body", async () => {
    const requests = stubFetch(() =>
      Response.json({ sid: "SM1", status: "queued" }, { status: 201 }),
    );

    await twilio(OPTS).send("+15555550123", "Your pigeon landed.");

    expect(requests).toHaveLength(1);
    const [req] = requests;
    expect(req.method).toBe("POST");
    expect(req.url).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json",
    );
    expect(req.headers.get("authorization")).toBe(
      `Basic ${Buffer.from("AC123:secret-token").toString("base64")}`,
    );
    expect(req.headers.get("content-type")).toMatch(
      /^application\/x-www-form-urlencoded/,
    );
    const form = new URLSearchParams(await req.text());
    expect(Object.fromEntries(form)).toEqual({
      To: "+15555550123",
      From: "+15555550100",
      Body: "Your pigeon landed.",
    });
  });

  it("keeps an accepted send successful when its unused body errors", async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new TypeError("success-body-terminated"));
        },
      }),
      { status: 201 },
    );
    expect(response.ok).toBe(true);
    vi.stubGlobal("fetch", async () => response);

    await expect(
      twilio(OPTS).send("+15555550123", "hi"),
    ).resolves.toBeUndefined();
  });

  it.each([21610, 21211])(
    "throws SmsError with Twilio's error code %i",
    async (code) => {
      stubFetch(() =>
        Response.json(
          {
            code,
            message: "Attempt to send to unsubscribed recipient",
            more_info: `https://www.twilio.com/docs/errors/${code}`,
            status: 400,
          },
          { status: 400 },
        ),
      );

      const err = await twilio(OPTS)
        .send("+15555550123", "hi")
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(SmsError);
      expect((err as SmsError).code).toBe(code);
    },
  );

  it("throws SmsError with the HTTP status when the error body has no code", async () => {
    stubFetch(() => new Response("bad gateway", { status: 502 }));

    const err = await twilio(OPTS)
      .send("+15555550123", "hi")
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(SmsError);
    expect((err as SmsError).code).toBe(502);
  });
});
