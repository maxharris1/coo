import { SmsError, type Sms } from "@/server/ports/sms";

export class FakeSms implements Sms {
  readonly sent: { to: string; body: string }[] = [];
  private failCode: number | undefined;

  async send(to: string, body: string): Promise<void> {
    const code = this.failCode;
    this.failCode = undefined;
    if (code !== undefined) throw new SmsError(code);
    this.sent.push({ to, body });
  }

  failNext(code: number): void {
    this.failCode = code;
  }
}
