import { describe, expect, it } from "vitest";
import { canonInD } from "@/songs/canonInD";
import { moonlightSonata } from "@/songs/moonlightSonata";
import { odeToJoy } from "@/songs/odeToJoy";
import { twinkleTwinkle } from "@/songs/twinkleTwinkle";
import { jingleBells } from "@/songs/jingleBells";
import { midnightGroove } from "@/songs/midnightGroove";
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
    if (song.original) {
      // an original composition must say so, and must not claim to transcribe anything
      expect(song.source.toLowerCase()).toContain("original composition");
      expect(song.source.toLowerCase()).not.toContain("transcription");
    } else {
      expect(song.coverage.toLowerCase()).toContain("not the complete piece");
      expect(song.source.toLowerCase()).toContain("hand transcription");
    }
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

describe("Moonlight Sonata chart", () => {
  const notes = moonlightSonata.melody;
  const p = (n: (typeof notes)[number]) => pitchName(n.pitch);
  const bar = (i: number) => notes.slice(i * 12, i * 12 + 12).map(p);

  it("bars 1–2: twelve triplet-eighths G#3 C#4 E4 per bar (C# minor figure)", () => {
    const fig = ["G#3", "C#4", "E4"];
    expect(bar(0)).toEqual([...fig, ...fig, ...fig, ...fig]);
    expect(bar(1)).toEqual(bar(0));
  });

  it("bar 3 is A major then D major (A3 C#4 E4 ×2, A3 D4 F#4 ×2)", () => {
    expect(bar(2)).toEqual([...Array(2).fill(["A3", "C#4", "E4"]).flat(), ...Array(2).fill(["A3", "D4", "F#4"]).flat()]);
  });

  it("bar 4 is the G#7 / C#m / C#sus2 / G#7 turn", () => {
    expect(bar(3)).toEqual(["G#3", "C4", "F#4", "G#3", "C#4", "E4", "G#3", "C#4", "D#4", "F#3", "C4", "D#4"]);
  });

  it("the four-bar figure is played twice, then a held C# minor chord", () => {
    expect(bar(4)).toEqual(bar(0));
    expect(bar(7)).toEqual(bar(3));
    const chord = notes.filter((n) => n.chordGroup !== null);
    expect(chord.map(p).sort()).toEqual(["C#4", "E4", "G#4"]);
    expect(chord.every((n) => n.hold)).toBe(true);
    expect(notes.filter((n) => n.chordGroup === null).some((n) => n.hold)).toBe(false);
  });

  it("a pitch always sits on the same lane, and lanes follow pitch height", () => {
    const lane = new Map<number, number>();
    for (const n of notes) {
      if (n.chordGroup !== null) continue;
      expect(lane.get(n.pitch) ?? n.lane).toBe(n.lane);
      lane.set(n.pitch, n.lane);
    }
    const byPitch = [...lane.entries()].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < byPitch.length; i++) expect(byPitch[i][1]).toBeGreaterThanOrEqual(byPitch[i - 1][1]);
  });

  it("left-hand octaves follow C# – B – A / F# – G# G# – (repeat)", () => {
    const low = moonlightSonata.accompaniment.filter((a) => a.pitch < 40).map((a) => [pitchName(a.pitch), a.startBeat]);
    expect(low.slice(0, 6)).toEqual([["C#2", 0], ["B1", 4], ["A1", 8], ["F#1", 10], ["G#1", 12], ["G#1", 14]]);
  });

  it("is played softly", () => {
    expect(notes.every((n) => n.velocity < 0.7)).toBe(true);
  });
});

/** Shared: a pitch always sits on the same lane, and a higher pitch never sits on a lower lane. */
function expectFixedPitchLanes(song: typeof odeToJoy) {
  const lane = new Map<number, number>();
  for (const n of song.melody) {
    if (n.chordGroup !== null) continue;
    expect(lane.get(n.pitch) ?? n.lane).toBe(n.lane);
    lane.set(n.pitch, n.lane);
  }
  const byPitch = [...lane.entries()].sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < byPitch.length; i++) expect(byPitch[i][1]).toBeGreaterThanOrEqual(byPitch[i - 1][1]);
}
const letters = (song: typeof odeToJoy, from: number, to: number) => song.melody.slice(from, to).map((n) => pitchName(n.pitch).replace(/\d/, ""));

describe("Ode to Joy chart", () => {
  it("opens with E E F G G F E D C C D E E D D and repeats it (bars 1-8)", () => {
    expect(letters(odeToJoy, 0, 15).join(" ")).toBe("E E F G G F E D C C D E E D D");
    expect(letters(odeToJoy, 15, 30).join(" ")).toBe("E E F G G F E D C C D E D C C");
  });
  it("bridge (bars 9-12) is D D E C · D E F E C · D E F E D · C D G", () => {
    // 4 + 5 + 5 + 3 notes right after the first 8 bars (15 + 15 = 30 notes)
    expect(letters(odeToJoy, 30, 47).join(" ")).toBe("D D E C D E F E C D E F E D C D G");
  });
  it("the last phrase returns to the theme and closes on a held C-major chord", () => {
    const chord = odeToJoy.melody.filter((n) => n.chordGroup !== null);
    expect(chord.map((n) => pitchName(n.pitch)).sort()).toEqual(["C4", "E4", "G4"]);
    expect(chord.every((n) => n.hold)).toBe(true);
  });
  it("dotted quarters and halves are holds, quarters are taps; pitches have fixed lanes", () => {
    for (const n of odeToJoy.melody.filter((n) => n.chordGroup === null)) expect(n.hold).toBe(n.durationBeats >= 1.5);
    expectFixedPitchLanes(odeToJoy);
  });
});

describe("Twinkle Twinkle chart", () => {
  it("is the six-phrase tune C C G G A A G · F F E E D D C · G G F F E E D ×2 · C C G G A A G · F F E E D D C", () => {
    const notes = letters(twinkleTwinkle, 0, 99);
    expect(notes.slice(0, 7).join(" ")).toBe("C C G G A A G");
    expect(notes.slice(7, 14).join(" ")).toBe("F F E E D D C");
    expect(notes.slice(14, 21).join(" ")).toBe("G G F F E E D");
    expect(notes.slice(21, 28).join(" ")).toBe("G G F F E E D");
    expect(notes.slice(28, 35).join(" ")).toBe("C C G G A A G");
    expect(notes.slice(35, 41).join(" ")).toBe("F F E E D D");
  });
  it("ends on a held C-major chord; fixed pitch lanes", () => {
    const chord = twinkleTwinkle.melody.filter((n) => n.chordGroup !== null);
    expect(chord.map((n) => pitchName(n.pitch)).sort()).toEqual(["C4", "E4", "G4"]);
    expectFixedPitchLanes(twinkleTwinkle);
  });
});

describe("Jingle Bells chart", () => {
  const first = "E E E E E E E G C D E F F F F F E E E E E D D E D G".split(" ");
  it("chorus: jingle bells ×2, jingle all the way, oh what fun… (26 notes), played twice", () => {
    expect(letters(jingleBells, 0, 26)).toEqual(first);
    expect(letters(jingleBells, 26, 52)).toEqual(first);
  });
  it("closes on a held C-major chord; fixed pitch lanes", () => {
    const chord = jingleBells.melody.filter((n) => n.chordGroup !== null);
    expect(chord.map((n) => pitchName(n.pitch)).sort()).toEqual(["C4", "E4", "G4"]);
    expect(jingleBells.melody.length).toBe(52 + 3);
    expectFixedPitchLanes(jingleBells);
  });
});

describe("Midnight Groove (original, easy)", () => {
  const notes = midnightGroove.melody;
  const solo = notes.filter((n) => n.chordGroup === null);
  const names = (ns: typeof notes) => ns.map((n) => pitchName(n.pitch));

  it("is flagged as an original composition", () => {
    expect(midnightGroove.original).toBe(true);
    expect(midnightGroove.composer.toLowerCase()).toContain("original");
  });

  it("opens with the hook on four steady quarter notes: A A C D", () => {
    const bar1 = notes.filter((n) => n.startBeat < 4);
    expect(bar1.map((n) => n.startBeat)).toEqual([0, 1, 2, 3]);
    expect(names(bar1)).toEqual(["A4", "A4", "C5", "D5"]);
  });

  it("repeats the hook note for note in bars 9-12 (the tune you can remember)", () => {
    const key = (from: number) =>
      notes.filter((n) => n.startBeat >= from && n.startBeat < from + 16).map((n) => [n.startBeat - from, n.pitch, n.durationBeats]);
    expect(key(32)).toEqual(key(0));
    expect(key(0).length).toBe(14);
  });

  it("uses only four pitches, one per key: A4→A, C5→S, D5→K, E5→L", () => {
    expect(names(solo).filter((v, i, a) => a.indexOf(v) === i).sort()).toEqual(["A4", "C5", "D5", "E5"]);
    const lane = new Map<number, number>();
    for (const n of notes) {
      expect(lane.get(n.pitch) ?? n.lane).toBe(n.lane);
      lane.set(n.pitch, n.lane);
    }
    expect([...lane.entries()].sort((x, y) => x[0] - y[0]).map(([, l]) => l)).toEqual([0, 1, 2, 3]);
  });

  it("is easy to play: tunes start at least a beat apart and nothing but the ending is a hold", () => {
    for (let i = 1; i < solo.length; i++) expect(solo[i].startBeat - solo[i - 1].startBeat).toBeGreaterThanOrEqual(1);
    expect(notes.filter((n) => n.startBeat < 60).some((n) => n.hold)).toBe(false);
  });

  it("ends on a held two-key chord, A4 + E5, for the whole last bar", () => {
    const last = notes.filter((n) => n.startBeat >= 60);
    expect(names(last).sort()).toEqual(["A4", "E5"]);
    expect(last.every((n) => n.hold && n.durationBeats === 4 && n.chordGroup !== null)).toBe(true);
  });

  it("bass plays root, root, fifth on the 3-3-2 hits and stays below the melody", () => {
    const bar1 = midnightGroove.accompaniment.filter((a) => a.startBeat < 4).map((a) => [pitchName(a.pitch), a.startBeat]);
    expect(bar1).toEqual([["A2", 0], ["A2", 1.5], ["E3", 3]]);
    expect(Math.max(...midnightGroove.accompaniment.map((a) => a.pitch))).toBeLessThan(Math.min(...notes.map((n) => n.pitch)));
  });
});

describe("buildSong", () => {
  it("rejects mismatched chord tokens", () => {
    expect(() =>
      buildSong({ id: "x", title: "x", composer: "x", bpm: 60, unit: 0.25, melody: ["A4+C5:2:1"], accompaniment: [], source: "", coverage: "" }),
    ).toThrow();
  });
});
