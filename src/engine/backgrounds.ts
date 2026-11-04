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
function grandPiano(ctx: CanvasRenderingContext2D, x: number, baseY: number, w: number, glow: number, rim: string) {
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
  ctx.strokeStyle = `rgba(${rim},${0.22 + 0.25 * glow})`;
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
 * "Moonlit recital hall" — made for Für Elise (a quiet night-time bagatelle); the "dawn" variant (sunrise
 * sky, golden light and petals) is the Canon in D theme:
 * a night sky with a breathing moon and twinkling stars, tall arched windows, a grand piano in silhouette,
 * rose petals drifting down and music notes floating up. The glow pulses with the music's eighth-notes and
 * the scene gets livelier as the combo grows.
 */
function moonlitHall(variant: "moon" | "dawn" = "moon"): Background {
  const dawn = variant === "dawn";
  // palette: [light tint used for halo/windows/beams/rim, window glass, petal pink, petal white]
  const tint = dawn ? "255,205,140" : "190,205,255";
  const glass = dawn ? "255,215,160" : "150,175,255";
  const glassLow = dawn ? "230,150,110" : "90,100,200";
  const frame = dawn ? "255,232,195" : "205,215,255";
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
      sky.addColorStop(0, dawn ? "#1a1038" : "#040715");
      sky.addColorStop(0.42, dawn ? "#4b2660" : "#0f0f30");
      sky.addColorStop(0.78, dawn ? "#c8607a" : "#27163f");
      sky.addColorStop(1, dawn ? "#f4a860" : "#3c1d44");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      const warm = ctx.createRadialGradient(W / 2, H * 1.05, 10, W / 2, H * 1.05, W * 0.6);
      warm.addColorStop(0, `rgba(255,${dawn ? 200 : 160},${dawn ? 120 : 130},${(dawn ? 0.22 : 0.1) + 0.1 * energy + 0.05 * beat})`);
      warm.addColorStop(1, "rgba(255,160,130,0)");
      ctx.fillStyle = warm;
      ctx.fillRect(0, 0, W, H);

      // ── stars ──
      for (const st of stars) {
        ctx.globalAlpha = (dawn ? 0.4 : 1) * (0.25 + 0.75 * (0.5 + 0.5 * Math.sin(now * st.tw + st.ph)));
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
      halo.addColorStop(0, `rgba(${tint},${0.38 + 0.2 * beat + 0.1 * energy})`);
      halo.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(mx - haloR, my - haloR, haloR * 2, haloR * 2);
      const disc = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
      disc.addColorStop(0, dawn ? "#fffbe0" : "#fffdf2");
      disc.addColorStop(1, dawn ? "#ffcf78" : "#d9d6f5");
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = "rgba(140,140,190,0.2)";
      if (!dawn) for (const [dx, dy, r] of [[-0.3, -0.1, 0.18], [0.25, 0.25, 0.13], [0.1, -0.4, 0.09], [-0.1, 0.4, 0.07]]) {
        ctx.beginPath();
        ctx.arc(mx + dx * mr, my + dy * mr, r * mr, 0, 6.2832);
        ctx.fill();
      }

      // ── slow clouds ──
      for (const c of clouds) {
        const cw = W * c.w;
        const x = ((((c.off * (W + cw) + now * c.speed) % (W + cw)) + (W + cw)) % (W + cw)) - cw;
        const g = ctx.createRadialGradient(x + cw / 2, c.y * H, 4, x + cw / 2, c.y * H, cw / 2);
        g.addColorStop(0, `rgba(${dawn ? "255,190,160" : "190,200,255"},${c.a * (dawn ? 1.6 : 1)})`);
        g.addColorStop(1, `rgba(${dawn ? "255,190,160" : "190,200,255"},0)`);
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
          g.addColorStop(0, `rgba(${glass},${0.3 + 0.2 * glow})`);
          g.addColorStop(1, `rgba(${glassLow},${0.12 + 0.1 * glow})`);
          ctx.fillStyle = g;
          ctx.fill();
          ctx.strokeStyle = `rgba(${frame},${0.35 + 0.2 * glow})`;
          ctx.lineWidth = 2.5;
          ctx.stroke();
          // mullions
          ctx.strokeStyle = `rgba(${frame},0.28)`;
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
          beam.addColorStop(0, `rgba(${tint},${0.12 + 0.08 * glow})`);
          beam.addColorStop(1, `rgba(${tint},0)`);
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
        grandPiano(ctx, fieldX * 0.5 - pw / 2 + pw * 0.1, H - 8, pw, beat * 0.6 + energy * 0.4, tint);
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
        ctx.fillStyle = p.pink
          ? dawn ? `rgba(255,214,130,${0.5 + 0.3 * energy})` : `rgba(255,170,205,${0.5 + 0.3 * energy})`
          : `rgba(255,240,248,${0.38 + 0.25 * energy})`;
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


/**
 * "Moonlit lake" — made for the Moonlight Sonata: a huge moon over a still lake, its reflection shimmering
 * in time with the music, distant mountains, drifting mist and slowly rising notes.
 */
function moonlitLake(): Background {
  const rnd = seeded(77123);
  const stars = Array.from({ length: 140 }, () => ({ x: rnd(), y: rnd() * 0.55, r: 0.5 + rnd() * 1.3, tw: 0.6 + rnd() * 2, ph: rnd() * 6.28 }));
  const notes = Array.from({ length: 10 }, (_, i) => ({
    side: i % 2, u: rnd(), off: rnd(), speed: 0.02 + rnd() * 0.02, glyph: GLYPHS[i % 4], size: 22 + rnd() * 20, sway: rnd() * 6.28, color: LANE_COLORS[i % 4],
  }));
  const mist = [
    { y: 0.5, speed: 5, w: 0.8, a: 0.07, off: 0.2 },
    { y: 0.58, speed: -3, w: 0.9, a: 0.06, off: 0.7 },
  ];
  return {
    draw(ctx, L, s) {
      const { W, H, fieldX, fieldW } = L;
      const { now, beat, energy } = s;
      const horizon = H * 0.6;
      const rightX = fieldX + fieldW;
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, "#030818");
      sky.addColorStop(0.6, "#0b1a3a");
      sky.addColorStop(1, "#1c3b5c");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, horizon);
      for (const st of stars) {
        ctx.globalAlpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(now * st.tw + st.ph));
        ctx.fillStyle = "#e6f0ff";
        ctx.beginPath();
        ctx.arc(st.x * W, st.y * H, st.r, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // moon
      const mr = Math.min(96, H * 0.12);
      const mx = W - rightX > 150 ? rightX + (W - rightX) / 2 : W * 0.5; // beside the lanes when there is room
      const my = horizon * 0.42;
      const haloR = mr * (3.6 + 0.5 * beat + 0.6 * energy);
      const halo = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, haloR);
      halo.addColorStop(0, `rgba(200,225,255,${0.4 + 0.2 * beat + 0.1 * energy})`);
      halo.addColorStop(1, "rgba(200,225,255,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(mx - haloR, my - haloR, haloR * 2, haloR * 2);
      const disc = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
      disc.addColorStop(0, "#ffffff");
      disc.addColorStop(1, "#cfe0f7");
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = "rgba(120,140,185,0.18)";
      for (const [dx, dy, r] of [[-0.3, -0.1, 0.2], [0.28, 0.2, 0.14], [0.05, -0.42, 0.1]]) {
        ctx.beginPath();
        ctx.arc(mx + dx * mr, my + dy * mr, r * mr, 0, 6.2832);
        ctx.fill();
      }

      // distant mountains (left and right of centre)
      ctx.fillStyle = "#050d1e";
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      ctx.lineTo(0, horizon - H * 0.12);
      ctx.lineTo(W * 0.1, horizon - H * 0.2);
      ctx.lineTo(W * 0.22, horizon - H * 0.09);
      ctx.lineTo(W * 0.3, horizon - H * 0.14);
      ctx.lineTo(W * 0.4, horizon);
      ctx.lineTo(W * 0.62, horizon);
      ctx.lineTo(W * 0.72, horizon - H * 0.1);
      ctx.lineTo(W * 0.82, horizon - H * 0.19);
      ctx.lineTo(W * 0.92, horizon - H * 0.08);
      ctx.lineTo(W, horizon - H * 0.15);
      ctx.lineTo(W, horizon);
      ctx.closePath();
      ctx.fill();

      // lake
      const lake = ctx.createLinearGradient(0, horizon, 0, H);
      lake.addColorStop(0, "#10294a");
      lake.addColorStop(1, "#050c1c");
      ctx.fillStyle = lake;
      ctx.fillRect(0, horizon, W, H - horizon);

      // moon reflection: shimmering strips that widen/brighten with the beat and the combo
      const strips = 26;
      for (let i = 0; i < strips; i++) {
        const t = i / strips;
        const y = horizon + 4 + t * (H - horizon - 8);
        const h = 2 + t * 5;
        const wob = Math.sin(now * 1.4 + i * 1.7) * (6 + t * 26);
        const w = mr * (1.6 - t * 0.7) * (1 + 0.25 * beat) * (0.6 + 0.4 * Math.sin(now * 2 + i));
        ctx.fillStyle = `rgba(210,230,255,${(0.34 - t * 0.2) * (0.7 + 0.3 * beat + 0.3 * energy)})`;
        ctx.fillRect(mx + wob - w / 2, y, w, h);
      }

      // mist
      for (const m of mist) {
        const mw = W * m.w;
        const x = ((((m.off * (W + mw) + now * m.speed) % (W + mw)) + (W + mw)) % (W + mw)) - mw;
        const g = ctx.createRadialGradient(x + mw / 2, m.y * H, 4, x + mw / 2, m.y * H, mw / 2);
        g.addColorStop(0, `rgba(170,200,235,${m.a})`);
        g.addColorStop(1, "rgba(170,200,235,0)");
        ctx.fillStyle = g;
        ctx.save();
        ctx.translate(x + mw / 2, m.y * H);
        ctx.scale(1, 0.2);
        ctx.translate(-(x + mw / 2), -m.y * H);
        ctx.fillRect(x, m.y * H - mw / 2, mw, mw);
        ctx.restore();
      }

      // rising notes
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const n of notes) {
        const prog = (((n.off + now * n.speed) % 1) + 1) % 1;
        const lo = n.side === 0 ? 0 : rightX;
        const hi = n.side === 0 ? fieldX : W;
        const range = hi - lo;
        const x = range > 80 ? lo + range * (0.15 + 0.7 * n.u) : W * (n.side === 0 ? 0.08 : 0.92);
        ctx.globalAlpha = Math.sin(prog * Math.PI) * (0.4 + 0.3 * energy + 0.25 * beat);
        ctx.fillStyle = rgba(n.color, 1);
        ctx.font = `${n.size * (1 + 0.1 * beat)}px ${GLYPH_FONT}`;
        ctx.fillText(n.glyph, x + Math.sin(now * 0.7 + n.sway) * 16, H * (1.05 - prog * 1.15));
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    },
  };
}


/**
 * "Starry night" — for Twinkle, Twinkle, Little Star: a deep violet sky full of twinkling four-point stars
 * that flare on the beat, a crescent moon, shooting stars and rolling hills.
 */
function starryNight(): Background {
  const rnd = seeded(31337);
  const dots = Array.from({ length: 170 }, () => ({ x: rnd(), y: rnd() * 0.85, r: 0.5 + rnd() * 1.2, tw: 0.7 + rnd() * 2.4, ph: rnd() * 6.28 }));
  const big = Array.from({ length: 26 }, () => ({ x: rnd(), y: rnd() * 0.7, size: 5 + rnd() * 9, tw: 0.6 + rnd() * 1.6, ph: rnd() * 6.28 }));
  const notes = Array.from({ length: 10 }, (_, i) => ({
    side: i % 2, u: rnd(), off: rnd(), speed: 0.022 + rnd() * 0.025, glyph: GLYPHS[i % 4], size: 22 + rnd() * 20, sway: rnd() * 6.28, color: LANE_COLORS[i % 4],
  }));
  const star4 = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
  };
  return {
    draw(ctx, L, s) {
      const { W, H, fieldX, fieldW } = L;
      const { now, beat, energy } = s;
      const rightX = fieldX + fieldW;
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#0a0630");
      sky.addColorStop(0.55, "#1d1052");
      sky.addColorStop(1, "#3b1a6b");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      for (const d of dots) {
        ctx.globalAlpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(now * d.tw + d.ph));
        ctx.fillStyle = "#f1ecff";
        ctx.beginPath();
        ctx.arc(d.x * W, d.y * H, d.r, 0, 6.2832);
        ctx.fill();
      }
      for (const b of big) {
        const tw = 0.5 + 0.5 * Math.sin(now * b.tw + b.ph);
        ctx.globalAlpha = 0.35 + 0.55 * tw + 0.2 * beat;
        ctx.fillStyle = "#fff6c9";
        star4(ctx, b.x * W, b.y * H, b.size * (0.7 + 0.5 * tw + 0.5 * beat * energy + 0.2 * beat));
      }
      ctx.globalAlpha = 1;

      // crescent moon
      const mr = Math.min(60, H * 0.075);
      const mx = W - rightX > 150 ? rightX + (W - rightX) / 2 : W * 0.86;
      const my = H * 0.16;
      const halo = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 3.4);
      halo.addColorStop(0, `rgba(255,240,190,${0.25 + 0.15 * beat})`);
      halo.addColorStop(1, "rgba(255,240,190,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(mx - mr * 3.4, my - mr * 3.4, mr * 6.8, mr * 6.8);
      ctx.save();
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, 6.2832);
      ctx.clip();
      ctx.fillStyle = "#fff3c4";
      ctx.beginPath();
      ctx.rect(mx - mr, my - mr, mr * 2, mr * 2);
      ctx.arc(mx + mr * 0.45, my - mr * 0.12, mr * 0.88, 0, 6.2832, true);
      ctx.fill();
      ctx.restore();

      // shooting stars
      for (let k = 0; k < 3; k++) {
        const ph = (now * 0.12 + k / 3) % 1;
        if (ph > 0.14) continue;
        const t = ph / 0.14;
        const x0 = W * (0.15 + 0.3 * k) + t * W * 0.22;
        const y0 = H * (0.08 + 0.12 * k) + t * H * 0.12;
        const g = ctx.createLinearGradient(x0, y0, x0 - 90, y0 - 50);
        g.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - t)})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 - 90, y0 - 50);
        ctx.stroke();
      }

      // hills
      for (const [base, amp, col] of [[0.8, 0.035, "#150c3a"], [0.87, 0.03, "#0c0624"]] as const) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 24) ctx.lineTo(x, H * base + Math.sin(x * 0.006 + base * 9) * H * amp);
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fill();
      }

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const n of notes) {
        const prog = (((n.off + now * n.speed) % 1) + 1) % 1;
        const lo = n.side === 0 ? 0 : rightX;
        const hi = n.side === 0 ? fieldX : W;
        const range = hi - lo;
        const x = range > 80 ? lo + range * (0.15 + 0.7 * n.u) : W * (n.side === 0 ? 0.08 : 0.92);
        ctx.globalAlpha = Math.sin(prog * Math.PI) * (0.4 + 0.3 * energy + 0.25 * beat);
        ctx.fillStyle = rgba(n.color, 1);
        ctx.font = `${n.size * (1 + 0.1 * beat)}px ${GLYPH_FONT}`;
        ctx.fillText(n.glyph, x + Math.sin(now * 0.8 + n.sway) * 16, H * (1.05 - prog * 1.15));
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    },
  };
}

/**
 * "Snowy night" — for Jingle Bells: falling snow, snow-covered hills with pines, and little cottages whose
 * windows glow warmly in time with the music.
 */
function snowyNight(): Background {
  const rnd = seeded(2112);
  const flakes = Array.from({ length: 110 }, () => ({ x: rnd(), y: rnd(), r: 1.2 + rnd() * 2.8, speed: 0.04 + rnd() * 0.09, sway: 0.5 + rnd() * 1.2, ph: rnd() * 6.28 }));
  const stars = Array.from({ length: 70 }, () => ({ x: rnd(), y: rnd() * 0.45, r: 0.5 + rnd() * 1.1, tw: 0.8 + rnd() * 2, ph: rnd() * 6.28 }));
  const notes = Array.from({ length: 8 }, (_, i) => ({
    side: i % 2, u: rnd(), off: rnd(), speed: 0.02 + rnd() * 0.02, glyph: GLYPHS[i % 4], size: 22 + rnd() * 18, sway: rnd() * 6.28, color: LANE_COLORS[i % 4],
  }));
  const pine = (ctx: CanvasRenderingContext2D, x: number, base: number, h: number) => {
    ctx.fillStyle = "#0a2236";
    for (let i = 0; i < 3; i++) {
      const y = base - h * (0.35 * i);
      const w = h * (0.5 - i * 0.1);
      ctx.beginPath();
      ctx.moveTo(x, y - h * 0.45);
      ctx.lineTo(x + w / 2, y);
      ctx.lineTo(x - w / 2, y);
      ctx.closePath();
      ctx.fill();
    }
  };
  const cottage = (ctx: CanvasRenderingContext2D, x: number, base: number, w: number, glow: number) => {
    const h = w * 0.55;
    ctx.fillStyle = "#07131f";
    ctx.fillRect(x - w / 2, base - h, w, h);
    ctx.beginPath(); // roof with a snow cap
    ctx.moveTo(x - w * 0.62, base - h);
    ctx.lineTo(x, base - h - w * 0.42);
    ctx.lineTo(x + w * 0.62, base - h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#e8f2ff";
    ctx.beginPath();
    ctx.moveTo(x - w * 0.62, base - h);
    ctx.lineTo(x, base - h - w * 0.42);
    ctx.lineTo(x + w * 0.62, base - h);
    ctx.lineTo(x + w * 0.5, base - h + 4);
    ctx.lineTo(x, base - h - w * 0.3);
    ctx.lineTo(x - w * 0.5, base - h + 4);
    ctx.closePath();
    ctx.fill();
    const wg = ctx.createRadialGradient(x, base - h * 0.5, 2, x, base - h * 0.5, w * 0.9);
    wg.addColorStop(0, `rgba(255,200,100,${0.35 + 0.3 * glow})`);
    wg.addColorStop(1, "rgba(255,200,100,0)");
    ctx.fillStyle = wg;
    ctx.fillRect(x - w, base - h * 1.6, w * 2, h * 2.2);
    ctx.fillStyle = `rgba(255,214,120,${0.8 + 0.2 * glow})`;
    ctx.fillRect(x - w * 0.28, base - h * 0.72, w * 0.22, h * 0.36);
    ctx.fillRect(x + w * 0.08, base - h * 0.72, w * 0.22, h * 0.36);
  };
  return {
    draw(ctx, L, s) {
      const { W, H, fieldX, fieldW } = L;
      const { now, beat, energy } = s;
      const rightX = fieldX + fieldW;
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#050f22");
      sky.addColorStop(0.5, "#123257");
      sky.addColorStop(1, "#2f6590");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      for (const st of stars) {
        ctx.globalAlpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(now * st.tw + st.ph));
        ctx.fillStyle = "#eaf4ff";
        ctx.beginPath();
        ctx.arc(st.x * W, st.y * H, st.r, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // far hill, cottages and pines, near hill
      const ridge = (base: number, amp: number, k: number) => (x: number) => H * base + Math.sin(x * k + base * 7) * H * amp;
      const far = ridge(0.74, 0.03, 0.005);
      const near = ridge(0.84, 0.03, 0.007);
      ctx.fillStyle = "#cfe2f4";
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 20) ctx.lineTo(x, far(x));
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
      const glow = beat * 0.7 + energy * 0.4;
      if (fieldX > 140) cottage(ctx, fieldX * 0.5, far(fieldX * 0.5) + 6, Math.min(150, fieldX * 0.5), glow);
      if (W - rightX > 140) cottage(ctx, rightX + (W - rightX) * 0.5, far(rightX + (W - rightX) * 0.5) + 6, Math.min(130, (W - rightX) * 0.45), glow);
      for (const px of [0.06, 0.2, 0.33, 0.67, 0.8, 0.94]) pine(ctx, px * W, far(px * W) + 8, Math.min(120, H * 0.16));
      ctx.fillStyle = "#f4f9ff";
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 20) ctx.lineTo(x, near(x));
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
      const shade = ctx.createLinearGradient(0, H * 0.78, 0, H);
      shade.addColorStop(0, "rgba(40,80,130,0)");
      shade.addColorStop(1, "rgba(20,40,90,0.5)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, H * 0.78, W, H * 0.22);

      // snow
      const count = 70 + Math.round(energy * 40);
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < count; i++) {
        const f = flakes[i];
        const y = ((((f.y + now * f.speed * (1 + energy * 0.6)) % 1.06) + 1.06) % 1.06) * H - H * 0.03;
        const x = f.x * W + Math.sin(now * f.sway + f.ph) * 26;
        ctx.globalAlpha = 0.55 + 0.35 * Math.sin(f.ph + now);
        ctx.beginPath();
        ctx.arc(x, y, f.r, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const n of notes) {
        const prog = (((n.off + now * n.speed) % 1) + 1) % 1;
        const lo = n.side === 0 ? 0 : rightX;
        const hi = n.side === 0 ? fieldX : W;
        const range = hi - lo;
        const x = range > 80 ? lo + range * (0.15 + 0.7 * n.u) : W * (n.side === 0 ? 0.08 : 0.92);
        ctx.globalAlpha = Math.sin(prog * Math.PI) * (0.45 + 0.3 * energy + 0.25 * beat);
        ctx.fillStyle = rgba(n.color, 1);
        ctx.font = `${n.size * (1 + 0.1 * beat)}px ${GLYPH_FONT}`;
        ctx.fillText(n.glyph, x + Math.sin(now * 0.7 + n.sway) * 16, H * (1.05 - prog * 1.15));
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    },
  };
}


/**
 * "Neon night" — for Midnight Groove: a synthwave city night. A striped neon sun sinks behind a skyline, a
 * perspective grid races toward the horizon and speaker-style equalizer bars on both sides jump with the beat.
 */
function neonNight(): Background {
  const rnd = seeded(8080);
  const eq = Array.from({ length: 16 }, () => ({ ph: rnd() * 6.28, sp: 1.4 + rnd() * 2.4, base: 0.22 + rnd() * 0.3 }));
  const towers = Array.from({ length: 34 }, (_, i) => ({ x: i / 34, w: 0.02 + rnd() * 0.028, h: 0.03 + rnd() * 0.11, lit: rnd() }));
  const notes = Array.from({ length: 9 }, (_, i) => ({
    side: i % 2, u: rnd(), off: rnd(), speed: 0.025 + rnd() * 0.03, glyph: GLYPHS[i % 4], size: 22 + rnd() * 20, sway: rnd() * 6.28, color: LANE_COLORS[i % 4],
  }));
  return {
    draw(ctx, L, s) {
      const { W, H, fieldX, fieldW } = L;
      const { now, beat, energy } = s;
      const rightX = fieldX + fieldW;
      const horizon = H * 0.6;

      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, "#06010e");
      sky.addColorStop(0.55, "#1a0430");
      sky.addColorStop(1, "#5d0e57");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, horizon);

      // striped sun
      const sr = Math.min(W, H) * 0.19;
      const sx = W - rightX > 150 ? rightX + (W - rightX) / 2 : W * 0.5;
      const sy = horizon - sr * 0.55;
      const glow = ctx.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * (2.2 + 0.5 * beat + 0.4 * energy));
      glow.addColorStop(0, `rgba(255,60,160,${0.38 + 0.2 * beat})`);
      glow.addColorStop(1, "rgba(255,60,160,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(sx - sr * 3, sy - sr * 3, sr * 6, sr * 6);
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, 6.2832);
      ctx.clip();
      const disc = ctx.createLinearGradient(0, sy - sr, 0, sy + sr);
      disc.addColorStop(0, "#ffe94a");
      disc.addColorStop(0.55, "#ff6a3d");
      disc.addColorStop(1, "#ff1f8f");
      ctx.fillStyle = disc;
      ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
      ctx.fillStyle = "#1c0433"; // slits in the lower half
      for (let i = 0; i < 7; i++) {
        const y = sy + sr * (0.05 + i * 0.14);
        ctx.fillRect(sx - sr, y, sr * 2, 1.5 + i * 1.6);
      }
      ctx.restore();

      // skyline
      for (const t of towers) {
        const bh = t.h * H;
        ctx.fillStyle = "#0b0219";
        ctx.fillRect(t.x * W, horizon - bh, t.w * W, bh);
        if (t.lit > 0.35) {
          ctx.fillStyle = t.lit > 0.7 ? `rgba(0,255,230,${0.45 + 0.4 * beat})` : `rgba(255,70,190,${0.4 + 0.4 * beat})`;
          for (let y = horizon - bh + 6; y < horizon - 4; y += 11) ctx.fillRect(t.x * W + 3, y, Math.max(2, t.w * W - 6), 2);
        }
      }

      // floor + perspective grid
      const floor = ctx.createLinearGradient(0, horizon, 0, H);
      floor.addColorStop(0, "#21053b");
      floor.addColorStop(1, "#08010f");
      ctx.fillStyle = floor;
      ctx.fillRect(0, horizon, W, H - horizon);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `rgba(255,70,200,${0.45 + 0.4 * beat + 0.15 * energy})`;
      for (let i = -14; i <= 14; i++) {
        ctx.beginPath();
        ctx.moveTo(W / 2 + i * (W / 90), horizon);
        ctx.lineTo(W / 2 + i * (W / 9), H);
        ctx.stroke();
      }
      ctx.strokeStyle = `rgba(0,240,255,${0.38 + 0.3 * beat})`;
      const slide = (now * 0.5) % 1;
      for (let k = 0; k < 11; k++) {
        const t = (k + slide) / 11;
        const y = horizon + (H - horizon) * t * t;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,70,200,0.5)";
      ctx.fillRect(0, horizon - 1, W, 2);

      // equalizer bars beside the lanes
      const sides: [number, number][] = [];
      if (fieldX > 110) sides.push([8, fieldX - 8]);
      if (W - rightX > 110) sides.push([rightX + 8, W - 8]);
      for (const [x0, x1] of sides) {
        const n = 8;
        const bw = (x1 - x0) / n;
        for (let i = 0; i < n; i++) {
          const e = eq[(i + (x0 > fieldX ? 8 : 0)) % eq.length];
          const lvl = Math.min(1, e.base + 0.28 * Math.sin(now * e.sp + e.ph) + 0.3 * beat + 0.25 * energy);
          const h = Math.max(6, lvl * H * 0.42);
          const g = ctx.createLinearGradient(0, H - h, 0, H);
          g.addColorStop(0, "#00f0ff");
          g.addColorStop(1, "#ff2fa0");
          ctx.fillStyle = g;
          ctx.globalAlpha = 0.85;
          ctx.fillRect(x0 + i * bw + 2, H - h, bw - 4, h);
        }
      }
      ctx.globalAlpha = 1;

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const n of notes) {
        const prog = (((n.off + now * n.speed) % 1) + 1) % 1;
        const lo = n.side === 0 ? 0 : rightX;
        const hi = n.side === 0 ? fieldX : W;
        const range = hi - lo;
        const x = range > 80 ? lo + range * (0.15 + 0.7 * n.u) : W * (n.side === 0 ? 0.08 : 0.92);
        ctx.globalAlpha = Math.sin(prog * Math.PI) * (0.5 + 0.3 * energy + 0.25 * beat);
        ctx.fillStyle = rgba(n.color, 1);
        ctx.font = `${n.size * (1 + 0.12 * beat)}px ${GLYPH_FONT}`;
        ctx.fillText(n.glyph, x + Math.sin(now * 0.8 + n.sway) * 14, H * (1.02 - prog * 1.1));
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    },
  };
}

const THEMES: Record<string, () => Background> = {
  "fur-elise": () => moonlitHall("moon"),
  "canon-in-d": () => moonlitHall("dawn"),
  "moonlight-sonata": moonlitLake,
  "ode-to-joy": () => moonlitHall("dawn"),
  "twinkle-twinkle": starryNight,
  "jingle-bells": snowyNight,
  "midnight-groove": neonNight,
};

/** Scenes a local-only song can choose by name (`"theme"` in its chart file). */
const THEME_BY_NAME: Record<string, () => Background> = {
  moon: () => moonlitHall("moon"),
  dawn: () => moonlitHall("dawn"),
  lake: moonlitLake,
  stars: starryNight,
  snow: snowyNight,
  neon: neonNight,
};
const CUSTOM_THEMES = new Map<string, string>();

/** Pick one of the built-in scenes for a song id (used by local-only songs). */
export function registerSongTheme(songId: string, themeName: string) {
  if (THEME_BY_NAME[themeName]) CUSTOM_THEMES.set(songId, themeName);
}

/** Background for a song; unknown songs fall back to the moonlit hall. */
export function createBackground(songId: string): Background {
  const named = CUSTOM_THEMES.get(songId);
  if (named) return THEME_BY_NAME[named]();
  return (THEMES[songId] ?? THEMES["fur-elise"])();
}
