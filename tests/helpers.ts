import { buildSong, timeSong } from "@/songs/builder";
import { PlaySession } from "@/engine/session";
import type { SoundCommand } from "@/engine/types";

/** 60 bpm, unit 1 beat → note times are whole seconds at normal tempo. */
export function makeSession(melody: string[]) {
  const data = buildSong({ id: "t", title: "t", composer: "t", bpm: 60, unit: 1, melody, accompaniment: [], source: "", coverage: "" });
  return new PlaySession(timeSong(data, "normal"));
}

export const noteOns = (sounds: SoundCommand[]) => sounds.filter((s) => s.type === "noteOn");
