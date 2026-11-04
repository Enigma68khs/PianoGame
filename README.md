# PianoGame — MVP v0.1

A browser piano rhythm game (keyboard on desktop, touch on phones). Four tile lanes (**A S K L**) fall in time with the music, and **every key you press plays a real piano note**:

| You do | You hear |
|---|---|
| Press the right key on time | the exact note of the original melody |
| Press a wrong key | a **different** piano pitch (the right note is *not* played, not auto-corrected, not repeated later) |
| Miss a note | silence — that melody note is simply missing |

The game never stops for mistakes; when the song ends you get a result screen with accuracy and a full note-by-note log.

> **Music data caveat (please read):** every public-domain chart (Für Elise, Canon in D, Moonlight Sonata, Ode to Joy, Twinkle Twinkle Little Star, Jingle Bells) is a *hand transcription* made for this project, and **Midnight Groove is an original composition** written for it. It has **not** been proof-read against an Urtext/Henle/IMSLP edition. See [Music data provenance](#music-data-provenance).

## Run it

Requires Node.js 20+ (developed on Node 24) and Chrome or Edge on desktop.

```bash
npm install
npm run dev          # → http://localhost:3000
# or a production build:
npm run build && npm start     # → http://localhost:3000
```

Checks:

```bash
npm run typecheck    # tsc --noEmit
npm test             # 155 unit tests (vitest)
# browser end-to-end (real Chrome, real AudioContext). Needs Google Chrome installed (set CHROME_PATH otherwise):
npm run build && npx next start -p 3100 &
BASE_URL=http://localhost:3100 npm run test:e2e          # desktop keyboard flow
BASE_URL=http://localhost:3100 npm run test:e2e:mobile   # emulated iPhone, real multi-touch (use a production build: the dev overlay covers a button)
```

Click **Start Game** (this click is what unlocks browser audio).

> If `npm test` fails with *"Cannot find native binding"* (a known npm optional-dependency bug), run `rm -rf node_modules package-lock.json && npm install`.

## Continuous integration

`.github/workflows/ci.yml` runs on every push (any branch): `npm ci` → typecheck → 81 unit tests → production build → desktop keyboard E2E → emulated-phone touch E2E (Playwright's Chromium, installed in the job). **Only a push to `main` that passes all of it is built as a static site and deployed to GitHub Pages**; a failing run keeps the previous deployment and uploads the E2E screenshots and server log as an artifact (`e2e-debug`). Locally: `npm run verify` (typecheck + unit tests + build) and the two E2E commands above. Set `CHROME_PATH=` (empty) to force Playwright's bundled Chromium instead of your installed Chrome (`npx playwright-core install chromium` once).

## Controls

| Key | Action |
|---|---|
| `A` `S` `K` `L` | lanes 1–4 (works with a Korean IME switched on — input uses `KeyboardEvent.code`) |
| `Space` | pause / resume (resume has a 2 s count-in) |
| `Esc` | pause menu / resume |
| `R` | restart — asks for confirmation (`Enter` = yes, `Esc` = no) |

Several keys can be held at once (chords). Holding a key does not auto-repeat. The window losing focus pauses the game.

### Phones / tablets (touch)

Touch the lane columns (or the A S K L pads) with your fingers: every finger is its own input, so chords work with several fingers, and a Hold tile is played by keeping the finger down. Landscape is recommended; portrait works too. The menu's Start button stays fixed at the bottom, the HUD compacts on small screens, and iOS Safari is switched to the "playback" audio session so the piano is audible even with the silent switch on (iOS 16.4+). The fullscreen button is hidden where the browser has no page-fullscreen (iPhone Safari). The same touch/mouse input also works with a mouse on desktop.

## Features implemented

- **Screens:** menu / song select (logo, song cards, Easy-Normal-Hard, key guide, volume, Start), gameplay (4-lane canvas field, A S K L pads, Score / Combo / Accuracy / progress, Pause · Restart · Volume · Fullscreen), results (grade, score, accuracy, Perfect / Great / Miss / Wrong Note, max combo, pitch timeline, full input log, replay, Play Again, back to song select).
- **State machine:** `MENU → READY (3-2-1) → PLAYING ⇄ PAUSED → COMPLETED`.
- **Single time base:** everything (tile position, judging, accompaniment scheduling) derives from `AudioContext.currentTime` through `SongClock`. Pause freezes it, resume continues from the same song position, restart resets it, so audio and visuals cannot drift apart.
- **Tile types:** Normal, Hold (key must stay down; releasing early cuts the sound and is logged), Chord (several keys at once, each member judged independently).
- **Judging:** Perfect ±60 ms, Great ±130 ms, otherwise Miss — all in `src/engine/constants.ts`. Score 100 / 70 / 0 / 0; combo breaks on Miss or Wrong Note.
- **Real-time piano engine:** a self-contained Web Audio synthesizer (no samples → no licensing issue). Sound is produced *by the input*, not by a pre-rendered melody file.
- **Wrong-note logic:** every note carries an explicit table `laneSounds[lane]`. Pressing lane *L* for a note targeted at lane *T* sounds `pitch + (L − T)` semitones (target E5 on K, press L → F5). A wrong press consumes only the note that is currently due; it never consumes a chord member the player can still hit. Keys pressed when nothing is due are recorded as *stray* wrong notes (they break the combo but are not part of the accuracy denominator).
- **Accompaniment** is a separate auto-played track that never contains the player's melody pitches (checked by a test).
- **Performance log** per input: song time, key, target pitch, played pitch, judgement, timing error (ms), note length / held time. Stats are a pure function of this log.
- **Replay of your performance** from the log (wrong notes stay wrong, missed notes stay missing).
- **Input-latency calibration** (menu → "보정하기"): a click track plays on the audio clock (4 count-in clicks, then 12 you tap along with using A S K L / Space / a touch on the pad). The median difference between your taps and the clicks is stored as `inputOffsetMs` (−250…+250 ms; negative = you tap late) and added to every input time while judging, so a note you hit exactly "in your feel of the beat" is judged on the beat. Outlier taps are trimmed, the screen reports how steady you were, and you can fine-tune ±5 ms or reset. Logic: `src/engine/calibration.ts` (pure, unit-tested); UI: `src/components/CalibrationScreen.tsx`.
- Preferences (volume, difficulty, song, input offset) and best score per song/difficulty in `localStorage`.

## Project structure

```
src/
  app/                  Next.js App Router shell (layout, page, global styles, icon)
  components/           React screens: GameApp (screen flow), MenuScreen, GameScreen, ResultsScreen
  engine/
    constants.ts        judgement windows, scoring, lane/key map, fall time, difficulty tempo  ← tuning lives here
    types.ts            shared types (notes, events, stats)
    clock.ts            SongClock — the single time base (injectable `now`)
    session.ts          PlaySession — PURE judging core: press/release/tick → events + sound commands
    stats.ts            stats/accuracy/grade computed from the event log
    input.ts            GameInput — keyboard → lane/command events (repeat suppression, chords, preventDefault)
    renderer.ts         canvas drawing only (tiles, pads, effects)
    gameController.ts   glue: state machine, rAF loop, input ↔ session ↔ audio ↔ renderer
  audio/
    pianoSynth.ts       Web Audio piano synthesizer
    scheduler.ts        accompaniment scheduler (look-ahead on the audio clock)
    replay.ts           performance replay
    audioEngine.ts      lazy AudioContext singleton
  songs/
    builder.ts          chart DSL → SongData, beats → seconds per difficulty, wrong-note tables
    furElise.ts         chart: Für Elise (data only)
    canonInD.ts         chart: Canon in D (data only)
    moonlightSonata.ts  chart: Moonlight Sonata, opening bars (data only)
    odeToJoy.ts · twinkleTwinkle.ts · jingleBells.ts   charts: the three easy songs (data only)
    midnightGroove.ts   an original composition (data only)
    privateSongs.ts     loader for local-only songs from songs-private/ (development only)
    index.ts            catalog (seven songs playable with a ★ difficulty guide; Clair de Lune is "Coming Soon")
  lib/storage.ts        localStorage wrapper
tests/                  vitest unit tests
e2e/run.mjs             Chrome end-to-end script (playwright-core)
```

Adding a song = adding one data file next to `furElise.ts` (melody tokens `pitch:length:lane`, accompaniment tokens) and registering it in `songs/index.ts`; no engine change is needed.

## Music data provenance

- **Composition:** Ludwig van Beethoven, *Für Elise* (Bagatelle in A minor, WoO 59) — public domain.
- **Chart (Für Elise):** hand-transcribed by the author of this code from the public-domain right-hand melody. **No third-party MIDI file, engraving or sample was downloaded or used.**
- **Not verified:** I could not check the transcription against a printed or Urtext score in this environment. The opening motif (E D♯ E D♯ E B D C A, the A–C–E–A–B / E–G♯–B–C arpeggio figures and their second ending) is the well-known one and is covered by a test, but bar-by-bar correctness has **not** been confirmed. Please proof-read `src/songs/furElise.ts` against a Henle/Peters/IMSLP score before calling it "the" arrangement.
- **What it is:** an *excerpt arrangement* (~45 s at Normal): opening theme (bars 1–8), the second episode (E–G–F–E / D–F–E–D / C–E–D–C), a return of the theme, and a closing A-minor dyad. It is **not** the complete piece. The two short "link" bars (12, 20) that join the sections, and the bass under the second episode, are simplified/added for gameplay. The tempo is slowed (♩ = 50) so four keys can play it; Easy ×0.75, Hard ×1.25.
- **Lanes** are hand-assigned along the melodic contour (higher pitch → higher lane); they are part of the data, not computed at runtime.
- **Sound:** synthesized in the browser; no external audio files.

### Canon in D

- **Composition:** Johann Pachelbel (1653–1706) — public domain. Chart: `src/songs/canonInD.ts`, hand-transcribed; no third-party MIDI/score/sample used.
- **What it is:** an *excerpt arrangement* (~31 s at Normal, ♩ = 70): the eight-note ground bass **D A B F♯ G D G A** (one note per half-bar) under the top line's **variation 1** (stepwise half notes F♯ E D C♯ B A B C♯) and **variation 2** (quarter notes D F♯ A G · F♯ D F♯ E · D B D A · G B A G), closing on a held 3-key D-major chord. The canonic entries of the other voices and the later eighth-note variations are **not** included, so it is **not the complete piece**.
- **Verification level:** the ground-bass pattern and the opening descending theme were cross-checked against one beginner tutorial (it lists the same shapes transposed to C major). The rest is from memory and has **not** been proof-read against a score. Treat it as unverified until you do.
- **Fixed pitch→lane table** (a pitch always sits on the same key): G4 A4 → A · B4 C♯5 D5 → S · E5 F♯5 → K · G5 A5 → L. Only the closing chord is a Hold (`holdMinBeats: 4` in the chart; Für Elise uses the default 0.75).
- **Accompaniment:** the ground bass plus a quiet broken chord, all below G4 (a test checks it never duplicates a melody pitch).
- Each song has its own animated background (Für Elise: moonlit hall; Canon in D: sunrise hall) — `src/engine/backgrounds.ts`.

### Moonlight Sonata (1st movement)

- **Composition:** Ludwig van Beethoven, Piano Sonata No. 14 "Moonlight", Op. 27 No. 2 — public domain. Chart: `src/songs/moonlightSonata.ts`; no third-party MIDI/score/sample used.
- **What it is:** an *excerpt arrangement* (~40 s at Normal, ♩ = 54): the right-hand **triplet arpeggios of the famous opening four bars** (bar 1–2 C♯ minor `G♯3 C♯4 E4`, bar 3 A major then D major `A3 C♯4 E4 / A3 D4 F♯4`, bar 4 G♯7–C♯m–C♯sus2–G♯7), played twice over the left-hand octave bass (C♯ – B – A / F♯ – G♯ G♯), closing on a held C♯-minor chord. **The singing melody that enters in bar 5 is not included, so this is not the complete movement.**
- **Verification level:** the pitches of bars 1–4 (figure and bass) were checked against a published harmonic study of the movement (B. Hamann, UC Davis, which gives the notes in its own letter notation); I could not check them against the score itself. Everything after bar 4 is just the repeat described above.
- **Fixed pitch→lane table:** F♯3 G♯3 A3 → A · C4 C♯4 → S · D4 D♯4 → K · E4 F♯4 G♯4 → L. Played softly (velocity 0.62). Background: moonlit lake.

### Ode to Joy, Twinkle Twinkle Little Star, Jingle Bells (easy songs)

All three are public-domain melodies, hand-transcribed (no third-party MIDI/score/sample), each with a closing C-major chord added for the game, and each has its own background (sunrise hall / starry night / snowy night). The note sequences were cross-checked against letter-note pages on the web: Ode to Joy's opening 15 notes, Twinkle's first three phrases (the rest repeats them) and Jingle Bells' chorus. **The Ode to Joy bridge (bars 9–12: `D D E C · D E F E C · D E F E D · C D G`) is from memory and was not confirmed against a score.**
- **Ode to Joy** — the complete 16-bar main theme (♩ = 100, ~40 s): C4 G3 → A, D4 → S, E4 → K, F4 G4 → L; dotted quarters and half notes are Holds.
- **Twinkle Twinkle Little Star** — the melody once through, six phrases (♩ = 92, ~33 s): C4 → A, D4 → S, E4 F4 → K, G4 A4 → L; half notes are Holds.
- **Jingle Bells** — the chorus twice (♩ = 112, ~36 s): C4 → A, D4 → S, E4 → K, F4 G4 → L; half and whole notes are Holds. The verses are not included.
None of them is the complete piece in the full sense (just the tune/theme/chorus); the song cards show a rough difficulty guide (★).

### Midnight Groove — an original piece

Written for this project; **not a transcription and not based on any existing song or recording**. It keeps a dark A-minor night-drive mood, but the tune is deliberately simple and singable. ♩ = 84, ~46 s at Normal, `src/songs/midnightGroove.ts` (★ easy):
- **Notes:** only four pitches — A4 C5 D5 E5 — one per key (A S K L), steady quarter notes; the only Hold is the closing chord.
- **Form:** hook "A A C D / E D C" and its answer (bars 1–4) → a contrasting phrase starting high, "E E D C / D C A", repeated (5–8) → the hook again, note for note (9–12) → a rising run, a falling run, a long E and a held A + E (13–16).
- **Groove:** the bass keeps the 3-3-2 pattern (hits on beat 1, the "and" of 2 and beat 4) while the melody stays plain on top. Background: "neon night" — striped sun, skyline, a perspective grid and beat-driven equalizer bars. Card badge: ORIGINAL.

### Clair de Lune — not implemented

Debussy's *Clair de lune* (public-domain composition) is still a "Coming Soon" card. I could not obtain note-level data I can trust: the web sources I could reach (tutorials, analyses) describe key, chords and form but do not list the notes, and I am not willing to guess a famous melody from memory — the spec forbids presenting an imprecise imitation as the real piece. To add it, provide the notes from a source you are allowed to use (a score you own, a public-domain MIDI you have verified, or the letter notes of the right hand), and it only needs one new file next to the other charts.

## Private (local-only) songs

For a song you transcribed yourself but must **not** publish — e.g. a modern copyrighted track — put a chart file in `songs-private/` (see [songs-private/README.md](songs-private/README.md) and the template `_example.json.template`). It appears on the menu with a **PRIVATE** badge, **only when you run `npm run dev` on your own computer**:

- `songs-private/*.json` and `public/private-songs/` are git-ignored, so they can't be committed.
- The loader runs in development only; `npm run build` (prebuild hook) deletes the synced copy, so the production build, CI and the GitHub Pages export neither contain nor try to load private charts (checked: no match in `.next` or `out`).
- A chart with an empty `melody` is shown as a disabled slot (this is how the `NO BATIDÃO` slot ships on the author's machine — **its notes are not included anywhere in this repository**; the song is under copyright and needs the rights holders' permission before it could be published).
- Notes can be written with `E4:2` (lane picked automatically: the song's distinct pitches are spread evenly over the four keys) or `E4:2:3` (forced lane); chords `C4+E4+G4:4`; rests `R:2`. Mistakes in a chart are listed in a yellow box on the menu instead of crashing.

## Test results

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run build` | pass |
| `npm test` (155 unit tests: judging windows, wrong-note mapping, no auto-correction, misses are silent, chords, holds, full-song simulations for every song — perfect / all-wrong / silent —, clock pause/resume, key-repeat, simultaneous keys, stats, chart integrity, Canon-specific checks, latency-calibration maths and offset persistence) | 155 / 155 pass |
| `npm run test:e2e` (real Chrome, 52 checks, incl. calibration: a deliberately ~75 ms-late player is measured and the same late press changes from Great to Perfect) | 52 / 52 pass |
| `npm run test:e2e:mobile` (emulated iPhone 13, portrait + landscape, real CDP touch incl. two fingers at once: layout, touch hit with correct pitch, multi-touch, pause/resume by tap, results screen, calibration by touch, last menu panel not hidden behind the Start bar) | all pass |

What the E2E run verifies in a real browser: menu renders; `AudioContext` is running after Start; countdown; Space/Esc pause freezes song time (±1 ms) and resume continues from the same position; `R` asks for confirmation, Esc cancels, Enter restarts with a cleared log; key auto-repeat produces one input; **measured on the synth output with an `AnalyserNode`: the correct key makes E5 (659 Hz) the loudest pitch, the wrong key makes D♯5 sound while E5 stays absent afterwards, and an unplayed note is silent**; a scripted autopilot plays the whole song with deliberate wrong keys and skipped notes (game keeps running, counts match the plan, mean input error 6 ms), the results screen and log appear, replay starts, Play Again works, reload returns to a working menu; no console errors.

### Not verifiable by me (needs a human)

- **How it sounds.** Pitch and silence were measured, but I could not listen to the timbre. The synthesizer is a plausible piano approximation, not a sampled piano.
- **Perceived audio/visual sync and latency on your hardware.** The logic uses one clock, but speaker/Bluetooth output latency and screen latency vary. The calibration screen measures the *combined* delay of your setup from your own taps; it was verified with scripted taps (known 75 ms lag recovered, ±15 ms) and real CDP touches, but not with a real Bluetooth headset, and it cannot separate audio latency from your own habit — it only makes the judging consistent with how you actually tap.
- **Real phones.** Touch was verified on an emulated iPhone in Chrome, not on real iOS Safari / Android devices (touch latency, the iOS silent-switch behaviour, multi-touch limits, notches and browser toolbars).
- **Real keyboard feel** (ghosting on cheap keyboards when holding 3+ keys, IME behaviour with a physical Korean layout). Tests use synthetic `KeyboardEvent`s with the same `code`s.
- Edge, Firefox, Safari (only Chrome was run). Fullscreen button (relies on a user gesture; not exercised headlessly).
- Whether the chart matches the printed score (see above).

## Not implemented / known limitations

- Chart not proof-read against an Urtext; only an excerpt of the piece; tempo slowed.
- Seven playable songs: five excerpts/themes of public-domain pieces, one complete original; Clair de Lune is still "Coming Soon" (see above).
- Piano is synthesized, not sampled; no sustain pedal, no velocity layers.
- A Hold that is still held when you pause is treated as released at the pause position.
- Keys pressed when nothing is due (including during the lead-in before the first tile) count as stray Wrong Notes by design.
- Latency calibration is a single global offset (no separate audio / visual split); touch controls are tested only on an emulated phone (see below); no accounts, ranking or backend (out of scope).

## Ideas for next versions

1. Proof-read the chart against Urtext; add the full piece and more songs via a MIDI → chart importer that keeps the explicit `laneSounds` tables.
2. Sampled piano (e.g., a properly licensed multi-sample set) behind the same `PianoSynth` interface.
3. Per-difficulty judgement windows; separate visual-vs-audio latency calibration.
4. Practice mode (slow/loop sections), per-bar accuracy heat-map in the results.
5. Gamepad/touch input, key remapping UI.
6. Worker-based audio scheduling so background-tab throttling never affects accompaniment.
