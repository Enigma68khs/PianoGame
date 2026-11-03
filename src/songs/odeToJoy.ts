import { buildSong, type ChartDef } from "./builder";

/**
 * "Ode to Joy" — main theme of the choral finale of Symphony No. 9 in D minor, Op. 125, by Ludwig van Beethoven
 * (1770–1827). Public-domain composition, here in C major.
 *
 * HAND TRANSCRIPTION made for this project (no third-party MIDI / engraving). The 15-note opening was
 * cross-checked against letter-note pages; the bridge (bars 9–12) is from memory — see README.
 *
 * 4/4, authored in eighth-note units (2 per beat). Fixed pitch → lane table (a pitch always sits on one key):
 *   G3 C4 → 0 · D4 → 1 · E4 → 2 · F4 G4 → 3
 * Dotted quarters and half notes are Hold tiles (holdMinBeats 1.5); the final C-major chord is a 3-key Hold.
 */

const A = ["E4:2:2", "E4:2:2", "F4:2:3", "G4:2:3", "G4:2:3", "F4:2:3", "E4:2:2", "D4:2:1", "C4:2:0", "C4:2:0", "D4:2:1", "E4:2:2"];
const END_1 = ["E4:3:2", "D4:1:1", "D4:4:1"]; //   E.  D D(half)
const END_2 = ["D4:3:1", "C4:1:0", "C4:4:0"]; //   D.  C C(half)
const BRIDGE = [
  "D4:2:1", "D4:2:1", "E4:2:2", "C4:2:0", //                    D D E C
  "D4:2:1", "E4:1:2", "F4:1:3", "E4:2:2", "C4:2:0", //          D E-F E C
  "D4:2:1", "E4:1:2", "F4:1:3", "E4:2:2", "D4:2:1", //          D E-F E D
  "C4:2:0", "D4:2:1", "G3:4:0", //                              C D G(half)
];
// the last C is replaced by a held C-major chord so the piece ends on a resolved sound
const END_FINAL = ["D4:3:1", "C4:1:0", "C4+E4+G4:8:0+2+3"];

const def: ChartDef = {
  id: "ode-to-joy",
  title: "Ode to Joy",
  composer: "Ludwig van Beethoven",
  bpm: 100,
  unit: 0.5,
  holdMinBeats: 1.5,
  melody: [...A, ...END_1, ...A, ...END_2, ...BRIDGE, ...A, ...END_FINAL],
  accompaniment: [],
  source:
    "Hand transcription of the Ode to Joy theme from Beethoven's Symphony No. 9, 4th movement (public-domain composition). No third-party MIDI/score file used.",
  coverage:
    "The complete 16-bar main theme (~40 s at Normal) with a closing C-major chord added for the game. NOT the complete piece — it is only the theme, without the symphony's variations, orchestration or choir; the bridge bars are from memory and not yet proof-read against a score.",
};

export const odeToJoy = buildSong(def);
