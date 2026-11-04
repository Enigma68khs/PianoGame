import { buildSong, type ChartDef } from "./builder";

/**
 * "Midnight Groove" — an ORIGINAL composition written for this project. It is not a transcription of, and does
 * not quote, any existing song; it only shares a mood with Brazilian-funk / phonk dance tracks: a dark minor
 * mode (A Phrygian: A B♭ C D E …), a short hypnotic hook and the "3-3-2" tresillo rhythm — three hits per bar,
 * spaced 3 + 3 + 2 eighth notes apart — carried by a pulsing bass.
 *
 * 4/4, authored in sixteenth-note units (16 per bar). Lanes are assigned automatically from the six pitches
 * used (A4 B♭4 C5 D5 E5 G5): lowest → A … highest → L, a pitch always on the same key.
 *
 *   bars 1–4    the hook (3-3-2 hits) and its answer
 *   bars 5–8    a climbing eighth-note ladder with a sixteenth-note flourish
 *   bars 9–12   the hook again, higher
 *   bars 13–15  two-key chord stabs, then a run up to the top
 *   bar 16      a held A-minor chord (3 keys)
 */

// 3-3-2 hit patterns: a note on beat 1, one on the "and" of 2, one on beat 4, each followed by a gap
const hit = (pitches: [string, string, string]) => [
  `${pitches[0]}:3`, "R:3", `${pitches[1]}:3`, "R:3", `${pitches[2]}:2`, "R:2",
];

const melody = [
  // A — the hook and its answer
  ...hit(["A4", "C5", "A4"]),
  ...hit(["Bb4", "A4", "E5"]),
  ...hit(["A4", "C5", "E5"]),
  ...hit(["D5", "C5", "Bb4"]),
  // B — eighth-note ladder
  "A4:2", "C5:2", "D5:2", "E5:2", "D5:2", "C5:2", "D5:2", "C5:2",
  "Bb4:2", "C5:2", "D5:2", "C5:2", "Bb4:2", "A4:2", "Bb4:2", "A4:2",
  "A4:1", "C5:1", "E5:2", "G5:3", "R:1", "E5:2", "D5:2", "C5:2", "A4:2",
  "G5:3", "R:1", "E5:3", "R:1", "D5:2", "C5:2", "Bb4:2", "A4:2",
  // A' — the hook, higher
  ...hit(["E5", "G5", "E5"]),
  ...hit(["D5", "C5", "D5"]),
  ...hit(["E5", "G5", "G5"]),
  "E5:2", "D5:2", "C5:2", "Bb4:2", "A4:3", "R:1", "A4:2", "R:2",
  // C — chord stabs and the run to the top
  "A4+C5:3", "R:3", "A4+C5:3", "R:3", "C5+E5:2", "R:2",
  "D5+G5:3", "R:3", "C5+E5:3", "R:3", "Bb4+D5:2", "R:2",
  "A4:1", "A4:1", "C5:2", "E5:2", "G5:2", "E5:2", "C5:2", "A4:2", "R:2",
  // end — held A-minor chord
  "A4+C5+E5:16",
];

// Bass: root, root, then the fifth on beat 4 — [name, fifth] per bar
const BARS: [string, string][] = [
  ["A2", "E3"], ["Bb2", "F3"], ["A2", "E3"], ["D3", "A3"],
  ["A2", "E3"], ["Bb2", "F3"], ["A2", "E3"], ["E3", "B3"],
  ["A2", "E3"], ["G2", "D3"], ["A2", "E3"], ["E3", "B3"],
  ["A2", "E3"], ["D3", "A3"], ["E3", "B3"],
];
const accompaniment: string[] = [];
BARS.forEach(([root, fifth], bar) => {
  const s = bar * 16;
  accompaniment.push(`${root}@${s}:3`, `${root}@${s + 6}:3`, `${fifth}@${s + 12}:2`);
});
accompaniment.push("A2@240:16", "E3@240:16"); // bar 16: held under the chord

const def: ChartDef = {
  id: "midnight-groove",
  title: "Midnight Groove",
  composer: "PianoGame (original)",
  bpm: 92,
  unit: 0.25,
  holdMinBeats: 2, // only the closing chord is held
  velocity: 0.86,
  accompanimentVelocity: 0.55,
  melody,
  accompaniment,
  original: true,
  source:
    "Original composition written for this project; not derived from, and not quoting, any existing song or recording.",
  coverage:
    "A complete original piece (~42 s at Normal) in the mood of a Brazilian-funk / phonk night: dark A-Phrygian hook on the 3-3-2 rhythm, a climbing ladder, chord stabs and a closing A-minor chord.",
};

export const midnightGroove = buildSong(def);
