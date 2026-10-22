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
  START_CREATURES, RESPAWN, PUSH_DIST,
  PLANT_CELLS, PLANT_SIZE, PLANTS, PLANT_MAX, PLANT_ENERGY_MAX, PLANT_SPROUT_COST,
  PLANT_SPROUT_TICKS, PLANT_GROW_TICKS, PLANT_MATURE_TICKS, PLANT_OLD_TICKS,
  PLANT_SEED_MIN, PLANT_SEED_SHARE, SEED_ENERGY, SEED_DIST, PLANT_MUTATE_CELLS,
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

export type PlantStage = "seed" | "sprout" | "mature" | "old";

// A plant is 2×2 world units — it never grows in size, only in stage. It has the
// same brain as Плюша (memory, pointer, energy, packet), just sixteen cells.
export type Plant = {
  id: number;
  x: number;
  y: number;
  stage: PlantStage;
  age: number;        // ticks spent in the current stage
  brain: Brain;
};

export type World = {
  rng: Rng;
  tick: number;
  creatures: Creature[];
  plants: Plant[];
  nextPlantId: number;
  nextCreatureId: number;
};

// A plant's brain: twelve turns of light, one seed, and back to the start.
export function plantMemory(): number[] {
  const mem = new Array<number>(PLANT_CELLS).fill(OP_REST);
  for (let i = 0; i < PLANT_CELLS - 4; i++) mem[i] = useCell(0);     // photosynthesis
  mem[PLANT_CELLS - 2] = OP_SEED;                                    // 3 — plant a seed
  mem[PLANT_CELLS - 1] = jumpCell(0);
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

export function createWorld(seed = 1, count = START_CREATURES, plants = PLANTS): World {
  const rng = mulberry32(seed);
  const world: World = {
    rng, tick: 0, creatures: [], plants: [], nextPlantId: 0, nextCreatureId: 0,
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
  // Plants scattered by the seed, in every stage, so the field reads at once.
  for (let i = 0; i < plants; i++) {
    const x = PLANT_SIZE + rng() * (W - PLANT_SIZE * 2);
    const y = PLANT_SIZE + rng() * (H - PLANT_SIZE * 2);
    const t = rng();
    const stage: PlantStage = t < 0.3 ? "seed" : t < 0.55 ? "sprout" : t < 0.85 ? "mature" : "old";
    world.plants.push({
      id: world.nextPlantId++,
      x, y,
      stage,
      age: Math.floor(rng() * 100),
      brain: {
        mem: plantMemory(),
        pc: Math.floor(rng() * PLANT_CELLS),
        energy: PLANT_ENERGY_MAX * (0.25 + rng() * 0.7),
        packet: { energy: 0, last: null },
      },
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
  plants: Plant[];
  nextPlantId: number;
  nextCreatureId: number;
};

// shortcut: the rng's own state is not copied — stepWorld draws no randomness
// (seeds use a hash of id and tick), so rewinding stays exact. If the rng is ever
// used inside a tick, snapshot its state here too.
export function snapshot(world: World): Snapshot {
  return {
    tick: world.tick,
    creatures: world.creatures.map(copyCreature),
    plants: world.plants.map(copyPlant),
    nextPlantId: world.nextPlantId,
    nextCreatureId: world.nextCreatureId,
  };
}

export function restore(world: World, s: Snapshot): void {
  world.tick = s.tick;
  world.creatures = s.creatures.map(copyCreature);
  world.plants = s.plants.map(copyPlant);
  world.nextPlantId = s.nextPlantId;
  world.nextCreatureId = s.nextCreatureId;
}

function copyPlant(p: Plant): Plant {
  return { ...p, brain: { ...p.brain, mem: p.brain.mem.slice(), packet: { ...p.brain.packet } } };
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

  stepPlants(world);                                     // plants grow and seed first
  for (const c of world.creatures) {                     // then the fallen leave a seed
    if (c.brain.energy > 0) continue;
    addPlant(world, c.x, c.y, "seed", ORG_BASE + Math.max(0, c.brain.energy), plantMemory());
  }
  world.creatures = world.creatures.filter(c => c.brain.energy > 0);

  if (RESPAWN && world.creatures.length === 0) respawn(world);   // the last one dies — a new one arrives
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

function addPlant(world: World, x: number, y: number, stage: PlantStage, energy: number, mem: number[]): Plant {
  const p: Plant = {
    id: world.nextPlantId++,
    x: Math.max(PLANT_SIZE, Math.min(W - PLANT_SIZE, x)),
    y: Math.max(PLANT_SIZE, Math.min(H - PLANT_SIZE, y)),
    stage,
    age: 0,
    brain: { mem, pc: 0, energy, packet: { energy: 0, last: null } },
  };
  world.plants.push(p);
  return p;
}

// Plants: a seed spends energy to become a sprout; the rest breathe light with the
// same interpreter as Плюша, and only a mature plant may drop a seed.
function stepPlants(world: World): void {
  for (const p of [...world.plants]) {                   // the new seeds wait for the next tick
    p.age++;
    const b = p.brain;

    if (p.stage === "seed") {
      b.energy -= PLANT_SPROUT_COST / PLANT_SPROUT_TICKS; // it lives off its reserves
      if (p.age >= PLANT_SPROUT_TICKS && b.energy > 0) { p.stage = "sprout"; p.age = 0; }
    } else {
      runPlantCell(world, p);
      if (p.stage === "sprout" && p.age >= PLANT_GROW_TICKS) { p.stage = "mature"; p.age = 0; }
      else if (p.stage === "mature" && p.age >= PLANT_MATURE_TICKS) { p.stage = "old"; p.age = 0; }
      else if (p.stage === "old" && p.age >= PLANT_OLD_TICKS) b.energy = 0;
    }
  }
  world.plants = world.plants.filter(p => p.brain.energy > 0);
}

// shortcut: the plant interpreter repeats the creature one instead of sharing it —
// plants have no costs, no death-by-mutation and no packet flush of their own. If a
// third kind of brain appears, factor both into one runner.
function runPlantCell(world: World, p: Plant): void {
  const b = p.brain;
  const cell = b.mem[b.pc];
  const op = opOf(cell);

  if (op === OP_JUMP) {
    b.pc = jumpTarget(cell) % PLANT_CELLS;
    return;
  }
  if (op === OP_USE) {
    const gain = 2 * lightAt(world, p.x);               // a plant's light is free
    b.packet.energy = Math.min(PACKET_MAX, b.packet.energy + gain);
    b.packet.last = { label: "Свет", amount: gain };
    b.energy = Math.min(PLANT_ENERGY_MAX, b.energy + b.packet.energy);
    b.packet.energy = 0;
  } else if (op === OP_SEED) {
    trySeed(world, p);
  }
  b.pc = (b.pc + 1) % PLANT_CELLS;
}

// Only a mature plant with fuel makes a seed, and the child is not a copy:
// a few cells of its memory are rewritten.
function trySeed(world: World, p: Plant): void {
  if (p.stage !== "mature") return;
  if (p.brain.energy < PLANT_SEED_MIN) return;
  if (world.plants.length >= PLANT_MAX) return;

  const taken = p.brain.energy * PLANT_SEED_SHARE;
  p.brain.energy -= taken;

  const a = hashAngle(p.id, world.tick);
  addPlant(
    world,
    p.x + Math.cos(a) * SEED_DIST,
    p.y + Math.sin(a) * SEED_DIST,
    "seed",
    taken * SEED_ENERGY,
    mutateMemory(p.brain.mem, p.id, world.tick),
  );
}

// The child's memory: the parent's, with a few cells rewritten.
function mutateMemory(parent: number[], a: number, b: number): number[] {
  const rng = mulberry32(a * 7919 + b * 104729 + 13);
  const mem = parent.slice();
  for (let k = 0; k < PLANT_MUTATE_CELLS; k++) {
    const i = Math.floor(rng() * mem.length);
    const t = rng();
    mem[i] = t < 0.6 ? useCell(0) : t < 0.75 ? OP_REST : t < 0.88 ? OP_SEED : jumpCell(Math.floor(rng() * mem.length));
  }
  return mem;
}

// Deterministic "random" direction: no rng, so snapshots stay exact.
function hashAngle(id: number, tick: number): number {
  const v = Math.sin(id * 127.1 + tick * 311.7) * 43758.5453;
  return (v - Math.floor(v)) * Math.PI * 2;
}
