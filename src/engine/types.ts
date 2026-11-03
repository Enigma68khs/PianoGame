export type LaneIndex = 0 | 1 | 2 | 3;
export type NoteType = "normal" | "hold" | "chord";
export type Judgement = "perfect" | "great" | "miss" | "wrong";
export type GameState = "MENU" | "READY" | "PLAYING" | "PAUSED" | "COMPLETED";
export type Difficulty = "easy" | "normal" | "hard";

/** One playable (player-controlled) note of the melody. Times are in beats; converted to seconds per difficulty. */
export interface SongNote {
  id: number;
  /** MIDI pitch of the original melody note. */
  pitch: number;
  startBeat: number;
  durationBeats: number;
  lane: LaneIndex;
  type: NoteType;
  /** Hold tile: the key must stay down for the note's length (chord members can be holds too). */
  hold: boolean;
  /** Notes sharing a chordGroup must be played together. null = not part of a chord. */
  chordGroup: number | null;
  velocity: number;
  /**
   * Explicit wrong-note table: pitch that sounds if the player presses lane i for this note.
   * laneSounds[lane] === pitch. Never recomputed at runtime so behaviour is data-driven and predictable.
   */
  laneSounds: [number, number, number, number];
}

/** Auto-played backing note. Never overlaps with the melody notes the player is responsible for. */
export interface AccompanimentNote {
  pitch: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
}

export interface SongData {
  id: string;
  title: string;
  composer: string;
  /** Beats are quarter notes. */
  bpm: number;
  melody: SongNote[];
  accompaniment: AccompanimentNote[];
  /** Honest provenance / completeness statement shown in README + UI. */
  source: string;
  coverage: string;
}

/** A note with times resolved to seconds for a given difficulty. */
export interface TimedNote extends SongNote {
  time: number;
  duration: number;
}

export interface TimedAccompaniment extends AccompanimentNote {
  time: number;
  duration: number;
}

export interface TimedSong {
  data: SongData;
  difficulty: Difficulty;
  notes: TimedNote[];
  accompaniment: TimedAccompaniment[];
  /** Song time (s) after which the last note has finished. */
  endTime: number;
}

/** One entry of the performance log (spec §10). */
export interface PerformanceEvent {
  seq: number;
  /** Song time (s) of the input (or of the miss deadline for misses). */
  time: number;
  key: string | null;
  lane: LaneIndex | null;
  targetNoteId: number | null;
  targetPitch: number | null;
  /** Pitch that actually sounded; null if nothing sounded (Miss). */
  playedPitch: number | null;
  judgement: Judgement;
  /** Signed ms: positive = late. null for misses/strays without timing target. */
  timingErrorMs: number | null;
  /** Length of the note in seconds (target note length), if applicable. */
  noteDuration: number | null;
  /** For hold notes: how long the key was actually held (s). */
  heldDuration: number | null;
  holdBroken: boolean;
  /** Wrong key pressed while no note was due: counted as a wrong note but did not consume a note. */
  stray: boolean;
  /** Seconds the played pitch rings (for replay). */
  soundDuration: number | null;
  velocity: number | null;
}

export type SoundCommand =
  | { type: "noteOn"; voiceId: string; pitch: number; velocity: number; duration: number; kind: "correct" | "wrong" }
  | { type: "noteOff"; voiceId: string };

export interface SessionOutput {
  events: PerformanceEvent[];
  sounds: SoundCommand[];
  /** Key press that produced nothing (e.g. too early for the lane's next note). */
  ignored?: "early";
}

export interface Stats {
  perfect: number;
  great: number;
  miss: number;
  wrong: number;
  /** Wrong presses that did not consume a note (subset of `wrong`). */
  strayWrong: number;
  score: number;
  combo: number;
  maxCombo: number;
  /** Required note events resolved so far (perfect + great + miss + consumed-wrong). */
  resolved: number;
  /** 0..100 */
  accuracy: number;
  avgTimingErrorMs: number;
}
