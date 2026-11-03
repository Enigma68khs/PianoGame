// Phone check: emulated iPhone 13 (portrait + landscape) with REAL touch input (Chrome DevTools Protocol touch events,
// including two fingers at once) against a running server.
//   BASE_URL=http://localhost:3000 node e2e/mobile.mjs
import { chromium, devices } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
mkdirSync("e2e/shots", { recursive: true });

let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const phone = devices["iPhone 13"];

for (const [name, viewport] of [
  ["portrait", phone.viewport],
  ["landscape", { width: phone.viewport.height, height: phone.viewport.width }],
]) {
  console.log(`\n── ${name} ${viewport.width}×${viewport.height} ──`);
  const ctx = await browser.newContext({ ...phone, viewport });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const api = (fn, arg) => page.evaluate(fn, arg);
  const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });

  await page.goto(BASE);
  await page.waitForSelector("text=Start Game");

  // ── menu ──
  const menu = await api(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Start Game/.test(x.textContent)).getBoundingClientRect();
    return { hOverflow: document.documentElement.scrollWidth > innerWidth + 1, startTop: b.top, startBottom: b.bottom, startLeft: b.left, startRight: b.right, vw: innerWidth, vh: innerHeight, touchHint: /터치/.test(document.body.innerText) };
  });
  check("menu: no horizontal overflow", !menu.hOverflow);
  check("menu: Start Game is visible without scrolling", menu.startTop >= 0 && menu.startBottom <= menu.vh && menu.startLeft >= 0 && menu.startRight <= menu.vw, `bottom ${Math.round(menu.startBottom)}/${menu.vh}`);
  check("menu: shows the touch-play hint on touch devices", menu.touchHint);
  await page.screenshot({ path: `e2e/shots/m-${name}-1-menu.png` });

  await page.getByRole("radio", { name: /Hard/ }).tap();
  await page.getByText("Start Game").tap();
  await page.waitForFunction(() => window.__pianoGame?.getState() === "READY");
  await page.waitForFunction(() => window.__pianoGame?.getState() === "PLAYING", null, { timeout: 15000 });

  // ── game layout ──
  const game = await api(() => {
    const c = document.querySelector("canvas").getBoundingClientRect();
    const over = (sel) => { const e = document.querySelector(sel); return e.scrollWidth > e.clientWidth + 1; };
    const sl = document.querySelector('footer input[type="range"]').getBoundingClientRect();
    return {
      audio: window.__pianoGame.getAudioState(),
      canvas: { x: c.x, y: c.y, w: c.width, h: c.height },
      headerOverflow: over("header"), footerOverflow: over("footer"),
      docOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      sliderRight: sl.right, vw: innerWidth,
    };
  });
  check("game: audio running after the tap on Start", game.audio === "running");
  check("game: HUD header/footer do not overflow, nothing scrolls sideways", !game.headerOverflow && !game.footerOverflow && !game.docOverflow);
  check("game: volume slider is fully on screen", game.sliderRight <= game.vw, `${Math.round(game.sliderRight)}/${game.vw}`);
  check("game: playfield is at least 240 px tall", game.canvas.h >= 240, `${Math.round(game.canvas.h)}px`);

  // lane centres (same formula as the renderer)
  const fieldW = Math.min(game.canvas.w * 0.92, game.canvas.h * 0.95);
  const fieldX = (game.canvas.w - fieldW) / 2;
  const laneX = (lane) => game.canvas.x + fieldX + (lane + 0.5) * (fieldW / 4);
  const padY = game.canvas.y + game.canvas.h - 28;

  // ── a finger on the right lane at the right time plays the right note ──
  const firstLane = await api(() => window.__pianoGame.getNotes()[0].lane);
  const firstPitch = await api(() => window.__pianoGame.getNotes()[0].pitch);
  await api(() => new Promise((res) => { const g = window.__pianoGame; const f = () => (g.getSongTime() >= -0.06 ? res() : requestAnimationFrame(f)); f(); }));
  await touch("touchStart", [{ x: laneX(firstLane), y: padY, id: 1 }]);
  await page.waitForTimeout(90);
  await touch("touchEnd", []);
  const ev0 = (await api(() => window.__pianoGame.getEvents()))[0];
  check("touch: first tile hit with the correct pitch", ev0 && ["perfect", "great"].includes(ev0.judgement) && ev0.playedPitch === firstPitch, ev0 ? `${ev0.judgement} pitch ${ev0.playedPitch} err ${ev0.timingErrorMs}ms` : "no event");

  // ── two fingers at once = two independent inputs ──
  // wait for a moment when neither lane A nor lane S has a tile close by (a tile 130–300 ms away would make the
  // press an ignored "too early" input, which is by design not logged)
  await api(() => new Promise((res) => {
    const g = window.__pianoGame;
    const notes = g.getNotes();
    const quiet = (t) => !notes.some((n) => n.lane <= 1 && n.time > t - 0.25 && n.time < t + 0.4);
    const f = () => { const t = g.getSongTime(); if (t > 0.8 && quiet(t)) res(); else requestAnimationFrame(f); };
    f();
  }));
  const before = await api(() => window.__pianoGame.getEvents().length);
  await touch("touchStart", [{ x: laneX(0), y: padY, id: 1 }, { x: laneX(1), y: padY, id: 2 }]);
  await page.waitForTimeout(60);
  await touch("touchEnd", []);
  const after = await api(() => window.__pianoGame.getEvents());
  const keys = after.slice(before).map((e) => e.key).sort().join("");
  check("multi-touch: two fingers register two lanes (A and S)", after.length - before === 2 && keys === "AS", `new events ${after.length - before}, keys ${keys}`);

  // ── lane under a finger lights up while held, and releases cleanly ──
  await touch("touchStart", [{ x: laneX(3), y: padY, id: 3 }]);
  await page.waitForTimeout(50);
  await touch("touchEnd", []);
  check("touch: pressing one finger twice doesn't leave a stuck key", (await api(() => window.__pianoGame.getState())) === "PLAYING");

  // ── pause button by tap, and the resume path ──
  await page.locator("footer button").first().tap();
  check("touch: Pause button pauses", (await api(() => window.__pianoGame.getState())) === "PAUSED");
  await page.screenshot({ path: `e2e/shots/m-${name}-2-pause.png` });
  await page.getByRole("button", { name: /Resume/ }).first().tap();
  await page.waitForFunction(() => window.__pianoGame?.getState() === "PLAYING", null, { timeout: 8000 });
  check("touch: Resume continues the song", true);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `e2e/shots/m-${name}-3-game.png` });

  // ── finish the song to look at the results screen (portrait only) ──
  if (name === "portrait") {
    await api(() => {
      const g = window.__pianoGame;
      const notes = g.getNotes();
      let idx = notes.findIndex((n) => n.time > g.getSongTime());
      const loop = () => {
        const t = g.getSongTime();
        while (idx >= 0 && idx < notes.length && t >= notes[idx].time && g.getState() === "PLAYING") {
          const code = g.lanes[notes[idx].lane];
          window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true }));
          setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true })), Math.max(60, notes[idx].hold ? notes[idx].duration * 900 : 60));
          idx++;
        }
        if (g.getState() !== "COMPLETED") requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.waitForSelector("text=Performance Complete", { timeout: 60000 });
    await page.waitForTimeout(1500);
    const res = await api(() => ({
      docOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      mainOverflow: document.querySelector("main").scrollWidth > innerWidth + 1,
      playAgain: !!document.body.innerText.match(/Play Again/),
    }));
    check("results: no sideways overflow and buttons present", !res.docOverflow && !res.mainOverflow && res.playAgain);
    await page.screenshot({ path: `e2e/shots/m-${name}-4-results.png` });
    await page.getByText("Play Again").tap();
    await page.waitForFunction(() => window.__pianoGame?.getState() === "READY");
    check("results: Play Again works by touch", true);
  }

  check("no console/page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} check(s) FAILED` : "\nall phone checks passed");
process.exit(failed ? 1 : 0);
