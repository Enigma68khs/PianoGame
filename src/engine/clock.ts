/**
 * The single time base of the game. `now` is injected: in the browser it is AudioContext.currentTime,
 * so rendering, judging and music scheduling all derive from the audio clock and cannot drift apart.
 *
 * songTime = now() - origin while running; frozen while paused.
 */
export class SongClock {
  private origin = 0;
  private frozenAt = 0;
  private running = false;

  constructor(private readonly now: () => number) {}

  /** Place the clock at `songTime` without running it. */
  reset(songTime: number) {
    this.frozenAt = songTime;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.origin = this.now() - this.frozenAt;
    this.running = true;
  }

  pause() {
    if (!this.running) return;
    this.frozenAt = this.now() - this.origin;
    this.running = false;
  }

  get isRunning() {
    return this.running;
  }

  /** Current song time in seconds (negative during lead-in). */
  time(): number {
    return this.running ? this.now() - this.origin : this.frozenAt;
  }

  /** Audio-context timestamp at which `songTime` plays (valid while running). */
  toContextTime(songTime: number): number {
    return this.origin + songTime;
  }
}
