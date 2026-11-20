export class SmsError extends Error {
  constructor(readonly code: number) {
    super(`sms send failed with code ${code}`);
    this.name = "SmsError";
  }
}

export interface Sms {
  send(to: string, body: string): Promise<void>;
}
