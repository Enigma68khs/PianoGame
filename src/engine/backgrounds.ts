import { LANE_COLORS } from "./renderer";

/** The subset of the renderer layout a background needs. */
export interface BgLayout {
  W: number;
  H: number;
  fieldX: number;
  fieldW: number;
  judgeY: number;
}

export interface BgState {
  /** Wall-clock seconds (keeps drifting while paused). */
  now: number;
  /** 0..1 pulse that peaks on every eighth-note of the music and decays. */
  beat: number;
  /** 0..1 smoothed excitement (grows with the combo). */
  energy: number;
}

export interface Background {
  draw(ctx: CanvasRenderingContext2D, L: BgLayout, s: BgState): void;
}

const GLYPHS = ["♪", "♫", "♩", "♬"];
const GLYPH_FONT = '"Apple Symbols","Segoe UI Symbol","Noto Sans Symbols2","DejaVu Sans",serif';

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function archPath(ctx: CanvasRenderingContext2D, cx: number, top: number, bottom: number, w: number) {
  const r = w / 2;
  ctx.beginPath();
  ctx.moveTo(cx - r, bottom);
  ctx.lineTo(cx - r, top + r);
  ctx.arc(cx, top + r, r, Math.PI, 0);
  ctx.lineTo(cx + r, bottom);
  ctx.closePath();
}

/** Side-on grand piano with the lid propped open, plus a stool. `x` is the left edge, `baseY` the floor. */
function grandPiano(ctx: CanvasRenderingContext2D, x: number, baseY: number, w: number, glow: number) {
  const u = w / 100;
  ctx.save();
  ctx.translate(x, baseY);
  ctx.fillStyle = "rgba(4,3,14,0.94)";
  // legs
  for (const lx of [7, 47, 88]) ctx.fillRect(lx * u, -24 * u, 4 * u, 24 * u);
  // case
  ctx.beginPath();
  ctx.roundRect(0, -32 * u, 100 * u, 9 * u, 3 * u);
  ctx.fill();
  // raised lid
  ctx.beginPath();
  ctx.moveTo(10 * u, -32 * u);
  ctx.lineTo(98 * u, -32 * u);
  ctx.lineTo(95 * u, -68 * u);
  ctx.lineTo(38 * u, -47 * u);
  ctx.closePath();
  ctx.fill();
  // music desk
  ctx.beginPath();
  ctx.moveTo(3 * u, -32 * u);
  ctx.lineTo(9 * u, -46 * u);
  ctx.lineTo(15 * u, -46 * u);
  ctx.lineTo(12 * u, -32 * u);
  ctx.closePath();
  ctx.fill();
  // stool
  ctx.fillRect(-26 * u, -18 * u, 16 * u, 4 * u);
  ctx.fillRect(-24 * u, -14 * u, 2.2 * u, 14 * u);
  ctx.fillRect(-14 * u, -14 * u, 2.2 * u, 14 * u);
  // moonlit rim along the lid edge
  ctx.strokeStyle = `rgba(190,205,255,${0.22 + 0.25 * glow})`;
  ctx.lineWidth = Math.max(1, u * 0.9);
  ctx.beginPath();
  ctx.moveTo(38 * u, -47 * u);
  ctx.lineTo(95 * u, -68 * u);
  ctx.moveTo(10 * u, -32 * u);
  ctx.lineTo(100 * u, -32 * u);
  ctx.stroke();
  ctx.restore();
}

/**
 * "Moonlit recital hall" — made for Für Elise (a quiet night-time bagatelle):
 * a night sky with a breathing moon and twinkling stars, tall arched windows, a grand piano in silhouette,
 * rose petals drifting down and music notes floating up. The glow pulses with the music's eighth-notes and
 * the scene gets livelier as the combo grows.
 */
function moonlitHall(): Background {
  const rnd = seeded(20240611);
  const stars = Array.from({ length: 110 }, () => ({ x: rnd(), y: rnd() * 0.7, r: 0.5 + rnd() * 1.4, tw: 0.8 + rnd() * 2.2, ph: rnd() * 6.28 }));
  const petals = Array.from({ length: 30 }, () => ({
    x: rnd(),
    y: rnd(),
    size: 6 + rnd() * 9,
    speed: 0.012 + rnd() * 0.02,
    sway: 0.4 + rnd() * 0.8,
    phase: rnd() * 6.28,
    spin: (rnd() - 0.5) * 2.4,
    pink: rnd() > 0.35,
  }));
  const notes = Array.from({ length: 12 }, (_, i) => ({
    side: i % 2,
    u: rnd(),
    off: rnd(),
    speed: 0.025 + rnd() * 0.03,
    glyph: GLYPHS[i % GLYPHS.length],
    size: 22 + rnd() * 22,
    sway: rnd() * 6.28,
    color: LANE_COLORS[i % 4],
  }));
  const clouds = [
    { y: 0.2, speed: 6, w: 0.55, a: 0.05, off: 0.1 },
    { y: 0.33, speed: 4, w: 0.7, a: 0.04, off: 0.6 },
    { y: 0.12, speed: 8, w: 0.4, a: 0.05, off: 0.85 },
  ];

  return {
    draw(ctx, L, s) {
      const { W, H, fieldX, fieldW } = L;
      const { now, beat, energy } = s;
      const rightX = fieldX + fieldW;
      const sideW = Math.min(fieldX, W - rightX);
      const hasSides = sideW > 150;

      // ── sky ──
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#040715");
      sky.addColorStop(0.42, "#0f0f30");
      sky.addColorStop(0.78, "#27163f");
      sky.addColorStop(1, "#3c1d44");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      const warm = ctx.createRadialGradient(W / 2, H * 1.05, 10, W / 2, H * 1.05, W * 0.6);
      warm.addColorStop(0, `rgba(255,160,130,${0.1 + 0.1 * energy + 0.05 * beat})`);
      warm.addColorStop(1, "rgba(255,160,130,0)");
      ctx.fillStyle = warm;
      ctx.fillRect(0, 0, W, H);

      // ── stars ──
      for (const st of stars) {
        ctx.globalAlpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(now * st.tw + st.ph));
        ctx.fillStyle = "#e8ecff";
        ctx.beginPath();
        ctx.arc(st.x * W, st.y * H, st.r, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ── moon ──
      const mr = Math.min(78, H * 0.095);
      const mx = hasSides ? rightX + sideW / 2 : W * 0.88;
      const my = hasSides ? H * 0.17 : H * 0.15;
      const haloR = mr * (3.4 + 0.5 * beat + 0.5 * energy);
      const halo = ctx.createRadialGradient(mx, my, mr * 0.6, mx, my, haloR);
      halo.addColorStop(0, `rgba(190,205,255,${0.38 + 0.2 * beat + 0.1 * energy})`);
      halo.addColorStop(1, "rgba(190,205,255,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(mx - haloR, my - haloR, haloR * 2, haloR * 2);
      const disc = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
      disc.addColorStop(0, "#fffdf2");
      disc.addColorStop(1, "#d9d6f5");
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = "rgba(140,140,190,0.2)";
      for (const [dx, dy, r] of [[-0.3, -0.1, 0.18], [0.25, 0.25, 0.13], [0.1, -0.4, 0.09], [-0.1, 0.4, 0.07]]) {
        ctx.beginPath();
        ctx.arc(mx + dx * mr, my + dy * mr, r * mr, 0, 6.2832);
        ctx.fill();
      }

      // ── slow clouds ──
      for (const c of clouds) {
        const cw = W * c.w;
        const x = ((((c.off * (W + cw) + now * c.speed) % (W + cw)) + (W + cw)) % (W + cw)) - cw;
        const g = ctx.createRadialGradient(x + cw / 2, c.y * H, 4, x + cw / 2, c.y * H, cw / 2);
        g.addColorStop(0, `rgba(190,200,255,${c.a})`);
        g.addColorStop(1, "rgba(190,200,255,0)");
        ctx.fillStyle = g;
        ctx.save();
        ctx.translate(x + cw / 2, c.y * H);
        ctx.scale(1, 0.18);
        ctx.translate(-(x + cw / 2), -c.y * H);
        ctx.fillRect(x, c.y * H - cw / 2, cw, cw);
        ctx.restore();
      }

      // ── arched windows + piano ──
      if (hasSides) {
        const ww = Math.min(sideW * 0.56, 210);
        const glow = 0.5 * beat + 0.35 * energy;
        const windows = [
          { cx: fieldX / 2, top: H * 0.1, bottom: H * 0.72 },
          { cx: rightX + sideW / 2, top: H * 0.34, bottom: H * 0.88 },
        ];
        for (const win of windows) {
          archPath(ctx, win.cx, win.top, win.bottom, ww);
          const g = ctx.createLinearGradient(0, win.top, 0, win.bottom);
          g.addColorStop(0, `rgba(150,175,255,${0.3 + 0.2 * glow})`);
          g.addColorStop(1, `rgba(90,100,200,${0.12 + 0.1 * glow})`);
          ctx.fillStyle = g;
          ctx.fill();
          ctx.strokeStyle = `rgba(205,215,255,${0.35 + 0.2 * glow})`;
          ctx.lineWidth = 2.5;
          ctx.stroke();
          // mullions
          ctx.strokeStyle = "rgba(205,215,255,0.28)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(win.cx, win.top + ww / 2);
          ctx.lineTo(win.cx, win.bottom);
          for (const f of [0.38, 0.62, 0.85]) {
            const y = win.top + (win.bottom - win.top) * f;
            ctx.moveTo(win.cx - ww / 2, y);
            ctx.lineTo(win.cx + ww / 2, y);
          }
          ctx.stroke();
          // soft moonbeam falling from the window
          const bw = ww * 0.9;
          const beam = ctx.createLinearGradient(0, win.bottom - 20, 0, H);
          beam.addColorStop(0, `rgba(170,190,255,${0.12 + 0.08 * glow})`);
          beam.addColorStop(1, "rgba(170,190,255,0)");
          ctx.fillStyle = beam;
          ctx.beginPath();
          ctx.moveTo(win.cx - bw / 2, win.bottom);
          ctx.lineTo(win.cx + bw / 2, win.bottom);
          ctx.lineTo(win.cx + bw * 0.9, H);
          ctx.lineTo(win.cx - bw * 0.9, H);
          ctx.closePath();
          ctx.fill();
        }
        const pw = Math.min(fieldX * 0.78, 320);
        grandPiano(ctx, fieldX * 0.5 - pw / 2 + pw * 0.1, H - 8, pw, beat * 0.6 + energy * 0.4);
      }

      // ── floor ──
      const floorTop = L.judgeY;
      const fl = ctx.createLinearGradient(0, floorTop, 0, H);
      fl.addColorStop(0, "rgba(0,0,0,0)");
      fl.addColorStop(1, "rgba(3,2,12,0.45)");
      ctx.fillStyle = fl;
      ctx.fillRect(0, floorTop, W, H - floorTop);

      // ── rose petals drifting down ──
      const petalCount = 16 + Math.round(energy * 14);
      for (let i = 0; i < petalCount; i++) {
        const p = petals[i];
        const fall = (((p.y + now * p.speed * (1 + energy * 0.8)) % 1.12) + 1.12) % 1.12;
        const y = fall * H - H * 0.06;
        const x = p.x * W + Math.sin(now * p.sway + p.phase) * 38;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(now * p.spin + p.phase);
        ctx.scale(1, 0.55 + 0.45 * Math.sin(now * p.sway * 1.7 + p.phase));
        ctx.fillStyle = p.pink ? `rgba(255,170,205,${0.5 + 0.3 * energy})` : `rgba(255,240,248,${0.38 + 0.25 * energy})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, 6.2832);
        ctx.fill();
        ctx.restore();
      }

      // ── notes floating up ──
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const n of notes) {
        const prog = (((n.off + now * n.speed) % 1) + 1) % 1;
        const lo = n.side === 0 ? 0 : rightX;
        const hi = n.side === 0 ? fieldX : W;
        const range = hi - lo;
        const x = range > 80 ? lo + range * (0.15 + 0.7 * n.u) : W * (n.side === 0 ? 0.08 : 0.92);
        const y = H * (1.05 - prog * 1.15);
        ctx.globalAlpha = Math.sin(prog * Math.PI) * (0.45 + 0.3 * energy + 0.25 * beat);
        ctx.fillStyle = rgba(n.color, 1);
        ctx.font = `${n.size * (1 + 0.12 * beat)}px ${GLYPH_FONT}`;
        ctx.fillText(n.glyph, x + Math.sin(now * 0.8 + n.sway) * 16, y);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    },
  };
}

const THEMES: Record<string, () => Background> = {
  "fur-elise": moonlitHall,
};

/** Background for a song; unknown songs fall back to the moonlit hall. */
export function createBackground(songId: string): Background {
  return (THEMES[songId] ?? moonlitHall)();
}
