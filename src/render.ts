// Rendering only — reads the world, never mutates it.
import { W, H, type Creature, type World } from "./sim.ts";
import { genomeColor } from "./genome.ts";

const BG = "#0d0f16";

export function draw(ctx: CanvasRenderingContext2D, world: World, vw: number, vh: number): void {
  const s = Math.min(vw / W, vh / H);          // world units → pixels
  const ox = (vw - W * s) / 2, oy = (vh - H * s) / 2;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, vw, vh);

  for (const c of world.creatures) blob(ctx, c, ox, oy, s, world.tick);
}

function blob(ctx: CanvasRenderingContext2D, c: Creature, ox: number, oy: number, s: number, tick: number): void {
  const cx = ox + c.x * s;
  const cy = oy + c.y * s;
  const r = (c.size * s) / 2 * 0.92;
  const breath = 1 + Math.sin(tick * 0.22 + c.id) * 0.025;   // she breathes

  ctx.fillStyle = genomeColor(c.genome);
  ctx.beginPath(); ctx.ellipse(cx, cy, r, r * breath, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(5,8,14,0.35)";
  ctx.lineWidth = Math.max(1, r * 0.04);
  ctx.stroke();

  // blush
  ctx.fillStyle = "rgba(255,120,150,0.32)";
  for (const k of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + k * r * 0.6, cy + r * 0.3, r * 0.2, r * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // the face always stays upright — a rotating face reads as a mess
  const blink = (tick + 50) % 90 < 6;   // one blink every ~4.5 s, not at load
  for (const k of [-1, 1]) {
    const px = cx + k * r * 0.32, py = cy - r * 0.06;
    if (blink) {
      ctx.strokeStyle = "#0b0d14";
      ctx.lineWidth = Math.max(1.5, r * 0.1);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(px - r * 0.14, py); ctx.lineTo(px + r * 0.14, py);
      ctx.stroke();
      ctx.lineCap = "butt";
    } else {
      ctx.fillStyle = "#0b0d14";
      ctx.beginPath(); ctx.arc(px, py, r * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.beginPath(); ctx.arc(px - r * 0.07, py - r * 0.08, r * 0.07, 0, Math.PI * 2); ctx.fill();
    }
  }

  nameTag(ctx, "Плюша", cx, cy + r + Math.max(6, r * 0.14), r);
}

function nameTag(ctx: CanvasRenderingContext2D, text: string, x: number, top: number, r: number): void {
  const font = Math.max(10, Math.round(r * 0.6));
  ctx.font = `${font}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = "center";
  const w = ctx.measureText(text).width;
  ctx.fillStyle = "rgba(13,15,22,0.8)";
  ctx.fillRect(x - w / 2 - 5, top, w + 10, font + 6);
  ctx.fillStyle = "rgba(255,215,110,0.9)";
  ctx.fillText(text, x, top + font + 1);
}
