export interface SimulationClockOptions {
  /** Simulation date expressed as elapsed days from the chosen UI epoch. */
  initialElapsedDays?: number;
  /** Number of simulated days advanced by one real second. */
  daysPerSecond?: number;
  /** Whether time starts advancing immediately. */
  running?: boolean;
  /** Optional protection against a very large frame delta after tab suspension. */
  maxFrameDeltaSeconds?: number;
}

/**
 * Frame-rate-independent simulation clock.
 *
 * Every frame advances:
 *   elapsedSimulationDays += frameDeltaSeconds * daysPerSecond
 *
 * The class owns no browser timers and allocates nothing in its update path.
 * It can consume either a renderer-provided frame delta or requestAnimationFrame
 * timestamps. Using accumulated time (rather than frame count) preserves orbital
 * speed ratios on displays with different refresh rates.
 */
export class SimulationClock {
  private elapsedDaysValue: number;
  private daysPerSecondValue: number;
  private runningValue: boolean;
  private readonly maxFrameDeltaSeconds: number;
  private previousTimestampMs: number | undefined;

  constructor(options: SimulationClockOptions = {}) {
    this.elapsedDaysValue = finiteNumber(options.initialElapsedDays, 0);
    this.daysPerSecondValue = nonNegativeFiniteNumber(
      options.daysPerSecond,
      100,
    );
    this.runningValue = options.running ?? true;
    this.maxFrameDeltaSeconds = nonNegativeFiniteNumber(
      options.maxFrameDeltaSeconds,
      Number.POSITIVE_INFINITY,
      true,
    );
  }

  get elapsedDays(): number {
    return this.elapsedDaysValue;
  }

  get daysPerSecond(): number {
    return this.daysPerSecondValue;
  }

  get isRunning(): boolean {
    return this.runningValue;
  }

  setDaysPerSecond(daysPerSecond: number): void {
    if (!Number.isFinite(daysPerSecond) || daysPerSecond < 0) {
      throw new RangeError("daysPerSecond must be a finite non-negative number");
    }
    this.daysPerSecondValue = daysPerSecond;
  }

  /** UI-friendly alias for `setDaysPerSecond`. */
  setTimeScale(daysPerSecond: number): void {
    this.setDaysPerSecond(daysPerSecond);
  }

  play(): void {
    if (!this.runningValue) {
      this.runningValue = true;
      // Do not count wall-clock time spent paused when timestamp mode resumes.
      this.previousTimestampMs = undefined;
    }
  }

  pause(): void {
    this.runningValue = false;
  }

  toggle(): boolean {
    if (this.runningValue) this.pause();
    else this.play();
    return this.runningValue;
  }

  /**
   * Advance from an already-computed frame delta in real seconds, for example
   * the value returned by THREE.Clock.getDelta().
   */
  advance(frameDeltaSeconds: number): number {
    if (!Number.isFinite(frameDeltaSeconds) || frameDeltaSeconds < 0) {
      return this.elapsedDaysValue;
    }

    if (!this.runningValue) return this.elapsedDaysValue;

    const boundedDelta = Math.min(
      frameDeltaSeconds,
      this.maxFrameDeltaSeconds,
    );
    this.elapsedDaysValue += boundedDelta * this.daysPerSecondValue;
    return this.elapsedDaysValue;
  }

  /** Concise alias suitable for a requestAnimationFrame render loop. */
  update(frameDeltaSeconds: number): number {
    return this.advance(frameDeltaSeconds);
  }

  /** Common render-loop alias for `advance`. */
  tick(frameDeltaSeconds: number): number {
    return this.advance(frameDeltaSeconds);
  }

  /**
   * Advance directly from requestAnimationFrame's millisecond timestamp.
   * The first timestamp establishes a baseline and advances zero days.
   */
  updateFromTimestamp(timestampMs: number): number {
    if (!Number.isFinite(timestampMs)) return this.elapsedDaysValue;

    const previousTimestamp = this.previousTimestampMs;
    this.previousTimestampMs = timestampMs;

    if (previousTimestamp === undefined) return this.elapsedDaysValue;
    return this.advance(Math.max(0, timestampMs - previousTimestamp) / 1_000);
  }

  /** Reset elapsed time and clear timestamp state so no stale delta is applied. */
  reset(elapsedDays = 0): number {
    if (!Number.isFinite(elapsedDays)) {
      throw new RangeError("elapsedDays must be finite");
    }

    this.elapsedDaysValue = elapsedDays;
    this.previousTimestampMs = undefined;
    return this.elapsedDaysValue;
  }
}

function finiteNumber(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : value;
}

function nonNegativeFiniteNumber(
  value: number | undefined,
  fallback: number,
  allowPositiveInfinity = false,
): number {
  if (value === undefined) return fallback;
  if (allowPositiveInfinity && value === Number.POSITIVE_INFINITY) return value;
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
