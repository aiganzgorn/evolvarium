// Mutations: traits the brain can call. Pure logic only — visuals live in render.ts.
import type { Creature, World } from "./sim.ts";
import { W, H, LEG_LENGTH, LEG_MAX, LEG_STEP_DEG, LEG_ATTACH, LEG_ATTACH_R, LEG_SPREAD } from "./config.ts";

export type Packet = { energy: number; last: { label: string; amount: number } | null };

export type MutationContext = {
  self: Creature;
  world: World;
  light: number;      // 0..1
  params: number[];   // four numbers 00..99 taken from the cell
  packet: Packet;     // mutations may read and spend it
};

export type LegState = {
  angle: number;      // relative to the body, clamped to ±180°
  grabbed: boolean;
  x: number;          // the ground point it holds, in world units
  y: number;
  length: number;     // fixed at birth, part of the mutation
  attach: number;     // hinge angle on the body, radians
};

export type Mutation = {
  id: string;          // also the visual key in render.ts
  label: string;
  hint: string;        // what the params mean, shown in the panel
  leg?: LegState;      // per-creature state, legs only
  act: (ctx: MutationContext) => number;   // result handed back to the brain
};

// --- photosynthesis ----------------------------------------------------------
export function photosynthesis(): Mutation {
  return {
    id: "photosynthesis",
    label: "Фотосинтез",
    hint: "параметры не используются",
    act: ({ light }) => 2 * light,              // 2 energy at 100% light, 0 at 0%
  };
}

// --- leg ---------------------------------------------------------------------
// A rigid stick, no joints: it can turn around its hinge on the body, grab the
// ground with its tip, and release it. While it holds the ground, turning it
// swings the whole body around that point instead of swinging the stick.
// Two legs sit on either side of the bottom; only one can hold the ground.
export function leg(side: -1 | 1 = -1): Mutation {
  const hinge = LEG_ATTACH + side * LEG_SPREAD;
  return {
    id: "leg",
    label: side < 0 ? "Ножка левая" : "Ножка правая",
    hint: "p1: 01 влево, 02 вправо, 03 схватить, 04 отпустить · p2: градусы (0 → 12)",
    leg: { angle: 0, grabbed: false, x: 0, y: 0, length: Math.min(LEG_LENGTH, LEG_MAX), attach: hinge },
    // state lives on `this`, so a copied mutation (rewind) keeps its own
    act({ self, params }) {
      const state = this.leg!;
      const action = params[0] ?? 0;
      const step = ((params[1] || LEG_STEP_DEG) * Math.PI) / 180;

      if (action === 3) {
        const tip = legTip(self, state);
        if (tip.x < 0 || tip.x > W || tip.y < 0 || tip.y > H) return 0;   // no hooking the void
        for (const other of self.mutations) {          // one foot on the ground at a time
          if (other !== this && other.leg) other.leg.grabbed = false;
        }
        state.x = tip.x;
        state.y = tip.y;
        state.grabbed = true;
      } else if (action === 4) {
        state.grabbed = false;
      } else if (action === 1 || action === 2) {
        const d = action === 1 ? -step : step;
        if (state.grabbed) rotateBodyAround(self, state, d);
        else {
          const next = Math.max(-Math.PI, Math.min(Math.PI, state.angle + d));
          if (tipFits(self, state, next)) state.angle = next;   // no reaching past the edge
        }
      }
      return 0;
    },
  };
}

// Where the leg is hinged on the body.
export function attachPoint(c: Creature, attach: number): { x: number; y: number } {
  const rad = (c.size / 2) * LEG_ATTACH_R;
  const a = c.angle + attach;
  return { x: c.x + Math.cos(a) * rad, y: c.y + Math.sin(a) * rad };
}

// Where the tip is: on the ground point it holds, or at the end of the stick.
export function legTip(c: Creature, s: LegState): { x: number; y: number } {
  if (s.grabbed) return { x: s.x, y: s.y };
  const a = attachPoint(c, s.attach);
  const len = Math.min(s.length, LEG_MAX);        // never longer than twice the body
  const dir = c.angle + s.attach + s.angle;
  return { x: a.x + Math.cos(dir) * len, y: a.y + Math.sin(dir) * len };
}

// The tip is nailed down, so turning the leg turns the whole body instead.
// It refuses when the body would be pushed out of the world.
function rotateBodyAround(c: Creature, s: LegState, d: number): void {
  const cos = Math.cos(d), sin = Math.sin(d);
  const dx = c.x - s.x, dy = c.y - s.y;
  const x = s.x + dx * cos - dy * sin;
  const y = s.y + dx * sin + dy * cos;
  const r = c.size / 2;
  if (x < r || x > W - r || y < r || y > H - r) return;   // the wall stops her
  c.x = x;
  c.y = y;
  c.angle += d;
}

// Can the tip sit at this angle without leaving the world?
function tipFits(c: Creature, s: LegState, angle: number): boolean {
  const a = attachPoint(c, s.attach);
  const dir = c.angle + s.attach + angle;
  const x = a.x + Math.cos(dir) * s.length;
  const y = a.y + Math.sin(dir) * s.length;
  return x >= 0 && x <= W && y >= 0 && y <= H;
}
