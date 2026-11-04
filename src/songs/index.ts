import type { SongData } from "@/engine/types";
import { canonInD } from "./canonInD";
import { furElise } from "./furElise";
import { jingleBells } from "./jingleBells";
import { midnightGroove } from "./midnightGroove";
import { moonlightSonata } from "./moonlightSonata";
import { odeToJoy } from "./odeToJoy";
import { twinkleTwinkle } from "./twinkleTwinkle";

export const SONGS: SongData[] = [furElise, canonInD, moonlightSonata, odeToJoy, twinkleTwinkle, jingleBells, midnightGroove];

export interface SongCatalogEntry {
  id: string;
  title: string;
  composer: string;
  available: boolean;
  /** Rough difficulty for the card: 1 (easy) – 3 (hard). A guide, not a measurement. */
  level?: 1 | 2 | 3;
  /** A local-only song loaded from songs-private/ (development only, never deployed). */
  private?: boolean;
  /** A composition written for this project. */
  original?: boolean;
}

/** Cards shown in the song selector. Anything without `available` is "Coming Soon". */
export const CATALOG: SongCatalogEntry[] = [
  { id: furElise.id, title: furElise.title, composer: furElise.composer, available: true, level: 3 },
  { id: canonInD.id, title: canonInD.title, composer: canonInD.composer, available: true, level: 2 },
  { id: moonlightSonata.id, title: moonlightSonata.title, composer: moonlightSonata.composer, available: true, level: 2 },
  { id: odeToJoy.id, title: odeToJoy.title, composer: odeToJoy.composer, available: true, level: 1 },
  { id: twinkleTwinkle.id, title: twinkleTwinkle.title, composer: twinkleTwinkle.composer, available: true, level: 1 },
  { id: jingleBells.id, title: jingleBells.title, composer: jingleBells.composer, available: true, level: 1 },
  { id: midnightGroove.id, title: midnightGroove.title, composer: midnightGroove.composer, available: true, level: 1, original: true },
  { id: "clair-de-lune", title: "Clair de Lune", composer: "Claude Debussy", available: false },
];

/** Local-only songs (see privateSongs.ts). Empty in production builds. */
const PRIVATE_SONGS: SongData[] = [];

export function setPrivateSongs(songs: SongData[]) {
  PRIVATE_SONGS.length = 0;
  PRIVATE_SONGS.push(...songs);
}

export function getSong(id: string): SongData | undefined {
  return SONGS.find((s) => s.id === id) ?? PRIVATE_SONGS.find((s) => s.id === id);
}
