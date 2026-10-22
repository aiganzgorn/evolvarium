// Pure simulation core — NO DOM, NO canvas, runs headless in Node.
// The world is plain coordinates in abstract units (one 1440×900 screen). No cells.
import { mulberry32, type Rng } from "./rng.ts";
import type { Genome } from "./genome.ts";
import type { Mutation } from "./mutations.ts";
import { photosynthesis, mouth, push, leg, mutationCost } from "./mutations.ts";
import {
  W, H, SIZE, MEM_CELLS, START_ENERGY, HEAD_MAX, PACKET_MAX,
  JUMP_COST, USE_COST, ORG_BASE, BASE_GENOME,
  LIGHT_MIN, LIGHT_MAX, LIGHT_PERIOD, LIGHT_BAND, LEG_MIN, LEG_MAX,
  BUSHES, ORGANIC_CELLS, ORGANIC_SIZE, SEED_SIZE, ORGANIC_GROW, ORGANIC_MAX,
  ORGANIC_SEED_MIN, ORGANIC_SEED_GROWN, MAX_ORGANICS, ORGANIC_SEED_SHARE, SEED_ENERGY, SEED_DIST, SEED_CROWD, SEED_NEIGHBOURS, SEED_NEIGHBOURS_R, PUSH_DIST,
} from "./config.ts";

// --- brain language ----------------------------------------------------------
// A cell is one decimal number, read in groups of two digits after the first:
//   0                    rest (costs nothing)
//   1 tt                 jump to cell tt          100 -> cell 0, 155 -> cell 55
//   2 ii p1 p2 p3 p4     use mutation ii with four params, each 00..99
//                        200 = mutation 00, no params
//                        20101120000 = mutation 01, params 01 12 00 00
//   3                    plant a seed (organics only)
// Trailing zero params may be dropped: 2010112 means the same as 20101120000.
export const OP_REST = 0;
export const OP_JUMP = 1;
export const OP_USE = 2;
export const OP_SEED = 3;
export const PARAMS = 4;
export const ENERGY_COST: Record<number, number> = {
  [OP_REST]: 0, [OP_JUMP]: JUMP_COST, [OP_USE]: USE_COST,
};

export const opOf = (cell: number): number =>
  cell < 10 ? cell : cell >= 200 ? OP_USE : cell >= 100 ? OP_JUMP : OP_REST;

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
  id: number;
  x: number;
  y: number;
  energy: number;
  size: number;       // grows from SEED_SIZE to ORGANIC_SIZE
  mem: number[];      // ORGANIC_CELLS cells
  pc: number;
};

export type World = {
  rng: Rng;
  tick: number;
  creatures: Creature[];
  organics: Organic[];
  nextOrganicId: number;
  nextCreatureId: number;
};

// An organic's brain: six turns of light, one seed, and back to the start.
export function plantMemory(): number[] {
  const mem = new Array<number>(ORGANIC_CELLS).fill(OP_REST);
  for (let i = 0; i < ORGANIC_CELLS - 2; i++) mem[i] = useCell(0);   // photosynthesis
  mem[ORGANIC_CELLS - 2] = OP_SEED;                                  // 3 — plant a seed
  mem[ORGANIC_CELLS - 1] = jumpCell(0);
  return mem;
}

// A hand-written two-legged walker: fuel, then a full step on each leg.
// While a leg holds the ground its turn swings the body; while it is free the
// same turn swings only the leg. Two turns of each kind bring both back, so the
// pair of legs stays symmetric and the body keeps its heading.
export function demoMemory(): number[] {
  const mem = new Array<number>(MEM_CELLS).fill(OP_REST);
  let i = 0;
  for (let k = 0; k < 20; k++) mem[i++] = useCell(0);           // photosynthesis (a weak trickle)

  const turn = (which: number, dir: 1 | 2, deg: number) => { mem[i++] = useCell(which, [dir, deg]); };
  const cycle = (which: number, dir: 1 | 2, other: 1 | 2, deg: number) => {
    mem[i++] = useCell(which, [3]);                              // 03 grab the ground
    turn(which, dir, deg);                                       // body swings
    mem[i++] = useCell(which, [4]);                              // 04 let go
    turn(which, other, deg);                                     // leg swings back
    mem[i++] = useCell(which, [3]);                              // grab again
    turn(which, other, deg);                                     // body swings back
    mem[i++] = useCell(which, [4]);                              // let go
    turn(which, dir, deg);                                       // and the leg comes home
  };
  cycle(1, 2, 1, 40);                                            // left leg
  cycle(2, 1, 2, 40);                                            // right leg, the other way
  mem[i++] = useCell(3);                                         // 03 mouth: bite a bush
  mem[i++] = useCell(3);                                         // ...again
  mem[i++] = useCell(3);
  mem[i++] = useCell(4, [PUSH_DIST]);                            // 04 push: shove forward
  mem[i] = jumpCell(0);                                          // and start over
  return mem;
}

// Random memory from a seed: mostly nonsense, but always with a little fuel.
export function randomMemory(rng: Rng): number[] {
  const mem = new Array<number>(MEM_CELLS).fill(OP_REST);
  for (let i = 0; i < MEM_CELLS; i++) {
    const r = rng();
    if (r < 0.50) mem[i] = OP_REST;
    else if (r < 0.72) mem[i] = useCell(0);                                  // photosynthesis
    else if (r < 0.86) {
      const which = 1 + Math.floor(rng() * 2);                               // leg 01 or 02
      const action = 1 + Math.floor(rng() * 4);                              // 01..04
      const degrees = 3 + Math.floor(rng() * 12);
      mem[i] = useCell(which, [action, degrees]);
    } else if (r < 0.93) mem[i] = useCell(3, [0, 0, 0, 0]);                   // mouth
    else if (r < 0.98) mem[i] = useCell(4, [PUSH_DIST, 0, 0, 0]);             // push
    else mem[i] = jumpCell(Math.floor(rng() * MEM_CELLS));                    // jump anywhere
  }
  mem[MEM_CELLS - 1] = jumpCell(0);                        // always come back around
  for (let i = 0; i < 3; i++) mem[i] = useCell(0);         // a bit of fuel to start with
  return mem;
}

// Legs: born at a length drawn from the seed, and that is what gets inherited.
function bornLegs(rng: Rng): Mutation[] {
  const legs = [leg(-1), leg(1)];
  for (const m of legs) {
    const t = rng();
    m.leg!.length = Math.round(LEG_MIN + t * (LEG_MAX - LEG_MIN));
  }
  return legs;
}

export function createWorld(seed = 1, count = 1): World {
  const rng = mulberry32(seed);
  const world: World = {
    rng, tick: 0, creatures: [], organics: [], nextOrganicId: 0, nextCreatureId: 0,
  };
  for (let i = 0; i < count; i++) {
    world.creatures.push({
      id: world.nextCreatureId++,
      x: W / 2,
      y: H / 2,
      angle: 0,
      size: SIZE,
      genome: { ...BASE_GENOME },
      brain: { mem: randomMemory(rng), pc: 0, energy: START_ENERGY, packet: { energy: 0, last: null } },
      mutations: [photosynthesis(), ...bornLegs(rng), mouth(), push()],
    });
  }
  // A couple of bushes to start with, scattered by the seed.
  for (let i = 0; i < BUSHES; i++) {
    const x = ORGANIC_SIZE + rng() * (W - ORGANIC_SIZE * 2);
    const y = ORGANIC_SIZE + rng() * (H - ORGANIC_SIZE * 2);
    world.organics.push({
      id: world.nextOrganicId++,
      x, y,
      energy: ORGANIC_MAX * (0.4 + rng() * 0.4),
      size: ORGANIC_SIZE * (0.7 + rng() * 0.3),
      mem: plantMemory(),
      pc: Math.floor(rng() * ORGANIC_CELLS),
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

// --- world helpers -----------------------------------------------------------
// The bright band's centre in world units; it sweeps left to right and wraps.
export function lightCenter(world: World): number {
  const band = W * LIGHT_BAND;
  const travel = W + band;
  const phase = (world.tick % LIGHT_PERIOD) / LIGHT_PERIOD;
  return ((phase * travel + W / 2 + band / 2) % travel) - band / 2;
}

// Local light under (x): the band gives 100%, the shade gives 10%.
export function lightAt(world: World, x: number): number {
  const band = W * LIGHT_BAND;
  const d = Math.min(1, Math.abs(x - lightCenter(world)) / (band / 2));
  const glow = 0.5 * (1 + Math.cos(Math.PI * d));    // 1 in the middle, 0 at the edge
  return LIGHT_MIN + (LIGHT_MAX - LIGHT_MIN) * glow;
}

// --- snapshots ---------------------------------------------------------------
// A whole world state, deep-copied, so the UI can step backwards.
export type Snapshot = {
  tick: number;
  creatures: Creature[];
  organics: Organic[];
  nextOrganicId: number;
  nextCreatureId: number;
};

// shortcut: the rng's own state is not copied — stepWorld draws no randomness
// (seeds use a hash of id and tick), so rewinding stays exact. If the rng is ever
// used inside a tick, snapshot its state here too.
export function snapshot(world: World): Snapshot {
  return {
    tick: world.tick,
    creatures: world.creatures.map(copyCreature),
    organics: world.organics.map(copyOrganic),
    nextOrganicId: world.nextOrganicId,
    nextCreatureId: world.nextCreatureId,
  };
}

export function restore(world: World, s: Snapshot): void {
  world.tick = s.tick;
  world.creatures = s.creatures.map(copyCreature);
  world.organics = s.organics.map(copyOrganic);
  world.nextOrganicId = s.nextOrganicId;
  world.nextCreatureId = s.nextCreatureId;
}

function copyOrganic(o: Organic): Organic {
  return { ...o, mem: o.mem.slice() };
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

// The tick drives the brains of creatures and the tiny brains of plants.
export function stepWorld(world: World): void {
  if (world.creatures.length === 0 && world.organics.length === 0) return;   // nothing alive
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
      const index = mutationOf(cell);
      const m = c.mutations[index];
      const params = paramsOf(cell);
      pay(b, mutationCost(m, params));
      const result = m
        ? m.act({ self: c, world, light: lightAt(world, c.x), params, packet: b.packet })
        : 0;
      b.packet.energy = Math.min(PACKET_MAX, b.packet.energy + result);
      b.packet.last = { label: m ? m.label : `мутации ${index} нет`, amount: result };
    }
    b.pc = next;
    if (b.pc === 0) flush(b);
  }

  stepOrganics(world);                                   // plants grow and seed first
  for (const c of world.creatures) {                     // then the fallen become new plants
    if (c.brain.energy > 0) continue;
    if (world.organics.length >= MAX_ORGANICS) continue; // the field is full
    world.organics.push(organic(world, c.x, c.y, ORG_BASE + Math.max(0, c.brain.energy), SEED_SIZE, plantMemory()));
  }
  world.creatures = world.creatures.filter(c => c.brain.energy > 0);

  if (world.creatures.length === 0) respawn(world);      // the last one dies — a new one arrives
}

// A fresh Плюша, hatched from a hash of the tick: no shared rng, so rewind stays exact.
function respawn(world: World): void {
  const rng = mulberry32(world.tick * 2654435761 + world.nextCreatureId * 40503);
  const x = SIZE + rng() * (W - SIZE * 2);
  const y = SIZE + rng() * (H - SIZE * 2);
  world.creatures.push({
    id: world.nextCreatureId++,
    x, y,
    angle: 0,
    size: SIZE,
    genome: { ...BASE_GENOME },
    brain: { mem: randomMemory(rng), pc: 0, energy: START_ENERGY, packet: { energy: 0, last: null } },
    mutations: [photosynthesis(), ...bornLegs(rng), mouth(), push()],
  });
}

function organic(world: World, x: number, y: number, energy: number, size: number, mem: number[]): Organic {
  return { id: world.nextOrganicId++, x, y, energy, size, mem, pc: 0 };
}

// Plants: grow, photosynthesise, and now and then drop a seed.
function stepOrganics(world: World): void {
  for (const o of [...world.organics]) {                 // the new seeds wait for the next tick
    if (o.energy <= 0) continue;
    o.size = Math.min(ORGANIC_SIZE, o.size + ORGANIC_GROW);

    const cell = o.mem[o.pc];
    const op = opOf(cell);
    const next = (o.pc + 1) % ORGANIC_CELLS;

    if (op === OP_JUMP) {
      o.pc = jumpTarget(cell) % ORGANIC_CELLS;
      continue;
    }
    if (op === OP_USE) {
      // plants do not pay for their own light; they just grow toward the sun
      o.energy = Math.min(ORGANIC_MAX, o.energy + 2 * lightAt(world, o.x));
    } else if (op === OP_SEED) {
      plantSeed(world, o);
    }
    o.pc = next;
  }
  world.organics = world.organics.filter(o => o.energy > 0);
}

// Half the energy goes into a seed; the seed starts with a tenth of it, nearby.
function plantSeed(world: World, o: Organic): void {
  if (world.organics.length >= MAX_ORGANICS) return;                       // no room
  if (o.size < ORGANIC_SIZE * ORGANIC_SEED_GROWN) return;                  // not grown yet
  if (o.energy < ORGANIC_SEED_MIN) return;                                 // not enough fuel
  const left = o.energy * SEED_ENERGY;
  o.energy -= o.energy * ORGANIC_SEED_SHARE;

  const a = seedAngle(o, world.tick);
  const dist = o.size / 2 + SEED_DIST;
  const x = Math.max(ORGANIC_SIZE, Math.min(W - ORGANIC_SIZE, o.x + Math.cos(a) * dist));
  const y = Math.max(ORGANIC_SIZE, Math.min(H - ORGANIC_SIZE, o.y + Math.sin(a) * dist));
  const crowded = world.organics.some(p =>
    Math.hypot(p.x - x, p.y - y) < ORGANIC_SIZE * SEED_CROWD);
  if (crowded) return;                                                     // no room here

  const neighbours = world.organics.filter(p =>
    Math.hypot(p.x - x, p.y - y) < SEED_NEIGHBOURS_R).length;
  if (neighbours >= SEED_NEIGHBOURS) return;                               // this patch is full

  world.organics.push(organic(world, x, y, left, SEED_SIZE, plantMemory()));
}

// Deterministic "random" direction: no rng, so snapshots stay exact.
function seedAngle(o: Organic, tick: number): number {
  const v = Math.sin(o.id * 127.1 + tick * 311.7) * 43758.5453;
  return (v - Math.floor(v)) * Math.PI * 2;
}
