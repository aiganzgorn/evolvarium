// Rendering only — reads the world, never mutates it.
import { W, H, SIZE } from "./config.ts";
import type { Creature, Organic, World } from "./sim.ts";
import { genomeColor } from "./genome.ts";

const BG = "#0d0f16";

// One place converts world units → pixels, so clicks and drawing always agree.
export function viewTransform(vw: number, vh: number): { s: number; ox: number; oy: number } {
  const s = Math.min(vw / W, vh / H);
  return { s, ox: (vw - W * s) / 2, oy: (vh - H * s) / 2 };
}

export function draw(ctx: CanvasRenderingContext2D, world: World, vw: number, vh: number): void {
  const { s, ox, oy } = viewTransform(vw, vh);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, vw, vh);
  light(ctx, world.light, vw, vh);

  for (const o of world.organics) organic(ctx, o, ox, oy, s);
  for (const c of world.creatures) blob(ctx, c, ox, oy, s, world.tick);
}

// Global light falls from above: brighter at the top, gone at the bottom.
function light(ctx: CanvasRenderingContext2D, value: number, vw: number, vh: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, `rgba(255,240,190,${(0.12 * value).toFixed(3)})`);
  g.addColorStop(1, "rgba(255,240,190,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);
}

function organic(ctx: CanvasRenderingContext2D, o: Organic, ox: number, oy: number, s: number): void {
  const cx = ox + o.x * s, cy = oy + o.y * s;
  const r = SIZE * s * (0.14 + Math.min(o.amount, 40) * 0.014);

  ctx.fillStyle = "rgba(120,220,150,0.35)";
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(170,240,180,0.75)";
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2); ctx.fill();
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

  // blush — the only face feature she has so far
  ctx.fillStyle = "rgba(255,120,150,0.5)";
  for (const k of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + k * r * 0.58, cy + r * 0.22, r * 0.22, r * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const m of c.mutations) drawMutation(ctx, m.id, cx, cy, r, tick);

  nameTag(ctx, "Плюша", cx, cy + r + Math.max(6, r * 0.14), r);
}

// Every mutation must be visible. A new one gets its own case here.
function drawMutation(ctx: CanvasRenderingContext2D, id: string, cx: number, cy: number, r: number, tick: number): void {
  switch (id) {
    case "photosynthesis": {
      const sway = Math.sin(tick * 0.08) * 0.1;     // the sprout leans in the "wind"
      const baseY = cy - r * 0.84;                  // top of the head
      const tipY = cy - r * 1.34;                   // stem tip
      ctx.strokeStyle = "#5fb96f";
      ctx.lineWidth = Math.max(1, r * 0.07);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx, baseY);
      ctx.quadraticCurveTo(cx + r * 0.1, (baseY + tipY) / 2, cx, tipY);
      ctx.stroke();
      ctx.lineCap = "butt";
      leaf(ctx, cx, tipY, r * 0.52, -0.55 + sway);
      leaf(ctx, cx, tipY, r * 0.52, Math.PI + 0.55 - sway);
      break;
    }
  }
}

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, angle: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = "#79dd8c";
  ctx.beginPath(); ctx.ellipse(len * 0.5, 0, len, len * 0.42, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(20,60,30,0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
  ctx.restore();
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
