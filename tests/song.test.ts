import { describe, expect, it } from "vitest";
import { furElise } from "@/songs/furElise";
import { buildLaneSounds, buildSong, pitchFromName, pitchName, timeSong } from "@/songs/builder";
import { HOLD_MIN_BEATS } from "@/engine/constants";

describe("pitch helpers", () => {
  it("converts note names to MIDI", () => {
    expect(pitchFromName("C4")).toBe(60);
    expect(pitchFromName("A4")).toBe(69);
    expect(pitchFromName("E5")).toBe(76);
    expect(pitchFromName("D#5")).toBe(75);
    expect(pitchFromName("G#4")).toBe(68);
    expect(pitchFromName("A2")).toBe(45);
  });
  it("round-trips", () => {
    for (const p of [45, 60, 69, 75, 76, 79]) expect(pitchFromName(pitchName(p))).toBe(p);
  });
});

describe("wrong-note table", () => {
  it("maps adjacent lanes to adjacent pitches (E5 on K, L pressed → F5)", () => {
    const t = buildLaneSounds(pitchFromName("E5"), 2);
    expect(t[2]).toBe(pitchFromName("E5"));
    expect(t[3]).toBe(pitchFromName("F5"));
    expect(t[1]).toBe(pitchFromName("D#5"));
    expect(t[0]).toBe(pitchFromName("D5"));
  });
  it("never gives another lane the correct pitch", () => {
    for (let target = 0; target < 4; target++) {
      const t = buildLaneSounds(70, target);
      t.forEach((p, lane) => lane !== target && expect(p).not.toBe(70));
    }
  });
});

describe("Für Elise chart", () => {
  const notes = furElise.melody;

  it("starts with the well-known motif E D# E D# E B D C A", () => {
    expect(notes.slice(0, 9).map((n) => n.pitch)).toEqual([76, 75, 76, 75, 76, 71, 74, 72, 69]);
  });

  it("is sorted by time with unique ids and valid lanes", () => {
    expect(new Set(notes.map((n) => n.id)).size).toBe(notes.length);
    for (let i = 1; i < notes.length; i++) expect(notes[i].startBeat).toBeGreaterThanOrEqual(notes[i - 1].startBeat);
    for (const n of notes) {
      expect([0, 1, 2, 3]).toContain(n.lane);
      expect(n.laneSounds[n.lane]).toBe(n.pitch);
      expect(n.durationBeats).toBeGreaterThan(0);
    }
  });

  it("covers all tile types: normal, hold and chord", () => {
    const types = new Set(notes.map((n) => n.type));
    expect(types).toEqual(new Set(["normal", "hold", "chord"]));
    for (const n of notes.filter((n) => n.type === "hold")) expect(n.durationBeats).toBeGreaterThanOrEqual(HOLD_MIN_BEATS);
  });

  it("chord members share a time and use different lanes", () => {
    const groups = new Map<number, typeof notes>();
    for (const n of notes) if (n.chordGroup !== null) groups.set(n.chordGroup, [...(groups.get(n.chordGroup) ?? []), n]);
    expect(groups.size).toBeGreaterThan(0);
    for (const g of groups.values()) {
      expect(g.length).toBeGreaterThan(1);
      expect(new Set(g.map((n) => n.startBeat)).size).toBe(1);
      expect(new Set(g.map((n) => n.lane)).size).toBe(g.length);
    }
  });

  it("no two melody notes share a lane at the same time", () => {
    const seen = new Set<string>();
    for (const n of notes) {
      const k = `${n.startBeat}:${n.lane}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });

  it("accompaniment never duplicates a melody pitch sounding at the same time", () => {
    for (const a of furElise.accompaniment) {
      for (const m of notes) {
        const overlap = a.startBeat < m.startBeat + m.durationBeats && m.startBeat < a.startBeat + a.durationBeats;
        if (overlap) expect(a.pitch).not.toBe(m.pitch);
      }
    }
  });

  it("lasts 30–60 s at Normal", () => {
    const t = timeSong(furElise, "normal");
    expect(t.endTime).toBeGreaterThanOrEqual(30);
    expect(t.endTime).toBeLessThanOrEqual(60);
  });

  it("difficulty scales the tempo", () => {
    const e = timeSong(furElise, "easy").endTime;
    const n = timeSong(furElise, "normal").endTime;
    const h = timeSong(furElise, "hard").endTime;
    expect(e).toBeGreaterThan(n);
    expect(n).toBeGreaterThan(h);
  });

  it("is honest about its provenance", () => {
    expect(furElise.coverage.toLowerCase()).toContain("not the complete piece");
    expect(furElise.source.toLowerCase()).toContain("hand transcription");
  });
});

describe("buildSong", () => {
  it("rejects mismatched chord tokens", () => {
    expect(() =>
      buildSong({ id: "x", title: "x", composer: "x", bpm: 60, unit: 0.25, melody: ["A4+C5:2:1"], accompaniment: [], source: "", coverage: "" }),
    ).toThrow();
  });
});
