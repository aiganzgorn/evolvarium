// Rendering only — reads the world, never mutates it.
import { DIRS, W, H, type Creature, type World } from "./sim.ts";
import { genomeColor } from "./genome.ts";

const BG = "#0d0f16";
const GRID = "rgba(140,160,220,0.07)";

export function draw(ctx: CanvasRenderingContext2D, world: World, vw: number, vh: number): void {
  const cell = Math.max(7, Math.min(vw / W, vh / H));
  const ox = (vw - cell * W) / 2, oy = (vh - cell * H) / 2;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, vw, vh);
  drawGrid(ctx, ox, oy, cell);

  for (const c of world.creatures) blob(ctx, c, ox, oy, cell, world.tick);
}

function drawGrid(ctx: CanvasRenderingContext2D, ox: number, oy: number, cell: number): void {
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= W; x++) {
    const px = Math.round(ox + x * cell) + 0.5;
    ctx.moveTo(px, oy); ctx.lineTo(px, oy + H * cell);
  }
  for (let y = 0; y <= H; y++) {
    const py = Math.round(oy + y * cell) + 0.5;
    ctx.moveTo(ox, py); ctx.lineTo(ox + W * cell, py);
  }
  ctx.stroke();
}

function blob(ctx: CanvasRenderingContext2D, c: Creature, ox: number, oy: number, cell: number, tick: number): void {
  const cx = ox + (c.x + 0.5) * cell;
  const cy = oy + (c.y + 0.5) * cell;
  const r = cell * 0.44;
  const a = (c.dir * Math.PI) / 4;
  const side = a + Math.PI / 2;

  ctx.fillStyle = genomeColor(c.genome);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

  // blush
  ctx.fillStyle = "rgba(255,120,150,0.32)";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + Math.cos(side) * r * 0.6 * s, cy + Math.sin(side) * r * 0.6 * s, r * 0.26, 0, Math.PI * 2);
    ctx.fill();
  }

  // eyes blink every ~4.5 s, offset per creature so they don't sync
  const blink = (tick + c.id * 7) % 90 < 6;
  for (const s of [-1, 1]) {
    const px = cx + Math.cos(a) * r * 0.26 + Math.cos(side) * r * 0.34 * s;
    const py = cy + Math.sin(a) * r * 0.26 + Math.sin(side) * r * 0.34 * s;
    if (blink) {
      ctx.strokeStyle = "rgba(10,12,18,0.85)";
      ctx.lineWidth = Math.max(1, r * 0.13);
      ctx.beginPath();
      ctx.moveTo(px - r * 0.16, py); ctx.lineTo(px + r * 0.16, py);
      ctx.stroke();
    } else {
      ctx.fillStyle = "#0b0d14";
      ctx.beginPath(); ctx.arc(px, py, r * 0.19, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath(); ctx.arc(px - r * 0.06, py - r * 0.06, r * 0.06, 0, Math.PI * 2); ctx.fill();
    }
  }

  // label goes BELOW the blob so it never fights the HUD in the top-left corner
  if (c.id === 0 && cell >= 12) nameTag(ctx, "Плюша", cx, cy + r + 4, cell);
}

function nameTag(ctx: CanvasRenderingContext2D, text: string, x: number, top: number, cell: number): void {
  const font = Math.max(11, Math.round(cell * 0.38));
  ctx.font = `${font}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = "center";
  const w = ctx.measureText(text).width;
  ctx.fillStyle = "rgba(13,15,22,0.8)";
  ctx.fillRect(x - w / 2 - 4, top, w + 8, font + 4);
  ctx.fillStyle = "rgba(255,215,110,0.9)";
  ctx.fillText(text, x, top + font);
}
