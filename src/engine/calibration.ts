/**
 * Input-latency calibration (pure maths, no DOM / audio).
 *
 * The calibration screen plays a steady click and the player taps along. Every tap is compared with the click
 * it was aimed at; the typical (median) difference is how late (+) or early (−) this player + keyboard/screen +
 * speakers are relative to the audio clock. The game then adds the opposite amount to every input time
 * (`ControllerOptions.inputOffset`), so a note the player *meant* to hit exactly on the beat is judged on the beat.
 *
 *   taps 48 ms late on average  →  offset −48 ms  →  press at +48 ms is judged as 0 ms (Perfect)
 */

/** Seconds between calibration clicks. */
export const CAL_INTERVAL = 0.6;
/** Clicks the player only listens to (they are accented; taps near them are ignored). */
export const CAL_COUNT_IN = 4;
/** Clicks the player taps along with. */
export const CAL_TAP_CLICKS = 12;
/** Largest offset the game accepts (ms) — anything bigger is a measurement error, not latency. */
export const MAX_OFFSET_MS = 250;
/** A tap further than this from its click is not "aimed at" it (s). */
export const MAX_TAP_DISTANCE = 0.35;
/** Fewest usable taps for a result. */
export const MIN_TAPS = 6;

export interface TapMatch {
  /** Index into the click list. */
  click: number;
  /** tap time − click time, seconds (+ = late). */
  delta: number;
}

export type Quality = "good" | "ok" | "noisy";

export interface CalibrationResult {
  /** Offset to store, in whole ms (negative when the player taps late). */
  offsetMs: number;
  /** Median tap error before correction, ms (+ = late). */
  medianMs: number;
  /** Standard deviation of the kept taps, ms — how steady the player was. */
  spreadMs: number;
  /** Taps that were used / discarded as outliers or unmatched. */
  used: number;
  dropped: number;
  quality: Quality;
}

export const clampOffsetMs = (ms: number): number =>
  Number.isFinite(ms) ? Math.max(-MAX_OFFSET_MS, Math.min(MAX_OFFSET_MS, Math.round(ms))) : 0;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Pair every tap with the click it was aimed at: the nearest one within MAX_TAP_DISTANCE. A click is claimed by at
 * most one tap (the closest), so double-taps do not count twice. Both lists are times on the same clock (seconds).
 */
export function matchTaps(taps: number[], clicks: number[], maxDistance = MAX_TAP_DISTANCE): TapMatch[] {
  const best = new Map<number, number>(); // click index → delta with the smallest |delta|
  for (const t of taps) {
    let k = -1;
    let d = Infinity;
    for (let i = 0; i < clicks.length; i++) {
      if (Math.abs(t - clicks[i]) < Math.abs(d)) {
        k = i;
        d = t - clicks[i];
      }
    }
    if (k < 0 || Math.abs(d) > maxDistance) continue;
    const prev = best.get(k);
    if (prev === undefined || Math.abs(d) < Math.abs(prev)) best.set(k, d);
  }
  return [...best.entries()].map(([click, delta]) => ({ click, delta })).sort((a, b) => a.click - b.click);
}

/**
 * Turn raw tap times into an offset. `clicks` are the clicks the player was meant to tap along with.
 * Returns null when there are too few usable taps (the player did not really tap along).
 */
export function computeCalibration(taps: number[], clicks: number[]): CalibrationResult | null {
  const matches = matchTaps(taps, clicks);
  if (matches.length < MIN_TAPS) return null;
  const deltas = matches.map((m) => m.delta);

  // Robust outlier trim: keep taps within max(40 ms, 2.5 robust-sigmas) of the median.
  const med0 = median(deltas);
  const mad = median(deltas.map((d) => Math.abs(d - med0)));
  const limit = Math.max(0.04, 2.5 * 1.4826 * mad);
  const kept = deltas.filter((d) => Math.abs(d - med0) <= limit);
  if (kept.length < MIN_TAPS) return null;

  const med = median(kept);
  const mean = kept.reduce((a, b) => a + b, 0) / kept.length;
  const spread = Math.sqrt(kept.reduce((a, d) => a + (d - mean) ** 2, 0) / kept.length);
  const spreadMs = Math.round(spread * 1000);
  return {
    offsetMs: clampOffsetMs(-med * 1000),
    medianMs: Math.round(med * 1000),
    spreadMs,
    used: kept.length,
    dropped: taps.length - kept.length,
    quality: spreadMs <= 35 ? "good" : spreadMs <= 65 ? "ok" : "noisy",
  };
}

/** AudioContext times of the clicks: index 0..CAL_COUNT_IN-1 are count-in, the rest are tap clicks. */
export function clickSchedule(start: number): { time: number; accent: boolean }[] {
  return Array.from({ length: CAL_COUNT_IN + CAL_TAP_CLICKS }, (_, i) => ({
    time: start + i * CAL_INTERVAL,
    accent: i < CAL_COUNT_IN,
  }));
}
