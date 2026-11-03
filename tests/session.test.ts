import { describe, expect, it } from "vitest";
import { JUDGE } from "@/engine/constants";
import { PlaySession } from "@/engine/session";
import { computeStats } from "@/engine/stats";
import { pitchFromName, timeSong } from "@/songs/builder";
import { SONGS } from "@/songs";
import { makeSession, noteOns } from "./helpers";
import type { SoundCommand } from "@/engine/types";

const E5 = pitchFromName("E5");
const F5 = pitchFromName("F5");

describe("hits", () => {
  it("Perfect inside ±60 ms plays the exact pitch", () => {
    const s = makeSession(["E5:1:2"]); // note at t=0, lane 2 (J)
    const out = s.press(2, 0.05);
    expect(out.events[0].judgement).toBe("perfect");
    expect(out.events[0].timingErrorMs).toBe(50);
    expect(noteOns(out.sounds).map((x) => (x as { pitch: number }).pitch)).toEqual([E5]);
  });

  it("Great between 60 and 130 ms (early and late)", () => {
    expect(makeSession(["E5:1:2"]).press(2, -0.1).events[0].judgement).toBe("great");
    expect(makeSession(["E5:1:2"]).press(2, 0.12).events[0].judgement).toBe("great");
  });

  it("window edges follow the constants", () => {
    expect(makeSession(["E5:1:2"]).press(2, JUDGE.PERFECT).events[0].judgement).toBe("perfect");
    expect(makeSession(["E5:1:2"]).press(2, JUDGE.PERFECT + 0.001).events[0].judgement).toBe("great");
    expect(makeSession(["E5:1:2"]).press(2, JUDGE.GREAT).events[0].judgement).toBe("great");
  });

  it("a note can only be hit once", () => {
    const s = makeSession(["E5:1:2"]);
    s.press(2, 0);
    const again = s.press(2, 0.01);
    expect(again.events[0].judgement).toBe("wrong"); // stray
    expect(again.events[0].stray).toBe(true);
    expect(again.events[0].playedPitch).not.toBe(E5);
  });
});

describe("wrong notes (spec §6)", () => {
  it("target E5 on K, player presses L → F5, E5 never sounds, note consumed", () => {
    const s = makeSession(["E5:1:2"]);
    const out = s.press(3, 0.02);
    const ev = out.events[0];
    expect(ev.judgement).toBe("wrong");
    expect(ev.playedPitch).toBe(F5);
    expect(ev.targetPitch).toBe(E5);
    expect(ev.stray).toBe(false);
    expect(ev.key).toBe("L");
    expect(noteOns(out.sounds).map((x) => (x as { pitch: number }).pitch)).toEqual([F5]);
  });

  it("the correct pitch is never played afterwards (no auto-correction, no duplicate)", () => {
    const s = makeSession(["E5:1:2", "G5:1:0"]);
    const all: SoundCommand[] = [];
    all.push(...s.press(3, 0.02).sounds); // wrong key on note 1
    for (let t = 0; t < 3; t += 0.01) all.push(...s.tick(t).sounds); // let everything play out
    const pitches = noteOns(all).map((x) => (x as { pitch: number }).pitch);
    expect(pitches).toEqual([F5]);
    expect(pitches).not.toContain(E5);
    expect(s.events.map((e) => e.judgement)).toEqual(["wrong", "miss"]);
  });

  it("wrong pitches follow each note's explicit table for every lane", () => {
    for (let lane = 0; lane < 4; lane++) {
      const s = makeSession(["E5:1:2"]);
      if (lane === 2) continue;
      const out = s.press(lane as 0 | 1 | 3, 0);
      expect(out.events[0].playedPitch).toBe(E5 + (lane - 2));
    }
  });

  it("a wrong press consumes only the due note, not later ones", () => {
    const s = makeSession(["E5:1:2", "G5:1:0"]);
    s.press(3, 0);
    const hit = s.press(0, 1.0);
    expect(hit.events[0].judgement).toBe("perfect");
  });

  it("stray key (nothing due) is a Wrong Note that consumes nothing and uses a non-target pitch", () => {
    const s = makeSession(["E5:1:2"]);
    const out = s.press(3, -0.9); // 0.9 s early: not due, not 'early' for lane 3
    expect(out.events[0].judgement).toBe("wrong");
    expect(out.events[0].stray).toBe(true);
    expect(out.events[0].targetNoteId).toBeNull();
    expect(out.events[0].playedPitch).not.toBe(E5);
    // the real note is still playable
    expect(s.press(2, 0).events[0].judgement).toBe("perfect");
  });

  it("pressing the right lane far too early is ignored (no sound, no penalty)", () => {
    const s = makeSession(["E5:1:2"]);
    const out = s.press(2, -0.25);
    expect(out.ignored).toBe("early");
    expect(out.sounds).toHaveLength(0);
    expect(out.events).toHaveLength(0);
    expect(s.press(2, 0).events[0].judgement).toBe("perfect");
  });
});

describe("misses", () => {
  it("an unplayed note becomes Miss after the Great window and produces no sound", () => {
    const s = makeSession(["E5:1:2"]);
    expect(s.tick(JUDGE.GREAT - 0.01).events).toHaveLength(0);
    const out = s.tick(JUDGE.GREAT + 0.01);
    expect(out.events[0].judgement).toBe("miss");
    expect(out.events[0].playedPitch).toBeNull();
    expect(out.sounds).toHaveLength(0);
  });

  it("a late press after the miss does not resurrect the note", () => {
    const s = makeSession(["E5:1:2"]);
    s.tick(0.2);
    const out = s.press(2, 0.2);
    expect(out.events[0].judgement).toBe("wrong");
    expect(out.events[0].playedPitch).not.toBe(E5);
  });

  it("each miss is reported once", () => {
    const s = makeSession(["E5:1:2"]);
    s.tick(0.2);
    expect(s.tick(0.3).events).toHaveLength(0);
    expect(s.events.filter((e) => e.judgement === "miss")).toHaveLength(1);
  });

  it("the game keeps going: later notes are still playable after a miss and a wrong note", () => {
    const s = makeSession(["E5:1:2", "G5:1:0", "A5:1:1"]);
    s.tick(0.5); // miss #1
    s.press(3, 1.0); // wrong on #2
    expect(s.press(1, 2.0).events[0].judgement).toBe("perfect");
    expect(s.isFinished(2.5)).toBe(false); // song tail (last note ends at 3 s) not over yet
    s.tick(3.0); // the 1 s note is a Hold: it completes when its end passes
    expect(s.isFinished(3.0)).toBe(true);
  });
});

describe("chords (independent note events)", () => {
  const chord = () => makeSession(["C5+E5:1:0+2"]);

  it("each member is hit independently with its own pitch", () => {
    const s = chord();
    const a = s.press(0, 0.01);
    const b = s.press(2, 0.03);
    expect(a.events[0].playedPitch).toBe(pitchFromName("C5"));
    expect(b.events[0].playedPitch).toBe(pitchFromName("E5"));
    expect(s.events.map((e) => e.judgement)).toEqual(["perfect", "perfect"]);
  });

  it("works in either order and with only one key", () => {
    const s = chord();
    s.press(2, 0.0);
    s.tick(0.2);
    expect(s.events.map((e) => e.judgement)).toEqual(["perfect", "miss"]);
    expect(s.events[1].playedPitch).toBeNull();
  });

  it("a wrong key does NOT consume a chord member the player can still hit", () => {
    const s = chord();
    const w = s.press(3, 0.0);
    expect(w.events[0].judgement).toBe("wrong");
    expect(w.events[0].stray).toBe(true);
    expect(s.press(0, 0.02).events[0].judgement).toBe("perfect");
    expect(s.press(2, 0.02).events[0].judgement).toBe("perfect");
  });
});

describe("hold notes", () => {
  it("sustains while held and ends the sound when released early", () => {
    const s = makeSession(["E5:4:2"]); // 4 s hold
    s.press(2, 0);
    const out = s.release(2, 1.0);
    expect(out.sounds).toEqual([{ type: "noteOff", voiceId: "n0" }]);
    expect(s.events[0].holdBroken).toBe(true);
    expect(s.events[0].heldDuration).toBeCloseTo(1.0);
  });

  it("completes when held to the end", () => {
    const s = makeSession(["E5:2:2"]);
    s.press(2, 0);
    s.tick(2.0);
    const out = s.release(2, 2.05);
    expect(out.sounds).toHaveLength(0);
    expect(s.events[0].holdBroken).toBe(false);
    expect(s.states[0].status).toBe("hit");
  });

  it("releasing within the end tolerance counts as complete", () => {
    const s = makeSession(["E5:2:2"]);
    s.press(2, 0);
    s.release(2, 2 - JUDGE.HOLD_END_TOLERANCE + 0.01);
    expect(s.events[0].holdBroken).toBe(false);
  });
});

describe.each(SONGS.map((d) => [d.title, d] as const))("full-song simulations: %s", (_title, data) => {
  const song = timeSong(data, "normal");

  it("perfect play: every note Perfect, sounds are exactly the melody, in order", () => {
    const s = new PlaySession(song);
    const all: SoundCommand[] = [];
    for (const n of song.notes) {
      all.push(...s.tick(n.time - 0.01).sounds);
      all.push(...s.press(n.lane, n.time).sounds);
    }
    s.tick(song.endTime + 1);
    expect(s.events.every((e) => e.judgement === "perfect")).toBe(true);
    expect(noteOns(all).map((x) => (x as { pitch: number }).pitch)).toEqual(song.notes.map((n) => n.pitch));
    const st = computeStats(s.events);
    expect(st.perfect).toBe(song.notes.length);
    expect(st.accuracy).toBe(100);
    expect(st.maxCombo).toBe(song.notes.length);
    expect(s.isFinished(song.endTime + 2)).toBe(true);
  });

  it("playing every note on the wrong lane: song continues, no correct pitch ever sounds", () => {
    const s = new PlaySession(song);
    const all: SoundCommand[] = [];
    for (const n of song.notes) {
      all.push(...s.tick(n.time - 0.01).sounds);
      const wrongLane = ((n.lane + 1) % 4) as 0 | 1 | 2 | 3;
      if (n.chordGroup !== null) continue; // chord members are exercised separately
      all.push(...s.press(wrongLane, n.time).sounds);
    }
    all.push(...s.tick(song.endTime + 1).sounds);
    const played = noteOns(all) as { pitch: number; kind: string }[];
    expect(played.length).toBeGreaterThan(0);
    // each played pitch must be the wrong-table pitch of the target, never the target itself
    const events = s.events.filter((e) => e.judgement === "wrong" && e.targetNoteId !== null);
    for (const e of events) {
      expect(e.playedPitch).not.toBe(e.targetPitch);
      expect(e.playedPitch).toBe(song.notes[e.targetNoteId!].laneSounds[e.lane!]);
    }
    expect(played.every((p) => p.kind === "wrong")).toBe(true);
    expect(s.isFinished(song.endTime + 2)).toBe(true);
  });

  it("silence: every note is a Miss, nothing sounds, session still finishes", () => {
    const s = new PlaySession(song);
    const out = s.tick(song.endTime + 5);
    expect(out.sounds).toHaveLength(0);
    expect(out.events).toHaveLength(song.notes.length);
    expect(out.events.every((e) => e.judgement === "miss" && e.playedPitch === null)).toBe(true);
    expect(s.isFinished(song.endTime + 5)).toBe(true);
  });
});
