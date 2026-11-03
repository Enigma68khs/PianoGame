import type { PerformanceEvent, TimedAccompaniment } from "@/engine/types";
import type { PianoSynth } from "./pianoSynth";

export interface ReplayHandle {
  /** Total length in seconds. */
  length: number;
  cancel(): void;
}

/**
 * Re-creates the player's performance from the recorded events: exactly the pitches that sounded
 * (wrong notes stay wrong, missed notes stay missing) at the recorded times, plus the accompaniment.
 */
export function replayPerformance(
  synth: PianoSynth,
  events: readonly PerformanceEvent[],
  accompaniment: readonly TimedAccompaniment[],
  onEnd?: () => void,
): ReplayHandle {
  const { ctx } = synth;
  const first = Math.min(0, ...events.map((e) => e.time), ...accompaniment.map((a) => a.time));
  const origin = ctx.currentTime + 0.25 - first;
  let length = 0;

  for (const e of events) {
    if (e.playedPitch === null) continue;
    const dur = e.soundDuration ?? 0.5;
    synth.play({ pitch: e.playedPitch, velocity: e.velocity ?? 0.8, duration: dur, when: origin + e.time });
    length = Math.max(length, e.time + dur);
  }
  for (const a of accompaniment) {
    const dur = Math.max(a.duration * 1.3, 0.4);
    synth.play({ pitch: a.pitch, velocity: a.velocity, duration: dur, when: origin + a.time });
    length = Math.max(length, a.time + dur);
  }

  const total = length - first + 0.8;
  const timer = setTimeout(() => onEnd?.(), total * 1000);
  return {
    length: total,
    cancel() {
      clearTimeout(timer);
      synth.stopAll();
    },
  };
}
