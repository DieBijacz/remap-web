export type RAFHandle = number;

export class Clock {
  private last = 0;
  private running = false;
  private raf: RAFHandle | null = null;

  start(tick: (dt: number, now: number) => void) {
    if (this.running) return;
    this.running = true;
    const loop = (ts: number) => {
      if (!this.running) return;
      if (!this.last) this.last = ts;
      const dtMs = ts - this.last;
      this.last = ts;
      // dt w sekundach, clamping dla stabilności
      const dt = Math.min(Math.max(dtMs / 1000, 0), 0.1);
      tick(dt, ts / 1000);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.raf != null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.last = 0;
  }
}

/** Pausowalny zegar z referencyjnym „tokenowym” systemem pauzy. */
export class PausableTime {
  private time = 0;          // sekundy
  private pausedTokens = 0;  // ile warstw pauzy aktywnych
  private ticking = true;

  /** aktualizuj czas o dt (jeśli niezapauzowany) */
  tick(dt: number) {
    if (this.ticking && this.pausedTokens === 0) {
      this.time += dt;
    }
  }

  /** pobierz aktualny czas (s) */
  get() { return this.time; }

  /** nadpisz czas (s) */
  set(v: number) { this.time = Math.max(0, v); }

  /** dodaj/odejmij czas (s) — bezpiecznie */
  add(v: number) { this.set(this.time + v); }

  /** pełna pauza (np. globalna) */
  setTicking(on: boolean) { this.ticking = on; }

  /** wejdź w pauzę warstwową (np. banner/rotacja) */
  pauseLayer() { this.pausedTokens++; }

  /** wyjdź z pauzy warstwowej */
  resumeLayer() { this.pausedTokens = Math.max(0, this.pausedTokens - 1); }

  /** czy efektywnie zapauzowany */
  isPaused() { return !this.ticking || this.pausedTokens > 0; }
}
