import { PausableTime } from './Clock';

export class Timer {
  private remaining: number;
  private clock: PausableTime;

  constructor(remaining: number, clock: PausableTime) {
    this.remaining = remaining;
    this.clock = clock;
  }

  tick(dt: number) {
    if (!this.clock.isPaused()) {
      this.remaining = Math.max(0, this.remaining - dt);
    }
  }

  get() { return this.remaining; }
  set(v: number) { this.remaining = Math.max(0, v); }
  add(v: number) { this.set(this.remaining + v); }
  expired() { return this.remaining <= 0; }
}
