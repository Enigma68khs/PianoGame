import type { SongData } from "@/engine/types";
import { furElise } from "./furElise";

export const SONGS: SongData[] = [furElise];

export interface SongCatalogEntry {
  id: string;
  title: string;
  composer: string;
  available: boolean;
}

/** Cards shown in the song selector. Anything without `available` is "Coming Soon". */
export const CATALOG: SongCatalogEntry[] = [
  { id: furElise.id, title: furElise.title, composer: furElise.composer, available: true },
  { id: "canon-d", title: "Canon in D", composer: "Johann Pachelbel", available: false },
  { id: "clair-de-lune", title: "Clair de Lune", composer: "Claude Debussy", available: false },
  { id: "moonlight", title: "Moonlight Sonata", composer: "Ludwig van Beethoven", available: false },
];

export function getSong(id: string): SongData | undefined {
  return SONGS.find((s) => s.id === id);
}
