import type { SongClock } from "@/engine/clock";
import type { TimedAccompaniment } from "@/engine/types";
import type { PianoSynth } from "./pianoSynth";

const LOOKAHEAD = 0.25; // seconds of music scheduled ahead of the clock
const INTERVAL_MS = 30;

/**
 * Plays the auto-accompaniment track on the same clock as everything else.
 * Notes are handed to the Web Audio engine at exact context times a few hundred ms ahead; pausing
 * silences them and resuming re-schedules from the song position, so music and tiles stay in sync.
 */
export class AccompanimentScheduler {
  private next = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly synth: PianoSynth,
    private readonly clock: SongClock,
    private readonly notes: TimedAccompaniment[],
  ) {}

  /** Begin / resume scheduling from the clock's current position. */
  start() {
    this.stop();
    const t = this.clock.time();
    this.next = this.notes.findIndex((n) => n.time >= t - 0.001);
    if (this.next < 0) this.next = this.notes.length;
    this.timer = setInterval(() => this.pump(), INTERVAL_MS);
    this.pump();
  }

  /** Stop scheduling and silence anything already handed to the audio engine. */
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private pump() {
    if (!this.clock.isRunning) return;
    const horizon = this.clock.time() + LOOKAHEAD;
    while (this.next < this.notes.length && this.notes[this.next].time <= horizon) {
      const n = this.notes[this.next++];
      this.synth.play({
        pitch: n.pitch,
        velocity: n.velocity,
        duration: Math.max(n.duration * 1.3, 0.4),
        when: this.clock.toContextTime(n.time),
      });
    }
  }
}
