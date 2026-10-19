export const SPEEDS = [1, 10, 60, 120, 300, 600];
export const SLOW_SPEED = 10;
export const SLOW_WINDOW = 60;

type Listener = () => void;

/** The single simulation clock. Advances only while playing; scrubbing sets t directly. */
export class Clock {
  t = 0;
  playing = false;
  speed = 120;
  loop = false;
  slowNearBurns = true;
  duration = 1;
  /** TIGs of applied burns, ascending. */
  burnTimes: number[] = [];
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  setTimeline(duration: number, burnTimes: number[]): void {
    this.duration = duration;
    this.burnTimes = burnTimes;
    if (this.t > duration) this.t = duration;
    this.emit();
  }

  setTime(t: number): void {
    this.t = Math.max(0, Math.min(this.duration, t));
    this.emit();
  }

  play(): void {
    if (this.t >= this.duration) this.t = 0;
    this.playing = true;
    this.emit();
  }

  pause(): void {
    this.playing = false;
    this.emit();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  restart(): void {
    this.t = 0;
    this.emit();
  }

  setSpeed(s: number): void {
    this.speed = s;
    this.emit();
  }

  faster(): void {
    const i = SPEEDS.indexOf(this.speed);
    this.setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, (i < 0 ? 3 : i) + 1)]);
  }

  slower(): void {
    const i = SPEEDS.indexOf(this.speed);
    this.setSpeed(SPEEDS[Math.max(0, (i < 0 ? 3 : i) - 1)]);
  }

  setLoop(on: boolean): void {
    this.loop = on;
    this.emit();
  }

  setSlowNearBurns(on: boolean): void {
    this.slowNearBurns = on;
    this.emit();
  }

  nearBurn(t = this.t): boolean {
    return this.burnTimes.some((b) => Math.abs(t - b) <= SLOW_WINDOW);
  }

  /** Speed actually applied right now (drops to 10× near burns). */
  effectiveSpeed(t = this.t): number {
    return this.slowNearBurns && this.speed > SLOW_SPEED && this.nearBurn(t) ? SLOW_SPEED : this.speed;
  }

  nextBurnTime(t = this.t): number | null {
    for (const b of this.burnTimes) if (b > t + 0.5) return b;
    return null;
  }

  prevBurnTime(t = this.t): number | null {
    let out: number | null = null;
    for (const b of this.burnTimes) if (b < t - 0.5) out = b;
    return out;
  }

  jumpNext(): void {
    const b = this.nextBurnTime();
    this.setTime(b ?? this.duration);
  }

  jumpPrev(): void {
    const b = this.prevBurnTime();
    this.setTime(b ?? 0);
  }

  /** Advance by `realDt` seconds of wall time. Returns true if t changed. */
  tick(realDt: number): boolean {
    if (!this.playing) return false;
    let remaining = Math.min(realDt, 0.25);
    let t = this.t;
    // Sub-step so playback never jumps over a slow window around a burn.
    for (let guard = 0; remaining > 1e-9 && guard < 8; guard++) {
      const speed = this.effectiveSpeed(t);
      let next = t + remaining * speed;
      if (this.slowNearBurns && speed > SLOW_SPEED) {
        const enter = this.burnTimes.map((b) => b - SLOW_WINDOW).find((w) => w > t && w < next);
        if (enter !== undefined) {
          remaining -= (enter - t) / speed;
          t = enter;
          continue;
        }
      } else if (speed === SLOW_SPEED && this.speed > SLOW_SPEED) {
        const exit = this.burnTimes.map((b) => b + SLOW_WINDOW).find((w) => w > t && w < next);
        if (exit !== undefined) {
          remaining -= (exit - t + 1e-6) / speed;
          t = exit + 1e-6;
          continue;
        }
      }
      t = next;
      remaining = 0;
    }
    if (t >= this.duration) {
      if (this.loop) t = 0;
      else {
        t = this.duration;
        this.playing = false;
      }
    }
    this.t = t;
    this.emit();
    return true;
  }
}
