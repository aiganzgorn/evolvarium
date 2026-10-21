// Pure simulation core — NO DOM, NO canvas, runs headless in Node.
// The world is plain coordinates in abstract units (one 1440×900 screen). No cells.
import { mulberry32, type Rng } from "./rng.ts";
import { BASE_GENOME, type Genome } from "./genome.ts";

export const W = 1440, H = 900;
export const SIZE = 120;            // Плюша's diameter in world units
export const TICK_HZ = 20;

export type Creature = {
  id: number;
  x: number;          // center
  y: number;
  size: number;       // diameter
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
      x: W / 2,
      y: H / 2,
      size: SIZE,
      genome: { ...BASE_GENOME },
    });
  }
  return world;
}

// Movement is off for now — the tick only drives breathing and blinking.
export function stepWorld(world: World): void {
  world.tick++;
}
