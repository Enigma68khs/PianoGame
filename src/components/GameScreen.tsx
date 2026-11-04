"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameController, type GameResult, type HudSnapshot } from "@/engine/gameController";
import { emptyStats } from "@/engine/stats";
import type { Difficulty, SongData } from "@/engine/types";

interface Props {
  song: SongData;
  difficulty: Difficulty;
  volume: number;
  /** Input-latency correction (ms) from the calibration screen. */
  inputOffsetMs?: number;
  onVolumeChange(v: number): void;
  onExit(): void;
  onComplete(r: GameResult): void;
}

const INITIAL: HudSnapshot = {
  state: "READY",
  title: "",
  stats: emptyStats(),
  progress: 0,
  countdown: null,
  resuming: false,
  confirmRestart: false,
};

function Stat({ label, value, accent, bump }: { label: string; value: string; accent?: string; bump?: number }) {
  return (
    <div className="flex min-w-16 flex-col items-center sm:min-w-24">
      <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-violet-300/60 sm:text-[10px] sm:tracking-[0.25em]">{label}</span>
      <span
        key={bump}
        className={`hud-value font-black tabular-nums leading-tight ${bump !== undefined ? "animate-bump" : ""}`}
        style={{ color: accent }}
      >
        {value}
      </span>
    </div>
  );
}

export default function GameScreen({ song, difficulty, volume, inputOffsetMs = 0, onVolumeChange, onExit, onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<GameController | null>(null);
  const [hud, setHud] = useState<HudSnapshot>({ ...INITIAL, title: song.title });
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false); // iPhone Safari has no page fullscreen
  useEffect(() => setCanFullscreen(typeof document.documentElement.requestFullscreen === "function"), []);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    let cancelled = false;
    let ctrl: GameController | null = null;
    (async () => {
      if (!canvasRef.current) return;
      ctrl = await GameController.create({
        song,
        difficulty,
        volume,
        inputOffset: inputOffsetMs / 1000,
        canvas: canvasRef.current,
        onChange: setHud,
        onComplete: (r) => onCompleteRef.current(r),
      });
      if (cancelled) {
        ctrl.destroy();
        return;
      }
      controllerRef.current = ctrl;
      ctrl.start();
    })();
    return () => {
      cancelled = true;
      ctrl?.destroy();
      controllerRef.current = null;
    };
    // controller is created once per mounted run (GameApp remounts with a new key for each run)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else rootRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  const c = () => controllerRef.current;
  /** Buttons must not keep focus, or Space would "click" them again. */
  const act = (fn: () => void) => (e: React.MouseEvent) => {
    (e.currentTarget as HTMLElement).blur();
    fn();
  };

  const { stats } = hud;
  const paused = hud.state === "PAUSED";
  const comboKey = stats.combo;

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 flex flex-col bg-[#07070f]"
      style={{ paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}
    >
      {/* top HUD */}
      <header className="hud-top relative z-10 flex shrink-0 items-center justify-center gap-4 border-b border-white/10 bg-black/30 px-3 backdrop-blur sm:justify-between sm:px-6">
        <div className="hidden min-w-0 flex-1 sm:block">
          <div className="truncate text-lg font-extrabold">{song.title}</div>
          <div className="truncate text-xs text-violet-200/60">
            {song.composer} · {difficulty.toUpperCase()}
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-6">
          <Stat label="Score" value={stats.score.toLocaleString()} />
          <Stat label="Combo" value={String(stats.combo)} accent={stats.combo >= 10 ? "#fde68a" : undefined} bump={comboKey} />
          <Stat label="Accuracy" value={`${stats.accuracy.toFixed(1)}%`} accent={stats.accuracy >= 90 ? "#67e8f9" : undefined} />
        </div>
        <div className="hidden flex-1 text-right text-xs text-violet-200/60 sm:block">
          <span className="tabular-nums">{Math.round(hud.progress * 100)}%</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10" role="progressbar" aria-valuenow={Math.round(hud.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Song progress">
          <div className="h-full bg-gradient-to-r from-violet-400 to-pink-400" style={{ width: `${hud.progress * 100}%` }} />
        </div>
      </header>

      {/* playfield */}
      <div className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label="Piano tile playfield" />

        {hud.state === "READY" && hud.countdown !== null && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="text-center">
              <div key={hud.countdown} className="animate-countdown text-[9rem] font-black leading-none text-white drop-shadow-[0_0_40px_rgba(167,139,250,0.9)]">
                {hud.countdown}
              </div>
              <div className="mt-2 text-sm tracking-[0.3em] text-violet-200/80">{hud.resuming ? "RESUMING" : "GET READY"}</div>
            </div>
          </div>
        )}

        {paused && !hud.confirmRestart && (
          <div className="absolute inset-0 grid place-items-center bg-black/60 backdrop-blur-sm">
            <div className="panel animate-pop w-[min(92vw,26rem)] p-8 text-center">
              <h2 className="text-3xl font-black tracking-wide">PAUSED</h2>
              <p className="mt-1 text-sm text-violet-200/60">일시정지 · 진행 시간과 음악이 멈췄습니다</p>
              <div className="mt-6 flex flex-col gap-3">
                <button className="btn-primary rounded-xl py-3 text-lg font-extrabold" onClick={act(() => c()?.resume())}>
                  Resume <span className="text-xs opacity-70 pointer-coarse:hidden">(Space)</span>
                </button>
                <button className="btn-ghost rounded-xl py-3 font-bold" onClick={act(() => c()?.requestRestart())}>
                  Restart <span className="text-xs opacity-60 pointer-coarse:hidden">(R)</span>
                </button>
                <button className="btn-ghost rounded-xl py-3 font-bold" onClick={act(onExit)}>
                  Song Select
                </button>
              </div>
            </div>
          </div>
        )}

        {hud.confirmRestart && (
          <div className="absolute inset-0 grid place-items-center bg-black/70 backdrop-blur-sm">
            <div className="panel animate-pop w-[min(92vw,26rem)] p-8 text-center" role="alertdialog" aria-label="Restart confirmation">
              <h2 className="text-2xl font-black">처음부터 다시 시작할까요?</h2>
              <p className="mt-2 text-sm text-violet-200/65">점수, 콤보, 연주 기록이 모두 초기화됩니다.</p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button className="btn-ghost rounded-xl py-3 font-bold" onClick={act(() => c()?.cancelRestart())}>
                  Cancel <span className="text-xs opacity-60 pointer-coarse:hidden">(Esc)</span>
                </button>
                <button className="btn-primary rounded-xl py-3 font-extrabold" onClick={act(() => c()?.restart())}>
                  Restart <span className="text-xs opacity-70 pointer-coarse:hidden">(Enter)</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* bottom controls */}
      <footer
        className="hud-bottom relative z-10 flex shrink-0 items-center justify-between gap-2 border-t border-white/10 bg-black/30 px-3 backdrop-blur sm:gap-4 sm:px-6"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            className="btn-ghost rounded-lg px-3 py-1.5 text-sm font-bold sm:px-4"
            onClick={act(() => (paused ? c()?.resume() : c()?.pause()))}
            disabled={hud.state === "COMPLETED"}
          >
            {paused ? "▶" : "⏸"}<span className="max-sm:hidden"> {paused ? "Resume" : "Pause"}</span>
          </button>
          <button className="btn-ghost rounded-lg px-3 py-1.5 text-sm font-bold sm:px-4" onClick={act(() => c()?.requestRestart())}>
            ↻<span className="max-sm:hidden"> Restart</span>
          </button>
          {canFullscreen && (
            <button className="btn-ghost rounded-lg px-3 py-1.5 text-sm font-bold sm:px-4" onClick={act(toggleFullscreen)}>
            {fullscreen ? "⤡" : "⤢"}<span className="max-sm:hidden">{fullscreen ? " Exit Full" : " Fullscreen"}</span>
          </button>
          )}
        </div>
        <div className="hidden text-xs text-violet-200/50 md:block pointer-coarse:hidden">A · S · K · L &nbsp;|&nbsp; Space 일시정지 &nbsp;|&nbsp; Esc 메뉴 &nbsp;|&nbsp; R 재시작</div>
        <label className="flex min-w-0 items-center gap-2 text-xs text-violet-200/70 sm:gap-3">
          🔊
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            aria-label="Volume"
            className="w-20 cursor-pointer sm:w-32"
            onChange={(e) => {
              onVolumeChange(Number(e.target.value));
              c()?.setVolume(Number(e.target.value));
            }}
            onPointerUp={(e) => (e.currentTarget as HTMLInputElement).blur()}
          />
        </label>
      </footer>
    </div>
  );
}
