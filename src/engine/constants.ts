import type { Difficulty, LaneIndex } from "./types";

/** Lane → keyboard mapping. `code` is layout/IME independent (works with Korean IME active). */
export const LANES: { code: string; label: string; index: LaneIndex }[] = [
  { code: "KeyA", label: "A", index: 0 },
  { code: "KeyS", label: "S", index: 1 },
  { code: "KeyK", label: "K", index: 2 },
  { code: "KeyL", label: "L", index: 3 },
];
export const LANE_COUNT = 4;
export const LANE_BY_CODE: Record<string, LaneIndex> = Object.fromEntries(LANES.map((l) => [l.code, l.index]));

/** Initial tuning values (spec §5) — all judgement behaviour is driven from here. */
export const JUDGE = {
  /** |error| ≤ this → Perfect (seconds). */
  PERFECT: 0.06,
  /** |error| ≤ this → Great. Beyond → the note can no longer be hit and becomes Miss. */
  GREAT: 0.13,
  /** A correct-lane press this early (before the Great window) is ignored rather than punished. */
  EARLY_IGNORE: 0.3,
  /** When no note is due, stray presses take their wrong pitch from a note up to this far ahead. */
  STRAY_REFERENCE: 0.6,
  /** Holds are "complete" when released within this of the note's end. */
  HOLD_END_TOLERANCE: 0.18,
  /** Added to every input time (s). Positive if the player hears/sees things late. For calibration. */
  INPUT_OFFSET: 0,
} as const;

export const SCORE = { perfect: 100, great: 70, wrong: 0, miss: 0 } as const;
/** Accuracy weight of each judgement (consistent with the score table). */
export const ACCURACY_WEIGHT = { perfect: 1, great: 0.7, miss: 0, wrong: 0 } as const;

/** Semitone offset per lane of distance used to build each note's explicit wrong-note table. */
export const WRONG_NOTE_SEMITONES_PER_LANE = 1;

/** Notes of this length (beats) or more become Hold tiles. */
export const HOLD_MIN_BEATS = 0.75;

/** Seconds a tile takes from the top of the field to the judgement line. */
export const FALL_TIME = 1.7;
export const COUNTDOWN_SECONDS = 3;

export const DIFFICULTY: Record<Difficulty, { label: string; labelKo: string; tempo: number; blurb: string }> = {
  easy: { label: "Easy", labelKo: "쉬움", tempo: 0.75, blurb: "느린 템포" },
  normal: { label: "Normal", labelKo: "보통", tempo: 1.0, blurb: "기본 템포" },
  hard: { label: "Hard", labelKo: "어려움", tempo: 1.25, blurb: "빠른 템포" },
};

/** Keep the last note ringing / on screen before showing results. */
export const END_PADDING = 1.6;
