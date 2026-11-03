import type { Difficulty } from "@/engine/types";

const KEY = "pianogame.v1";

export interface BestRecord {
  score: number;
  accuracy: number;
  maxCombo: number;
  at: number;
}

interface Persisted {
  volume: number;
  difficulty: Difficulty;
  songId: string;
  best: Record<string, BestRecord>;
}

const DEFAULTS: Persisted = { volume: 0.8, difficulty: "normal", songId: "fur-elise", best: {} };

export function loadPrefs(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, best: {} };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      volume: typeof parsed.volume === "number" ? Math.min(1, Math.max(0, parsed.volume)) : DEFAULTS.volume,
      difficulty:
        parsed.difficulty === "easy" || parsed.difficulty === "hard" || parsed.difficulty === "normal"
          ? parsed.difficulty
          : DEFAULTS.difficulty,
      songId: typeof parsed.songId === "string" ? parsed.songId : DEFAULTS.songId,
      best: parsed.best && typeof parsed.best === "object" ? parsed.best : {},
    };
  } catch {
    return { ...DEFAULTS, best: {} };
  }
}

export function savePrefs(patch: Partial<Persisted>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadPrefs(), ...patch }));
  } catch {
    /* storage unavailable (private mode / quota) — preferences are optional */
  }
}

export const bestKey = (songId: string, difficulty: Difficulty) => `${songId}:${difficulty}`;

/** Stores the run if it beats the saved best. Returns the previous best (if any) and whether this is a new best. */
export function saveBest(songId: string, difficulty: Difficulty, rec: BestRecord): { previous: BestRecord | null; isNewBest: boolean } {
  const prefs = loadPrefs();
  const k = bestKey(songId, difficulty);
  const previous = prefs.best[k] ?? null;
  const isNewBest = !previous || rec.score > previous.score;
  if (isNewBest) savePrefs({ best: { ...prefs.best, [k]: rec } });
  return { previous, isNewBest };
}
