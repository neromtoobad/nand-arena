import { useEffect, useRef } from "react";
import { SIZE } from "@sdk/game.js";

const COLORS = {
  bg: "#0c110f", grid: "#16211d",
  a: "#12b89c", aGlow: "#4ff2d4",
  b: "#ff4f8b", bGlow: "#ff8db3",
};

/**
 * Draws a match at time t (float, 0..ticks). Trails are drawn up to t; heads interpolate.
 * m = { posA, posB, ticks, crash }
 */
export function drawBoard(ctx, px, m, t, opts = {}) {
  const cell = px / SIZE;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, px, px);
  if (!opts.mini) {
    ctx.fillStyle = COLORS.grid;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      ctx.beginPath(); ctx.arc((x + 0.5) * cell, (y + 0.5) * cell, Math.max(1, cell * 0.06), 0, Math.PI * 2); ctx.fill();
    }
  }
  const ticks = m.ticks;
  const tt = Math.max(0, Math.min(t, ticks));
  const k = Math.floor(tt);
  const frac = tt - k;
  const crashed = k >= ticks;

  const trail = (pos, color, glow) => {
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = color; ctx.lineWidth = cell * 0.42;
    if (!opts.mini) { ctx.shadowColor = glow; ctx.shadowBlur = cell * 0.5; }
    ctx.beginPath();
    const c = p => [(p.x + 0.5) * cell, (p.y + 0.5) * cell];
    ctx.moveTo(...c(pos[0]));
    const lastFull = Math.min(k, ticks - 1);
    for (let i = 1; i <= lastFull; i++) ctx.lineTo(...c(pos[i]));
    // head: interpolate toward the next cell (for the final tick, toward the crash cell)
    let head = c(pos[lastFull]);
    if (!crashed && k < ticks) {
      const nxt = c(pos[k + 1]);
      const from = c(pos[k]);
      const f = k === ticks - 1 ? Math.min(frac, 0.55) : frac;
      head = [from[0] + (nxt[0] - from[0]) * f, from[1] + (nxt[1] - from[1]) * f];
      ctx.lineTo(...head);
    } else if (crashed) {
      const nxt = c(pos[ticks]);
      const from = c(pos[ticks - 1]);
      head = [from[0] + (nxt[0] - from[0]) * 0.55, from[1] + (nxt[1] - from[1]) * 0.55];
      ctx.lineTo(...head);
    }
    ctx.stroke();
    ctx.restore();
    return head;
  };
  const ha = trail(m.posA, COLORS.a, COLORS.aGlow);
  const hb = trail(m.posB, COLORS.b, COLORS.bGlow);

  const dotHead = (h, glow, dead) => {
    ctx.save();
    ctx.fillStyle = dead ? "#ffffff" : glow;
    if (!opts.mini) { ctx.shadowColor = glow; ctx.shadowBlur = cell * 1.1; }
    ctx.beginPath(); ctx.arc(h[0], h[1], cell * (opts.mini ? 0.32 : 0.3), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (dead) {
      ctx.save();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(1.5, cell * 0.12);
      const r = cell * 0.55;
      ctx.beginPath(); ctx.moveTo(h[0] - r, h[1] - r); ctx.lineTo(h[0] + r, h[1] + r);
      ctx.moveTo(h[0] + r, h[1] - r); ctx.lineTo(h[0] - r, h[1] + r); ctx.stroke();
      ctx.restore();
    }
  };
  dotHead(ha, COLORS.aGlow, crashed && m.crash[0]);
  dotHead(hb, COLORS.bGlow, crashed && m.crash[1]);
}

/** Static or animated board. If `t` is given it's controlled; else it auto-plays and loops. */
export default function Board({ match, t, size = 560, mini = false, loop = false, speed = 9, onTick }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !match) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = size * dpr; cv.height = size * dpr;
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (t !== undefined) { drawBoard(ctx, size, match, t, { mini }); return; }
    if (!loop) { drawBoard(ctx, size, match, match.ticks, { mini }); return; }
    let raf, start = performance.now();
    const hold = 1.6;
    const frame = now => {
      const el = (now - start) / 1000;
      const total = match.ticks / speed + hold;
      const tt = Math.min(match.ticks, ((el % total) * speed));
      drawBoard(ctx, size, match, tt, { mini });
      onTick && onTick(tt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [match, t, size, mini, loop, speed]);
  return <canvas ref={ref} style={{ aspectRatio: "1 / 1" }} />;
}
