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
export const HEAD_MAX = 1000;       // the head cannot hold more
export const PACKET_MAX = 50;       // the packet cannot carry more
export const JUMP_COST = 1;         // energy per "go to cell N"
export const USE_COST = 1;          // energy per "use mutation"

// light (a moving band sweeps left to right)
export const LIGHT_MIN = 0.10;      // darkest: 10% of full light
export const LIGHT_MAX = 1.00;      // brightest: 100%
export const LIGHT_PERIOD = 240;    // ticks for one full sweep (12 s at 20 Hz)
export const LIGHT_BAND = 0.9;      // bright band width, as a share of the world (a longer day)

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

// life at the start: 0 creatures and 0 bushes means an empty world.
// Put 1 / 2 / true back to bring life in.
export const START_CREATURES = 0;      // how many Плюши are born at the start
export const RESPAWN = false;          // a new Плюша after the last one dies

// plants: 2×2 pixels each, sixteen cells of memory, four stages
export const PLANT_CELLS = 16;
export const PLANT_SIZE = 2;           // world units — exactly 2×2 pixels on the reference screen
export const PLANTS = 240;             // seeds and young plants scattered at the start
export const PLANT_MAX = 4000;         // hard cap so the field cannot explode
export const PLANT_ENERGY_MAX = 40;    // a plant cannot store more
export const PLANT_SPROUT_COST = 6;    // energy a seed spends to become a sprout
export const PLANT_SPROUT_TICKS = 60;  // ...spread over this many ticks
export const PLANT_GROW_TICKS = 180;   // sprout → mature
export const PLANT_MATURE_TICKS = 600; // mature → old
export const PLANT_OLD_TICKS = 300;    // old → gone
export const PLANT_SEED_MIN = 24;      // no seed below this energy
export const PLANT_SEED_SHARE = 0.5;   // part of the parent's energy that goes to the seed
export const SEED_ENERGY = 0.6;        // the child gets this share of what was taken
export const SEED_DIST = 14;           // how far the seed lands from the parent
export const PLANT_MUTATE_CELLS = 4;   // how many cells of the child's memory differ

// photosynthesis and the rest of the mutation economy
export const PHOTO_GAIN = 3;        // income = PHOTO_GAIN × light
export const PHOTO_COST = 1;        // ...and one call costs this
export const LEG_TURN_COST = 0;     // swinging a free leg is free
export const LEG_HOLD_COST = 1;     // grabbing or releasing the ground costs

// feeding and shoving
export const EAT_RANGE = 10;        // gap between her rim and the bush rim
export const EAT_RATE = 8;          // most energy one bite can take
export const EAT_COST = 2;          // a bite is work
export const PUSH_DIST = 28;        // how far one shove moves the body
export const PUSH_COST = 2;         // ...and a shove is work too

// death
export const ORG_BASE = 5;          // a fallen Плюша leaves a seed with this much energy

// debug
export const HISTORY_TICKS = 200;   // how many ticks you can rewind

// genome
export const BASE_GENOME: Genome = { speed: 3, turn: 0.18, hue: 200 };
export const MUTATION = { count: 3, chance: 0.2, size: 0.2 };
export type Mut = typeof MUTATION;
