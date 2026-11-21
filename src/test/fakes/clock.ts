import type { Clock } from "@/server/clock";

export class FakeClock implements Clock {
  readonly offsetMs = 0;

  constructor(private ms: number) {}

  now(): number {
    return this.ms;
  }

  advance(ms: number): void {
    this.ms += ms;
  }

  set(ms: number): void {
    this.ms = ms;
  }
}
