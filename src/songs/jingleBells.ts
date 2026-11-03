import { buildSong, type ChartDef } from "./builder";

/**
 * "Jingle Bells" — James Lord Pierpont (1822–1893), published 1857. Public domain.
 *
 * HAND TRANSCRIPTION of the chorus made for this project (no third-party MIDI / engraving); the note
 * sequence was cross-checked against letter-note pages. 4/4, eighth-note units (2 per beat).
 * Fixed pitch → lane table: C4 → 0 · D4 → 1 · E4 → 2 · F4 G4 → 3
 * Half and whole notes are Hold tiles (holdMinBeats 2); a held C-major chord closes the piece.
 */

const CHORUS = [
  // jingle bells, jingle bells, jingle all the way
  "E4:2:2", "E4:2:2", "E4:4:2",
  "E4:2:2", "E4:2:2", "E4:4:2",
  "E4:2:2", "G4:2:3", "C4:3:0", "D4:1:1",
  "E4:8:2",
  // oh what fun it is to ride in a one-horse open sleigh
  "F4:2:3", "F4:2:3", "F4:3:3", "F4:1:3",
  "F4:2:3", "E4:2:2", "E4:2:2", "E4:1:2", "E4:1:2",
  "E4:2:2", "D4:2:1", "D4:2:1", "E4:2:2",
  "D4:4:1", "G4:4:3",
];
const FINAL = ["C4+E4+G4:8:0+2+3"];

const def: ChartDef = {
  id: "jingle-bells",
  title: "Jingle Bells",
  composer: "James Lord Pierpont",
  bpm: 112,
  unit: 0.5,
  holdMinBeats: 2,
  melody: [...CHORUS, ...CHORUS, ...FINAL],
  accompaniment: [],
  source: "Hand transcription of the chorus of Pierpont's \"Jingle Bells\" (1857, public domain). No third-party MIDI/score file used.",
  coverage:
    "The chorus played twice (~36 s at Normal) with a closing C-major chord added for the game. NOT the complete piece — the verses are not included.",
};

export const jingleBells = buildSong(def);
