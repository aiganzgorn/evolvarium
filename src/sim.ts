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
// A cell is one decimal number, read in groups of two digits after the first:
//   0                    rest (costs nothing)
//   1 tt                 jump to cell tt          100 -> cell 0, 155 -> cell 55
//   2 ii p1 p2 p3 p4     use mutation ii with four params, each 00..99
//                        200 = mutation 00, no params
//                        20101120000 = mutation 01, params 01 12 00 00
// Trailing zero params may be dropped: 2010112 means the same as 20101120000.
export const OP_REST = 0;
export const OP_JUMP = 1;
export const OP_USE = 2;
export const PARAMS = 4;
export const ENERGY_COST: Record<number, number> = {
  [OP_REST]: 0, [OP_JUMP]: JUMP_COST, [OP_USE]: USE_COST,
};

export const opOf = (cell: number): number =>
  cell >= 200 ? OP_USE : cell >= 100 ? OP_JUMP : OP_REST;

// "20101120000" -> [1, 1, 12, 0, 0]; an odd tail is padded from the left
function groups(cell: number): number[] {
  let digits = String(Math.floor(cell)).slice(1);
  if (digits.length % 2) digits = "0" + digits;
  const out: number[] = [];
  for (let i = 0; i < digits.length; i += 2) out.push(Number(digits.slice(i, i + 2)));
  return out;
}

export const mutationOf = (cell: number): number => groups(cell)[0] ?? 0;
export const paramsOf = (cell: number): number[] => {
  const g = groups(cell).slice(1);
  return Array.from({ length: PARAMS }, (_, i) => g[i] ?? 0);
};
export const jumpTarget = (cell: number): number => cell % 100;

export const jumpCell = (target: number): number => OP_JUMP * 100 + (target % 100);
export const useCell = (index: number, params: number[] = []): number =>
  Number(String(OP_USE) + [index, ...params].map(v => String(v % 100).padStart(2, "0")).join(""));

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

// A hand-written walker: fuel, then one step — hook, swing, let go, swing back.
// The swings cancel, so the body stays upright; the step repeats every 29 ticks.
export function demoMemory(): number[] {
  const mem = new Array<number>(MEM_CELLS).fill(OP_REST);
  let i = 0;
  for (let k = 0; k < 20; k++) mem[i++] = useCell(0);           // photosynthesis
  mem[i++] = useCell(1, [3]);                                   // 03 grab the ground
  mem[i++] = useCell(1, [2, 48]);                               // 02 turn right 48°
  mem[i++] = useCell(1, [4]);                                   // 04 let go
  mem[i++] = useCell(1, [1, 48]);                               // 01 swing the leg back
  mem[i++] = useCell(1, [3]);                                   // 03 grab again
  mem[i++] = useCell(1, [1, 48]);                               // body swings the other way
  mem[i++] = useCell(1, [4]);                                   // 04 let go
  mem[i++] = useCell(1, [2, 48]);                               // re-aim the leg
  mem[i] = jumpCell(0);                                         // and start over
  return mem;
}

// Random memory from a seed: mostly nonsense, but always with a little fuel.
export function randomMemory(rng: Rng): number[] {
  const mem = new Array<number>(MEM_CELLS).fill(OP_REST);
  for (let i = 0; i < MEM_CELLS; i++) {
    const r = rng();
    if (r < 0.55) mem[i] = OP_REST;
    else if (r < 0.75) mem[i] = useCell(0);                                  // photosynthesis
    else if (r < 0.95) {
      const action = 1 + Math.floor(rng() * 4);                              // leg: 01..04
      const degrees = 3 + Math.floor(rng() * 12);
      mem[i] = useCell(1, [action, degrees]);
    } else mem[i] = jumpCell(Math.floor(rng() * MEM_CELLS));                  // jump anywhere
  }
  mem[MEM_CELLS - 1] = jumpCell(0);                        // always come back around
  for (let i = 0; i < 3; i++) mem[i] = useCell(0);         // a bit of fuel to start with
  return mem;
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
      brain: { mem: randomMemory(rng), pc: 0, energy: START_ENERGY, packet: { energy: 0, last: null } },
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
    const op = opOf(cell);
    let next = (b.pc + 1) % MEM_CELLS;

    if (op === OP_JUMP) {
      pay(b, JUMP_COST);
      next = jumpTarget(cell) % MEM_CELLS;
    } else if (op === OP_USE) {
      pay(b, USE_COST);
      const index = mutationOf(cell);
      const m = c.mutations[index];
      const result = m
        ? m.act({ self: c, world, light: world.light, params: paramsOf(cell), packet: b.packet })
        : 0;
      b.packet.energy = Math.min(PACKET_MAX, b.packet.energy + result);
      b.packet.last = { label: m ? m.label : `мутации ${index} нет`, amount: result };
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
