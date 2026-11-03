import { PianoSynth } from "./pianoSynth";

interface AudioEngine {
  ctx: AudioContext;
  synth: PianoSynth;
}

let engine: AudioEngine | null = null;

/** Creates the AudioContext lazily; must first be called from a user gesture (Start Game click / key press). */
export async function getAudio(volume = 0.8): Promise<AudioEngine> {
  if (!engine) {
    try {
      // iOS 16.4+: treat page audio as "playback" so the ring/silent switch does not mute the piano.
      (navigator as unknown as { audioSession?: { type: string } }).audioSession && ((navigator as unknown as { audioSession: { type: string } }).audioSession.type = "playback");
    } catch {
      /* unsupported */
    }
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor({ latencyHint: "interactive" });
    engine = { ctx, synth: new PianoSynth(ctx, volume) };
  }
  if (engine.ctx.state !== "running") {
    try {
      await engine.ctx.resume();
    } catch {
      /* will retry on next gesture */
    }
  }
  return engine;
}

export function peekAudio(): AudioEngine | null {
  return engine;
}
