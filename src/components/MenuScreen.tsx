"use client";

import { useEffect, useRef, useState } from "react";
import { DIFFICULTY } from "@/engine/constants";
import type { Difficulty } from "@/engine/types";
import { CATALOG, getSong } from "@/songs";
import { timeSong } from "@/songs/builder";

interface Props {
  songId: string;
  onSong(id: string): void;
  difficulty: Difficulty;
  onDifficulty(d: Difficulty): void;
  volume: number;
  onVolume(v: number): void;
  onStart(): void | Promise<void>;
}

const LANE_KEYS = [
  { k: "A", c: "#38bdf8" },
  { k: "S", c: "#a78bfa" },
  { k: "K", c: "#f472b6" },
  { k: "L", c: "#fbbf24" },
];

function Logo() {
  return (
    <div className="flex items-center gap-4">
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#ec4899" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#lg)" />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={10 + i * 12.5} y={i % 2 ? 14 : 10} width="9" height={i % 2 ? 30 : 38} rx="3" fill="#fff" opacity={0.95 - i * 0.08} />
        ))}
      </svg>
      <div>
        <h1 className="text-5xl font-black tracking-tight leading-none">
          Piano<span className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">Game</span>
        </h1>
        <p className="mt-1 text-sm text-violet-200/70">네 개의 키로 연주하는 클래식 · MVP v0.1</p>
      </div>
    </div>
  );
}

export default function MenuScreen({ songId, onSong, difficulty, onDifficulty, volume, onVolume, onStart }: Props) {
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;

  const begin = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    try {
      await onStartRef.current();
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  };

  // Space starts the game (spec §4). The key press is also the user gesture that unlocks audio.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault(); // no page scroll, and no "click" on whichever button has focus
      if (!e.repeat) void begin();
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && e.preventDefault();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const song = getSong(songId);
  const timed = song ? timeSong(song, difficulty) : null;

  return (
    <main className="relative h-screen w-screen overflow-y-auto bg-[radial-gradient(ellipse_at_20%_0%,#2a1766_0%,#0c0a1c_45%,#07070f_100%)]">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-8 px-8 py-10">
        <header className="flex items-center justify-between">
          <Logo />
          <p className="hidden text-sm text-violet-200/60 md:block">
            Chrome · Edge 데스크톱 권장 · 소리를 켜 주세요 🔊
          </p>
        </header>

        <section className="grid flex-1 gap-8 lg:grid-cols-[1.35fr_1fr]">
          {/* songs */}
          <div className="flex flex-col gap-4">
            <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-violet-300/70">Select Song · 곡 선택</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {CATALOG.map((c) => {
                const selected = c.id === songId && c.available;
                return (
                  <button
                    key={c.id}
                    disabled={!c.available}
                    onClick={() => c.available && onSong(c.id)}
                    className={[
                      "panel group relative overflow-hidden p-5 text-left transition",
                      c.available ? "hover:-translate-y-1 hover:border-violet-300/50" : "cursor-not-allowed opacity-45",
                      selected ? "!border-violet-300 ring-2 ring-violet-400/60 shadow-[0_0_50px_-10px_rgba(167,139,250,0.9)]" : "",
                    ].join(" ")}
                    aria-pressed={selected}
                  >
                    <div className="mb-8 flex items-end gap-1" aria-hidden>
                      {[14, 26, 18, 34, 22, 40, 16, 28].map((h, i) => (
                        <span
                          key={i}
                          className="w-2 rounded-t"
                          style={{
                            height: h,
                            background: c.available ? ["#38bdf8", "#a78bfa", "#f472b6", "#fbbf24"][i % 4] : "#475569",
                            opacity: c.available ? 0.9 : 0.5,
                          }}
                        />
                      ))}
                    </div>
                    <div className="text-xl font-extrabold">{c.title}</div>
                    <div className="text-sm text-violet-200/70">{c.composer}</div>
                    <span
                      className={[
                        "absolute right-4 top-4 rounded-full px-3 py-1 text-[11px] font-bold tracking-wide",
                        c.available ? "bg-violet-500/30 text-violet-100" : "bg-white/10 text-slate-300",
                      ].join(" ")}
                    >
                      {c.available ? (selected ? "SELECTED" : "PLAYABLE") : "Coming Soon"}
                    </span>
                  </button>
                );
              })}
            </div>
            {song && timed && (
              <p className="panel px-4 py-3 text-xs leading-relaxed text-violet-100/70">
                <b className="text-violet-100">{song.melody.length} notes</b> · 약 {Math.round(timed.endTime)}초 · {song.coverage}
              </p>
            )}
          </div>

          {/* settings */}
          <div className="flex flex-col gap-5">
            <div className="panel p-5">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-violet-300/70">Difficulty · 난이도</h2>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Difficulty">
                {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    role="radio"
                    aria-checked={difficulty === d}
                    onClick={() => onDifficulty(d)}
                    className={[
                      "rounded-xl px-3 py-3 text-center transition",
                      difficulty === d ? "bg-violet-500 text-white shadow-lg shadow-violet-500/40" : "btn-ghost text-violet-100/80",
                    ].join(" ")}
                  >
                    <div className="font-extrabold">{DIFFICULTY[d].label}</div>
                    <div className="text-[11px] opacity-75">
                      {DIFFICULTY[d].labelKo} · ×{DIFFICULTY[d].tempo}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="panel p-5">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-violet-300/70">Controls · 조작법</h2>
              <div className="flex items-center justify-center gap-3">
                {LANE_KEYS.map((l) => (
                  <div key={l.k} className="flex flex-col items-center gap-1">
                    <span className={`keycap !h-14 !min-w-14 ${l.k.length > 1 ? "!px-4 text-base" : "text-2xl"}`} style={{ boxShadow: `0 4px 0 ${l.c}, 0 8px 18px ${l.c}55` }}>
                      {l.k}
                    </span>
                    <span className="text-[10px] text-violet-200/60">Lane {LANE_KEYS.indexOf(l) + 1}</span>
                  </div>
                ))}
              </div>
              <ul className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] text-violet-100/75">
                <li><span className="keycap !h-7 !min-w-0 !text-xs">Space</span><br />시작 / 일시정지</li>
                <li><span className="keycap !h-7 !min-w-0 !text-xs">Esc</span><br />일시정지 메뉴</li>
                <li><span className="keycap !h-7 !min-w-0 !text-xs">R</span><br />재시작(확인)</li>
              </ul>
              <p className="mt-3 text-xs leading-relaxed text-violet-200/65">
                맞는 키 → 원곡의 음 · 틀린 키 → <b className="text-rose-300">다른 음</b> · 놓친 음 → <b className="text-slate-300">소리 없음</b>. 두 손으로 여러 키를 동시에 누를 수 있어요.
              </p>
            </div>

            <div className="panel p-5">
              <label className="flex items-center gap-4 text-sm" htmlFor="vol">
                <span className="w-24 text-xs font-bold uppercase tracking-[0.2em] text-violet-300/70">Volume</span>
                <input
                  id="vol"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(e) => onVolume(Number(e.target.value))}
                  className="h-2 flex-1 cursor-pointer"
                  aria-label="Volume"
                />
                <span className="w-10 text-right tabular-nums text-violet-100/80">{Math.round(volume * 100)}</span>
              </label>
            </div>

            <button
              onClick={begin}
              disabled={starting}
              className="btn-primary mt-auto rounded-2xl px-8 py-5 text-2xl font-black tracking-wide text-white disabled:opacity-60"
            >
              {starting ? "Loading…" : <>▶  Start Game <span className="text-sm font-semibold opacity-70">(Space)</span></>}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
