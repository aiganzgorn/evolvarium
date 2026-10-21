// Genome of one creature. Genetics only — no rendering, no DOM.
// The genes do not affect anything yet: movement is off, so speed/turn have no effect.
import type { Rng } from "./rng.ts";

export const GENOME_FIELDS = ["speed", "turn", "hue"] as const;
export type Genome = { speed: number; turn: number; hue: number };

export const BASE_GENOME: Genome = { speed: 3, turn: 0.18, hue: 200 };

export const GENOME_LABELS: Record<keyof Genome, string> = {
  speed: "Скорость",
  turn: "Вёрткость",
  hue: "Окрас",
};

// how many genes may mutate, per-gene chance, and relative step size
export const DEFAULT_MUT = { count: GENOME_FIELDS.length, chance: 0.2, size: 0.2 };
export type Mut = typeof DEFAULT_MUT;

export function mutate(rng: Rng, g: Genome, mut: Mut = DEFAULT_MUT): Genome {
  const out: Genome = { ...g };
  let done = 0;
  for (const key of GENOME_FIELDS) {
    if (done >= mut.count) break;
    if (rng() < mut.chance) {
      out[key] = g[key] * (rng() < 0.5 ? 1 - mut.size : 1 + mut.size);
      done++;
    }
  }
  out.speed = Math.min(12, Math.max(1, out.speed));
  out.turn = Math.min(1, Math.max(0, out.turn));
  out.hue = (out.hue % 360 + 360) % 360;
  return out;
}

export const genomeColor = (g: Genome): string => `hsl(${g.hue} 72% 62%)`;
