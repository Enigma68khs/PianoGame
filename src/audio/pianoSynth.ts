export interface PlayOptions {
  pitch: number;
  /** 0..1 */
  velocity: number;
  /** AudioContext time; defaults to "now". */
  when?: number;
  /** Seconds until the damper falls (key released). */
  duration: number;
  voiceId?: string;
}

interface Voice {
  id: string;
  start: number;
  release: (when: number, tau?: number) => void;
  kill: () => void;
  released: boolean;
}

const MAX_VOICES = 40;

export const midiToFreq = (pitch: number) => 440 * Math.pow(2, (pitch - 69) / 12);

/**
 * Self-contained piano-like synthesiser (no external samples → no licensing concerns).
 * Per note: two slightly detuned oscillators with a piano-ish harmonic spectrum (the "two strings"),
 * a velocity-dependent low-pass filter that darkens as the note decays, a two-stage amplitude envelope
 * (fast initial drop + long tail, longer for low notes) and a short filtered-noise "hammer".
 */
export class PianoSynth {
  readonly master: GainNode;
  private readonly comp: DynamicsCompressorNode;
  private readonly wave: PeriodicWave;
  private readonly noise: AudioBuffer;
  private voices = new Map<string, Voice>();
  private anon = 0;
  private volume = 0.8;

  constructor(readonly ctx: AudioContext, volume = 0.8) {
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 18;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.connect(this.comp).connect(ctx.destination);
    this.setVolume(volume);

    const harmonics = [0, 1, 0.52, 0.3, 0.2, 0.13, 0.09, 0.06, 0.04, 0.025, 0.015];
    const real = new Float32Array(harmonics.length);
    const imag = new Float32Array(harmonics);
    this.wave = ctx.createPeriodicWave(real, imag);

    const len = Math.floor(ctx.sampleRate * 0.04);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0; // deterministic noise
      data[i] = (seed / 0xffffffff) * 2 - 1;
    }
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    // Perceptual (squared) curve; 1.0 stays comfortably below clipping thanks to the compressor.
    this.master.gain.setTargetAtTime(this.volume * this.volume * 0.9, this.ctx.currentTime, 0.01);
  }

  getVolume() {
    return this.volume;
  }

  play(opts: PlayOptions): string {
    const { ctx } = this;
    const id = opts.voiceId ?? `a${this.anon++}`;
    // A re-triggered voice id (same key pressed again) replaces its previous sound.
    this.voices.get(id)?.release(opts.when ?? ctx.currentTime, 0.03);

    const t0 = Math.max(opts.when ?? ctx.currentTime, ctx.currentTime);
    const f = midiToFreq(opts.pitch);
    const vel = Math.min(1, Math.max(0.05, opts.velocity));
    const peak = 0.55 * Math.pow(vel, 1.3);

    const out = ctx.createGain(); // release control
    out.gain.value = 1;
    out.connect(this.master);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.4;
    const bright = Math.min(16000, f * (6 + vel * 12));
    const mellow = Math.min(9000, f * 2.4);
    filter.frequency.setValueAtTime(bright, t0);
    filter.frequency.setTargetAtTime(mellow, t0, 0.35);

    // two-stage envelope: punchy front + long tail
    const tauTail = Math.min(4.2, Math.max(0.7, 3.4 - (opts.pitch - 36) * 0.034));
    const front = ctx.createGain();
    front.gain.setValueAtTime(0.0001, t0);
    front.gain.linearRampToValueAtTime(peak * 0.7, t0 + 0.003);
    front.gain.setTargetAtTime(0.0001, t0 + 0.003, 0.14);
    const tail = ctx.createGain();
    tail.gain.setValueAtTime(0.0001, t0);
    tail.gain.linearRampToValueAtTime(peak * 0.45, t0 + 0.004);
    tail.gain.setTargetAtTime(0.0001, t0 + 0.004, tauTail);
    filter.connect(front).connect(out);
    filter.connect(tail).connect(out);

    const oscs: OscillatorNode[] = [];
    for (const detune of [-3.5, 3.5]) {
      const o = ctx.createOscillator();
      o.setPeriodicWave(this.wave);
      o.frequency.value = f;
      o.detune.value = detune;
      o.connect(filter);
      o.start(t0);
      oscs.push(o);
    }

    // hammer thump
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = Math.min(6000, f * 2.5);
    bp.Q.value = 0.8;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.35 * vel, t0);
    hg.gain.setTargetAtTime(0.0001, t0, 0.008);
    src.connect(bp).connect(hg).connect(out);
    src.start(t0);

    let ended = false;
    const fade = (when: number, tau: number) => {
      const tr = Math.max(when, ctx.currentTime);
      out.gain.cancelScheduledValues(tr);
      out.gain.setValueAtTime(1, tr);
      out.gain.setTargetAtTime(0, tr, tau);
      for (const o of oscs) o.stop(tr + tau * 8 + 0.05);
    };
    const voice: Voice = {
      id,
      start: t0,
      released: false,
      release: (when, tau = 0.09) => {
        if (voice.released) return;
        voice.released = true;
        fade(when, tau);
      },
      kill: () => {
        if (ended) return;
        ended = true;
        for (const o of oscs) {
          try {
            o.stop(ctx.currentTime);
          } catch {
            /* already stopped */
          }
        }
        out.disconnect();
        if (this.voices.get(id) === voice) this.voices.delete(id);
      },
    };
    oscs[0].onended = () => {
      if (!ended) {
        ended = true;
        out.disconnect();
        if (this.voices.get(id) === voice) this.voices.delete(id);
      }
    };
    this.voices.set(id, voice);
    // Natural damper at the written note length. An early key-up (noteOff) re-schedules the fade sooner.
    fade(t0 + Math.max(0.05, opts.duration), 0.11);
    // Guard polyphony
    if (this.voices.size > MAX_VOICES) {
      const oldest = [...this.voices.values()].sort((a, b) => a.start - b.start)[0];
      oldest?.release(ctx.currentTime, 0.04);
    }
    return id;
  }

  /** Damper falls now (key released early). */
  noteOff(voiceId: string, when?: number) {
    this.voices.get(voiceId)?.release(when ?? this.ctx.currentTime, 0.07);
  }

  /** Silence everything, including notes scheduled for the future (pause / restart / leave screen). */
  stopAll() {
    for (const v of [...this.voices.values()]) v.kill();
    this.voices.clear();
  }
}
