// Pure simulation core — NO DOM, NO canvas, runs headless in Node.
// The world is plain coordinates in abstract units (one 1440×900 screen). No cells.
import { mulberry32, type Rng } from "./rng.ts";
import { BASE_GENOME, type Genome } from "./genome.ts";

export const W = 1440, H = 900;
export const SIZE = 40;             // Плюша's diameter in world units (~40 px on a 1440×900 screen)
export const TICK_HZ = 20;

// --- brain -------------------------------------------------------------------
// One tick reads one memory cell. Cells hold plain numbers; the number IS the op.
export const MEM_CELLS = 60;
export const START_ENERGY = 20;
export const OP_REST = 0;           // "save energy": does nothing, costs nothing
export const OP_JUMP = 1;           // "go to cell N": N defaults to 0 (the first cell), costs 1
export const ENERGY_COST: Record<number, number> = { [OP_REST]: 0, [OP_JUMP]: 1 };

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

export type World = {
  rng: Rng;
  tick: number;
  creatures: Creature[];
};

function createBrain(): Brain {
  const mem = new Array<number>(MEM_CELLS).fill(OP_REST);
  mem[MEM_CELLS - 1] = OP_JUMP;     // full pass through memory costs 1 energy, then loop
  return { mem, pc: 0, energy: START_ENERGY };
}

export function createWorld(seed = 1, count = 1): World {
  const rng = mulberry32(seed);
  const world: World = { rng, tick: 0, creatures: [] };
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

  world.creatures = world.creatures.filter(c => c.brain.energy > 0);
}
