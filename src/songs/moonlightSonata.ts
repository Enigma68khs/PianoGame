import { buildSong, type ChartDef } from "./builder";

/**
 * Piano Sonata No. 14 in C♯ minor, Op. 27 No. 2 "Moonlight", 1st movement (Adagio sostenuto)
 * — Ludwig van Beethoven (1770–1827). Public-domain composition.
 *
 * HAND-BUILT CHART, no third-party MIDI/engraving used. The pitches of bars 1–4 (the triplet figure and the
 * bass) were checked against a published harmonic study of the movement (B. Hamann, "A Non-standard
 * Representation of Chords … Moonlight Sonata", UC Davis). It has not been proof-read against the score.
 *
 * What is playable: the right-hand triplet arpeggios of the famous opening four bars (played twice) — the
 * texture everyone knows — over the left-hand octave bass, and a closing C♯-minor chord. The singing melody
 * that enters in bar 5 is NOT included, so this is NOT the complete movement.
 *
 * Authored in triplet-eighth units (12 per bar of 4 beats; 1 unit = 1/3 beat).
 * Fixed pitch → lane table (a pitch always sits on the same key):
 *   F♯3 G♯3 A3 → 0 · C4 C♯4 → 1 · D4 D♯4 → 2 · E4 F♯4 G♯4 → 3
 */

const rep = (group: string[], times: number) => Array.from({ length: times }, () => group).flat();

// bar 1 & 2: C♯ minor (bass C♯, then B)
const CSM = ["G#3:1:0", "C#4:1:1", "E4:1:3"];
const BAR1 = rep(CSM, 4);
const BAR2 = rep(CSM, 4);
// bar 3: A major (bass A) twice, then D major / F♯ bass twice
const BAR3 = [...rep(["A3:1:0", "C#4:1:1", "E4:1:3"], 2), ...rep(["A3:1:0", "D4:1:2", "F#4:1:3"], 2)];
// bar 4: G♯7 – C♯m – C♯sus2 – G♯7 (bass G♯)
const BAR4 = [
  "G#3:1:0", "C4:1:1", "F#4:1:3",
  "G#3:1:0", "C#4:1:1", "E4:1:3",
  "G#3:1:0", "C#4:1:1", "D#4:1:2",
  "F#3:1:0", "C4:1:1", "D#4:1:2",
];
const FINAL = ["C#4+E4+G#4:12:1+2+3"];

const melody = [...BAR1, ...BAR2, ...BAR3, ...BAR4, ...BAR1, ...BAR2, ...BAR3, ...BAR4, ...FINAL];

// Left-hand octaves (one bar = 12 units)
const accompaniment: string[] = [];
for (const bar0 of [0, 4]) {
  const s = bar0 * 12;
  accompaniment.push(`C#2@${s}:12`, `C#3@${s}:12`); //          bar 1
  accompaniment.push(`B1@${s + 12}:12`, `B2@${s + 12}:12`); //  bar 2
  accompaniment.push(`A1@${s + 24}:6`, `A2@${s + 24}:6`); //    bar 3, first half
  accompaniment.push(`F#1@${s + 30}:6`, `F#2@${s + 30}:6`); //  bar 3, second half
  accompaniment.push(`G#1@${s + 36}:6`, `G#2@${s + 36}:6`); //  bar 4, first half
  accompaniment.push(`G#1@${s + 42}:6`, `G#2@${s + 42}:6`); //  bar 4, second half
}
accompaniment.push("C#2@96:12", "C#3@96:12");

const def: ChartDef = {
  id: "moonlight-sonata",
  title: "Moonlight Sonata",
  composer: "Ludwig van Beethoven",
  bpm: 54,
  unit: 1 / 3,
  holdMinBeats: 3.5, // only the closing chord is held
  velocity: 0.62,
  accompanimentVelocity: 0.5,
  melody,
  accompaniment,
  source:
    "Hand transcription of the triplet figure and bass of bars 1–4 of Beethoven's Moonlight Sonata, 1st movement (public-domain composition), checked against a published harmonic study; no third-party MIDI/score file used.",
  coverage:
    "Excerpt arrangement (~40 s at Normal): the famous opening four bars of triplet arpeggios, played twice over the left-hand bass, plus a closing C♯-minor chord. NOT the complete piece — the melody that enters in bar 5 is not included; not yet proof-read against a score.",
};

export const moonlightSonata = buildSong(def);
