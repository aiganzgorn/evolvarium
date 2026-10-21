// Pure simulation core — NO DOM, NO canvas, runs headless in Node.
// The world is plain coordinates in abstract units (one 1440×900 screen). No cells.
import { mulberry32, type Rng } from "./rng.ts";
import type { Genome } from "./genome.ts";
import {
  W, H, SIZE, MEM_CELLS, START_ENERGY, JUMP_COST, ORG_BASE, BASE_GENOME,
} from "./config.ts";

// --- brain language ----------------------------------------------------------
// One tick reads one memory cell. The number in the cell IS the op.
export const OP_REST = 0;           // "save energy": does nothing, costs nothing
export const OP_JUMP = 1;           // "go to cell N": N defaults to 0 (the first cell)
export const ENERGY_COST: Record<number, number> = { [OP_REST]: 0, [OP_JUMP]: JUMP_COST };

export type Brain = {
  mem: number[];
  pc: number;
  energy: number;
};

export type Creature = {
  id: number;
  x: number;          // center
  y: number;
  size: number;       // diameter
  genome: Genome;
  brain: Brain;
  mutations: string[];  // traits the brain will drive once there are ops for them
};

export type Organic = {
  x: number;          // where the body fell
  y: number;
  amount: number;
};

export type World = {
  rng: Rng;
  tick: number;
  creatures: Creature[];
  organics: Organic[];
};

function createBrain(): Brain {
  const mem = new Array<number>(MEM_CELLS).fill(OP_REST);
  mem[MEM_CELLS - 1] = OP_JUMP;     // a full pass through memory costs one jump
  return { mem, pc: 0, energy: START_ENERGY };
}

export function createWorld(seed = 1, count = 1): World {
  const rng = mulberry32(seed);
  const world: World = { rng, tick: 0, creatures: [], organics: [] };
  for (let i = 0; i < count; i++) {
    world.creatures.push({
      id: i,
      x: W / 2,
      y: H / 2,
      size: SIZE,
      genome: { ...BASE_GENOME },
      brain: createBrain(),
      mutations: [],
    });
  }
  return world;
}

// Movement is off for now — the tick only drives the brain (and, in time, the body).
export function stepWorld(world: World): void {
  if (world.creatures.length === 0) return;   // everyone is dead: the loop stops
  world.tick++;

  for (const c of world.creatures) {
    const b = c.brain;
    if (b.mem[b.pc] === OP_JUMP) { b.energy -= ENERGY_COST[OP_JUMP]; b.pc = 0; }
    else b.pc = (b.pc + 1) % MEM_CELLS;
  }

  for (const c of world.creatures) {
    if (c.brain.energy > 0) continue;
    world.organics.push({ x: c.x, y: c.y, amount: ORG_BASE + Math.max(0, c.brain.energy) });
  }
  world.creatures = world.creatures.filter(c => c.brain.energy > 0);
}
