// Every tunable number of the project lives here — change them in one place.
import type { Genome } from "./genome.ts";

// world (abstract units: one 1440×900 screen)
export const W = 1440;
export const H = 900;
export const TICK_HZ = 20;

// Плюша
export const SIZE = 40;             // diameter in world units

// brain
export const MEM_CELLS = 60;
export const START_ENERGY = 100;
export const HEAD_MAX = 150;        // the head cannot hold more
export const PACKET_MAX = 50;       // the packet cannot carry more
export const JUMP_COST = 1;         // energy per "go to cell N"
export const USE_COST = 1;          // energy per "use mutation"

// light (a moving band sweeps left to right)
export const LIGHT = 0.85;          // base level, 0..1
export const LIGHT_MIN = 0.88;      // multiplier far from the bright band
export const LIGHT_MAX = 1.28;      // multiplier in the middle of it
export const LIGHT_PERIOD = 240;    // ticks for one full sweep (12 s at 20 Hz)
export const LIGHT_BAND = 0.62;     // bright band width, as a share of the world

// leg mutation
export const LEG_LENGTH = 70;                 // world units, fixed at birth
export const LEG_STEP_DEG = 12;               // how far one action turns it
export const LEG_ATTACH_DEG = 90;             // where it hangs: 90° = bottom of the body
export const LEG_SPREAD_DEG = 26;             // each leg's hinge is this far off the bottom
export const LEG_ATTACH_R = 0.85;             // attach point radius, as a share of the body radius
export const LEG_MAX = SIZE * 2;              // a leg is never longer than twice the body
export const LEG_MIN = SIZE;                  // ...and never shorter than the body
export const LEG_STEP = (LEG_STEP_DEG * Math.PI) / 180;
export const LEG_ATTACH = (LEG_ATTACH_DEG * Math.PI) / 180;
export const LEG_SPREAD = (LEG_SPREAD_DEG * Math.PI) / 180;

// death
export const ORG_BASE = 5;          // organic left behind = ORG_BASE + energy left

// debug
export const HISTORY_TICKS = 200;   // how many ticks you can rewind

// genome
export const BASE_GENOME: Genome = { speed: 3, turn: 0.18, hue: 200 };
export const MUTATION = { count: 3, chance: 0.2, size: 0.2 };
export type Mut = typeof MUTATION;
