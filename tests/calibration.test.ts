import { describe, expect, it } from "vitest";
import {
  CAL_COUNT_IN,
  CAL_INTERVAL,
  CAL_TAP_CLICKS,
  MAX_OFFSET_MS,
  clampOffsetMs,
  clickSchedule,
  computeCalibration,
  matchTaps,
} from "@/engine/calibration";

const clicks = clickSchedule(10)
  .filter((c) => !c.accent)
  .map((c) => c.time);
/** Taps that are `lateMs` late on every click, with optional per-tap jitter (ms). */
const tapsAt = (lateMs: number, jitter: number[] = []) => clicks.map((c, i) => c + (lateMs + (jitter[i % jitter.length] ?? 0)) / 1000);

describe("click schedule", () => {
  it("has a count-in of accented clicks followed by the tap clicks, evenly spaced", () => {
    const s = clickSchedule(5);
    expect(s).toHaveLength(CAL_COUNT_IN + CAL_TAP_CLICKS);
    expect(s.filter((c) => c.accent)).toHaveLength(CAL_COUNT_IN);
    expect(s[0].time).toBe(5);
    for (let i = 1; i < s.length; i++) expect(s[i].time - s[i - 1].time).toBeCloseTo(CAL_INTERVAL, 9);
    expect(s.slice(0, CAL_COUNT_IN).every((c) => c.accent)).toBe(true);
    expect(s.slice(CAL_COUNT_IN).every((c) => !c.accent)).toBe(true);
  });
});

describe("matchTaps", () => {
  it("pairs each tap with its nearest click and reports + for late, − for early", () => {
    const m = matchTaps([clicks[0] + 0.05, clicks[1] - 0.03], clicks);
    expect(m.map((x) => x.click)).toEqual([0, 1]);
    expect(m[0].delta).toBeCloseTo(0.05, 9);
    expect(m[1].delta).toBeCloseTo(-0.03, 9);
  });
  it("ignores taps that are not aimed at any click (too far away, e.g. during the count-in)", () => {
    const last = clicks[clicks.length - 1];
    expect(matchTaps([clicks[0] - 0.6, last + 0.9], clicks)).toEqual([]);
  });
  it("lets a click be claimed by only one tap — the closest (double taps do not count twice)", () => {
    const m = matchTaps([clicks[2] + 0.12, clicks[2] + 0.02, clicks[2] + 0.2], clicks);
    expect(m).toHaveLength(1);
    expect(m[0].delta).toBeCloseTo(0.02, 9);
  });
});

describe("computeCalibration", () => {
  // Note: with clicks every 0.6 s a player who is *always* ≥ 300 ms off cannot be told apart from one who is
  // early by the rest of the beat — the matcher always picks the nearest click, so the usable range is ±300 ms.
  it("a player who is consistently 50 ms late gets an offset of −50 ms", () => {
    const r = computeCalibration(tapsAt(50), clicks)!;
    expect(r.medianMs).toBe(50);
    expect(r.offsetMs).toBe(-50);
    expect(r.spreadMs).toBe(0);
    expect(r.quality).toBe("good");
    expect(r.used).toBe(CAL_TAP_CLICKS);
  });
  it("a player who is early gets a positive offset", () => {
    expect(computeCalibration(tapsAt(-35), clicks)!.offsetMs).toBe(35);
  });
  it("is robust to a few wild taps (outliers do not move the median)", () => {
    const taps = tapsAt(40, [2, -3, 1, 0, -2, 3]);
    taps[3] += 0.25; // one stumble
    taps[9] -= 0.22; // one anticipation
    const r = computeCalibration(taps, clicks)!;
    expect(r.offsetMs).toBeGreaterThanOrEqual(-44);
    expect(r.offsetMs).toBeLessThanOrEqual(-36);
    expect(r.dropped).toBeGreaterThanOrEqual(2);
  });
  it("labels a shaky player 'noisy'", () => {
    const r = computeCalibration(tapsAt(20, [-120, 110, -90, 100, -110, 95]), clicks)!;
    expect(r.quality).toBe("noisy");
  });
  it("returns null when the player did not tap along (too few usable taps)", () => {
    expect(computeCalibration([], clicks)).toBeNull();
    expect(computeCalibration(tapsAt(10).slice(0, 4), clicks)).toBeNull();
    const last = clicks[clicks.length - 1];
    expect(computeCalibration(clicks.map((_, i) => last + 1 + i * 0.6), clicks)).toBeNull(); // all taps after the music ended
  });
  it("applying the offset moves a late press back onto the beat", () => {
    const r = computeCalibration(tapsAt(64), clicks)!;
    const pressAt = clicks[3] + 0.064;
    expect(Math.abs(pressAt + r.offsetMs / 1000 - clicks[3])).toBeLessThan(0.001);
  });
});

describe("clampOffsetMs", () => {
  it("rounds, clamps to ±250 and rejects non-numbers", () => {
    expect(clampOffsetMs(12.6)).toBe(13);
    expect(clampOffsetMs(900)).toBe(MAX_OFFSET_MS);
    expect(clampOffsetMs(-900)).toBe(-MAX_OFFSET_MS);
    expect(clampOffsetMs(Number.NaN)).toBe(0);
  });
});
