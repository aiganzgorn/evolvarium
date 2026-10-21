// Browser entry point: canvas, resize, fixed-rate loop.
import { createWorld, stepWorld, TICK_HZ } from "./sim.ts";
import { draw } from "./render.ts";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const tickEl = document.getElementById("tick")!;
const nEl = document.getElementById("n")!;
const seedEl = document.getElementById("seed")!;
const stateEl = document.getElementById("state")!;

const seed = Number(new URLSearchParams(location.search).get("seed")) || 1;
const world = createWorld(seed);
seedEl.textContent = String(seed);
nEl.textContent = String(world.creatures.length);

function resize(): void {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  canvas.style.width = innerWidth + "px";
  canvas.style.height = innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener("resize", resize);
resize();

const TICK_MS = 1000 / TICK_HZ;
let acc = 0;
let last = performance.now();
let shownTick = -1;
let paused = false;

function setPaused(v: boolean): void {
  paused = v;
  acc = 0;                            // drop the backlog so we don't jump on resume
  stateEl.textContent = v ? "пауза" : "идёт";
  stateEl.style.color = v ? "#ffd76e" : "";
}

addEventListener("keydown", (e) => {
  if (e.code !== "Space") return;
  e.preventDefault();
  setPaused(!paused);
});

function frame(now: number): void {
  acc = paused ? 0 : acc + (now - last);
  last = now;
  let guard = 0;                       // never freeze on a long tab switch
  while (acc >= TICK_MS && guard++ < 5) { stepWorld(world); acc -= TICK_MS; }

  draw(ctx, world, innerWidth, innerHeight);
  if (world.tick !== shownTick) { shownTick = world.tick; tickEl.textContent = `тик ${world.tick}`; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
