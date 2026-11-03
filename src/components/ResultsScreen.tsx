"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getAudio } from "@/audio/audioEngine";
import { replayPerformance, type ReplayHandle } from "@/audio/replay";
import { gradeFor } from "@/engine/stats";
import type { Judgement, PerformanceEvent } from "@/engine/types";
import { pitchName } from "@/songs/builder";
import type { RunSummary } from "./GameApp";

const GRADE_COLOR: Record<string, string> = {
  S: "from-amber-200 to-yellow-400",
  A: "from-cyan-200 to-sky-400",
  B: "from-violet-200 to-violet-400",
  C: "from-pink-200 to-pink-400",
  D: "from-slate-300 to-slate-500",
};
const GRADE_TEXT: Record<string, string> = {
  S: "Flawless performance! 완벽한 연주예요",
  A: "Brilliant! 훌륭한 공연이었어요",
  B: "Well played! 멋진 연주였어요",
  C: "Nice try — 다음엔 더 좋아질 거예요",
  D: "Keep practicing — 연습하면 반드시 늘어요",
};

const JUDGE_STYLE: Record<Judgement, { label: string; cls: string }> = {
  perfect: { label: "Perfect", cls: "text-amber-200" },
  great: { label: "Great", cls: "text-cyan-300" },
  miss: { label: "Miss", cls: "text-slate-400" },
  wrong: { label: "Wrong", cls: "text-rose-400" },
};

function useCountUp(target: number, ms = 1100) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function Timeline({ run }: { run: RunSummary }) {
  const { notes, events, stats } = run.result;
  void stats;
  const W = 1000;
  const H = 190;
  const pad = 14;
  const maxT = Math.max(...notes.map((n) => n.time + n.duration)) + 0.5;
  const pitches = [...notes.map((n) => n.pitch), ...events.map((e) => e.playedPitch ?? 60)];
  const lo = Math.min(...pitches) - 1;
  const hi = Math.max(...pitches) + 1;
  const x = (t: number) => pad + (t / maxT) * (W - pad * 2);
  const y = (p: number) => H - pad - ((p - lo) / (hi - lo)) * (H - pad * 2);

  const byNote = new Map<number, PerformanceEvent>();
  for (const e of events) if (e.targetNoteId !== null) byNote.set(e.targetNoteId, e);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl bg-black/30" role="img" aria-label="Performance timeline: target notes versus what you played">
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={pad} x2={W - pad} y1={H * f} y2={H * f} stroke="rgba(255,255,255,0.06)" />
      ))}
      {notes.map((n) => {
        const e = byNote.get(n.id);
        const w = Math.max(5, x(n.duration) - x(0));
        const hx = x(n.time);
        const hy = y(n.pitch);
        if (!e || e.judgement === "miss") {
          return <rect key={n.id} x={hx} y={hy - 4} width={w} height={8} rx={3} fill="none" stroke="#94a3b8" strokeDasharray="3 2" />;
        }
        if (e.judgement === "wrong") {
          const py = y(e.playedPitch ?? n.pitch);
          return (
            <g key={n.id}>
              <rect x={hx} y={hy - 4} width={w} height={8} rx={3} fill="none" stroke="#fb7185" strokeDasharray="3 2" />
              <line x1={hx + w / 2} x2={hx + w / 2} y1={hy} y2={py} stroke="#fb7185" strokeOpacity={0.5} />
              <rect x={hx} y={py - 4} width={w} height={8} rx={3} fill="#fb7185" />
            </g>
          );
        }
        return <rect key={n.id} x={hx} y={hy - 4} width={w} height={8} rx={3} fill={e.judgement === "perfect" ? "#fde68a" : "#67e8f9"} />;
      })}
      {events
        .filter((e) => e.stray && e.playedPitch !== null)
        .map((e) => (
          <text key={e.seq} x={x(Math.max(0, e.time))} y={y(e.playedPitch!) + 5} fontSize={14} fontWeight={800} fill="#fb7185" textAnchor="middle">
            ×
          </text>
        ))}
    </svg>
  );
}

export default function ResultsScreen({ run, onPlayAgain, onMenu }: { run: RunSummary; onPlayAgain(): void | Promise<void>; onMenu(): void }) {
  const { result } = run;
  const s = result.stats;
  const grade = gradeFor(s.accuracy, s.miss, s.wrong);
  const score = useCountUp(s.score);
  const [filter, setFilter] = useState<"all" | "mistakes">("all");
  const [replaying, setReplaying] = useState(false);
  const replayRef = useRef<ReplayHandle | null>(null);

  useEffect(() => () => replayRef.current?.cancel(), []);

  const rows = useMemo(() => {
    const list = filter === "all" ? result.events : result.events.filter((e) => e.judgement === "miss" || e.judgement === "wrong");
    return list;
  }, [filter, result.events]);

  const toggleReplay = async () => {
    if (replaying) {
      replayRef.current?.cancel();
      setReplaying(false);
      return;
    }
    const { synth } = await getAudio();
    setReplaying(true);
    replayRef.current = replayPerformance(synth, result.events, result.accompaniment, () => setReplaying(false));
  };

  return (
    <main className="h-screen w-screen overflow-y-auto bg-[radial-gradient(ellipse_at_50%_-10%,#3b1d8f_0%,#0c0a1c_50%,#07070f_100%)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-8 py-10">
        <header className="animate-fade-up text-center">
          <p className="text-xs font-bold uppercase tracking-[0.4em] text-violet-300/70">Performance Complete · 공연 완료</p>
          <h1 className="mt-2 text-4xl font-black">{result.title}</h1>
          <p className="text-sm text-violet-200/60">
            {result.composer} · {result.difficulty.toUpperCase()}
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <div className="panel animate-pop flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className={`bg-gradient-to-b ${GRADE_COLOR[grade]} bg-clip-text text-[8rem] font-black leading-none text-transparent drop-shadow-[0_0_30px_rgba(253,230,138,0.35)]`} aria-label={`Grade ${grade}`}>
              {grade}
            </div>
            <p className="text-sm text-violet-100/80">{GRADE_TEXT[grade]}</p>
            {run.isNewBest && <span className="rounded-full bg-amber-300/20 px-3 py-1 text-xs font-bold text-amber-200">★ NEW BEST</span>}
            {!run.isNewBest && run.previousBest && (
              <span className="text-xs text-violet-200/50">Best {run.previousBest.score.toLocaleString()}</span>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="panel animate-fade-up grid grid-cols-2 gap-4 p-6">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-violet-300/60">Final Score</div>
                <div className="text-5xl font-black tabular-nums" data-testid="final-score">{score.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-violet-300/60">Accuracy</div>
                <div className="text-5xl font-black tabular-nums text-cyan-300" data-testid="final-accuracy">{s.accuracy.toFixed(1)}%</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {[
                { l: "Perfect", v: s.perfect, c: "text-amber-200" },
                { l: "Great", v: s.great, c: "text-cyan-300" },
                { l: "Miss", v: s.miss, c: "text-slate-300" },
                { l: "Wrong Note", v: s.wrong, c: "text-rose-400" },
                { l: "Max Combo", v: s.maxCombo, c: "text-violet-200" },
              ].map((m) => (
                <div key={m.l} className="panel animate-fade-up p-4 text-center">
                  <div className={`text-3xl font-black tabular-nums ${m.c}`}>{m.v}</div>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-violet-200/60">{m.l}</div>
                </div>
              ))}
            </div>
            <p className="px-1 text-xs text-violet-200/55">
              평균 타이밍 오차 {s.avgTimingErrorMs.toFixed(0)}ms · 판정된 음표 {s.resolved}/{result.totalNotes}
              {s.strayWrong > 0 && ` · 음표 없이 누른 오답 ${s.strayWrong}회`}
            </p>
          </div>
        </section>

        <section className="panel p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-violet-300/70">My Performance · 연주 기록</h2>
            <div className="flex flex-wrap gap-3 text-[11px] text-violet-100/70">
              <span><i className="mr-1 inline-block h-2 w-3 rounded-sm bg-amber-200" />Perfect</span>
              <span><i className="mr-1 inline-block h-2 w-3 rounded-sm bg-cyan-300" />Great</span>
              <span><i className="mr-1 inline-block h-2 w-3 rounded-sm bg-rose-400" />Wrong (실제 소리)</span>
              <span><i className="mr-1 inline-block h-2 w-3 rounded-sm border border-dashed border-rose-400" />Wrong (원래 음)</span>
              <span><i className="mr-1 inline-block h-2 w-3 rounded-sm border border-dashed border-slate-400" />Miss (소리 없음)</span>
            </div>
          </div>
          <Timeline run={run} />
        </section>

        <section className="panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-violet-300/70">Input Log · 입력 기록</h2>
            <div className="flex gap-2 text-xs">
              {(["all", "mistakes"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1 font-bold ${filter === f ? "bg-violet-500" : "btn-ghost"}`}>
                  {f === "all" ? `All (${result.events.length})` : `Mistakes (${result.events.filter((e) => e.judgement === "miss" || e.judgement === "wrong").length})`}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-72 overflow-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-xs tabular-nums" data-testid="event-log">
              <thead className="sticky top-0 bg-[#15122b] text-violet-300/70">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Key</th>
                  <th className="px-3 py-2">Target 목표 음</th>
                  <th className="px-3 py-2">Played 실제 음</th>
                  <th className="px-3 py-2">Result</th>
                  <th className="px-3 py-2">Error</th>
                  <th className="px-3 py-2">Length</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const st = JUDGE_STYLE[e.judgement];
                  return (
                    <tr key={e.seq} className="border-t border-white/5 hover:bg-white/5">
                      <td className="px-3 py-1.5 text-violet-200/40">{e.seq + 1}</td>
                      <td className="px-3 py-1.5">{e.time.toFixed(2)}s</td>
                      <td className="px-3 py-1.5 font-bold">{e.key ?? "—"}</td>
                      <td className="px-3 py-1.5">{e.targetPitch !== null ? pitchName(e.targetPitch) : "—"}</td>
                      <td className={`px-3 py-1.5 font-bold ${e.judgement === "wrong" ? "text-rose-400" : e.playedPitch === null ? "text-slate-500" : ""}`}>
                        {e.playedPitch !== null ? pitchName(e.playedPitch) : "(silence)"}
                      </td>
                      <td className={`px-3 py-1.5 font-bold ${st.cls}`}>
                        {st.label}
                        {e.stray ? " (stray)" : ""}
                        {e.holdBroken ? " · hold released early" : ""}
                      </td>
                      <td className="px-3 py-1.5">{e.timingErrorMs === null ? "—" : `${e.timingErrorMs > 0 ? "+" : ""}${e.timingErrorMs}ms`}</td>
                      <td className="px-3 py-1.5">{e.heldDuration !== null ? `held ${e.heldDuration.toFixed(2)}s` : e.noteDuration !== null ? `${e.noteDuration.toFixed(2)}s` : "—"}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-violet-200/50">
                      {filter === "mistakes" ? "실수가 없습니다 — 완벽해요! 🎹" : "기록이 없습니다."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-center gap-4 pb-4">
          <button onClick={onPlayAgain} className="btn-primary rounded-2xl px-8 py-4 text-lg font-black text-white">
            ↻ Play Again <span className="text-sm opacity-70">다시 연주하기</span>
          </button>
          <button onClick={toggleReplay} className="btn-ghost rounded-2xl px-6 py-4 font-bold">
            {replaying ? "■ Stop" : "▶ Listen to my performance"}
          </button>
          <button onClick={onMenu} className="btn-ghost rounded-2xl px-6 py-4 font-bold">
            ⌂ Song Select <span className="text-sm opacity-60">곡 선택</span>
          </button>
        </footer>
      </div>
    </main>
  );
}
