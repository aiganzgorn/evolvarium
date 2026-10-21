// Mutations: traits the brain can call. Pure logic only — visuals live in render.ts.
import type { Creature, World } from "./sim.ts";

export type MutationContext = {
  self: Creature;
  world: World;
  light: number;      // 0..1
};

export type Mutation = {
  id: string;                                     // also the visual key in render.ts
  label: string;
  act: (ctx: MutationContext) => number;          // result handed back to the brain
};

export const PHOTOSYNTHESIS: Mutation = {
  id: "photosynthesis",
  label: "Фотосинтез",
  act: ({ light }) => 2 * light,                  // 2 energy at 100% light, 0 at 0%
};
