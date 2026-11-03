import { DIFFICULTY, HOLD_MIN_BEATS, LANE_COUNT, WRONG_NOTE_SEMITONES_PER_LANE } from "@/engine/constants";
import type {
  AccompanimentNote,
  Difficulty,
  LaneIndex,
  NoteType,
  SongData,
  SongNote,
  TimedSong,
} from "@/engine/types";

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "E5" → 76, "D#5" → 75, "C4" → 60. */
export function pitchFromName(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Bad pitch name: ${name}`);
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + SEMITONE[m[1]] + acc;
}

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export function pitchName(pitch: number): string {
  return `${NAMES[((pitch % 12) + 12) % 12]}${Math.floor(pitch / 12) - 1}`;
}

/**
 * Explicit wrong-note table for one note: the pitch heard for each possible pressed lane.
 * Pressing lane L for a note targeted at lane T sounds `pitch + (L - T) * step` semitones
 * (e.g. target E5 on K, player presses L → F5).
 */
export function buildLaneSounds(pitch: number, targetLane: number): [number, number, number, number] {
  const out = [0, 0, 0, 0].map((_, lane) =>
    Math.min(108, Math.max(21, pitch + (lane - targetLane) * WRONG_NOTE_SEMITONES_PER_LANE)),
  );
  return out as [number, number, number, number];
}

export interface ChartDef {
  id: string;
  title: string;
  composer: string;
  bpm: number;
  /** One beat = a quarter note; chart authored in `unit`-beat steps (0.25 = sixteenth). */
  unit: number;
  /**
   * Melody tokens, in order:
   *   "E5:2:3"        pitch : length(units) : lane(0-3)
   *   "A4+E5:6:1+3"   chord: pitches and lanes joined with '+'
   *   "R:2"           rest of 2 units
   */
  melody: string[];
  /** Accompaniment tokens: "A2@3:1" = pitch @ startUnit : length(units). Start is absolute (units). */
  accompaniment: string[];
  source: string;
  coverage: string;
}

export function buildSong(def: ChartDef): SongData {
  const melody: SongNote[] = [];
  let cursor = 0;
  let id = 0;
  let chordGroup = 0;

  for (const token of def.melody) {
    const parts = token.split(":");
    if (parts[0] === "R") {
      cursor += Number(parts[1]);
      continue;
    }
    const pitches = parts[0].split("+").map(pitchFromName);
    const length = Number(parts[1]);
    const lanes = parts[2].split("+").map(Number);
    if (pitches.length !== lanes.length) throw new Error(`Token pitch/lane mismatch: ${token}`);
    const isChord = pitches.length > 1;
    const group = isChord ? ++chordGroup : null;
    const durationBeats = length * def.unit;
    pitches.forEach((pitch, i) => {
      const lane = lanes[i] as LaneIndex;
      if (lane < 0 || lane >= LANE_COUNT) throw new Error(`Lane out of range in ${token}`);
      const type: NoteType = isChord ? "chord" : durationBeats >= HOLD_MIN_BEATS ? "hold" : "normal";
      melody.push({
        id: id++,
        pitch,
        startBeat: cursor * def.unit,
        durationBeats,
        lane,
        type,
        chordGroup: group,
        velocity: 0.82,
        laneSounds: buildLaneSounds(pitch, lane),
      });
    });
    cursor += length;
  }

  const accompaniment: AccompanimentNote[] = def.accompaniment.map((token) => {
    const m = /^([A-G][#b]?-?\d)@(\d+):(\d+)$/.exec(token);
    if (!m) throw new Error(`Bad accompaniment token: ${token}`);
    return {
      pitch: pitchFromName(m[1]),
      startBeat: Number(m[2]) * def.unit,
      durationBeats: Number(m[3]) * def.unit,
      velocity: 0.42,
    };
  });
  accompaniment.sort((a, b) => a.startBeat - b.startBeat);

  return {
    id: def.id,
    title: def.title,
    composer: def.composer,
    bpm: def.bpm,
    melody,
    accompaniment,
    source: def.source,
    coverage: def.coverage,
  };
}

/** Resolve beats → seconds for a difficulty (tempo multiplier). */
export function timeSong(data: SongData, difficulty: Difficulty): TimedSong {
  const secPerBeat = 60 / data.bpm / DIFFICULTY[difficulty].tempo;
  const notes = data.melody.map((n) => ({ ...n, time: n.startBeat * secPerBeat, duration: n.durationBeats * secPerBeat }));
  const accompaniment = data.accompaniment.map((n) => ({
    ...n,
    time: n.startBeat * secPerBeat,
    duration: n.durationBeats * secPerBeat,
  }));
  const endTime = Math.max(
    0,
    ...notes.map((n) => n.time + n.duration),
    ...accompaniment.map((n) => n.time + n.duration),
  );
  return { data, difficulty, notes, accompaniment, endTime };
}

/** A note is a Hold tile when it is at least HOLD_MIN_BEATS long (chord members included). */
export function isHold(note: { durationBeats: number }): boolean {
  return note.durationBeats >= HOLD_MIN_BEATS;
}
