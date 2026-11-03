import { JUDGE, LANES } from "./constants";
import type {
  Judgement,
  LaneIndex,
  PerformanceEvent,
  SessionOutput,
  SoundCommand,
  TimedNote,
  TimedSong,
} from "./types";
import { isHold } from "@/songs/builder";

export type NoteStatus = "pending" | "holding" | "hit" | "wrong" | "miss";

export interface NoteState {
  note: TimedNote;
  status: NoteStatus;
  judgement: Judgement | null;
  /** Song time of the input that resolved this note. */
  resolvedAt: number | null;
  /** For holds in progress / finished: song time the key went down. */
  pressedAt: number | null;
  holdBroken: boolean;
  event: PerformanceEvent | null;
}

/** Ring length of a normal tile's piano sound (seconds) — the damper falls after the written value. */
export function soundDurationFor(note: TimedNote): number {
  return isHold(note) ? note.duration * 1.1 : Math.max(note.duration * 1.4, 0.45);
}

/** Pitch used when a stray key has no note it can be attributed to in its own lane. */
const STRAY_SAME_LANE_OFFSET = 1;

function clampMidi(p: number) {
  return Math.min(108, Math.max(21, p));
}

/**
 * Pure game-logic core: no DOM, no audio. It consumes timestamped key events and produces
 * (a) the performance log and (b) the sound commands the audio layer must play.
 *
 * Correctness rules (spec §6):
 *  - correct lane within the Great window → the note's own pitch sounds, judgement Perfect/Great
 *  - wrong lane while a note is due → that note is CONSUMED as a Wrong Note, the pitch from the note's explicit
 *    laneSounds table sounds, and the correct pitch never sounds afterwards
 *  - a due note that gets no input becomes Miss and sounds nothing
 *  - notes are resolved independently; a wrong key never consumes a note of a chord
 */
export class PlaySession {
  readonly events: PerformanceEvent[] = [];
  readonly states: NoteState[];
  private seq = 0;

  constructor(readonly song: TimedSong) {
    this.states = song.notes.map((note) => ({
      note,
      status: "pending",
      judgement: null,
      resolvedAt: null,
      pressedAt: null,
      holdBroken: false,
      event: null,
    }));
  }

  get totalNotes() {
    return this.states.length;
  }

  /** True when every note is resolved and the song's tail has passed. */
  isFinished(t: number, tail = 0): boolean {
    return t >= this.song.endTime + tail && this.states.every((s) => s.status !== "pending" && s.status !== "holding");
  }

  private push(e: Omit<PerformanceEvent, "seq">): PerformanceEvent {
    const ev: PerformanceEvent = { seq: this.seq++, ...e };
    this.events.push(ev);
    return ev;
  }

  /** A key went down at song time `t`. */
  press(lane: LaneIndex, t: number): SessionOutput {
    const out: SessionOutput = { events: [], sounds: [] };
    const key = LANES[lane].label;

    // 1) Correct lane within the Great window → hit.
    let hit: NoteState | null = null;
    for (const s of this.states) {
      if (s.status !== "pending" || s.note.lane !== lane) continue;
      const d = Math.abs(t - s.note.time);
      if (d <= JUDGE.GREAT && (!hit || d < Math.abs(t - hit.note.time))) hit = s;
    }
    if (hit) {
      this.resolveHit(hit, lane, key, t, out);
      return out;
    }

    // 2) A note in ANOTHER lane is due → wrong note.
    let target: NoteState | null = null;
    for (const s of this.states) {
      if (s.status !== "pending" || s.note.lane === lane) continue;
      const d = Math.abs(t - s.note.time);
      if (d > JUDGE.GREAT) continue;
      if (
        !target ||
        d < Math.abs(t - target.note.time) - 1e-9 ||
        (Math.abs(d - Math.abs(t - target.note.time)) <= 1e-9 &&
          Math.abs(s.note.lane - lane) < Math.abs(target.note.lane - lane))
      ) {
        target = s;
      }
    }
    if (target) {
      this.resolveWrong(target, lane, key, t, out);
      return out;
    }

    // 3) Same-lane press well before its note → ignored (visual feedback only).
    for (const s of this.states) {
      if (s.status !== "pending" || s.note.lane !== lane) continue;
      const early = s.note.time - t;
      if (early > JUDGE.GREAT && early <= JUDGE.EARLY_IGNORE) {
        out.ignored = "early";
        return out;
      }
    }

    // 4) Stray key: a wrong note that consumes nothing.
    this.resolveStray(lane, key, t, out);
    return out;
  }

  /** A key went up. Ends the sound of a Hold early if the player let go. */
  release(lane: LaneIndex, t: number): SessionOutput {
    const out: SessionOutput = { events: [], sounds: [] };
    for (const s of this.states) {
      if (s.status !== "holding" || s.note.lane !== lane) continue;
      this.finishHold(s, t, out);
    }
    return out;
  }

  /** Advance time: turns overdue notes into Miss and completes holds whose end passed. */
  tick(t: number): SessionOutput {
    const out: SessionOutput = { events: [], sounds: [] };
    for (const s of this.states) {
      if (s.status === "pending" && t > s.note.time + JUDGE.GREAT) {
        const ev = this.push({
          time: s.note.time + JUDGE.GREAT,
          key: null,
          lane: null,
          targetNoteId: s.note.id,
          targetPitch: s.note.pitch,
          playedPitch: null, // nothing sounds: the melody note is simply missing
          judgement: "miss",
          timingErrorMs: null,
          noteDuration: s.note.duration,
          heldDuration: null,
          holdBroken: false,
          stray: false,
          soundDuration: null,
          velocity: null,
        });
        s.status = "miss";
        s.judgement = "miss";
        s.resolvedAt = ev.time;
        s.event = ev;
        out.events.push(ev);
      } else if (s.status === "holding" && t >= s.note.time + s.note.duration) {
        this.finishHold(s, s.note.time + s.note.duration, out, true);
      }
    }
    return out;
  }

  private resolveHit(s: NoteState, lane: LaneIndex, key: string, t: number, out: SessionOutput) {
    const err = t - s.note.time;
    const judgement: Judgement = Math.abs(err) <= JUDGE.PERFECT ? "perfect" : "great";
    const sd = soundDurationFor(s.note);
    const ev = this.push({
      time: t,
      key,
      lane,
      targetNoteId: s.note.id,
      targetPitch: s.note.pitch,
      playedPitch: s.note.pitch,
      judgement,
      timingErrorMs: Math.round(err * 1000),
      noteDuration: s.note.duration,
      heldDuration: null,
      holdBroken: false,
      stray: false,
      soundDuration: sd,
      velocity: s.note.velocity,
    });
    s.judgement = judgement;
    s.resolvedAt = t;
    s.pressedAt = t;
    s.event = ev;
    s.status = isHold(s.note) ? "holding" : "hit";
    out.events.push(ev);
    out.sounds.push({
      type: "noteOn",
      voiceId: `n${s.note.id}`,
      pitch: s.note.pitch,
      velocity: s.note.velocity,
      duration: sd,
      kind: "correct",
    });
  }

  private resolveWrong(s: NoteState, lane: LaneIndex, key: string, t: number, out: SessionOutput) {
    const pitch = this.wrongPitch(s.note, lane);
    // Pressing a key that is not part of a chord must not eat a chord member the player can still hit.
    const consumes = s.note.chordGroup === null;
    const sd = soundDurationFor(s.note);
    const ev = this.push({
      time: t,
      key,
      lane,
      targetNoteId: consumes ? s.note.id : null,
      targetPitch: s.note.pitch,
      playedPitch: pitch,
      judgement: "wrong",
      timingErrorMs: Math.round((t - s.note.time) * 1000),
      noteDuration: s.note.duration,
      heldDuration: null,
      holdBroken: false,
      stray: !consumes,
      soundDuration: sd,
      velocity: s.note.velocity,
    });
    if (consumes) {
      s.status = "wrong";
      s.judgement = "wrong";
      s.resolvedAt = t;
      s.event = ev;
    }
    out.events.push(ev);
    out.sounds.push({ type: "noteOn", voiceId: `w${ev.seq}`, pitch, velocity: s.note.velocity, duration: sd, kind: "wrong" });
  }

  private resolveStray(lane: LaneIndex, key: string, t: number, out: SessionOutput) {
    // Attribute the stray key to the nearest unresolved note in a different lane (so the pitch is predictable).
    let ref: NoteState | null = null;
    let anyRef: NoteState | null = null;
    for (const s of this.states) {
      if (s.status !== "pending") continue;
      const d = Math.abs(s.note.time - t);
      if (!anyRef || d < Math.abs(anyRef.note.time - t)) anyRef = s;
      if (s.note.lane !== lane && d <= JUDGE.STRAY_REFERENCE && (!ref || d < Math.abs(ref.note.time - t))) ref = s;
    }
    const base: TimedNote | undefined = (ref ?? anyRef)?.note ?? this.song.notes[this.song.notes.length - 1];
    if (!base) return;
    const pitch = this.wrongPitch(base, lane);
    const ev = this.push({
      time: t,
      key,
      lane,
      targetNoteId: null,
      targetPitch: base.pitch,
      playedPitch: pitch,
      judgement: "wrong",
      timingErrorMs: null,
      noteDuration: null,
      heldDuration: null,
      holdBroken: false,
      stray: true,
      soundDuration: 0.6,
      velocity: base.velocity * 0.9,
    });
    out.events.push(ev);
    out.sounds.push({
      type: "noteOn",
      voiceId: `w${ev.seq}`,
      pitch,
      velocity: base.velocity * 0.9,
      duration: 0.6,
      kind: "wrong",
    });
  }

  /** Wrong pitch from the note's explicit table (never the note's own pitch). */
  private wrongPitch(note: TimedNote, pressedLane: LaneIndex): number {
    if (pressedLane !== note.lane) return note.laneSounds[pressedLane];
    return clampMidi(note.pitch + STRAY_SAME_LANE_OFFSET);
  }

  private finishHold(s: NoteState, t: number, out: SessionOutput, completed = false) {
    const end = s.note.time + s.note.duration;
    const held = Math.max(0, t - (s.pressedAt ?? s.note.time));
    const broken = !completed && t < end - JUDGE.HOLD_END_TOLERANCE;
    s.status = "hit";
    s.holdBroken = broken;
    if (s.event) {
      s.event.heldDuration = held;
      s.event.holdBroken = broken;
    }
    if (broken) {
      const cmd: SoundCommand = { type: "noteOff", voiceId: `n${s.note.id}` };
      out.sounds.push(cmd);
      if (s.event) s.event.soundDuration = held;
    }
  }
}
