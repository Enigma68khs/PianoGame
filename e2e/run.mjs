// Real-browser end-to-end check (system Chrome via playwright-core).
//   npm run build && npx next start -p 3100 &   then   BASE_URL=http://localhost:3100 npm run test:e2e
// An in-page autopilot presses keys at the notes' song times using synthetic KeyboardEvents, so the whole
// pipeline (input → judge → piano synth → results) runs against the real AudioContext clock.
import { launchBrowser } from "./browser.mjs";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
mkdirSync("e2e/shots", { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

const api = (fn, arg) => page.evaluate(fn, arg);
const state = () => api(() => window.__pianoGame?.getState());
const songTime = () => api(() => window.__pianoGame?.getSongTime());
const press = (code) => api((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, bubbles: true })), code);
const release = (code) => api((c) => window.dispatchEvent(new KeyboardEvent("keyup", { code: c, bubbles: true })), code);
const waitState = (s, timeout = 20000) => page.waitForFunction((s) => window.__pianoGame?.getState() === s, s, { timeout });

// ── 1. menu ──────────────────────────────────────────────────────────────────
await page.goto(BASE);
await page.waitForSelector("text=Start Game");
check("menu renders (logo, song card, difficulty, volume, Start)", (await page.locator("text=Für Elise").count()) > 0 && (await page.locator("text=Coming Soon").count()) > 0);
await page.screenshot({ path: "e2e/shots/1-menu.png" });

await page.getByRole("radio", { name: /Hard/ }).click(); // shortest run
// Space on the menu starts the game (focus is deliberately left on the Hard button: Space must not click it)
await page.keyboard.press("Space");
await page.waitForFunction(() => !!window.__pianoGame);
check("Space on the menu starts the game", (await state()) === "READY");
const audioState = await api(() => window.__pianoGame.getAudioState());
check("AudioContext is running after the Start click", audioState === "running", audioState);
check("state READY with countdown", (await state()) === "READY");
await page.waitForTimeout(500);
await page.screenshot({ path: "e2e/shots/2-countdown.png" });

// ── 2. pause / resume during READY ─────────────────────────────────────────────
await press("Space"); await release("Space");
check("Space during countdown pauses (PAUSED)", (await state()) === "PAUSED");
await page.screenshot({ path: "e2e/shots/3-pause.png" });
await press("Space"); await release("Space");
check("Space resumes → READY (resume countdown)", (await state()) === "READY");
await waitState("PLAYING");
check("countdown ends → PLAYING", true);

// ── 3. pause freezes song time, resume continues from the same position ───────────
await page.waitForTimeout(2500);
const t1 = await songTime();
await press("Escape"); await release("Escape");
check("Escape pauses", (await state()) === "PAUSED");
const tFrozenA = await songTime();
await page.waitForTimeout(1500);
const tFrozenB = await songTime();
check("song time frozen while paused", Math.abs(tFrozenB - tFrozenA) < 0.001, `${tFrozenA.toFixed(3)} → ${tFrozenB.toFixed(3)}`);
check("song time was advancing before pause", t1 > 0.5, `t=${t1.toFixed(2)}`);
await press("Escape"); await release("Escape");
await waitState("PLAYING");
const tResumed = await songTime();
check("resume continues from the pause position (±100 ms)", Math.abs(tResumed - tFrozenB) < 0.1, `${tFrozenB.toFixed(3)} → ${tResumed.toFixed(3)}`);

// ── 4. restart with confirmation ─────────────────────────────────────────────
await press("KeyR"); await release("KeyR");
check("R pauses and asks for confirmation", (await state()) === "PAUSED" && (await page.locator("text=처음부터 다시 시작할까요?").count()) === 1);
await page.screenshot({ path: "e2e/shots/4-confirm.png" });
await press("Escape"); await release("Escape");
check("Esc cancels the restart (still PAUSED, dialog closed)", (await state()) === "PAUSED" && (await page.locator("text=처음부터 다시 시작할까요?").count()) === 0);
await press("KeyR"); await release("KeyR");
await press("Enter"); await release("Enter");
check("Enter confirms restart → READY at the beginning", (await state()) === "READY" && (await songTime()) < -1.5, `t=${(await songTime()).toFixed(2)}`);
check("restart cleared the input log", (await api(() => window.__pianoGame.getEvents().length)) === 0);
await waitState("PLAYING");

// ── 4b. what actually comes out of the speakers (AnalyserNode on the synth output) ───────────────
// First melody note: E5 (MIDI 76) on lane 3 (L). Hard tempo.
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
async function scenario(keyCode) {
  await page.evaluate(() => window.__pianoGame.probeStart());
  await waitState("PLAYING");
  // wait until song time ≈ the first note, then press (or not)
  await page.evaluate(
    (code) => new Promise((resolve) => {
      const g = window.__pianoGame;
      const f = () => {
        if (g.getSongTime() >= -0.005) { if (code) window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true })); resolve(); }
        else requestAnimationFrame(f);
      };
      f();
    }),
    keyCode,
  );
  await page.waitForTimeout(160);
  const early = await api((fs) => window.__pianoGame.probe(fs), [midiHz(75), midiHz(76), midiHz(77)]);
  await page.waitForTimeout(450); // let the note ring and give any "auto-corrected" correct note time to appear
  const later = await api((fs) => window.__pianoGame.probe(fs), [midiHz(75), midiHz(76), midiHz(77)]);
  const ev = await api(() => window.__pianoGame.getEvents());
  if (keyCode) await api((c) => window.dispatchEvent(new KeyboardEvent("keyup", { code: c, bubbles: true })), keyCode);
  return { early, later, ev };
}
const restart = async () => {
  await press("KeyR"); await release("KeyR");
  await press("Enter"); await release("Enter");
};

await restart();
const right = await scenario("KeyL");
check("correct key (L) → judged Perfect/Great and E5 (MIDI 76) is the loudest pitch", ["perfect", "great"].includes(right.ev[0]?.judgement) && right.early.peakMidi === 76, `peak MIDI ${right.early.peakMidi} (${right.early.peakHz.toFixed(1)} Hz), rms ${right.early.rms.toFixed(4)}`);

await restart();
const wrong = await scenario("KeyK");
check("wrong key (K) → Wrong Note and a DIFFERENT pitch (D#5, MIDI 75) sounds", wrong.ev[0]?.judgement === "wrong" && wrong.ev[0].playedPitch === 75 && wrong.early.peakMidi === 75, `peak MIDI ${wrong.early.peakMidi}`);
check("wrong key → the correct E5 never appears afterwards (no auto-correction)", wrong.later.db[1] < wrong.later.db[0] - 15 && wrong.early.db[1] < wrong.early.db[0] - 15, `dB D#5 ${wrong.later.db[0].toFixed(0)} vs E5 ${wrong.later.db[1].toFixed(0)}`);

await restart();
const silent = await scenario(null);
check("no key → Miss and the melody note is silent", silent.ev[0]?.judgement === "miss" && silent.later.rms < 0.0005 && silent.early.rms < 0.0005, `rms ${silent.later.rms.toExponential(1)}`);
check("press produces audible output (rms)", right.early.rms > 0.003, `rms ${right.early.rms.toFixed(4)}`);

await restart();
await waitState("PLAYING");

// ── 5. key-repeat suppression ──────────────────────────────────────────────────
// (while PLAYING, before the first note is due, a stray press is recorded once; repeats are ignored)
const before = await api(() => window.__pianoGame.getEvents().length);
await api(() => {
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyL", bubbles: true }));
  for (let i = 0; i < 20; i++) window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyL", repeat: true, bubbles: true }));
  window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyL", bubbles: true }));
});
const after = await api(() => window.__pianoGame.getEvents().length);
check("auto-repeat keydowns produce a single input", after - before <= 1, `events +${after - before}`);

// ── 6. autopilot through the whole song: perfect + some wrong + some skipped + chord ─────────────
await api(() => {
  const g = window.__pianoGame;
  const notes = g.getNotes();
  const plan = notes.map((n, i) => ({ n, mode: i % 17 === 5 ? "wrong" : i % 11 === 8 && n.chordGroup === null ? "skip" : "ok" }));
  window.__plan = plan.map((p) => ({ id: p.n.id, mode: p.mode, lane: p.n.lane, time: p.n.time, dur: p.n.duration, hold: p.n.hold, chord: p.n.chordGroup !== null }));
  const codes = g.lanes;
  let idx = 0;
  const releases = [];
  const loop = () => {
    const t = g.getSongTime();
    while (idx < plan.length && t >= plan[idx].n.time && g.getState() === "PLAYING") {
      const p = plan[idx++];
      if (p.mode === "skip") continue;
      const lane = p.mode === "wrong" ? (p.n.lane + 1) % 4 : p.n.lane;
      const code = codes[lane];
      window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true }));
      releases.push({ at: t + (p.n.hold && p.mode === "ok" ? p.n.duration - 0.1 : 0.07), code });
    }
    for (let i = releases.length - 1; i >= 0; i--) {
      if (t >= releases[i].at) {
        window.dispatchEvent(new KeyboardEvent("keyup", { code: releases[i].code, bubbles: true }));
        releases.splice(i, 1);
      }
    }
    if (g.getState() === "PLAYING" || g.getState() === "READY") requestAnimationFrame(loop);
  };
  // the previous check (key K stray) already used lane 3; make sure all keys are up
  for (const c of codes) window.dispatchEvent(new KeyboardEvent("keyup", { code: c, bubbles: true }));
  requestAnimationFrame(loop);
});
await page.waitForTimeout(6000);
await page.screenshot({ path: "e2e/shots/5-playing.png" });
const mid = await api(() => {
  const g = window.__pianoGame;
  return { t: g.getSongTime(), n: g.getEvents().length, st: g.getStats(), state: g.getState() };
});
check("tiles fall in real time (song time advancing)", mid.t > 3, `t=${mid.t.toFixed(1)}s`);
check("game continues despite wrong notes and misses", mid.state === "PLAYING" && mid.st.wrong > 0 && mid.st.miss > 0, JSON.stringify({ w: mid.st.wrong, m: mid.st.miss, p: mid.st.perfect }));

// COMPLETED unmounts the controller (results screen) → read from the DOM
await page.waitForSelector("text=Performance Complete", { timeout: 45000 }).catch(async (e) => {
  await page.screenshot({ path: "e2e/shots/fail.png" });
  const dbg = await api(() => { const g = window.__pianoGame; return g ? { state: g.getState(), t: g.getSongTime(), n: g.getEvents().length, notes: g.getNotes().length, st: g.getStats() } : null; });
  console.log("DEBUG", JSON.stringify(dbg), errors.slice(0, 3));
  throw e;
});
check("song ends → results screen shows", true);
await page.waitForTimeout(1500);
await page.screenshot({ path: "e2e/shots/6-results.png", fullPage: false });

const plan = await api(() => window.__plan);
const expected = { wrong: plan.filter((p) => p.mode === "wrong").length, skip: plan.filter((p) => p.mode === "skip").length };
const text = await page.locator("main").innerText();
const num = (label) => Number(new RegExp(`(\\d+)\\s*\\n?\\s*${label}`, "i").exec(text)?.[1] ?? NaN);
const wrongShown = num("Wrong Note");
const missShown = num("Miss");
check("results: Wrong Note count ≥ planned wrongs (plus any earlier stray)", wrongShown >= expected.wrong, `shown ${wrongShown}, planned ${expected.wrong}`);
check("results: Miss count ≥ planned skips", missShown >= expected.skip, `shown ${missShown}, planned ${expected.skip}`);
check("results: Perfect/Great/Max Combo/accuracy/score labels present", ["perfect", "great", "max combo", "accuracy", "final score"].every((l) => text.toLowerCase().includes(l)));
const avgErr = Number(/평균 타이밍 오차 (\d+)ms/.exec(text)?.[1] ?? NaN);
check("input timing vs tile clock: mean |error| of scripted presses is small", avgErr < 40, `${avgErr} ms`);
check("results: performance log lists target vs played notes", (await page.locator('[data-testid="event-log"] tbody tr').count()) > 10);
check("results: wrong rows show a different played pitch", await page.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-testid="event-log"] tbody tr')].filter((r) => /Wrong/.test(r.textContent) && !/stray/.test(r.textContent));
  return rows.length > 0 && rows.every((r) => { const c = r.querySelectorAll("td"); return c[3].textContent !== c[4].textContent; });
}));
check("results: missed rows show (silence)", await page.evaluate(() => [...document.querySelectorAll('[data-testid="event-log"] tbody tr')].some((r) => /Miss/.test(r.textContent) && /silence/.test(r.textContent))));

// ── 7. replay + navigation ────────────────────────────────────────────────────
await page.getByText("Listen to my performance").click();
await page.waitForSelector("text=Stop");
check("performance replay starts", true);
await page.getByText("■ Stop").click();
await page.getByText("Play Again").click();
await page.waitForFunction(() => window.__pianoGame?.getState() === "READY");
check("Play Again starts a fresh run (READY)", (await api(() => window.__pianoGame.getEvents().length)) === 0);
await page.reload();
await page.waitForSelector("text=Start Game");
check("page reload returns to a working menu", true);

// ── 8. second song: Canon in D ─────────────────────────────────────────────────────────────
await page.screenshot({ path: "e2e/shots/7-menu-two-songs.png" });
check("menu lists Canon in D as playable", (await page.getByRole("button", { name: /Canon in D/ }).isEnabled()));
await page.getByRole("button", { name: /Canon in D/ }).click();
await page.getByRole("radio", { name: /Normal/ }).click();
await page.keyboard.press("Space");
await page.waitForFunction(() => window.__pianoGame?.getState() === "READY");
const canon = await api(() => { const n = window.__pianoGame.getNotes(); return { count: n.length, first: n[0].pitch, lane: n[0].lane, holds: n.filter((x) => x.hold).length, chord: n.filter((x) => x.chordGroup !== null).length }; });
check("Canon loads: first note F#5 (78) on lane 2, only the closing 3-key chord is a hold", canon.first === 78 && canon.lane === 2 && canon.holds === 3 && canon.chord === 3, JSON.stringify(canon));
await api(() => window.__pianoGame.probeStart());
await waitState("PLAYING");
await api(() => new Promise((resolve) => {
  const g = window.__pianoGame;
  const f = () => { if (g.getSongTime() >= -0.005) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyK", bubbles: true })); resolve(); } else requestAnimationFrame(f); };
  f();
}));
await page.waitForTimeout(200);
// The ground bass (D3) sounds on the same beat, so compare the target pitch against its neighbouring semitones
// instead of asking for the single loudest frequency.
const cp = await api((fs) => window.__pianoGame.probe(fs), [midiHz(77), midiHz(78), midiHz(79)]);
check("Canon: correct key plays F#5 (MIDI 78) — clearly louder than F5 and G5", cp.db[1] > Math.max(cp.db[0], cp.db[2]) + 8, `dB F5 ${cp.db[0].toFixed(0)} · F#5 ${cp.db[1].toFixed(0)} · G5 ${cp.db[2].toFixed(0)}`);
await page.waitForTimeout(5000);
await page.screenshot({ path: "e2e/shots/8-canon-playing.png" });

// ── 9. third song: Moonlight Sonata (and Clair de Lune must stay "Coming Soon") ──────────────────
await page.goto(BASE);
await page.waitForSelector("text=Start Game");
check("Clair de Lune is still a disabled Coming Soon card", await page.getByRole("button", { name: /Clair de Lune/ }).isDisabled());
await page.getByRole("button", { name: /Moonlight Sonata/ }).click();
await page.getByRole("radio", { name: /Normal/ }).click();
await page.keyboard.press("Space");
await page.waitForFunction(() => window.__pianoGame?.getState() === "READY");
const moon = await api(() => { const n = window.__pianoGame.getNotes(); return { count: n.length, first: n[0].pitch, lane: n[0].lane, holds: n.filter((x) => x.hold).length }; });
check("Moonlight loads: first note G#3 (56) on lane 0, 99 notes, only the closing chord is a hold", moon.first === 56 && moon.lane === 0 && moon.count === 99 && moon.holds === 3, JSON.stringify(moon));
await api(() => window.__pianoGame.probeStart());
await waitState("PLAYING");
await api(() => new Promise((resolve) => {
  const g = window.__pianoGame;
  const f = () => { if (g.getSongTime() >= -0.005) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA", bubbles: true })); resolve(); } else requestAnimationFrame(f); };
  f();
}));
await page.waitForTimeout(200);
const mp = await api((fs) => window.__pianoGame.probe(fs), [midiHz(55), midiHz(56), midiHz(57)]);
check("Moonlight: correct key plays G#3 (MIDI 56) — clearly louder than G3 and A3", mp.db[1] > Math.max(mp.db[0], mp.db[2]) + 8, `dB G3 ${mp.db[0].toFixed(0)} · G#3 ${mp.db[1].toFixed(0)} · A3 ${mp.db[2].toFixed(0)}`);
await page.waitForTimeout(4000);
await page.screenshot({ path: "e2e/shots/9-moonlight-playing.png" });

// ── 10. the three simple songs are registered and load with the right first note ───────────────
for (const [label, firstPitch, firstLane] of [["Ode to Joy", 64, 2], ["Twinkle Twinkle Little Star", 60, 0], ["Jingle Bells", 64, 2], ["Midnight Groove", 69, 0]]) {
  await page.goto(BASE);
  await page.waitForSelector("text=Start Game");
  await page.getByRole("button", { name: new RegExp(label) }).click();
  await page.keyboard.press("Space");
  await page.waitForFunction(() => window.__pianoGame?.getState() === "READY");
  const info = await api(() => { const n = window.__pianoGame.getNotes(); return { count: n.length, p: n[0].pitch, l: n[0].lane }; });
  check(`${label} loads (first note MIDI ${firstPitch} on lane ${firstLane})`, info.p === firstPitch && info.l === firstLane && info.count > 20, JSON.stringify(info));
}

// ── 11. latency calibration: a deliberately late player gets compensated ───────────────────────────
// A press 0.1 s after the first note is only "Great" (Perfect needs ≤ 0.06 s). After calibrating a player who taps
// ~75 ms late, the same press must be judged Perfect.
async function latePressJudgement() {
  await page.goto(BASE);
  await page.waitForSelector("text=Start Game");
  await page.getByRole("button", { name: /Für Elise/ }).click();
  await page.getByRole("radio", { name: /Hard/ }).click();
  await page.keyboard.press("Space");
  await page.waitForFunction(() => window.__pianoGame?.getState() === "READY");
  await waitState("PLAYING");
  return api(() => new Promise((resolve) => {
    const g = window.__pianoGame;
    const n = g.getNotes()[0];
    const f = () => {
      if (g.getSongTime() >= n.time + 0.1) {
        window.dispatchEvent(new KeyboardEvent("keydown", { code: g.lanes[n.lane], bubbles: true }));
        resolve({ j: g.getEvents()[0]?.judgement, off: g.getInputOffset(), err: g.getEvents()[0]?.timingErrorMs });
      } else requestAnimationFrame(f);
    };
    f();
  }));
}
const control = await latePressJudgement();
check("without calibration a press 0.1 s late is only Great (offset 0)", control.j === "great" && control.off === 0, JSON.stringify(control));

await page.goto(BASE);
await page.waitForSelector("text=Start Game");
await page.getByTestId("open-calibration").click();
await page.waitForSelector("text=입력 지연 보정");
await page.screenshot({ path: "e2e/shots/10-calibration-intro.png" });
await page.keyboard.press("Space"); // Space starts the click track (and is the user gesture for audio)
await page.waitForFunction(() => window.__pianoCalib?.phase() === "running");
check("calibration starts on Space (clicks scheduled on the audio clock)", (await api(() => window.__pianoCalib.clicks().length)) === 12);
// in-page "player": taps ~75 ms after each click, like someone with a laggy setup
await api(() => new Promise((resolve) => {
  const c = window.__pianoCalib;
  const clicks = c.clicks();
  let i = 0;
  const f = () => {
    while (i < clicks.length && c.now() >= clicks[i] + 0.075) {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: ["KeyA", "KeyS", "KeyK", "KeyL"][i % 4], bubbles: true }));
      i++;
    }
    if (i < clicks.length) requestAnimationFrame(f); else resolve();
  };
  f();
}));
await page.getByTestId("cal-result").waitFor({ timeout: 8000 });
await page.screenshot({ path: "e2e/shots/11-calibration-result.png" });
const draftText = await page.getByTestId("cal-draft").innerText();
const draft = Number(draftText.replace("−", "-").replace("ms", ""));
check("calibration measures the ~75 ms lag → offset ≈ −75 ms", draft <= -65 && draft >= -110, draftText);
await page.getByRole("button", { name: "+5ms" }).click();
check("±5 ms fine-tune buttons adjust the value", Number((await page.getByTestId("cal-draft").innerText()).replace("−", "-").replace("ms", "")) === draft + 5);
await page.getByRole("button", { name: "-5ms" }).click();
await page.getByTestId("cal-apply").click();
await page.waitForSelector("text=Start Game");
check("applying returns to the menu showing the saved offset", (await page.getByTestId("offset-label").innerText()).includes(String(Math.abs(draft))));
check("the offset is persisted (localStorage)", (await api(() => JSON.parse(localStorage.getItem("pianogame.v1")).inputOffsetMs)) === draft);

const calibrated = await latePressJudgement();
check("after calibration the same late press is judged Perfect (offset applied to input time)", calibrated.j === "perfect" && Math.abs(calibrated.off * 1000 - draft) < 0.5, JSON.stringify(calibrated));

check("no console/page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
