import type { Scene, ClockTick } from '../../core/types';
import { Timer } from '../../core/Timer';
import { PausableTime } from '../../core/Clock';

export default class TimedMode implements Scene {
  private duration: number;
  private timer: Timer;
  private clock: PausableTime;
  onFinish?: () => void;

  constructor(durationSeconds = 30, clock?: PausableTime) {
    this.duration = durationSeconds;
    this.clock = clock ?? new PausableTime();
    this.timer = new Timer(this.duration, this.clock);
  }

  start() {
    // nothing to do, external loop should call update(dt)
  }

  stop() {
    // nothing for now
  }

  update(tick: ClockTick) {
    this.timer.tick(tick.dt);
    if (this.timer.expired()) {
      this.onFinish?.();
    }
  }
}
