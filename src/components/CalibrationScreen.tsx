"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAudio } from "@/audio/audioEngine";
import {
  CAL_COUNT_IN,
  CAL_INTERVAL,
  MAX_OFFSET_MS,
  clampOffsetMs,
  clickSchedule,
  computeCalibration,
  type CalibrationResult,
} from "@/engine/calibration";
import { LANE_BY_CODE } from "@/engine/constants";

interface Props {
  volume: number;
  /** Currently saved offset (ms). */
  offsetMs: number;
  onSave(ms: number): void;
  onExit(): void;
}

type Phase = "intro" | "running" | "result" | "failed";

const QUALITY_TEXT = {
  good: { label: "아주 일정해요", color: "text-emerald-300" },
  ok: { label: "괜찮아요", color: "text-amber-300" },
  noisy: { label: "들쭉날쭉해요 — 다시 측정해 보세요", color: "text-rose-300" },
} as const;

const fmt = (ms: number) => `${ms > 0 ? "+" : ms < 0 ? "−" : ""}${Math.abs(ms)}ms`;

/** A short, sharp click (not the piano) so the beat is unmistakable. */
function scheduleClick(ctx: AudioContext, when: number, accent: boolean, gain: number) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = accent ? 1400 : 900;
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(Math.max(0.05, gain * 0.35), when + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
  osc.connect(env).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + 0.08);
}

export default function CalibrationScreen({ volume, offsetMs, onSave, onExit }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [result, setResult] = useState<CalibrationResult | null>(null);
  const [draft, setDraft] = useState(offsetMs); // value that "적용" saves; the ± buttons fine-tune it
  const [beat, setBeat] = useState(-1); // index of the click that just sounded (for the pulse)
  const [tapCount, setTapCount] = useState(0);
  const [starting, setStarting] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const clicksRef = useRef<number[]>([]); // context times of the clicks to tap along with
  const tapsRef = useRef<number[]>([]);
  const rafRef = useRef(0);
  const phaseRef = useRef<Phase>("intro");
  phaseRef.current = phase;
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const startingRef = useRef(false);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const stopLoop = () => cancelAnimationFrame(rafRef.current);

  const begin = useCallback(async () => {
    if (phaseRef.current === "running" || startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    try {
      const { ctx } = await getAudio(volumeRef.current); // inside the user gesture → autoplay policy satisfied
      ctxRef.current = ctx;
      const start = ctx.currentTime + 0.8;
      const sched = clickSchedule(start);
      sched.forEach((c) => scheduleClick(ctx, c.time, c.accent, volumeRef.current));
      clicksRef.current = sched.filter((c) => !c.accent).map((c) => c.time);
      tapsRef.current = [];
      setTapCount(0);
      setBeat(-1);
      setResult(null);
      setPhase("running");
      phaseRef.current = "running";

      const lastClick = sched[sched.length - 1].time;
      const loop = () => {
        const now = ctx.currentTime;
        let b = -1;
        for (let i = 0; i < sched.length; i++) if (now >= sched[i].time) b = i;
        setBeat((prev) => (prev === b ? prev : b));
        if (now > lastClick + 0.6) {
          const r = computeCalibration(tapsRef.current, clicksRef.current);
          setResult(r);
          if (r) setDraft(r.offsetMs);
          setPhase(r ? "result" : "failed");
          return;
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, []);

  const tap = useCallback(() => {
    const ctx = ctxRef.current;
    if (phaseRef.current !== "running" || !ctx) return;
    tapsRef.current.push(ctx.currentTime); // same clock the game judges with
    setTapCount((n) => n + 1);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "Escape") {
        e.preventDefault();
        stopLoop();
        exitRef.current();
        return;
      }
      const isTapKey = e.code === "Space" || e.code === "Enter" || e.code in LANE_BY_CODE;
      if (!isTapKey) return;
      e.preventDefault();
      if (e.repeat) return;
      if (phaseRef.current === "running") tap();
      else if (phaseRef.current === "intro" && (e.code === "Space" || e.code === "Enter")) void begin();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [tap, begin]);

  // Stop the animation loop only when the screen goes away (NOT when a handler is re-created).
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // Test hook (like window.__pianoGame): lets the E2E suite tap on exact audio-clock times.
  useEffect(() => {
    const w = window as unknown as { __pianoCalib?: unknown };
    w.__pianoCalib = {
      phase: () => phaseRef.current,
      now: () => ctxRef.current?.currentTime ?? 0,
      clicks: () => clicksRef.current.slice(),
    };
    return () => {
      delete w.__pianoCalib;
    };
  }, []);

  const tapClickIndex = beat - CAL_COUNT_IN; // <0 while counting in
  const pulseOn = beat >= 0;
  const progress = Math.max(0, Math.min(1, tapClickIndex / Math.max(1, clicksRef.current.length)));

  return (
    <main className="relative flex h-[100dvh] w-screen flex-col items-center overflow-y-auto bg-[radial-gradient(ellipse_at_50%_0%,#2a1766_0%,#0c0a1c_50%,#07070f_100%)] px-4 py-8">
      <div className="flex w-full max-w-xl flex-col gap-5">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tight">🎧 입력 지연 보정</h1>
          <button onClick={onExit} className="btn-ghost rounded-xl px-4 py-2 text-sm" aria-label="Back to menu">
            ← 메뉴 <span className="opacity-60 pointer-coarse:hidden">(Esc)</span>
          </button>
        </header>

        <p className="text-sm leading-relaxed text-violet-100/75">
          키보드·화면·스피커(특히 블루투스)마다 소리가 나고 눌리는 데 걸리는 시간이 달라요. <b>딸깍 소리에 맞춰</b> 박자대로 눌러 주면,
          평균적으로 얼마나 빠르거나 늦게 누르는지 재서 판정 시각을 자동으로 맞춰 줘요. 처음 4번은 듣기만 하고, 이어지는{" "}
          <b>12번</b>에 맞춰 눌러요.
        </p>

        {/* tap pad */}
        <button
          type="button"
          data-testid="tap-pad"
          onPointerDown={(e) => {
            e.preventDefault();
            if (phase === "running") tap();
            else if (phase === "intro") void begin();
          }}
          className="relative mx-auto flex h-56 w-56 touch-none select-none items-center justify-center rounded-full border border-violet-300/30 bg-white/5 text-center transition-transform active:scale-95 sm:h-64 sm:w-64"
          style={{
            boxShadow: pulseOn && phase === "running" ? "0 0 0 10px rgba(167,139,250,0.25), 0 0 60px 10px rgba(167,139,250,0.55)" : "0 0 0 0 transparent",
            transition: "box-shadow 90ms ease-out, transform 80ms",
          }}
          aria-label="Tap along with the click"
        >
          {phase === "intro" && (
            <span className="px-6 text-lg font-bold">
              {starting ? "Loading…" : "▶ 시작"}
              <span className="mt-1 block text-xs font-normal opacity-70 pointer-coarse:hidden">Space / Enter</span>
            </span>
          )}
          {phase === "running" && (
            <span className="px-6">
              <span className="block text-4xl font-black tabular-nums">{tapClickIndex < 0 ? beat + 1 : `${tapClickIndex + 1}/${clicksRef.current.length}`}</span>
              <span className="mt-1 block text-sm opacity-80">{tapClickIndex < 0 ? "듣기만 하세요…" : "딸깍에 맞춰 누르세요!"}</span>
              <span className="mt-2 block text-[11px] opacity-60 pointer-coarse:hidden">A · S · K · L · Space</span>
            </span>
          )}
          {(phase === "result" || phase === "failed") && <span className="text-5xl">{phase === "result" ? "✔" : "…"}</span>}
        </button>

        {phase === "running" && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10" aria-hidden>
            <div className="h-full rounded-full bg-violet-400 transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
        {phase === "running" && <p className="text-center text-xs text-violet-200/60">입력 {tapCount}회 · 총 {clicksRef.current.length}번 딸깍 (간격 {Math.round(CAL_INTERVAL * 1000)}ms)</p>}

        {phase === "failed" && (
          <div className="panel p-5 text-sm leading-relaxed" role="status">
            <b className="text-amber-200">측정에 필요한 입력이 부족했어요.</b>
            <p className="mt-1 text-violet-100/75">소리가 들리는지 확인하고(볼륨, 음소거), 딸깍 소리에 맞춰 12번 눌러 주세요.</p>
            <button onClick={() => void begin()} className="btn-primary mt-4 w-full rounded-xl px-6 py-3 font-bold text-white">
              다시 측정
            </button>
          </div>
        )}

        {phase === "result" && result && (
          <div className="panel flex flex-col gap-4 p-5" data-testid="cal-result">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.25em] text-violet-300/70">측정 결과</div>
              <p className="mt-2 text-sm leading-relaxed text-violet-100/80">
                평균 <b>{fmt(result.medianMs)}</b>
                {result.medianMs > 0 ? " 늦게" : result.medianMs < 0 ? " 빠르게" : ""} 누르셨어요
                {result.medianMs !== 0 && (
                  <>
                    {" "}
                    → 판정 시각을 <b>{Math.abs(result.offsetMs)}ms {result.offsetMs < 0 ? "앞당겨서" : "늦춰서"}</b> 계산해요
                  </>
                )}
                .
              </p>
              <p className={`mt-1 text-xs ${QUALITY_TEXT[result.quality].color}`}>
                {QUALITY_TEXT[result.quality].label} · 편차 ±{result.spreadMs}ms · 사용한 입력 {result.used}회
              </p>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300/70">적용할 값</span>
              <div className="flex items-center gap-2">
                <button className="btn-ghost h-9 w-9 rounded-lg font-bold" onClick={() => setDraft((d) => clampOffsetMs(d - 5))} aria-label="-5ms">
                  −
                </button>
                <span className="w-20 text-center text-xl font-black tabular-nums" data-testid="cal-draft">
                  {fmt(draft)}
                </span>
                <button className="btn-ghost h-9 w-9 rounded-lg font-bold" onClick={() => setDraft((d) => clampOffsetMs(d + 5))} aria-label="+5ms">
                  +
                </button>
              </div>
            </div>
            <p className="-mt-2 text-[11px] text-violet-200/50">±{MAX_OFFSET_MS}ms 범위 · 판정이 계속 &ldquo;너무 빨라요&rdquo;로 느껴지면 +, &ldquo;늦다&rdquo;고 느껴지면 − 쪽으로 조금씩 조절해 보세요.</p>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  onSave(draft);
                  onExit();
                }}
                className="btn-primary col-span-2 rounded-xl px-6 py-3 font-bold text-white"
                data-testid="cal-apply"
              >
                이 값으로 적용 ({fmt(draft)})
              </button>
              <button onClick={() => void begin()} className="btn-ghost rounded-xl px-4 py-3 text-sm">
                다시 측정
              </button>
              <button onClick={() => setDraft(0)} className="btn-ghost rounded-xl px-4 py-3 text-sm">
                0으로 초기화
              </button>
            </div>
          </div>
        )}

        {(phase === "intro" || phase === "failed") && (
          <p className="text-center text-xs text-violet-200/60">
            현재 저장된 보정값: <b className="text-violet-100">{fmt(offsetMs)}</b>
            {offsetMs === 0 && " (보정 없음)"}
            {phase === "intro" && offsetMs !== 0 && (
              <button
                className="ml-2 underline decoration-dotted"
                onClick={() => {
                  onSave(0);
                }}
              >
                초기화
              </button>
            )}
          </p>
        )}

        <ul className="list-disc pl-5 text-[11px] leading-relaxed text-violet-200/50">
          <li>이어폰/스피커는 평소 게임할 때 쓰는 것으로 측정하세요. 장치를 바꾸면 다시 측정하는 게 좋아요.</li>
          <li>화면이 아니라 <b>소리</b>에 맞춰 누르세요. 게임에서도 소리가 기준이에요.</li>
          <li>보정값은 이 브라우저에 저장돼요.</li>
        </ul>
      </div>
    </main>
  );
}
