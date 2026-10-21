// Mutations: traits the brain can call. Pure logic only — visuals live in render.ts.
import type { Creature, World } from "./sim.ts";
import { LEG_LENGTH, LEG_STEP_DEG, LEG_ATTACH, LEG_ATTACH_R } from "./config.ts";

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
export function leg(): Mutation {
  return {
    id: "leg",
    label: "Ножка",
    hint: "p1: 01 влево, 02 вправо, 03 схватить, 04 отпустить · p2: градусы (0 → 12)",
    leg: { angle: 0, grabbed: false, x: 0, y: 0, length: LEG_LENGTH },
    // state lives on `this`, so a copied mutation (rewind) keeps its own
    act({ self, params }) {
      const state = this.leg!;
      const action = params[0] ?? 0;
      const step = ((params[1] || LEG_STEP_DEG) * Math.PI) / 180;

      if (action === 3) {
        const tip = legTip(self, state);
        state.x = tip.x;
        state.y = tip.y;
        state.grabbed = true;
      } else if (action === 4) {
        state.grabbed = false;
      } else if (action === 1 || action === 2) {
        const d = action === 1 ? -step : step;
        if (state.grabbed) rotateBodyAround(self, state, d);
        else state.angle = Math.max(-Math.PI, Math.min(Math.PI, state.angle + d));
      }
      return 0;
    },
  };
}

// Where the leg is hinged on the body.
export function attachPoint(c: Creature): { x: number; y: number } {
  const rad = (c.size / 2) * LEG_ATTACH_R;
  const a = c.angle + LEG_ATTACH;
  return { x: c.x + Math.cos(a) * rad, y: c.y + Math.sin(a) * rad };
}

// Where the tip is: on the ground point it holds, or at the end of the stick.
export function legTip(c: Creature, s: LegState): { x: number; y: number } {
  if (s.grabbed) return { x: s.x, y: s.y };
  const a = attachPoint(c);
  const dir = c.angle + LEG_ATTACH + s.angle;
  return { x: a.x + Math.cos(dir) * s.length, y: a.y + Math.sin(dir) * s.length };
}

// The tip is nailed down, so turning the leg turns the whole body instead.
function rotateBodyAround(c: Creature, s: LegState, d: number): void {
  const cos = Math.cos(d), sin = Math.sin(d);
  const dx = c.x - s.x, dy = c.y - s.y;
  c.x = s.x + dx * cos - dy * sin;
  c.y = s.y + dx * sin + dy * cos;
  c.angle += d;
}
