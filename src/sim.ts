// Pure simulation core — NO DOM, NO canvas, runs headless in Node.
// The world is plain coordinates in abstract units (one 1440×900 screen). No cells.
import { mulberry32, type Rng } from "./rng.ts";
import type { Genome } from "./genome.ts";
import type { Mutation } from "./mutations.ts";
import { photosynthesis, leg } from "./mutations.ts";
import {
  W, H, SIZE, MEM_CELLS, START_ENERGY, HEAD_MAX, PACKET_MAX,
  JUMP_COST, USE_COST, LIGHT, ORG_BASE, BASE_GENOME,
} from "./config.ts";

// --- brain language ----------------------------------------------------------
// A memory cell is one number: the last digit is the op, the rest is the argument.
//   0 = rest (costs nothing), 1 = jump to cell <arg>,
//   2 = use mutation <arg % 10>, action <floor(arg / 10)>.
export const OP_REST = 0;
export const OP_JUMP = 1;
export const OP_USE = 2;
export const ENERGY_COST: Record<number, number> = {
  [OP_REST]: 0, [OP_JUMP]: JUMP_COST, [OP_USE]: USE_COST,
};

export const opOf = (cell: number): number => cell % 10;
export const argOf = (cell: number): number => Math.floor(cell / 10);
export const mutationOf = (arg: number): number => arg % 10;
export const actionOf = (arg: number): number => Math.floor(arg / 10);

// Builds the number that lives in a cell: "use mutation <i>, action <a>".
export const useCell = (i: number, a = 0): number => OP_USE + (i + a * 10) * 10;

export type Brain = {
  mem: number[];
  pc: number;
  energy: number;
  packet: {
    energy: number;                                    // travels between cells
    last: { label: string; amount: number } | null;    // what was put in last, for the panel
  };
};

export type Creature = {
  id: number;
  x: number;          // center
  y: number;
  angle: number;      // body orientation, radians (the leg turns the body)
  size: number;       // diameter
  genome: Genome;
  brain: Brain;
  mutations: Mutation[];
};

export type Organic = {
  x: number;          // where the body fell
  y: number;
  amount: number;
};

export type World = {
  rng: Rng;
  tick: number;
  light: number;      // 0..1, global for now
  creatures: Creature[];
  organics: Organic[];
};

// The starting program is drawn from the seed: same seed, same creature.
function createBrain(rng: Rng): Brain {
  const mem = new Array<number>(MEM_CELLS).fill(OP_REST);
  let i = 0;

  const photos = 5 + Math.floor(rng() * 8);                 // 5..12 turns of light
  for (let k = 0; k < photos && i < MEM_CELLS - 3; k++) mem[i++] = useCell(0);

  mem[i++] = useCell(1, 2);                                 // leg: grab the ground
  const turns = 3 + Math.floor(rng() * 5);                  // 3..7 turns -> the body swings
  for (let k = 0; k < turns && i < MEM_CELLS - 1; k++) mem[i++] = useCell(1, rng() < 0.25 ? 1 : 0);
  if (i < MEM_CELLS - 1) mem[i++] = useCell(1, 3);          // leg: let go

  mem[MEM_CELLS - 1] = OP_JUMP;                             // back to the first cell
  return { mem, pc: 0, energy: START_ENERGY, packet: { energy: 0, last: null } };
}

export function createWorld(seed = 1, count = 1): World {
  const rng = mulberry32(seed);
  const world: World = {
    rng, tick: 0, light: LIGHT, creatures: [], organics: [],
  };
  for (let i = 0; i < count; i++) {
    world.creatures.push({
      id: i,
      x: W / 2,
      y: H / 2,
      angle: 0,
      size: SIZE,
      genome: { ...BASE_GENOME },
      brain: createBrain(rng),
      mutations: [photosynthesis(), leg()],
    });
  }
  return world;
}

// Costs are paid from the packet first, and from the head only when it is empty.
function pay(b: Brain, cost: number): void {
  const fromPacket = Math.min(b.packet.energy, cost);
  b.packet.energy -= fromPacket;
  b.energy -= cost - fromPacket;
}

// Wrap to the first cell: what the packet carries goes back into the head, up to HEAD_MAX.
function flush(b: Brain): void {
  const moved = Math.min(HEAD_MAX - b.energy, b.packet.energy);
  b.energy += moved;
  b.packet.energy = Math.min(PACKET_MAX, b.packet.energy - moved);
  if (moved > 0) b.packet.last = null;
}

// --- snapshots ---------------------------------------------------------------
// A whole world state, deep-copied, so the UI can step backwards.
export type Snapshot = {
  tick: number;
  light: number;
  creatures: Creature[];
  organics: Organic[];
};

// shortcut: the rng's own state is not copied — fine while stepWorld draws no
// randomness; snapshot it here as soon as it does.
export function snapshot(world: World): Snapshot {
  return {
    tick: world.tick,
    light: world.light,
    creatures: world.creatures.map(copyCreature),
    organics: world.organics.map(o => ({ ...o })),
  };
}

export function restore(world: World, s: Snapshot): void {
  world.tick = s.tick;
  world.light = s.light;
  world.creatures = s.creatures.map(copyCreature);
  world.organics = s.organics.map(o => ({ ...o }));
}

function copyCreature(c: Creature): Creature {
  return {
    ...c,
    genome: { ...c.genome },
    brain: {
      ...c.brain,
      mem: c.brain.mem.slice(),
      packet: {
        energy: c.brain.packet.energy,
        last: c.brain.packet.last ? { ...c.brain.packet.last } : null,
      },
    },
    mutations: c.mutations.map(m => (m.leg ? { ...m, leg: { ...m.leg } } : m)),  // defs shared, state copied
  };
}

// Movement is off for now — the tick only drives the brain (and, in time, the body).
export function stepWorld(world: World): void {
  if (world.creatures.length === 0) return;   // everyone is dead: the loop stops
  world.tick++;

  for (const c of world.creatures) {
    const b = c.brain;
    const cell = b.mem[b.pc];
    const op = opOf(cell), arg = argOf(cell);
    let next = (b.pc + 1) % MEM_CELLS;

    if (op === OP_JUMP) {
      pay(b, JUMP_COST);
      next = arg % MEM_CELLS;
    } else if (op === OP_USE) {
      pay(b, USE_COST);
      const m = c.mutations[mutationOf(arg)];
      const act = actionOf(arg);
      const result = m ? m.act({ self: c, world, light: world.light, action: act }) : 0;
      b.packet.energy = Math.min(PACKET_MAX, b.packet.energy + result);
      b.packet.last = { label: m ? m.label : `мутации ${mutationOf(arg)} нет`, amount: result };
    }
    b.pc = next;
    if (b.pc === 0) flush(b);
  }

  for (const c of world.creatures) {
    if (c.brain.energy > 0) continue;
    world.organics.push({ x: c.x, y: c.y, amount: ORG_BASE + Math.max(0, c.brain.energy) });
  }
  world.creatures = world.creatures.filter(c => c.brain.energy > 0);
}
