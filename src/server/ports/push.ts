export interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export class PushError extends Error {
  constructor(readonly status: number) {
    super(`push send failed with status ${status}`);
    this.name = "PushError";
  }
}

export interface Push {
  send(sub: PushSubscription, payload: PushPayload): Promise<void>;
}
