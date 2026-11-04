import { buildSong, type ChartDef } from "./builder";

/**
 * "Midnight Groove" — an ORIGINAL composition written for this project. It is not a transcription of, and does
 * not quote, any existing song. It keeps a dark A-minor night-drive mood, but the tune itself is deliberately
 * simple and singable so you can hear it as a song: four pitches only (A4 C5 D5 E5 — one per key, A S K L),
 * mostly steady quarter notes, and one short hook that keeps coming back.
 *
 * 4/4, ♩ = 84, authored in eighth-note units (8 per bar). The bass underneath carries the groove: a "3-3-2"
 * pattern (hits on beat 1, the "and" of 2 and beat 4) — the melody stays plain on top of it.
 *
 *   A  (bars 1–4)    the hook: A A C D / E D C — then the same start with an answer that settles on A
 *   B  (bars 5–8)    a contrasting phrase that starts high: E E D C / D C A — repeated, ending on A
 *   A  (bars 9–12)   the hook again, note for note
 *   C  (bars 13–16)  a rising run, a falling run, a long E, and a held A + E to finish
 */

const hook = (answer: string[]) => [
  "A4:2", "A4:2", "C5:2", "D5:2", //  A  A  C  D
  "E5:2", "D5:2", "C5:2", "R:2", //   E  D  C  .
  "A4:2", "A4:2", "C5:2", "D5:2", //  A  A  C  D
  ...answer,
];

const melody = [
  // A — the hook (bars 1–4)
  ...hook(["C5:2", "A4:2", "A4:4"]), //            C  A  A——
  // B — contrast (bars 5–8)
  "E5:2", "E5:2", "D5:2", "C5:2", //               E  E  D  C
  "D5:2", "C5:2", "A4:2", "R:2", //                D  C  A  .
  "E5:2", "E5:2", "D5:2", "C5:2", //               E  E  D  C
  "D5:2", "E5:2", "A4:4", //                       D  E  A——
  // A — the hook again (bars 9–12)
  ...hook(["C5:2", "A4:2", "A4:4"]),
  // C — rising, falling, long E, then the closing pair (bars 13–16)
  "A4:2", "C5:2", "D5:2", "E5:2", //               A  C  D  E
  "E5:2", "D5:2", "C5:2", "A4:2", //               E  D  C  A
  "C5:2", "D5:2", "E5:4", //                       C  D  E——
  "A4+E5:8", //                                    A + E held for the whole last bar
];

// Bass: root, root, then the fifth on beat 4 — the 3-3-2 groove. [root, fifth] per bar.
const A: [string, string] = ["A2", "E3"];
const G: [string, string] = ["G2", "D3"];
const E: [string, string] = ["E3", "B3"];
const D: [string, string] = ["D3", "A3"];
const BARS: [string, string][] = [
  A, A, A, E, //  hook
  G, G, A, E, //  contrast
  A, A, A, E, //  hook again
  A, D, E, //     run (bar 16 is the held chord, below)
];
const accompaniment: string[] = [];
BARS.forEach(([root, fifth], bar) => {
  const s = bar * 8;
  accompaniment.push(`${root}@${s}:3`, `${root}@${s + 3}:3`, `${fifth}@${s + 6}:2`);
});
accompaniment.push("A2@120:8", "E3@120:8"); // bar 16: held under the closing chord

const def: ChartDef = {
  id: "midnight-groove",
  title: "Midnight Groove",
  composer: "PianoGame (original)",
  bpm: 84,
  unit: 0.5,
  holdMinBeats: 3, // only the closing chord is held; the half notes are plain tiles
  velocity: 0.86,
  accompanimentVelocity: 0.55,
  melody,
  accompaniment,
  original: true,
  source:
    "Original composition written for this project; not derived from, and not quoting, any existing song or recording.",
  coverage:
    "A complete, easy original piece (~46 s at Normal): a four-note A-minor hook (A C D E) on steady quarter notes, a contrasting phrase, the hook again, and a held A + E ending, over a grooving bass.",
};

export const midnightGroove = buildSong(def);
