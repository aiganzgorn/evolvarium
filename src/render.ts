// Rendering only — reads the world, never mutates it.
import { W, H, SIZE, LIGHT_MAX, LIGHT_BAND, LIGHT_PERIOD } from "./config.ts";
import type { Creature, Organic, World } from "./sim.ts";
import { lightCenter } from "./sim.ts";
import { genomeColor } from "./genome.ts";
import { attachPoint, legTip, type LegState } from "./mutations.ts";

const BG = "#0d0f16";

export type Selection = { kind: "creature" | "organic"; id: number } | null;

// One place converts world units → pixels, so clicks and drawing always agree.
export function viewTransform(vw: number, vh: number): { s: number; ox: number; oy: number } {
  const s = Math.min(vw / W, vh / H);
  return { s, ox: (vw - W * s) / 2, oy: (vh - H * s) / 2 };
}

export function draw(
  ctx: CanvasRenderingContext2D, world: World, vw: number, vh: number, selected: Selection = null,
): void {
  const { s, ox, oy } = viewTransform(vw, vh);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, vw, vh);
  light(ctx, world, vw, vh, ox, s);

  for (const o of world.organics) {
    organic(ctx, o, ox, oy, s, selected?.kind === "organic" && selected.id === o.id);
  }
  for (const c of world.creatures) {
    blob(ctx, c, ox, oy, s, world.tick, selected?.kind === "creature" && selected.id === c.id);
  }
}

// The moving light band: a soft vertical wash that sweeps left to right.
function light(ctx: CanvasRenderingContext2D, world: World, vw: number, vh: number, ox: number, s: number): void {
  const band = W * LIGHT_BAND;
  const centre = ox + lightCenter(world) * s;
  const half = (band / 2) * s;

  const g = ctx.createLinearGradient(centre - half, 0, centre + half, 0);
  g.addColorStop(0, "rgba(255,240,190,0)");
  g.addColorStop(0.5, `rgba(255,240,190,${(0.34 * LIGHT_MAX).toFixed(3)})`);
  g.addColorStop(1, "rgba(255,240,190,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);

  // a faint top-down wash so the top of the screen reads as sky
  const top = ctx.createLinearGradient(0, 0, 0, vh);
  top.addColorStop(0, `rgba(255,240,190,${(0.07 * LIGHT_MAX).toFixed(3)})`);
  top.addColorStop(1, "rgba(255,240,190,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, vw, vh);
}

function organic(ctx: CanvasRenderingContext2D, o: Organic, ox: number, oy: number, s: number, selected: boolean): void {
  const cx = ox + o.x * s, cy = oy + o.y * s;
  const r = Math.max(2, o.size * s);

  ctx.fillStyle = "rgba(120,220,150,0.16)";
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2); ctx.fill();

  if (selected) {
    ctx.strokeStyle = "rgba(255,215,110,0.75)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.55, 0, Math.PI * 2); ctx.stroke();
  }

  // a little cluster of leaves, so a bush reads as a plant rather than a stain
  ctx.fillStyle = "rgba(88,186,116,0.85)";
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.25, r * 0.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(120,214,142,0.9)";
  ctx.beginPath(); ctx.arc(cx - r * 0.55, cy - r * 0.15, r * 0.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r * 0.55, cy - r * 0.1, r * 0.65, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(196,248,206,0.85)";
  ctx.beginPath(); ctx.arc(cx - r * 0.2, cy - r * 0.45, r * 0.34, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r * 0.3, cy - r * 0.5, r * 0.26, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = "rgba(74,120,80,0.9)";
  ctx.lineWidth = Math.max(1, r * 0.16);
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.5);
  ctx.lineTo(cx, cy + r * 1.05);
  ctx.stroke();
}

function blob(ctx: CanvasRenderingContext2D, c: Creature, ox: number, oy: number, s: number, tick: number, selected: boolean): void {
  const cx = ox + c.x * s;
  const cy = oy + c.y * s;
  const r = (c.size * s) / 2 * 0.92;
  const breath = 1 + Math.sin(tick * 0.22 + c.id) * 0.025;   // she breathes

  for (const m of c.mutations) if (m.leg) drawLeg(ctx, c, m.leg, ox, oy, s);

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

  for (const m of c.mutations) drawMutation(ctx, m.id, cx, cy, r, tick, c.angle);

  // The tag sits up-left of the body: below is taken by the leg, above by the sprout.
  const tag = nameTag(ctx, "Плюша", cx - r * 1.05, cy - r * 1.5, r);
  if (selected) selectionFrame(ctx, cx, cy, r, tag);
}

// A rigid stick from the hinge to the tip; a filled foot means it holds the ground.
function drawLeg(ctx: CanvasRenderingContext2D, c: Creature, leg: LegState, ox: number, oy: number, s: number): void {
  const a = attachPoint(c, leg.attach), t = legTip(c, leg);
  const ax = ox + a.x * s, ay = oy + a.y * s;
  const tx = ox + t.x * s, ty = oy + t.y * s;
  const r = (c.size * s) / 2;
  const width = Math.max(2, r * 0.22);

  ctx.strokeStyle = "rgba(8,12,20,0.55)";
  ctx.lineWidth = width + 2;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(tx, ty); ctx.stroke();

  ctx.strokeStyle = "#8fb8ff";
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.lineCap = "butt";

  const foot = Math.max(2.5, r * 0.17);
  if (leg.grabbed) {
    ctx.fillStyle = "#ffd76e";
    ctx.beginPath(); ctx.arc(tx, ty, foot, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.strokeStyle = "rgba(255,215,110,0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(tx, ty, foot, 0, Math.PI * 2); ctx.stroke();
  }
}

// A thin frame around the whole creature — the body, the sprout and the label.
function selectionFrame(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, tag: TagRect,
): void {
  const pad = Math.max(4, r * 0.28);
  const left = Math.min(cx - r - pad, tag.left - pad * 0.5);
  const right = cx + r + pad;
  const top = Math.min(cy - r * 1.72 - pad * 0.5, tag.top - pad * 0.5);
  const bottom = cy + r + pad;

  ctx.strokeStyle = "rgba(255,215,110,0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(left, top, right - left, bottom - top, 8);
  ctx.stroke();
}

// Every mutation must be visible. A new one gets its own case here.
function drawMutation(ctx: CanvasRenderingContext2D, id: string, cx: number, cy: number, r: number, tick: number, angle: number): void {
  switch (id) {
    case "photosynthesis": {
      const sway = Math.sin(tick * 0.08) * 0.1;     // the sprout leans in the "wind"
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);                            // the sprout marks which way the body faces
      const baseY = -r * 0.84;                      // top of the head
      const tipY = -r * 1.34;                       // stem tip
      ctx.strokeStyle = "#5fb96f";
      ctx.lineWidth = Math.max(1, r * 0.07);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, baseY);
      ctx.quadraticCurveTo(r * 0.1, (baseY + tipY) / 2, 0, tipY);
      ctx.stroke();
      ctx.lineCap = "butt";
      leaf(ctx, 0, tipY, r * 0.52, -0.55 + sway);
      leaf(ctx, 0, tipY, r * 0.52, Math.PI + 0.55 - sway);
      ctx.restore();
      break;
    }
    case "mouth": {
      // a small mouth on the front of the body, opened and closed with the tick
      const open = 0.35 + 0.25 * Math.sin(tick * 0.35);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.fillStyle = "rgba(20,26,40,0.85)";
      ctx.beginPath();
      ctx.ellipse(r * 0.62, 0, r * 0.1, r * 0.26 * open + r * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,215,110,0.5)";
      ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.beginPath();
      ctx.ellipse(r * 0.62, 0, r * 0.1, r * 0.26 * open + r * 0.05, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case "push": {
      // a little tail fin at the back: it pushes the body the way it faces
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.fillStyle = "rgba(143,184,255,0.55)";
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, 0);
      ctx.lineTo(-r * 1.5, -r * 0.34);
      ctx.lineTo(-r * 1.5, r * 0.34);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
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

type TagRect = { left: number; top: number; right: number; bottom: number };

function nameTag(ctx: CanvasRenderingContext2D, text: string, right: number, top: number, r: number): TagRect {
  const font = Math.max(10, Math.round(r * 0.6));
  ctx.font = `${font}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = "right";
  const w = ctx.measureText(text).width;
  const left = right - w - 10;
  const box = { left, top, right: left + w + 10, bottom: top + font + 6 };
  ctx.fillStyle = "rgba(13,15,22,0.8)";
  ctx.fillRect(left, top, w + 10, font + 6);
  ctx.fillStyle = "rgba(255,215,110,0.9)";
  ctx.fillText(text, right - 5, top + font + 1);
  return box;
}
