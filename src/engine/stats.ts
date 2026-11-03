import { ACCURACY_WEIGHT, SCORE } from "./constants";
import type { PerformanceEvent, Stats } from "./types";

export function emptyStats(): Stats {
  return {
    perfect: 0,
    great: 0,
    miss: 0,
    wrong: 0,
    strayWrong: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    resolved: 0,
    accuracy: 0,
    avgTimingErrorMs: 0,
  };
}

/**
 * Stats are a pure function of the performance log, so the result screen, the HUD and the tests
 * can never disagree about what happened.
 *
 * Accuracy = Σ weight(judgement) / required note events resolved. Strays (wrong keys while no note
 * was due) are not required events: they count as Wrong Notes and break the combo, but are not in the denominator.
 */
export function computeStats(events: readonly PerformanceEvent[]): Stats {
  const s = emptyStats();
  let weighted = 0;
  let errSum = 0;
  let errCount = 0;

  for (const e of events) {
    switch (e.judgement) {
      case "perfect":
      case "great":
        s[e.judgement]++;
        s.score += SCORE[e.judgement];
        weighted += ACCURACY_WEIGHT[e.judgement];
        s.resolved++;
        s.combo++;
        s.maxCombo = Math.max(s.maxCombo, s.combo);
        if (e.timingErrorMs !== null) {
          errSum += Math.abs(e.timingErrorMs);
          errCount++;
        }
        break;
      case "miss":
        s.miss++;
        s.resolved++;
        s.combo = 0;
        break;
      case "wrong":
        s.wrong++;
        s.score += SCORE.wrong;
        s.combo = 0;
        if (e.stray) s.strayWrong++;
        else s.resolved++;
        break;
    }
  }
  s.accuracy = s.resolved === 0 ? 100 : (weighted / s.resolved) * 100;
  s.avgTimingErrorMs = errCount === 0 ? 0 : errSum / errCount;
  return s;
}

export function gradeFor(accuracy: number, misses: number, wrongs: number): "S" | "A" | "B" | "C" | "D" {
  if (accuracy >= 95 && misses + wrongs === 0) return "S";
  if (accuracy >= 90) return "A";
  if (accuracy >= 75) return "B";
  if (accuracy >= 55) return "C";
  return "D";
}
