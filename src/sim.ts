// Pure simulation core — NO DOM, NO canvas, runs headless in Node.
import { mulberry32, type Rng } from "./rng.ts";
import { BASE_GENOME, type Genome } from "./genome.ts";

export const W = 120, H = 68;
export const HEAD = 10;             // Плюша's head spans 10×10 cells
export const TICK_HZ = 20;

export const DIRS = [
  [1, 0], [1, 1], [0, 1], [-1, 1],
  [-1, 0], [-1, -1], [0, -1], [1, -1],
] as const;

export type Creature = {
  id: number;
  x: number;          // top-left cell of the head box
  y: number;
  size: number;       // box edge in cells
  dir: number;
  t: number;          // ticks since the last step
  genome: Genome;
};

export type World = {
  rng: Rng;
  tick: number;
  creatures: Creature[];
};

export function createWorld(seed = 1, count = 1): World {
  const rng = mulberry32(seed);
  const world: World = { rng, tick: 0, creatures: [] };
  for (let i = 0; i < count; i++) {
    world.creatures.push({
      id: i,
      x: (rng() * (W - HEAD + 1)) | 0,
      y: (rng() * (H - HEAD + 1)) | 0,
      size: HEAD,
      dir: (rng() * DIRS.length) | 0,
      t: (rng() * 4) | 0,
      genome: { ...BASE_GENOME },
    });
  }
  return world;
}

export function stepWorld(world: World): void {
  world.tick++;
  for (const c of world.creatures) {
    c.t++;
    if (c.t < Math.max(1, Math.round(c.genome.speed))) continue;
    c.t = 0;
    if (world.rng() < c.genome.turn) c.dir = (world.rng() * DIRS.length) | 0;

    const [dx, dy] = DIRS[c.dir];
    const nx = c.x + dx, ny = c.y + dy;
    if (nx < 0 || ny < 0 || nx + c.size > W || ny + c.size > H) {   // wall: turn around instead of leaving the grid
      c.dir = (c.dir + 4) % DIRS.length;
      continue;
    }
    c.x = nx; c.y = ny;
  }
}
