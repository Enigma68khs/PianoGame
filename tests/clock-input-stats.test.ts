import { describe, expect, it } from "vitest";
import { SongClock } from "@/engine/clock";
import { GameInput, type GameCommand } from "@/engine/input";
import { computeStats, gradeFor } from "@/engine/stats";
import type { LaneIndex, PerformanceEvent } from "@/engine/types";

describe("SongClock (single time base)", () => {
  it("runs, freezes on pause, and resumes without losing or gaining time", () => {
    let now = 100;
    const c = new SongClock(() => now);
    c.reset(-1.7);
    expect(c.time()).toBe(-1.7);
    c.start();
    now += 1.7;
    expect(c.time()).toBeCloseTo(0);
    now += 2;
    c.pause();
    const frozen = c.time();
    expect(frozen).toBeCloseTo(2);
    now += 30; // a long pause
    expect(c.time()).toBeCloseTo(frozen);
    c.start();
    now += 0.5;
    expect(c.time()).toBeCloseTo(frozen + 0.5);
  });

  it("maps song time to audio-context time", () => {
    let now = 10;
    const c = new SongClock(() => now);
    c.reset(0);
    c.start();
    now += 3;
    expect(c.toContextTime(5)).toBeCloseTo(15);
  });

  it("restart: reset places the clock back at the start", () => {
    let now = 0;
    const c = new SongClock(() => now);
    c.reset(-1);
    c.start();
    now += 20;
    c.pause();
    c.reset(-1);
    expect(c.time()).toBe(-1);
    expect(c.isRunning).toBe(false);
  });
});

function harness() {
  const log: string[] = [];
  const input = new GameInput({
    onLaneDown: (l) => log.push(`down${l}`),
    onLaneUp: (l) => log.push(`up${l}`),
    onCommand: (c: GameCommand) => log.push(`cmd:${c}`),
  });
  let prevented = 0;
  const ev = (code: string, repeat = false, mods: object = {}) => ({
    code,
    repeat,
    preventDefault: () => void prevented++,
    ...mods,
  });
  return { log, input, ev, prevented: () => prevented };
}

describe("GameInput", () => {
  it("maps A S K L to lanes 0–3 via event.code (IME independent)", () => {
    const h = harness();
    for (const code of ["KeyA", "KeyS", "KeyK", "KeyL"]) h.input.keydown(h.ev(code));
    expect(h.log).toEqual(["down0", "down1", "down2", "down3"]);
  });

  it("ignores OS auto-repeat while a key is held", () => {
    const h = harness();
    h.input.keydown(h.ev("KeyK"));
    for (let i = 0; i < 10; i++) h.input.keydown(h.ev("KeyK", true));
    expect(h.log).toEqual(["down2"]);
  });

  it("also ignores a duplicate keydown with repeat=false while still held", () => {
    const h = harness();
    h.input.keydown(h.ev("KeyK"));
    h.input.keydown(h.ev("KeyK"));
    expect(h.log).toEqual(["down2"]);
    h.input.keyup(h.ev("KeyK"));
    h.input.keydown(h.ev("KeyK"));
    expect(h.log).toEqual(["down2", "up2", "down2"]);
  });

  it("supports simultaneous keys (chords)", () => {
    const h = harness();
    h.input.keydown(h.ev("KeyA"));
    h.input.keydown(h.ev("KeyL"));
    expect(h.input.isDown(0 as LaneIndex)).toBe(true);
    expect(h.input.isDown(3 as LaneIndex)).toBe(true);
    h.input.keyup(h.ev("KeyA"));
    expect(h.input.isDown(0 as LaneIndex)).toBe(false);
    expect(h.input.isDown(3 as LaneIndex)).toBe(true);
  });

  it("prevents default browser behaviour for game keys but not for browser shortcuts", () => {
    const h = harness();
    h.input.keydown(h.ev("Space"));
    h.input.keydown(h.ev("KeyA"));
    h.input.keydown(h.ev("Escape"));
    expect(h.prevented()).toBe(3);
    h.input.keydown(h.ev("KeyR", false, { ctrlKey: true })); // Ctrl+R = reload
    h.input.keydown(h.ev("KeyA", false, { metaKey: true }));
    expect(h.prevented()).toBe(3);
    expect(h.log).toEqual(["cmd:pause", "down0", "cmd:escape"]);
  });

  it("commands: Space, Escape, R, Enter fire once per press", () => {
    const h = harness();
    for (const code of ["Space", "Escape", "KeyR", "Enter"]) {
      h.input.keydown(h.ev(code));
      h.input.keydown(h.ev(code, true));
      h.input.keyup(h.ev(code));
    }
    expect(h.log).toEqual(["cmd:pause", "cmd:escape", "cmd:restart", "cmd:enter"]);
  });

  it("reset() clears held keys (optionally reporting releases) so nothing sticks after pause", () => {
    const h = harness();
    h.input.keydown(h.ev("KeyS"));
    h.input.keydown(h.ev("KeyK"));
    h.input.reset(true);
    expect(h.log).toEqual(["down1", "down2", "up1", "up2"]);
    h.input.keydown(h.ev("KeyS"));
    expect(h.log.at(-1)).toBe("down1");
  });
});

const ev = (judgement: PerformanceEvent["judgement"], extra: Partial<PerformanceEvent> = {}): PerformanceEvent => ({
  seq: 0,
  time: 0,
  key: "D",
  lane: 0,
  targetNoteId: 0,
  targetPitch: 60,
  playedPitch: 60,
  judgement,
  timingErrorMs: 10,
  noteDuration: 0.3,
  heldDuration: null,
  holdBroken: false,
  stray: false,
  soundDuration: 0.4,
  velocity: 0.8,
  ...extra,
});

describe("stats", () => {
  it("scores 100/70/0/0 and tracks combo", () => {
    const s = computeStats([ev("perfect"), ev("great"), ev("perfect"), ev("miss"), ev("perfect"), ev("wrong")]);
    expect(s.score).toBe(370); // 3×100 + 70
    expect(s.maxCombo).toBe(3);
    expect(s.combo).toBe(0);
    expect([s.perfect, s.great, s.miss, s.wrong]).toEqual([3, 1, 1, 1]);
  });

  it("wrong note and miss both reset the combo", () => {
    expect(computeStats([ev("perfect"), ev("perfect"), ev("wrong")]).combo).toBe(0);
    expect(computeStats([ev("perfect"), ev("perfect"), ev("miss")]).combo).toBe(0);
  });

  it("accuracy is based on resolved required notes; strays are not required events", () => {
    const base = computeStats([ev("perfect"), ev("perfect")]);
    expect(base.accuracy).toBe(100);
    const withStray = computeStats([ev("perfect"), ev("perfect"), ev("wrong", { stray: true })]);
    expect(withStray.accuracy).toBe(100);
    expect(withStray.wrong).toBe(1);
    expect(withStray.combo).toBe(0);
    const mixed = computeStats([ev("perfect"), ev("great"), ev("miss"), ev("wrong")]);
    expect(mixed.accuracy).toBeCloseTo(((1 + 0.7) / 4) * 100);
  });

  it("records timing error separately", () => {
    const s = computeStats([ev("perfect", { timingErrorMs: -20 }), ev("great", { timingErrorMs: 100 })]);
    expect(s.avgTimingErrorMs).toBe(60);
  });

  it("grades", () => {
    expect(gradeFor(100, 0, 0)).toBe("S");
    expect(gradeFor(96, 1, 0)).toBe("A");
    expect(gradeFor(80, 3, 3)).toBe("B");
    expect(gradeFor(20, 30, 30)).toBe("D");
  });
});
