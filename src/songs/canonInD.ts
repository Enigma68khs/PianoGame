import { buildSong, type ChartDef } from "./builder";

/**
 * Canon in D — Johann Pachelbel (1653–1706). Public-domain composition.
 *
 * HAND TRANSCRIPTION made for this project (no third-party MIDI / engraving was used) and NOT yet
 * proof-read against a score — see README → "Music data provenance".
 *
 * The piece is a canon over an eight-note ground bass, D A B F♯ G D G A, one note per half-bar.
 * This chart plays the top line through the first two variations over that bass:
 *   1. the stepwise theme in half notes   F♯ E D C♯ B A B C♯
 *   2. the same harmony in quarter notes  D F♯ A G · F♯ D F♯ E · D B D A · G B A G
 * and closes on a D-major chord. The canonic entries of the other violins and the later eighth-note
 * variations are NOT included.
 *
 * 4/4, authored in eighth-note units (2 units per beat, 8 per bar). One cycle of the ground bass = 32 units.
 * Lanes: 0=A 1=S 2=K 3=L, one fixed pitch → lane table so that a pitch always sits on the same key:
 *   G4 A4 → 0 · B4 C♯5 D5 → 1 · E5 F♯5 → 2 · G5 A5 → 3
 */

// Variation 1 — half notes (4 units each)
const VAR1 = ["F#5:4:2", "E5:4:2", "D5:4:1", "C#5:4:1", "B4:4:1", "A4:4:0", "B4:4:1", "C#5:4:1"];
// Variation 2 — quarter notes (2 units each)
const VAR2 = [
  "D5:2:1", "F#5:2:2", "A5:2:3", "G5:2:3",
  "F#5:2:2", "D5:2:1", "F#5:2:2", "E5:2:2",
  "D5:2:1", "B4:2:1", "D5:2:1", "A4:2:0",
  "G4:2:0", "B4:2:1", "A4:2:0", "G4:2:0",
];
// Closing D-major chord (3 keys at once), held for 4 beats
const FINAL = ["D5+F#5+A5:8:1+2+3"];

const melody = [...VAR1, ...VAR2, ...FINAL];

// ── Accompaniment: the ground bass + a gentle broken chord above it (all below G4, so it can never
//    duplicate a melody pitch the player is responsible for) ───────────────────────────────────────
const BASS = ["D3", "A2", "B2", "F#2", "G2", "D3", "G2", "A2"];
const CHORDS = [
  ["F#3", "A3", "D4"], //  D
  ["E3", "A3", "C#4"], //  A
  ["F#3", "B3", "D4"], //  Bm
  ["F#3", "A3", "C#4"], // F♯m
  ["G3", "B3", "D4"], //   G
  ["F#3", "A3", "D4"], //  D
  ["G3", "B3", "D4"], //   G
  ["E3", "A3", "C#4"], //  A
];
const accompaniment: string[] = [];
for (const cycleStart of [0, 32]) {
  BASS.forEach((bass, i) => {
    const s = cycleStart + i * 4;
    accompaniment.push(`${bass}@${s}:4`);
    CHORDS[i].forEach((tone, k) => accompaniment.push(`${tone}@${s + 1 + k}:1`));
  });
}
accompaniment.push("D3@64:8", "F#3@65:1", "A3@66:1", "D4@67:1");

const def: ChartDef = {
  id: "canon-in-d",
  title: "Canon in D",
  composer: "Johann Pachelbel",
  bpm: 70,
  unit: 0.5,
  holdMinBeats: 4, // only the closing chord is held; the half/quarter-note theme is tapped
  melody,
  accompaniment,
  source:
    "Hand transcription of the top line and ground bass of Pachelbel's Canon in D (public-domain composition). No third-party MIDI/score file used.",
  coverage:
    "Excerpt arrangement (~31 s at Normal): the ground bass with the theme's first two variations (half notes, then quarter notes) and a closing D-major chord. NOT the complete piece — no canonic entries, no eighth-note variations; not yet proof-read against a score.",
};

export const canonInD = buildSong(def);
