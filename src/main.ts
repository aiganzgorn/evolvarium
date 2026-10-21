// Browser entry point: canvas, resize, fixed-rate loop, the click-to-peek panel.
import { createWorld, stepWorld, opOf, type Creature } from "./sim.ts";
import { draw, viewTransform } from "./render.ts";
import { TICK_HZ, MEM_CELLS, HEAD_MAX, PACKET_MAX } from "./config.ts";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const tickEl = $("tick"), nEl = $("n"), seedEl = $("seed"), stateEl = $("state");
const hintEl = $("hint"), energyEl = $("energy"), packetEl = $("packet");
const orgEl = $("org"), lightEl = $("light");
const panel = $("panel"), pEnergy = $("penergy"), pMax = $("pmax"), pPc = $("ppc");
const pPacket = $("ppacket"), pPackMax = $("ppackmax"), pLast = $("plast");
const pMut = $("pmut"), pMem = $("pmem"), pMemCount = $("pmemcount");

const seed = Number(new URLSearchParams(location.search).get("seed")) || 1;
const world = createWorld(seed);
seedEl.textContent = String(seed);
nEl.textContent = String(world.creatures.length);
lightEl.textContent = `${Math.round(world.light * 100)}%`;

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

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// --- panel -------------------------------------------------------------------
const cells: HTMLDivElement[] = [];
pMemCount.textContent = String(MEM_CELLS);
for (let i = 0; i < MEM_CELLS; i++) {
  const d = document.createElement("div");
  d.className = "cell";
  d.textContent = "0";
  pMem.append(d);
  cells.push(d);
}

const OPS: Record<number, string> = { 0: "отдых", 1: "прыжок", 2: "мутация" };

function fillMutations(p: Creature): void {
  pMut.replaceChildren();
  if (p.mutations.length === 0) {
    const row = document.createElement("div");
    row.className = "note";
    row.textContent = "нет";
    pMut.append(row);
    return;
  }
  p.mutations.forEach((m, i) => {
    const row = document.createElement("div");
    row.className = "mut";
    const idx = document.createElement("span");
    idx.className = "idx";
    idx.textContent = String(i);
    const name = document.createElement("b");
    name.textContent = m.label;
    const cmd = document.createElement("span");
    cmd.className = "cmd";
    cmd.textContent = `  команда ${2 + i * 10}`;
    row.append(idx, name, cmd);
    pMut.append(row);
  });
}

function paintPanel(): void {
  const p = world.creatures[0];
  if (!p) { panel.hidden = true; return; }
  const b = p.brain;

  pEnergy.textContent = fmt(b.energy);
  pMax.textContent = String(HEAD_MAX);
  pPc.textContent = `${b.pc} · ${OPS[opOf(b.mem[b.pc])] ?? "?"}`;
  pPacket.textContent = fmt(b.packet.energy);
  pPackMax.textContent = String(PACKET_MAX);
  pLast.textContent = b.packet.last
    ? `${b.packet.last.label} ${b.packet.last.amount >= 0 ? "+" : ""}${fmt(b.packet.last.amount)}`
    : "—";

  for (let i = 0; i < MEM_CELLS; i++) {
    const v = b.mem[i], op = opOf(v), el = cells[i];
    const text = String(v);
    if (el.textContent !== text) el.textContent = text;
    const cls = "cell" + (op === 2 ? " use" : op === 1 ? " jump" : "") + (i === b.pc ? " pc" : "");
    if (el.className !== cls) el.className = cls;
  }
}

function openPanel(): void {
  const p = world.creatures[0];
  if (!p) return;
  fillMutations(p);
  panel.hidden = false;
  paintPanel();
}

let peekOpen = false;
$("pclose").addEventListener("click", () => { peekOpen = false; panel.hidden = true; });

canvas.addEventListener("click", (e) => {
  const p = world.creatures[0];
  if (!p) return;
  const { s, ox, oy } = viewTransform(innerWidth, innerHeight);
  const wx = (e.clientX - ox) / s, wy = (e.clientY - oy) / s;
  if (Math.hypot(wx - p.x, wy - p.y) <= p.size / 2) {
    peekOpen = !peekOpen;
    if (peekOpen) openPanel(); else panel.hidden = true;
  } else {
    peekOpen = false;
    panel.hidden = true;
  }
});

// --- loop --------------------------------------------------------------------
const TICK_MS = 1000 / TICK_HZ;
let acc = 0;
let last = performance.now();
let shownTick = -1;
let paused = true;                    // the world starts frozen and waits for a key press
let started = false;

function setPaused(v: boolean): void {
  paused = v;
  acc = 0;                            // drop the backlog so we don't jump on resume
  stateEl.textContent = v ? "пауза (пробел)" : "идёт (пробел)";
  stateEl.style.color = v ? "#ffd76e" : "";
  hintEl.style.display = v && !started ? "" : "none";
}

addEventListener("keydown", (e) => {
  if (e.code !== "Space") return;
  e.preventDefault();
  if (world.creatures.length === 0) return;   // nothing left to run
  if (paused) started = true;
  setPaused(!paused);
});

setPaused(true);

function frame(now: number): void {
  acc = paused ? 0 : acc + (now - last);
  last = now;
  let guard = 0;                       // never freeze on a long tab switch
  while (acc >= TICK_MS && guard++ < 5) { stepWorld(world); acc -= TICK_MS; }

  draw(ctx, world, innerWidth, innerHeight);
  if (world.tick !== shownTick) {
    shownTick = world.tick;
    tickEl.textContent = `тик ${world.tick}`;
    if (peekOpen) paintPanel();
  }

  const p = world.creatures[0];
  nEl.textContent = String(world.creatures.length);
  orgEl.textContent = String(world.organics.length);
  energyEl.textContent = p ? fmt(p.brain.energy) : "—";
  packetEl.textContent = p ? fmt(p.brain.packet.energy) : "—";
  if (!p) { stateEl.textContent = "все умерли"; stateEl.style.color = "#ff8a8a"; hintEl.style.display = "none"; }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
