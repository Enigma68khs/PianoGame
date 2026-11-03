import { PianoSynth } from "./pianoSynth";

interface AudioEngine {
  ctx: AudioContext;
  synth: PianoSynth;
}

let engine: AudioEngine | null = null;

/** Creates the AudioContext lazily; must first be called from a user gesture (Start Game click / key press). */
export async function getAudio(volume = 0.8): Promise<AudioEngine> {
  if (!engine) {
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
