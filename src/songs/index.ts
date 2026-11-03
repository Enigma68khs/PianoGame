import type { SongData } from "@/engine/types";
import { canonInD } from "./canonInD";
import { furElise } from "./furElise";
import { jingleBells } from "./jingleBells";
import { moonlightSonata } from "./moonlightSonata";
import { odeToJoy } from "./odeToJoy";
import { twinkleTwinkle } from "./twinkleTwinkle";

export const SONGS: SongData[] = [furElise, canonInD, moonlightSonata, odeToJoy, twinkleTwinkle, jingleBells];

export interface SongCatalogEntry {
  id: string;
  title: string;
  composer: string;
  available: boolean;
  /** Rough difficulty for the card: 1 (easy) – 3 (hard). A guide, not a measurement. */
  level?: 1 | 2 | 3;
}

/** Cards shown in the song selector. Anything without `available` is "Coming Soon". */
export const CATALOG: SongCatalogEntry[] = [
  { id: furElise.id, title: furElise.title, composer: furElise.composer, available: true, level: 3 },
  { id: canonInD.id, title: canonInD.title, composer: canonInD.composer, available: true, level: 2 },
  { id: moonlightSonata.id, title: moonlightSonata.title, composer: moonlightSonata.composer, available: true, level: 2 },
  { id: odeToJoy.id, title: odeToJoy.title, composer: odeToJoy.composer, available: true, level: 1 },
  { id: twinkleTwinkle.id, title: twinkleTwinkle.title, composer: twinkleTwinkle.composer, available: true, level: 1 },
  { id: jingleBells.id, title: jingleBells.title, composer: jingleBells.composer, available: true, level: 1 },
  { id: "clair-de-lune", title: "Clair de Lune", composer: "Claude Debussy", available: false },
];

export function getSong(id: string): SongData | undefined {
  return SONGS.find((s) => s.id === id);
}
