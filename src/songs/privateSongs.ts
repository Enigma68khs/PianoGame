import type { SongData } from "@/engine/types";
import { buildSong, type ChartDef } from "./builder";

/**
 * Private, local-only songs.
 *
 * Charts live as `songs-private/*.json` (git-ignored), are copied to `public/private-songs/index.json` by
 * `scripts/sync-private-songs.mjs` when `npm run dev` starts, and are fetched here — in DEVELOPMENT ONLY.
 * Production builds (CI, GitHub Pages) neither contain such files nor even try to load them, so a private chart
 * can never be published by accident.
 */

export interface PrivateChartFile {
  id: string;
  title: string;
  composer?: string;
  bpm: number;
  unit?: number;
  holdMinBeats?: number;
  velocity?: number;
  accompanimentVelocity?: number;
  melody: string[];
  accompaniment?: string[];
  source?: string;
  coverage?: string;
  /** 1–3 stars on the card (optional). */
  level?: 1 | 2 | 3;
  /** Background scene: moon | dawn | lake | stars | snow | neon (optional). */
  theme?: string;
}

export type PrivateResult =
  | { kind: "song"; song: SongData; level?: 1 | 2 | 3; theme?: string; file: string }
  /** Slot with metadata but no notes yet: shown as a disabled card. */
  | { kind: "pending"; id: string; title: string; composer: string; file: string }
  | { kind: "error"; file: string; message: string };

const fail = (file: string, message: string): PrivateResult => ({ kind: "error", file, message });
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Validates one chart file and builds the song. Never throws. */
export function parsePrivateChart(raw: unknown, file: string): PrivateResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return fail(file, "최상위가 객체({ ... })가 아니에요");
  const c = raw as Partial<PrivateChartFile>;
  if (typeof c.title !== "string" || !c.title.trim()) return fail(file, '"title"(곡 제목)이 필요해요');
  const id = `private-${slug(typeof c.id === "string" && c.id ? c.id : c.title)}`;
  if (id === "private-") return fail(file, '"id"는 영문/숫자가 들어 있어야 해요');
  const composer = typeof c.composer === "string" ? c.composer : "";
  if (!Array.isArray(c.melody)) return fail(file, '"melody"(음표 목록)가 배열이 아니에요');
  if (c.melody.length === 0 || c.melody.every((t) => typeof t === "string" && t.startsWith("R:"))) {
    return { kind: "pending", id, title: c.title, composer, file };
  }
  if (!c.melody.every((t) => typeof t === "string")) return fail(file, '"melody"에는 문자열만 넣을 수 있어요');
  if (typeof c.bpm !== "number" || !(c.bpm >= 20 && c.bpm <= 400)) return fail(file, '"bpm"은 20~400 사이의 숫자여야 해요');
  const unit = c.unit ?? 0.5;
  if (typeof unit !== "number" || !(unit > 0 && unit <= 4)) return fail(file, '"unit"은 0보다 크고 4 이하인 숫자여야 해요');
  if (c.accompaniment !== undefined && (!Array.isArray(c.accompaniment) || !c.accompaniment.every((t) => typeof t === "string"))) {
    return fail(file, '"accompaniment"는 문자열 배열이어야 해요');
  }

  const def: ChartDef = {
    id,
    title: c.title,
    composer,
    bpm: c.bpm,
    unit,
    holdMinBeats: c.holdMinBeats,
    velocity: c.velocity,
    accompanimentVelocity: c.accompanimentVelocity,
    melody: c.melody as string[],
    accompaniment: (c.accompaniment as string[] | undefined) ?? [],
    source: c.source ?? "Private local chart (user-supplied, not published).",
    coverage: c.coverage ?? "Private local chart — only on this computer, never deployed.",
  };

  let song: SongData;
  try {
    song = buildSong(def);
  } catch (e) {
    return fail(file, `음표 표기 오류: ${(e as Error).message}`);
  }
  if (song.melody.length < 2) return fail(file, "음표가 너무 적어요 (최소 2개)");

  // same lane, same moment → impossible to play
  const seen = new Map<string, number>();
  for (const n of song.melody) {
    const key = `${n.lane}@${n.startBeat.toFixed(4)}`;
    if (seen.has(key)) return fail(file, `같은 박에 같은 레인(${n.lane + 1}번)에 음표가 둘 있어요 (${n.startBeat.toFixed(2)}박)`);
    seen.set(key, n.id);
  }
  const level = c.level === 1 || c.level === 2 || c.level === 3 ? c.level : undefined;
  return { kind: "song", song, level, theme: typeof c.theme === "string" ? c.theme : undefined, file };
}

/** Fetches `private-songs/index.json` (written by the sync script). Empty outside development. */
export async function loadPrivateSongs(): Promise<PrivateResult[]> {
  if (process.env.NODE_ENV !== "development") return [];
  try {
    const res = await fetch("private-songs/index.json", { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { charts?: { file: string; chart?: unknown; error?: string }[] };
    return (data.charts ?? []).map((c) => (c.error ? fail(c.file, `JSON 문법 오류: ${c.error}`) : parsePrivateChart(c.chart, c.file)));
  } catch {
    return [];
  }
}
