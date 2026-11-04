import { describe, expect, it } from "vitest";
import { autoLaneTable, buildSong, pitchFromName } from "@/songs/builder";
import { parsePrivateChart } from "@/songs/privateSongs";
import { timeSong } from "@/songs/builder";

const base = { id: "demo", title: "Demo", composer: "me", bpm: 100, unit: 0.5 };
const ok = (melody: string[], extra: object = {}) => parsePrivateChart({ ...base, melody, ...extra }, "demo.json");

describe("automatic lanes", () => {
  it("spreads the distinct pitches evenly over the 4 lanes, low → A … high → L", () => {
    const t = autoLaneTable([60, 62, 64, 65, 67].map((p) => p));
    expect([60, 62, 64, 65, 67].map((p) => t.get(p))).toEqual([0, 1, 2, 2, 3]);
    expect(autoLaneTable([60, 72]).get(60)).toBe(0);
    expect(autoLaneTable([60, 72]).get(72)).toBe(3);
    expect(autoLaneTable([60]).get(60)).toBe(1);
  });

  it("a pitch always gets the same lane and a higher pitch never gets a lower lane", () => {
    const song = buildSong({ ...base, bpm: 100, unit: 0.5, melody: ["C4:2", "E4:2", "G4:2", "C4:2", "A4:2", "E4:2", "D5:2"], accompaniment: [], source: "", coverage: "" });
    const lanes = new Map<number, number>();
    for (const n of song.melody) {
      expect(lanes.get(n.pitch) ?? n.lane).toBe(n.lane);
      lanes.set(n.pitch, n.lane);
    }
    const sorted = [...lanes.entries()].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i][1]).toBeGreaterThanOrEqual(sorted[i - 1][1]);
    expect(sorted[0][1]).toBe(0);
    expect(sorted[sorted.length - 1][1]).toBe(3);
  });

  it("chords without lanes get distinct lanes, ascending with pitch", () => {
    const song = buildSong({ ...base, melody: ["C4:2", "D4:2", "E4:2", "C4+D4+E4:4"], accompaniment: [], source: "", coverage: "" });
    const chord = song.melody.filter((n) => n.chordGroup !== null).sort((a, b) => a.pitch - b.pitch);
    expect(new Set(chord.map((n) => n.lane)).size).toBe(3);
    expect(chord.map((n) => n.lane)).toEqual([...chord.map((n) => n.lane)].sort((a, b) => a - b));
  });

  it("explicit lanes still win, and a lane-less token can sit next to explicit ones", () => {
    const song = buildSong({ ...base, melody: ["C4:2:3", "E4:2"], accompaniment: [], source: "", coverage: "" });
    expect(song.melody[0].lane).toBe(3);
    expect(song.melody[1].pitch).toBe(pitchFromName("E4"));
    expect([0, 1, 2, 3]).toContain(song.melody[1].lane);
  });

  it("every note gets its explicit wrong-note table, just like built-in songs", () => {
    const song = buildSong({ ...base, melody: ["C4:2", "G4:2"], accompaniment: [], source: "", coverage: "" });
    for (const n of song.melody) {
      expect(n.laneSounds[n.lane]).toBe(n.pitch);
      n.laneSounds.forEach((p, lane) => lane !== n.lane && expect(p).not.toBe(n.pitch));
    }
  });
});

describe("parsePrivateChart", () => {
  it("builds a playable song with a private- id and honest local-only wording", () => {
    const r = ok(["C4:2", "E4:2", "G4:4"]);
    expect(r.kind).toBe("song");
    if (r.kind !== "song") return;
    expect(r.song.id).toBe("private-demo");
    expect(r.song.coverage.toLowerCase()).toContain("never deployed");
    expect(timeSong(r.song, "normal").notes.length).toBe(3);
  });

  it("carries level and theme through", () => {
    const r = ok(["C4:2", "E4:2"], { level: 2, theme: "snow" });
    expect(r.kind === "song" && r.level === 2 && r.theme === "snow").toBe(true);
  });

  it("an empty melody is a pending slot (disabled card), not an error", () => {
    const r = parsePrivateChart({ ...base, melody: [] }, "slot.json");
    expect(r).toMatchObject({ kind: "pending", id: "private-demo", title: "Demo" });
    expect(parsePrivateChart({ ...base, melody: ["R:4"] }, "slot.json").kind).toBe("pending");
  });

  it("reports readable errors instead of throwing", () => {
    const err = (raw: unknown) => {
      const r = parsePrivateChart(raw, "bad.json");
      expect(r.kind).toBe("error");
      return r.kind === "error" ? r.message : "";
    };
    expect(err(null)).toContain("객체");
    expect(err({ ...base, title: "", melody: ["C4:2"] })).toContain("title");
    expect(err({ ...base, melody: "C4:2" })).toContain("melody");
    expect(err({ ...base, bpm: 5, melody: ["C4:2", "E4:2"] })).toContain("bpm");
    expect(err({ ...base, unit: 0, melody: ["C4:2", "E4:2"] })).toContain("unit");
    expect(err({ ...base, melody: ["H9:2", "E4:2"] })).toContain("표기");
    expect(err({ ...base, melody: ["C4:0", "E4:2"] })).toContain("표기");
    expect(err({ ...base, melody: ["C4:2"] })).toContain("너무 적어요");
  });

  it("rejects two notes on the same lane at the same moment", () => {
    const r = parsePrivateChart({ ...base, melody: ["C4+E4:2:0+0", "G4:2"] }, "bad.json");
    expect(r.kind).toBe("error");
  });

  it("never exposes a loader in production (nothing is fetched outside development)", async () => {
    const { loadPrivateSongs } = await import("@/songs/privateSongs");
    expect(process.env.NODE_ENV).not.toBe("development");
    expect(await loadPrivateSongs()).toEqual([]);
  });
});
