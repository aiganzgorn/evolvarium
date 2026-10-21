// Pure simulation core — NO DOM, NO canvas, runs headless in Node.
import { mulberry32, type Rng } from "./rng.ts";
import { BASE_GENOME, type Genome } from "./genome.ts";

export const W = 120, H = 68;
export const HEAD = 10;             // Плюша's head spans 10×10 cells
export const TICK_HZ = 20;

export type Creature = {
  id: number;
  x: number;          // top-left cell of the head box
  y: number;
  size: number;       // box edge in cells
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
      x: Math.round((W - HEAD) / 2),
      y: Math.round((H - HEAD) / 2),
      size: HEAD,
      genome: { ...BASE_GENOME },
    });
  }
  return world;
}

// Movement is off for now — the tick only drives breathing and blinking.
export function stepWorld(world: World): void {
  world.tick++;
}
