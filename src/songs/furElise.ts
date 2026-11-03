import { buildSong, type ChartDef } from "./builder";

/**
 * Für Elise (Klavierstück in A minor, WoO 59) — Ludwig van Beethoven (1770–1827). Public domain composition.
 *
 * This chart is a HAND TRANSCRIPTION of the right-hand melody, written for this project.
 * It was NOT imported from any third-party MIDI file or score engraving, and it has not yet been
 * proofread against an Urtext edition (see README → "Music data provenance").
 *
 * Meter 3/8, authored in sixteenth-note units (6 units per bar). The tempo is deliberately
 * slower than a concert tempo so that the melody is playable on four keys.
 * Lane tokens: 0=A 1=S 2=K 3=L — lanes follow the melodic contour (higher pitch → higher lane).
 */

// ── Right-hand melody, one bar per entry ────────────────────────────────────────────────────
const PICKUP = ["E5:1:3", "D#5:1:2"];
// Opening motif: E D# E B D C (the "E D#" before it is the pick-up).
const THEME = ["E5:1:3", "D#5:1:2", "E5:1:3", "B4:1:1", "D5:1:2", "C5:1:1"];
// A4 · C E A   (arpeggio pick-up into the next bar)
const BAR_A = ["A4:2:0", "R:1", "C4:1:0", "E4:1:1", "A4:1:2"];
// B4 · E G# B  (first ending → leads to C5)
const BAR_B1 = ["B4:2:3", "R:1", "E4:1:0", "G#4:1:1", "B4:1:2"];
// C5 · (rest) E D#  (pick-up that restarts the theme)
const BAR_C = ["C5:2:3", "R:2", "E5:1:3", "D#5:1:2"];
// B4 · E C B   (second ending → resolves to A4)
const BAR_B2 = ["B4:2:3", "R:1", "E4:1:0", "C5:1:3", "B4:1:2"];
// A4 (long) + B C D pick-up into the second episode
const BAR_END_A = ["A4:3:0", "B4:1:0", "C5:1:0", "D5:1:1"];
// Second episode: E–G–F–E / D–F–E–D / C–E–D–C  (scale-like lane mapping: C=0 D=1 E=2 F/G=3)
const EP_1 = ["E5:3:2", "G5:1:3", "F5:1:3", "E5:1:2"];
const EP_2 = ["D5:3:1", "F5:1:3", "E5:1:2", "D5:1:1"];
const EP_3 = ["C5:3:0", "E5:1:2", "D5:1:1", "C5:1:0"];
// Link back to the theme (simplified, see README)
const BAR_LINK = ["B4:2:0", "R:2", "E5:1:3", "D#5:1:2"];
// Final A-minor dyad: A4 + E5, held (Chord Note, 2 keys at once)
const BAR_FINAL = ["A4+E5:6:1+3"];

const bars: string[][] = [
  PICKUP, // pick-up (2 units)
  THEME, //  1
  BAR_A, //   2
  BAR_B1, //  3
  BAR_C, //   4
  THEME, //   5
  BAR_A, //   6
  BAR_B2, //  7
  BAR_END_A, // 8
  EP_1, //    9
  EP_2, //   10
  EP_3, //   11
  BAR_LINK, // 12
  THEME, //  13
  BAR_A, //  14
  BAR_B2, // 15
  BAR_END_A, // 16
  EP_1, //   17
  EP_2, //   18
  EP_3, //   19
  BAR_LINK, // 20
  THEME, //  21
  BAR_A, //  22
  BAR_B2, // 23
  BAR_FINAL, // 24
];

const melody = bars.flat();
const UNITS_PER_BAR = 6;
const PICKUP_UNITS = 2;
const barStart = (bar: number) => PICKUP_UNITS + (bar - 1) * UNITS_PER_BAR;

// ── Accompaniment (separate auto-played track; never contains melody pitches) ───────────────
// Left-hand arpeggios follow the layout of the original; the second-episode bass is a simplified
// harmonic support (C – G – C – E) written for this game.
const accompaniment: string[] = [];
const am = (bar: number, pos: number[]) => {
  const [a, b, c] = pos;
  const s = barStart(bar);
  accompaniment.push(`A2@${s + a}:1`, `E3@${s + b}:1`, `A3@${s + c}:2`);
};
const em = (bar: number) => {
  const s = barStart(bar);
  accompaniment.push(`E2@${s + 3}:1`, `E3@${s + 4}:1`, `G#3@${s + 5}:2`);
};
const bass = (bar: number, low: string, high: string, lowLen = 3, highLen = 3) => {
  const s = barStart(bar);
  accompaniment.push(`${low}@${s}:${lowLen}`, `${high}@${s + 3}:${highLen}`);
};

for (const bar of [2, 6, 14, 22]) am(bar, [3, 4, 5]);
for (const bar of [3, 7, 15, 23]) em(bar);
am(4, [2, 3, 4]);
for (const bar of [8, 16]) accompaniment.push(`A2@${barStart(bar)}:3`);
for (const base of [9, 17]) {
  bass(base, "C3", "G3");
  bass(base + 1, "G2", "D3");
  bass(base + 2, "C3", "G3");
  bass(base + 3, "E2", "G#3", 3, 3);
}
accompaniment.push(`A2@${barStart(24)}:6`, `E3@${barStart(24)}:6`);

const def: ChartDef = {
  id: "fur-elise",
  title: "Für Elise",
  composer: "Ludwig van Beethoven",
  bpm: 50,
  unit: 0.25,
  melody,
  accompaniment,
  source:
    "Hand transcription of the right-hand melody of Beethoven's Bagatelle in A minor, WoO 59 (public-domain composition). No third-party MIDI/score file used.",
  coverage:
    "Excerpt arrangement (~45 s at Normal): the opening theme, the second episode (C major), and the return of the theme. NOT the complete piece; tempo slowed for 4-key play; the 'link' bars (12, 20) and second-episode bass are simplified.",
};

export const furElise = buildSong(def);
