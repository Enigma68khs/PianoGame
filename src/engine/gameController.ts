import { AccompanimentScheduler } from "@/audio/scheduler";
import { getAudio } from "@/audio/audioEngine";
import type { PianoSynth } from "@/audio/pianoSynth";
import { pitchName, timeSong } from "@/songs/builder";
import { SongClock } from "./clock";
import { createBackground } from "./backgrounds";
import { COUNTDOWN_SECONDS, DIFFICULTY, END_PADDING, FALL_TIME, JUDGE, LANES, LANE_COUNT } from "./constants";
import { GameInput, type GameCommand } from "./input";
import { Renderer } from "./renderer";
import { PlaySession } from "./session";
import { computeStats, emptyStats } from "./stats";
import type {
  Difficulty,
  GameState,
  LaneIndex,
  PerformanceEvent,
  SessionOutput,
  SongData,
  Stats,
  TimedAccompaniment,
  TimedNote,
} from "./types";

const RESUME_COUNTDOWN_SECONDS = 2;

export interface HudSnapshot {
  state: GameState;
  title: string;
  stats: Stats;
  /** 0..1 */
  progress: number;
  /** Whole seconds remaining in the READY countdown, else null. */
  countdown: number | null;
  /** True while the READY countdown is a resume (after Pause) rather than the song start. */
  resuming: boolean;
  confirmRestart: boolean;
}

export interface GameResult {
  songId: string;
  title: string;
  composer: string;
  difficulty: Difficulty;
  stats: Stats;
  events: PerformanceEvent[];
  notes: TimedNote[];
  accompaniment: TimedAccompaniment[];
  totalNotes: number;
}

export interface ControllerOptions {
  song: SongData;
  difficulty: Difficulty;
  volume: number;
  canvas: HTMLCanvasElement;
  onChange(h: HudSnapshot): void;
  onComplete(r: GameResult): void;
}

/**
 * Glue between input, the pure PlaySession, the audio engine and the renderer.
 * One clock (AudioContext time) drives everything.
 */
export class GameController {
  private state: GameState = "MENU";
  private readonly timed;
  private session: PlaySession;
  private readonly clock: SongClock;
  private readonly renderer: Renderer;
  private readonly scheduler: AccompanimentScheduler;
  private readonly input: GameInput;
  private laneDown: boolean[] = new Array(LANE_COUNT).fill(false);
  private raf = 0;
  private destroyed = false;
  private readyEndsAt = 0;
  private resuming = false;
  private confirmRestart = false;
  private lastEmit = 0;
  private lastCountdown: number | null = null;
  private completedAt: number | null = null;
  private stats: Stats = emptyStats();
  private disposers: (() => void)[] = [];
  private analyser: AnalyserNode | null = null;
  /** pointerId → lane for every finger / mouse button currently held on the playfield. */
  private touchLanes = new Map<number, LaneIndex>();
  private readonly pulsePeriod: number;

  private constructor(
    private readonly opts: ControllerOptions,
    private readonly synth: PianoSynth,
  ) {
    this.timed = timeSong(opts.song, opts.difficulty);
    this.session = new PlaySession(this.timed);
    this.clock = new SongClock(() => synth.ctx.currentTime);
    this.renderer = new Renderer(opts.canvas, createBackground(opts.song.id));
    // one pulse per eighth-note of the music (3/8 time)
    this.pulsePeriod = 60 / opts.song.bpm / DIFFICULTY[opts.difficulty].tempo / 2;
    this.scheduler = new AccompanimentScheduler(synth, this.clock, this.timed.accompaniment);
    this.input = new GameInput({
      onLaneDown: (lane) => this.laneDownEvent(lane),
      onLaneUp: (lane) => this.laneUpEvent(lane),
      onCommand: (cmd) => this.command(cmd),
    });
    this.attachListeners();
  }

  /** Must be called from a user gesture (it creates / resumes the AudioContext). */
  static async create(opts: ControllerOptions): Promise<GameController> {
    const { synth } = await getAudio(opts.volume);
    synth.setVolume(opts.volume);
    return new GameController(opts, synth);
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────
  /** Enter READY (countdown) from the beginning of the song. */
  start() {
    this.clock.reset(-FALL_TIME); // song time 0 (the first note) arrives one fall-time after play begins
    this.beginReady(COUNTDOWN_SECONDS, false);
    this.loop();
    if (typeof window !== "undefined") {
      (window as unknown as { __pianoGame?: unknown }).__pianoGame = this.debugApi();
    }
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.scheduler.stop();
    this.synth.stopAll();
    this.input.reset(false);
    this.disposers.forEach((d) => d());
    this.disposers = [];
    if (typeof window !== "undefined") delete (window as unknown as { __pianoGame?: unknown }).__pianoGame;
  }

  setVolume(v: number) {
    this.synth.setVolume(v);
  }

  getState() {
    return this.state;
  }

  // ── state transitions ──────────────────────────────────────────────────────
  private beginReady(seconds: number, resuming: boolean) {
    this.state = "READY";
    this.resuming = resuming;
    this.readyEndsAt = this.synth.ctx.currentTime + seconds;
    this.lastCountdown = null;
    this.emit(true);
  }

  private beginPlaying() {
    this.state = "PLAYING";
    this.resuming = false;
    this.clock.start();
    this.scheduler.start();
    this.emit(true);
  }

  pause() {
    if (this.state !== "PLAYING" && this.state !== "READY") return;
    if (this.state === "PLAYING") {
      // lift every held key / finger first so holds end cleanly at the pause position
      this.releaseAllTouches(true);
      this.input.reset(true);
      this.clock.pause();
    }
    this.input.reset(false);
    this.laneDown.fill(false);
    this.scheduler.stop();
    this.synth.stopAll();
    this.state = "PAUSED";
    this.resuming = false;
    this.emit(true);
  }

  resume() {
    if (this.state !== "PAUSED" || this.confirmRestart) return;
    this.input.reset(false);
    this.beginReady(RESUME_COUNTDOWN_SECONDS, true);
  }

  /** R key / button: ask first. */
  requestRestart() {
    if (this.state === "COMPLETED" || this.state === "MENU") return;
    if (this.state === "PLAYING" || this.state === "READY") this.pause();
    this.confirmRestart = true;
    this.emit(true);
  }

  cancelRestart() {
    if (!this.confirmRestart) return;
    this.confirmRestart = false;
    this.emit(true);
  }

  /** Score, combo and input log are reset; the song starts again from the beginning. */
  restart() {
    this.confirmRestart = false;
    this.scheduler.stop();
    this.synth.stopAll();
    this.input.reset(false);
    this.releaseAllTouches(false);
    this.laneDown.fill(false);
    this.clock.pause();
    this.clock.reset(-FALL_TIME);
    this.session = new PlaySession(this.timed);
    this.stats = emptyStats();
    this.completedAt = null;
    this.renderer.clearFx();
    this.beginReady(COUNTDOWN_SECONDS, false);
  }

  private complete() {
    if (this.state === "COMPLETED") return;
    this.state = "COMPLETED";
    this.scheduler.stop();
    this.clock.pause();
    this.input.reset(false);
    this.releaseAllTouches(false);
    this.emit(true);
    this.opts.onComplete({
      songId: this.opts.song.id,
      title: this.opts.song.title,
      composer: this.opts.song.composer,
      difficulty: this.opts.difficulty,
      stats: computeStats(this.session.events),
      events: this.session.events.slice(),
      notes: this.timed.notes,
      accompaniment: this.timed.accompaniment,
      totalNotes: this.timed.notes.length,
    });
  }

  // ── input ──────────────────────────────────────────────────────────────────
  private attachListeners() {
    const kd = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return; // let the volume slider keep its arrow keys
      this.input.keydown(e);
    };
    const ku = (e: KeyboardEvent) => this.input.keyup(e);
    const blur = () => {
      this.releaseAllTouches(true);
      this.input.reset(true);
      this.laneDown.fill(false);
      if (this.state === "PLAYING" || this.state === "READY") this.pause();
    };
    const vis = () => {
      if (document.hidden) blur();
    };
    // Touch / mouse: press anywhere in a lane column. Pointer capture keeps the release attached to this
    // canvas, every finger is tracked by its pointerId (multi-touch chords), and holding = keeping the finger down.
    const canvas = this.opts.canvas;
    const pd = (e: PointerEvent) => {
      const lane = this.laneAtClientX(e.clientX);
      if (lane === null) return;
      e.preventDefault();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic pointers can't be captured */
      }
      const alreadyDown = this.input.isDown(lane) || [...this.touchLanes.values()].includes(lane);
      this.touchLanes.set(e.pointerId, lane);
      if (!alreadyDown) this.laneDownEvent(lane);
    };
    const pu = (e: PointerEvent) => {
      const lane = this.touchLanes.get(e.pointerId);
      if (lane === undefined) return;
      e.preventDefault();
      this.touchLanes.delete(e.pointerId);
      const stillDown = this.input.isDown(lane) || [...this.touchLanes.values()].includes(lane);
      if (!stillDown) this.laneUpEvent(lane);
    };
    const noMenu = (e: Event) => e.preventDefault();
    canvas.addEventListener("pointerdown", pd);
    canvas.addEventListener("pointerup", pu);
    canvas.addEventListener("pointercancel", pu);
    canvas.addEventListener("contextmenu", noMenu);
    window.addEventListener("keydown", kd, { capture: true });
    window.addEventListener("keyup", ku, { capture: true });
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", vis);
    this.disposers.push(() => {
      canvas.removeEventListener("pointerdown", pd);
      canvas.removeEventListener("pointerup", pu);
      canvas.removeEventListener("pointercancel", pu);
      canvas.removeEventListener("contextmenu", noMenu);
      window.removeEventListener("keydown", kd, { capture: true });
      window.removeEventListener("keyup", ku, { capture: true });
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", vis);
    });
  }

  /** Lane under a horizontal screen position, or null outside the playfield. */
  private laneAtClientX(clientX: number): LaneIndex | null {
    const L = this.renderer.getLayout();
    const rel = clientX - this.opts.canvas.getBoundingClientRect().left - L.fieldX;
    if (rel < 0 || rel >= L.fieldW) return null;
    return Math.min(LANE_COUNT - 1, Math.floor(rel / L.laneW)) as LaneIndex;
  }

  /** Lift every finger (optionally reporting the releases so holds end at this moment). */
  private releaseAllTouches(notify: boolean) {
    const held = [...new Set(this.touchLanes.values())];
    this.touchLanes.clear();
    if (notify) for (const lane of held) if (!this.input.isDown(lane)) this.laneUpEvent(lane);
  }

  private command(cmd: GameCommand) {
    switch (cmd) {
      case "pause":
        if (this.confirmRestart) return;
        if (this.state === "PLAYING" || this.state === "READY") this.pause();
        else if (this.state === "PAUSED") this.resume();
        break;
      case "escape":
        if (this.confirmRestart) this.cancelRestart();
        else if (this.state === "PLAYING" || this.state === "READY") this.pause();
        else if (this.state === "PAUSED") this.resume();
        break;
      case "restart":
        if (this.confirmRestart) this.cancelRestart();
        else this.requestRestart();
        break;
      case "enter":
        if (this.confirmRestart) this.restart();
        break;
    }
  }

  private laneDownEvent(lane: LaneIndex) {
    if (this.state === "PLAYING") {
      this.laneDown[lane] = true;
      const t = this.clock.time() + JUDGE.INPUT_OFFSET;
      this.apply(this.session.press(lane, t), lane);
    } else if (this.state === "READY") {
      this.laneDown[lane] = true; // visual feedback only
    }
  }

  private laneUpEvent(lane: LaneIndex) {
    this.laneDown[lane] = false;
    if (this.state === "PLAYING") {
      this.apply(this.session.release(lane, this.clock.time() + JUDGE.INPUT_OFFSET), lane);
    }
  }

  /** Turn a session result into sound, visual effects and a HUD update. */
  private apply(out: SessionOutput, pressedLane?: LaneIndex) {
    const now = performance.now() / 1000;
    for (const s of out.sounds) {
      if (s.type === "noteOn") {
        this.synth.play({ pitch: s.pitch, velocity: s.velocity, duration: s.duration, voiceId: s.voiceId });
      } else {
        this.synth.noteOff(s.voiceId);
      }
    }
    if (out.ignored && pressedLane !== undefined) this.renderer.judgement(pressedLane, "early", now, "early");
    for (const e of out.events) {
      const lane = (e.lane ?? this.laneOfNote(e.targetNoteId) ?? 0) as LaneIndex;
      const fxLane = e.judgement === "miss" ? ((this.laneOfNote(e.targetNoteId) ?? 0) as LaneIndex) : lane;
      const label =
        e.judgement === "perfect"
          ? "PERFECT"
          : e.judgement === "great"
            ? "GREAT"
            : e.judgement === "miss"
              ? "MISS"
              : `WRONG ${e.playedPitch !== null ? pitchName(e.playedPitch) : ""}`;
      this.renderer.judgement(fxLane, e.judgement, now, label);
    }
    if (out.events.length) {
      this.stats = computeStats(this.session.events);
      this.emit(true);
    }
  }

  private laneOfNote(id: number | null): LaneIndex | null {
    if (id === null) return null;
    return this.timed.notes[id]?.lane ?? null;
  }

  // ── frame loop ─────────────────────────────────────────────────────────────
  private loop = () => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const ctxNow = this.synth.ctx.currentTime;

    if (this.state === "READY") {
      const remaining = this.readyEndsAt - ctxNow;
      if (remaining <= 0) {
        this.beginPlaying();
      } else {
        const c = Math.ceil(remaining);
        if (c !== this.lastCountdown) {
          this.lastCountdown = c;
          this.emit(true);
        }
      }
    }

    const t = this.clock.time();
    if (this.state === "PLAYING") {
      this.apply(this.session.tick(t));
      if (this.session.isFinished(t, END_PADDING)) this.complete();
    }

    this.renderer.render(
      {
        t,
        states: this.session.states,
        laneDown: this.laneDown,
        active: this.state === "PLAYING",
        beat: this.state === "PLAYING" ? Math.exp(-5 * ((((t % this.pulsePeriod) + this.pulsePeriod) % this.pulsePeriod) / this.pulsePeriod)) : 0,
        energy: Math.min(1, this.stats.combo / 40),
      },
      performance.now() / 1000,
    );
    if (this.state === "PLAYING") this.emit(false);
  };

  private progress(): number {
    const t = this.clock.time();
    return Math.min(1, Math.max(0, t / this.timed.endTime));
  }

  private emit(force: boolean) {
    const nowMs = performance.now();
    if (!force && nowMs - this.lastEmit < 120) return;
    this.lastEmit = nowMs;
    this.opts.onChange({
      state: this.state,
      title: this.opts.song.title,
      stats: this.stats,
      progress: this.progress(),
      countdown: this.state === "READY" ? this.lastCountdown : null,
      resuming: this.resuming,
      confirmRestart: this.confirmRestart,
    });
  }

  /** Read-only hooks for automated browser tests / debugging. */
  private debugApi() {
    return {
      getState: () => this.state,
      getSongTime: () => this.clock.time(),
      getEvents: () => this.session.events.slice(),
      getNotes: () => this.timed.notes,
      getStats: () => computeStats(this.session.events),
      getAudioTime: () => this.synth.ctx.currentTime,
      getAudioState: () => this.synth.ctx.state,
      lanes: LANES.map((l) => l.code),
      /** Taps the synth output so a test can measure what is actually being played. */
      probeStart: () => {
        if (this.analyser) return;
        const a = this.synth.ctx.createAnalyser();
        a.fftSize = 16384;
        a.smoothingTimeConstant = 0;
        const mute = this.synth.ctx.createGain();
        mute.gain.value = 0;
        this.synth.master.connect(a);
        a.connect(mute).connect(this.synth.ctx.destination);
        this.analyser = a;
      },
      /** RMS level, loudest frequency (as MIDI pitch) in 150–2000 Hz, and dB at the requested frequencies. */
      probe: (freqs: number[] = []) => {
        const a = this.analyser;
        if (!a) return null;
        const td = new Float32Array(a.fftSize);
        a.getFloatTimeDomainData(td);
        const rms = Math.sqrt(td.reduce((sum, v) => sum + v * v, 0) / td.length);
        const fd = new Float32Array(a.frequencyBinCount);
        a.getFloatFrequencyData(fd);
        const binHz = this.synth.ctx.sampleRate / a.fftSize;
        let best = Math.round(150 / binHz);
        for (let i = best; i < Math.round(2000 / binHz); i++) if (fd[i] > fd[best]) best = i;
        const peakHz = best * binHz;
        return {
          rms,
          peakHz,
          peakMidi: Math.round(69 + 12 * Math.log2(peakHz / 440)),
          db: freqs.map((f) => fd[Math.round(f / binHz)]),
        };
      },
    };
  }
}
