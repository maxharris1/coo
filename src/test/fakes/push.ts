import {
  PushError,
  type Push,
  type PushPayload,
  type PushSubscription,
} from "@/server/ports/push";

export class FakePush implements Push {
  readonly sent: { sub: PushSubscription; payload: PushPayload }[] = [];
  private failStatus: number | undefined;

  async send(sub: PushSubscription, payload: PushPayload): Promise<void> {
    const status = this.failStatus;
    this.failStatus = undefined;
    if (status !== undefined) throw new PushError(status);
    this.sent.push({ sub, payload });
  }

  failNext(status: number): void {
    this.failStatus = status;
  }
}
