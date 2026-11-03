"use client";

import { useCallback, useEffect, useState } from "react";
import { getAudio } from "@/audio/audioEngine";
import type { GameResult } from "@/engine/gameController";
import type { Difficulty } from "@/engine/types";
import { loadPrefs, saveBest, savePrefs, type BestRecord } from "@/lib/storage";
import { getSong } from "@/songs";
import GameScreen from "./GameScreen";
import MenuScreen from "./MenuScreen";
import ResultsScreen from "./ResultsScreen";

type Screen = "menu" | "game" | "results";

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
  const [run, setRun] = useState<RunSummary | null>(null);
  // bumps on every (re)start so GameScreen remounts with a fresh controller
  const [runKey, setRunKey] = useState(0);

  // Preferences live in localStorage → read after mount (keeps SSR/hydration identical).
  useEffect(() => {
    const p = loadPrefs();
    setVolume(p.volume);
    setDifficulty(p.difficulty);
    if (getSong(p.songId)) setSongId(p.songId);
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
    />
  );
}
