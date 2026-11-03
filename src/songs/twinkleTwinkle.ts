import { buildSong, type ChartDef } from "./builder";

/**
 * "Twinkle, Twinkle, Little Star" — the melody of the 18th-century French folk song "Ah! vous dirai-je, maman"
 * (also the theme of Mozart's variations K. 265). Public domain.
 *
 * HAND TRANSCRIPTION made for this project (no third-party MIDI / engraving); the note sequence was
 * cross-checked against letter-note pages. 4/4, quarter-note units. Fixed pitch → lane table:
 *   C4 → 0 · D4 → 1 · E4 F4 → 2 · G4 A4 → 3
 * Half notes are Hold tiles (holdMinBeats 2); the last C is a held C-major chord.
 */

const P1 = ["C4:1:0", "C4:1:0", "G4:1:3", "G4:1:3", "A4:1:3", "A4:1:3", "G4:2:3"]; //  C C G G A A G
const P2 = ["F4:1:2", "F4:1:2", "E4:1:2", "E4:1:2", "D4:1:1", "D4:1:1", "C4:2:0"]; //  F F E E D D C
const P3 = ["G4:1:3", "G4:1:3", "F4:1:2", "F4:1:2", "E4:1:2", "E4:1:2", "D4:2:1"]; //  G G F F E E D
const P2_END = ["F4:1:2", "F4:1:2", "E4:1:2", "E4:1:2", "D4:1:1", "D4:1:1", "C4+E4+G4:4:0+2+3"];

const def: ChartDef = {
  id: "twinkle-twinkle",
  title: "Twinkle Twinkle Little Star",
  composer: "Traditional (French folk melody)",
  bpm: 92,
  unit: 1,
  holdMinBeats: 2,
  melody: [...P1, ...P2, ...P3, ...P3, ...P1, ...P2_END],
  accompaniment: [],
  source:
    "Hand transcription of the traditional melody (\"Ah! vous dirai-je, maman\", public domain). No third-party MIDI/score file used.",
  coverage:
    "The complete melody once through (six phrases, ~33 s at Normal) with a closing C-major chord added for the game. NOT the complete piece — Mozart's variations on it are not included.",
};

export const twinkleTwinkle = buildSong(def);
