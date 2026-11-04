"use client";

import { useCallback, useEffect, useState } from "react";
import { getAudio } from "@/audio/audioEngine";
import type { GameResult } from "@/engine/gameController";
import type { Difficulty } from "@/engine/types";
import { loadPrefs, saveBest, savePrefs, type BestRecord } from "@/lib/storage";
import { getSong, setPrivateSongs, type SongCatalogEntry } from "@/songs";
import { loadPrivateSongs, type PrivateResult } from "@/songs/privateSongs";
import { registerSongTheme } from "@/engine/backgrounds";
import CalibrationScreen from "./CalibrationScreen";
import GameScreen from "./GameScreen";
import MenuScreen from "./MenuScreen";
import ResultsScreen from "./ResultsScreen";

type Screen = "menu" | "game" | "results" | "calibrate";

export interface RunSummary {
  result: GameResult;
  previousBest: BestRecord | null;
  isNewBest: boolean;
}

export default function GameApp() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [songId, setSongId] = useState("fur-elise");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [volume, setVolume] = useState(0.8);
  const [inputOffsetMs, setInputOffsetMs] = useState(0); // latency correction from the calibration screen
  const [run, setRun] = useState<RunSummary | null>(null);
  // bumps on every (re)start so GameScreen remounts with a fresh controller
  const [runKey, setRunKey] = useState(0);
  // local-only songs from songs-private/ (development only; empty in every production build)
  const [privateEntries, setPrivateEntries] = useState<SongCatalogEntry[]>([]);
  const [privateNotices, setPrivateNotices] = useState<string[]>([]);

  // Preferences live in localStorage → read after mount (keeps SSR/hydration identical).
  useEffect(() => {
    const p = loadPrefs();
    setVolume(p.volume);
    setDifficulty(p.difficulty);
    setInputOffsetMs(p.inputOffsetMs);
    if (getSong(p.songId)) setSongId(p.songId);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadPrivateSongs().then((results: PrivateResult[]) => {
      if (cancelled || results.length === 0) return;
      const entries: SongCatalogEntry[] = [];
      const notices: string[] = [];
      const songs = [];
      for (const r of results) {
        if (r.kind === "song") {
          songs.push(r.song);
          if (r.theme) registerSongTheme(r.song.id, r.theme);
          entries.push({ id: r.song.id, title: r.song.title, composer: r.song.composer, available: true, level: r.level, private: true });
        } else if (r.kind === "pending") {
          entries.push({ id: r.id, title: r.title, composer: r.composer, available: false, private: true });
          notices.push(`${r.file}: 아직 음표(melody)가 비어 있어요. 직접 채보한 음을 넣으면 카드가 활성화돼요.`);
        } else {
          notices.push(`${r.file}: ${r.message}`);
        }
      }
      setPrivateSongs(songs);
      setPrivateEntries(entries);
      setPrivateNotices(notices);
      const saved = loadPrefs().songId;
      if (songs.some((s) => s.id === saved)) setSongId(saved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const changeVolume = useCallback((v: number) => {
    setVolume(v);
    savePrefs({ volume: v });
  }, []);

  const startGame = useCallback(async () => {
    // Create/resume the AudioContext inside the click so the browser's autoplay policy is satisfied.
    await getAudio(volume);
    savePrefs({ difficulty, songId });
    setRunKey((k) => k + 1);
    setScreen("game");
  }, [volume, difficulty, songId]);

  const song = getSong(songId)!;

  if (screen === "game") {
    return (
      <GameScreen
        key={runKey}
        song={song}
        difficulty={difficulty}
        volume={volume}
        inputOffsetMs={inputOffsetMs}
        onVolumeChange={changeVolume}
        onExit={() => setScreen("menu")}
        onComplete={(result) => {
          const { previous, isNewBest } = saveBest(result.songId, result.difficulty, {
            score: result.stats.score,
            accuracy: result.stats.accuracy,
            maxCombo: result.stats.maxCombo,
            at: Date.now(),
          });
          setRun({ result, previousBest: previous, isNewBest });
          setScreen("results");
        }}
      />
    );
  }

  if (screen === "calibrate") {
    return (
      <CalibrationScreen
        volume={volume}
        offsetMs={inputOffsetMs}
        onSave={(ms) => {
          setInputOffsetMs(ms);
          savePrefs({ inputOffsetMs: ms });
        }}
        onExit={() => setScreen("menu")}
      />
    );
  }

  if (screen === "results" && run) {
    return (
      <ResultsScreen
        run={run}
        onPlayAgain={startGame}
        onMenu={() => setScreen("menu")}
      />
    );
  }

  return (
    <MenuScreen
      privateEntries={privateEntries}
      privateNotices={privateNotices}
      songId={songId}
      onSong={(id) => {
        setSongId(id);
        savePrefs({ songId: id });
      }}
      difficulty={difficulty}
      onDifficulty={(d) => {
        setDifficulty(d);
        savePrefs({ difficulty: d });
      }}
      volume={volume}
      onVolume={changeVolume}
      onStart={startGame}
      inputOffsetMs={inputOffsetMs}
      onCalibrate={() => setScreen("calibrate")}
    />
  );
}
