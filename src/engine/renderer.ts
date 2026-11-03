import { FALL_TIME, LANES, LANE_COUNT } from "./constants";
import type { NoteState } from "./session";
import type { Judgement, LaneIndex } from "./types";
import { isHold, pitchName } from "@/songs/builder";

export const LANE_COLORS = ["#38bdf8", "#a78bfa", "#f472b6", "#fbbf24"] as const;
const JUDGE_COLORS: Record<Judgement | "early", string> = {
  perfect: "#fde68a",
  great: "#67e8f9",
  miss: "#94a3b8",
  wrong: "#fb7185",
  early: "#cbd5e1",
};

interface Fx {
  kind: "ring" | "spark" | "text" | "flash";
  lane: LaneIndex;
  born: number;
  life: number;
  color: string;
  text?: string;
  /** spark velocity / offset */
  vx?: number;
  vy?: number;
  size?: number;
}

export interface Layout {
  W: number;
  H: number;
  fieldX: number;
  fieldW: number;
  laneW: number;
  judgeY: number;
  padH: number;
  pxPerSec: number;
  tileH: number;
}

export interface FrameInput {
  /** Song time (s). */
  t: number;
  states: readonly NoteState[];
  laneDown: readonly boolean[];
  /** True while the field should look "live". */
  active: boolean;
}

const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
};

/** Canvas drawing only — owns no game logic. */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private fx: Fx[] = [];
  private layout!: Layout;
  private dust: { x: number; y: number; s: number; v: number }[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    let seed = 42;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 46; i++) this.dust.push({ x: rnd(), y: rnd(), s: 0.6 + rnd() * 1.6, v: 0.01 + rnd() * 0.03 });
    this.resize();
  }

  /** Sync the backing store with the element's CSS size. Returns the layout. */
  resize(): Layout {
    const cssW = Math.max(320, this.canvas.clientWidth);
    const cssH = Math.max(240, this.canvas.clientHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(cssW * dpr) || this.canvas.height !== Math.round(cssH * dpr) || !this.layout) {
      this.canvas.width = Math.round(cssW * dpr);
      this.canvas.height = Math.round(cssH * dpr);
      this.dpr = dpr;
    }
    const padH = Math.min(150, Math.max(72, cssH * 0.15));
    const judgeY = cssH - padH;
    const fieldW = Math.min(cssW * 0.92, cssH * 0.95);
    const laneW = fieldW / LANE_COUNT;
    this.layout = {
      W: cssW,
      H: cssH,
      fieldX: (cssW - fieldW) / 2,
      fieldW,
      laneW,
      judgeY,
      padH,
      pxPerSec: judgeY / FALL_TIME,
      tileH: Math.min(laneW * 0.82, cssH * 0.2),
    };
    return this.layout;
  }

  getLayout() {
    return this.layout;
  }

  // ── effects API ─────────────────────────────────────────────────────────────
  clearFx() {
    this.fx = [];
  }

  judgement(lane: LaneIndex, judgement: Judgement | "early", now: number, label: string) {
    const color = JUDGE_COLORS[judgement];
    this.fx.push({ kind: "text", lane, born: now, life: 0.75, color, text: label });
    if (judgement === "perfect" || judgement === "great") {
      this.fx.push({ kind: "ring", lane, born: now, life: 0.5, color: LANE_COLORS[lane] });
      const n = judgement === "perfect" ? 14 : 8;
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
        const sp = 90 + Math.random() * 190;
        this.fx.push({
          kind: "spark",
          lane,
          born: now,
          life: 0.45 + Math.random() * 0.25,
          color: i % 3 === 0 ? "#ffffff" : LANE_COLORS[lane],
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 70,
          size: 2 + Math.random() * 3,
        });
      }
    } else if (judgement === "wrong") {
      this.fx.push({ kind: "flash", lane, born: now, life: 0.35, color: "#fb7185" });
    }
  }

  // ── drawing ─────────────────────────────────────────────────────────────────
  render(f: FrameInput, now: number) {
    const L = this.resize();
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawBackground(L, now);
    this.drawLanes(L, f);
    this.drawTiles(L, f, now);
    this.drawJudgeLine(L);
    this.drawPads(L, f);
    this.drawFx(L, now);
  }

  private drawBackground(L: Layout, now: number) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, L.H);
    g.addColorStop(0, "#07070f");
    g.addColorStop(0.55, "#0c0a1c");
    g.addColorStop(1, "#150f2b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L.W, L.H);

    const rg = ctx.createRadialGradient(L.W / 2, L.judgeY, 10, L.W / 2, L.judgeY, L.W * 0.55);
    rg.addColorStop(0, "rgba(124,92,255,0.22)");
    rg.addColorStop(1, "rgba(124,92,255,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, L.W, L.H);

    // drifting dust motes in the stage light
    ctx.fillStyle = "rgba(200,190,255,0.35)";
    for (const d of this.dust) {
      const y = (((d.y - now * d.v) % 1) + 1) % 1;
      ctx.globalAlpha = 0.15 + 0.35 * Math.sin((y + d.x) * 6.28) ** 2;
      ctx.beginPath();
      ctx.arc(d.x * L.W, y * L.H, d.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawLanes(L: Layout, f: FrameInput) {
    const ctx = this.ctx;
    // field backdrop
    const fg = ctx.createLinearGradient(0, 0, 0, L.judgeY);
    fg.addColorStop(0, "rgba(255,255,255,0.015)");
    fg.addColorStop(1, "rgba(255,255,255,0.05)");
    ctx.fillStyle = fg;
    ctx.fillRect(L.fieldX, 0, L.fieldW, L.judgeY);

    for (let i = 0; i < LANE_COUNT; i++) {
      const x = L.fieldX + i * L.laneW;
      if (f.laneDown[i]) {
        const lg = ctx.createLinearGradient(0, L.judgeY - L.H * 0.55, 0, L.judgeY);
        lg.addColorStop(0, "rgba(255,255,255,0)");
        lg.addColorStop(1, hexA(LANE_COLORS[i], 0.34));
        ctx.fillStyle = lg;
        ctx.fillRect(x, L.judgeY - L.H * 0.55, L.laneW, L.H * 0.55);
      }
    }
    ctx.strokeStyle = "rgba(255,255,255,0.09)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= LANE_COUNT; i++) {
      const x = Math.round(L.fieldX + i * L.laneW) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, L.judgeY + L.padH);
      ctx.stroke();
    }
    // outer glow edges
    ctx.fillStyle = "rgba(167,139,250,0.5)";
    ctx.fillRect(L.fieldX - 1, 0, 2, L.judgeY + L.padH);
    ctx.fillRect(L.fieldX + L.fieldW - 1, 0, 2, L.judgeY + L.padH);
  }

  private tileColors(s: NoteState, lane: number) {
    switch (s.status) {
      case "miss":
        return { top: "#64748b", bottom: "#334155", alpha: 0.55 };
      case "wrong":
        return { top: "#fb7185", bottom: "#9f1239", alpha: 0.5 };
      default: {
        const c = LANE_COLORS[lane];
        return { top: lighten(c, 0.35), bottom: c, alpha: 1 };
      }
    }
  }

  private drawTiles(L: Layout, f: FrameInput, now: number) {
    const ctx = this.ctx;
    const pad = L.laneW * 0.05;
    const drawn: NoteState[] = [];

    for (const s of f.states) {
      if (s.status === "hit" && !isHold(s.note)) continue; // consumed with a burst
      const n = s.note;
      const bottomRaw = L.judgeY - (n.time - f.t) * L.pxPerSec;
      const hold = isHold(n);
      const h = hold ? Math.max(L.tileH, n.duration * L.pxPerSec) : L.tileH;
      let bottom = bottomRaw;
      let top = bottomRaw - h;
      if (top > L.H || bottom < -20) continue;

      if (hold && (s.status === "holding" || s.status === "hit")) {
        // finished/in-progress hold: the part below the line is consumed
        bottom = Math.min(bottom, L.judgeY);
        if (top >= L.judgeY - 2) continue;
      }
      if (s.status === "miss" || s.status === "wrong") {
        if (top > L.judgeY + L.padH + 40) continue;
      }
      const x = L.fieldX + n.lane * L.laneW + pad;
      const w = L.laneW - pad * 2;
      const col = this.tileColors(s, n.lane);
      ctx.globalAlpha = col.alpha;

      const g = ctx.createLinearGradient(0, top, 0, bottom);
      g.addColorStop(0, col.top);
      g.addColorStop(1, col.bottom);
      ctx.fillStyle = g;
      if (col.alpha === 1) {
        ctx.shadowColor = hexA(LANE_COLORS[n.lane], 0.65);
        ctx.shadowBlur = 16;
      }
      rr(ctx, x, top, w, bottom - top, Math.min(14, w * 0.12));
      ctx.fill();
      ctx.shadowBlur = 0;

      // glossy highlight
      ctx.fillStyle = "rgba(255,255,255,0.20)";
      rr(ctx, x + 4, top + 4, w - 8, Math.min(22, (bottom - top) * 0.28), 8);
      ctx.fill();

      if (hold) {
        // centre track + progress while holding
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        rr(ctx, x + w * 0.38, top + 10, w * 0.24, Math.max(0, bottom - top - 20), 6);
        ctx.fill();
        if (s.status === "holding") {
          const prog = Math.min(1, Math.max(0, (f.t - n.time) / n.duration));
          const py = bottom - (bottom - top) * prog;
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          rr(ctx, x + w * 0.4, py, w * 0.2, bottom - py, 5);
          ctx.fill();
        }
        if (s.status === "pending" || s.status === "holding") {
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.font = `700 ${Math.max(10, L.laneW * 0.1)}px system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText("HOLD", x + w / 2, top + 24 + Math.min(14, L.laneW * 0.08));
        }
      }
      if (n.chordGroup !== null) drawn.push(s);
      if (s.status === "pending" || s.status === "holding") {
        // note name hint on tile
        ctx.fillStyle = "rgba(10,10,30,0.72)";
        ctx.font = `800 ${Math.max(11, L.laneW * 0.11)}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(pitchName(n.pitch), x + w / 2, bottom - 12);
      }
      ctx.globalAlpha = 1;
    }

    // connect chord members so a chord reads as one gesture
    const groups = new Map<number, NoteState[]>();
    for (const s of drawn) {
      const g = groups.get(s.note.chordGroup!) ?? [];
      g.push(s);
      groups.set(s.note.chordGroup!, g);
    }
    for (const members of groups.values()) {
      if (members.length < 2 || members.some((m) => m.status !== "pending")) continue;
      const yMid = L.judgeY - (members[0].note.time - f.t) * L.pxPerSec - L.tileH / 2;
      const xs = members.map((m) => L.fieldX + (m.note.lane + 0.5) * L.laneW);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(Math.min(...xs), yMid);
      ctx.lineTo(Math.max(...xs), yMid);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      for (const x of xs) {
        ctx.beginPath();
        ctx.arc(x, yMid, 7 + Math.sin(now * 8) * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.textAlign = "start";
  }

  private drawJudgeLine(L: Layout) {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = "rgba(196,181,253,0.9)";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "rgba(237,233,254,0.95)";
    ctx.fillRect(L.fieldX, L.judgeY - 1.5, L.fieldW, 3);
    ctx.restore();
  }

  private drawPads(L: Layout, f: FrameInput) {
    const ctx = this.ctx;
    const y = L.judgeY + 6;
    const h = L.padH - 6;
    for (let i = 0; i < LANE_COUNT; i++) {
      const x = L.fieldX + i * L.laneW + 4;
      const w = L.laneW - 8;
      const down = f.laneDown[i];
      // piano-key look
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      if (down) {
        g.addColorStop(0, hexA(LANE_COLORS[i], 0.95));
        g.addColorStop(1, hexA(LANE_COLORS[i], 0.55));
      } else {
        g.addColorStop(0, "#f8f7ff");
        g.addColorStop(1, "#c9c4e6");
      }
      ctx.fillStyle = g;
      if (down) {
        ctx.shadowColor = LANE_COLORS[i];
        ctx.shadowBlur = 24;
      }
      rr(ctx, x, y + (down ? 3 : 0), w, h - (down ? 3 : 0), 12);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = down ? "#ffffff" : "#312e5a";
      ctx.font = `800 ${Math.min(44, L.laneW * 0.26)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(LANES[i].label, x + w / 2, y + h / 2 + (down ? 3 : 0));
      ctx.textBaseline = "alphabetic";
    }
    ctx.textAlign = "start";
  }

  private drawFx(L: Layout, now: number) {
    const ctx = this.ctx;
    this.fx = this.fx.filter((e) => now - e.born < e.life);
    for (const e of this.fx) {
      const p = (now - e.born) / e.life;
      const cx = L.fieldX + (e.lane + 0.5) * L.laneW;
      switch (e.kind) {
        case "ring": {
          ctx.strokeStyle = e.color;
          ctx.globalAlpha = 1 - p;
          ctx.lineWidth = 4 * (1 - p) + 1;
          ctx.beginPath();
          ctx.ellipse(cx, L.judgeY, L.laneW * (0.2 + p * 0.5), L.laneW * (0.08 + p * 0.16), 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case "spark": {
          const dt = now - e.born;
          const x = cx + (e.vx ?? 0) * dt;
          const y = L.judgeY + (e.vy ?? 0) * dt + 260 * dt * dt;
          ctx.globalAlpha = 1 - p;
          ctx.fillStyle = e.color;
          ctx.beginPath();
          ctx.arc(x, y, (e.size ?? 3) * (1 - p * 0.5), 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "flash": {
          ctx.globalAlpha = (1 - p) * 0.45;
          ctx.fillStyle = e.color;
          ctx.fillRect(L.fieldX + e.lane * L.laneW, 0, L.laneW, L.judgeY + L.padH);
          break;
        }
        case "text": {
          const y = L.judgeY - 46 - p * 38;
          ctx.globalAlpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
          ctx.fillStyle = e.color;
          ctx.font = `800 ${Math.max(15, Math.min(26, L.laneW * 0.16))}px system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.shadowColor = "rgba(0,0,0,0.7)";
          ctx.shadowBlur = 6;
          ctx.fillText(e.text ?? "", cx, y);
          ctx.shadowBlur = 0;
          ctx.textAlign = "start";
          break;
        }
      }
      ctx.globalAlpha = 1;
    }
  }
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(c + (255 - c) * amt);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
