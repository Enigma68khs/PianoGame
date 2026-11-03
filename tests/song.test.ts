import { describe, expect, it } from "vitest";
import { canonInD } from "@/songs/canonInD";
import { furElise } from "@/songs/furElise";
import { SONGS } from "@/songs";
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

describe.each(SONGS.map((song) => [song.title, song] as const))("chart integrity: %s", (_name, song) => {
  const notes = song.melody;

  it("is sorted by time with unique ids and valid lanes", () => {
    expect(new Set(notes.map((n) => n.id)).size).toBe(notes.length);
    for (let i = 1; i < notes.length; i++) expect(notes[i].startBeat).toBeGreaterThanOrEqual(notes[i - 1].startBeat);
    for (const n of notes) {
      expect([0, 1, 2, 3]).toContain(n.lane);
      expect(n.laneSounds[n.lane]).toBe(n.pitch);
      expect(n.durationBeats).toBeGreaterThan(0);
    }
  });

  it("chord members share a time and use different lanes", () => {
    const groups = new Map<number, typeof notes>();
    for (const n of notes) if (n.chordGroup !== null) groups.set(n.chordGroup, [...(groups.get(n.chordGroup) ?? []), n]);
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
    for (const a of song.accompaniment) {
      for (const m of notes) {
        const overlap = a.startBeat < m.startBeat + m.durationBeats && m.startBeat < a.startBeat + a.durationBeats;
        if (overlap) expect(a.pitch).not.toBe(m.pitch);
      }
    }
  });

  it("lasts 30–60 s at Normal and scales with difficulty", () => {
    const e = timeSong(song, "easy").endTime;
    const n = timeSong(song, "normal").endTime;
    const h = timeSong(song, "hard").endTime;
    expect(n).toBeGreaterThanOrEqual(30);
    expect(n).toBeLessThanOrEqual(60);
    expect(e).toBeGreaterThan(n);
    expect(n).toBeGreaterThan(h);
  });

  it("has Hold tiles consistent with the chart, and is honest about its provenance", () => {
    for (const n of notes) expect(n.hold).toBe(n.type === "hold" || (n.type === "chord" && n.hold));
    expect(song.coverage.toLowerCase()).toContain("not the complete piece");
    expect(song.source.toLowerCase()).toContain("hand transcription");
  });
});

describe("Für Elise chart", () => {
  const notes = furElise.melody;

  it("starts with the well-known motif E D# E D# E B D C A", () => {
    expect(notes.slice(0, 9).map((n) => n.pitch)).toEqual([76, 75, 76, 75, 76, 71, 74, 72, 69]);
  });

  it("covers all tile types: normal, hold and chord", () => {
    expect(new Set(notes.map((n) => n.type))).toEqual(new Set(["normal", "hold", "chord"]));
    for (const n of notes.filter((n) => n.type === "hold")) expect(n.durationBeats).toBeGreaterThanOrEqual(HOLD_MIN_BEATS);
  });
});

describe("Canon in D chart", () => {
  const notes = canonInD.melody;
  const names = (from: number, to: number) => notes.slice(from, to).map((n) => pitchName(n.pitch));

  it("variation 1 is the stepwise theme F# E D C# B A B C# in half notes", () => {
    expect(names(0, 8)).toEqual(["F#5", "E5", "D5", "C#5", "B4", "A4", "B4", "C#5"]);
    expect(notes.slice(0, 8).every((n) => n.durationBeats === 2)).toBe(true);
  });

  it("variation 2 is the quarter-note line over the same bass", () => {
    expect(names(8, 24)).toEqual(
      ["D5", "F#5", "A5", "G5", "F#5", "D5", "F#5", "E5", "D5", "B4", "D5", "A4", "G4", "B4", "A4", "G4"],
    );
    expect(notes.slice(8, 24).every((n) => n.durationBeats === 1)).toBe(true);
  });

  it("the ground bass is D A B F# G D G A, one note per half-bar, in both cycles", () => {
    const bass = canonInD.accompaniment.filter((a) => a.durationBeats === 2);
    expect(bass.map((a) => pitchName(a.pitch)).slice(0, 8)).toEqual(["D3", "A2", "B2", "F#2", "G2", "D3", "G2", "A2"]);
    expect(bass.slice(0, 8).map((a) => a.startBeat)).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
    expect(bass.slice(8, 16).map((a) => a.startBeat)).toEqual([16, 18, 20, 22, 24, 26, 28, 30]);
  });

  it("a given pitch always sits on the same lane", () => {
    const lane = new Map<number, number>();
    for (const n of notes) {
      if (n.chordGroup !== null) continue;
      expect(lane.get(n.pitch) ?? n.lane).toBe(n.lane);
      lane.set(n.pitch, n.lane);
    }
  });

  it("ends on a held 3-key D-major chord; everything before it is a tap", () => {
    const chord = notes.filter((n) => n.chordGroup !== null);
    expect(chord.map((n) => pitchName(n.pitch)).sort()).toEqual(["A5", "D5", "F#5"]);
    expect(chord.every((n) => n.hold && n.durationBeats === 4)).toBe(true);
    expect(notes.filter((n) => n.chordGroup === null).some((n) => n.hold)).toBe(false);
  });
});

describe("buildSong", () => {
  it("rejects mismatched chord tokens", () => {
    expect(() =>
      buildSong({ id: "x", title: "x", composer: "x", bpm: 60, unit: 0.25, melody: ["A4+C5:2:1"], accompaniment: [], source: "", coverage: "" }),
    ).toThrow();
  });
});
