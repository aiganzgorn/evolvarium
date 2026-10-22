// Browser entry point: canvas, resize, fixed-rate loop, the click-to-peek panel.
import {
  createWorld, stepWorld, snapshot, restore, opOf, mutationOf, paramsOf, jumpTarget,
  jumpCell, useCell, demoMemory, randomMemory, lightAt, OP_REST,
  type Creature, type Snapshot,
} from "./sim.ts";
import { mulberry32 } from "./rng.ts";
import { draw, viewTransform, type Selection } from "./render.ts";
import {
  TICK_HZ, MEM_CELLS, HEAD_MAX, PACKET_MAX, HISTORY_TICKS, W, RESPAWN,
  ORGANIC_MAX, ORGANIC_SIZE, ORGANIC_SEED_MIN, ORGANIC_SEED_SHARE, SEED_ENERGY,
  SEED_NEIGHBOURS, SEED_NEIGHBOURS_R,
} from "./config.ts";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const tickEl = $("tick"), nEl = $("n"), seedEl = $("seed"), stateEl = $("state");
const hintEl = $("hint"), energyEl = $("energy"), packetEl = $("packet");
const orgEl = $("org"), lightEl = $("light"), histEl = $("hist");
const panel = $("panel"), pEnergy = $("penergy"), pMax = $("pmax"), pPc = $("ppc");
const pPacket = $("ppacket"), pPackMax = $("ppackmax"), pLast = $("plast");
const pMut = $("pmut"), pMem = $("pmem"), pMemCount = $("pmemcount");

const seed = Number(new URLSearchParams(location.search).get("seed")) || 1;
const world = createWorld(seed);
seedEl.textContent = String(seed);
nEl.textContent = String(world.creatures.length);
lightEl.textContent = `${Math.round(lightAt(world, W / 2) * 100)}%`;

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
// Selection is either Плюша or a bush — both have a brain, so both can be inspected.
type Sel = Selection;
let sel: Sel = null;

const cells: HTMLDivElement[] = [];
let cellCount = 0;

function buildCells(n: number, editable: boolean): void {
  if (cellCount === n) { gridEditable = editable; return; }
  cellCount = n;
  gridEditable = editable;
  cells.length = 0;
  pMem.replaceChildren();
  for (let i = 0; i < n; i++) {
    const d = document.createElement("div");
    d.className = "cell";
    d.dataset.i = String(i);
    d.textContent = "0";
    d.addEventListener("click", () => { if (gridEditable) selectCell(i); });
    pMem.append(d);
    cells.push(d);
  }
  pMemCount.textContent = String(n);
}
let gridEditable = true;

const OPS: Record<number, string> = { 0: "отдых", 1: "прыжок", 2: "мутация", 3: "семя" };

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
    const head = document.createElement("div");
    head.className = "mut";
    const idx = document.createElement("span");
    idx.className = "idx";
    idx.textContent = i.toString().padStart(2, "0");
    const name = document.createElement("b");
    name.textContent = m.label;
    head.append(idx, name);
    if (m.leg) {
      const size = document.createElement("span");
      size.className = "note";
      size.textContent = ` · ${Math.round(m.leg.length)} ед.`;
      head.append(size);
    }
    pMut.append(head);

    const hint = document.createElement("div");
    hint.className = "mut act";
    hint.textContent = m.hint;
    pMut.append(hint);
  });
}

// A cell as it reads in the grid: "2·01" (mutation), "1→07" (jump), "семя", "·".
function cellLabel(v: number): string {
  const op = opOf(v);
  if (op === 3) return "семя";
  if (op === 2) return `2·${String(mutationOf(v)).padStart(2, "0")}`;
  if (op === 1) return `1→${String(jumpTarget(v)).padStart(2, "0")}`;
  return "·";
}

function paintPanel(): void {
  const creature = sel?.kind === "creature" ? world.creatures.find(c => c.id === sel!.id) : undefined;
  const plant = sel?.kind === "organic" ? world.organics.find(o => o.id === sel!.id) : undefined;
  if (!creature && !plant) { panel.hidden = true; return; }

  const mem = creature ? creature.brain.mem : plant!.mem;
  const pc = creature ? creature.brain.pc : plant!.pc;

  $("pname").textContent = creature ? "Плюша" : `Куст #${plant!.id}`;
  pEnergy.textContent = fmt(creature ? creature.brain.energy : plant!.energy);
  $("pmaxlabel").textContent = creature ? "потолок головы" : "прочность";
  pMax.textContent = String(creature ? HEAD_MAX : ORGANIC_MAX);
  pPc.textContent = `${pc} · ${OPS[opOf(mem[pc])] ?? "?"}`;

  $("ppacketbox").hidden = !creature;
  $("pmutbox").hidden = !creature;
  $("pmemtools").hidden = !creature;
  if (creature) {
    const b = creature.brain;
    pPacket.textContent = fmt(b.packet.energy);
    pPackMax.textContent = String(PACKET_MAX);
    pLast.textContent = b.packet.last
      ? `${b.packet.last.label} ${b.packet.last.amount >= 0 ? "+" : ""}${fmt(b.packet.last.amount)}`
      : "—";
  }
  const rows = ["psizerow", "pseedmin", "pseedshare", "pseedchild", "pseednear"];
  for (const id of rows) $(id).hidden = !plant;
  $("legend").textContent = creature
    ? "2·NN — мутация NN · 1→NN — прыжок · · — отдых · клик по ячейке — правка"
    : "2·00 — фотосинтез · семя — посадить семечко · 1→NN — прыжок · только просмотр";
  if (plant) {
    $("psize").textContent = `${Math.round(plant.size)} / ${ORGANIC_SIZE}`;
    $("pseedminv").textContent = `${ORGANIC_SEED_MIN} · сейчас ${Math.round(plant.energy)}`;
    $("pseedsharev").textContent = `${Math.round(ORGANIC_SEED_SHARE * 100)}% энергии`;
    $("pseedchildv").textContent = `${Math.round(SEED_ENERGY * 100)}% от забранного`;
    $("pseednearv").textContent = `${SEED_NEIGHBOURS} куста в ${SEED_NEIGHBOURS_R} ед.`;
  }

  buildCells(mem.length, !!creature);
  for (let i = 0; i < mem.length; i++) {
    const v = mem[i], op = opOf(v), el = cells[i];
    const text = cellLabel(v);
    if (el.textContent !== text) el.textContent = text;
    const cls = "cell" + (op === 3 ? " seed" : op === 2 ? " use" : op === 1 ? " jump" : "") +
      (i === pc ? " pc" : "") + (i === selected ? " sel" : "");
    if (el.className !== cls) el.className = cls;
  }
  if (!creature) editor.hidden = true;
}

// --- cell editor -------------------------------------------------------------
const editor = $("editor"), edOp = $("edop") as unknown as HTMLSelectElement;
const edJumpBox = $("edjump"), edJump = $("edjumpn") as unknown as HTMLInputElement;
const edUse = $("eduse") as unknown as HTMLDivElement;
const edIdx = $("edidx") as unknown as HTMLInputElement;
const edParams = [1, 2, 3, 4].map(n => $(`edp${n}`) as unknown as HTMLInputElement);
let selected = -1;

const current = (): Creature | undefined => world.creatures[0];

function selectCell(i: number): void {
  const p = current();
  if (!p) return;
  selected = i;
  const v = p.brain.mem[i];
  edOp.value = String(opOf(v));
  edJump.value = String(jumpTarget(v));
  edIdx.value = String(mutationOf(v));
  const params = paramsOf(v);
  edParams.forEach((el, k) => { el.value = String(params[k]); });
  editor.hidden = false;
  $("edname").textContent = `ячейка ${i}`;
  syncEditor();
  paintPanel();
}

function syncEditor(): void {
  const op = Number(edOp.value);
  edJumpBox.hidden = op !== 1;
  edUse.hidden = op !== 2;
}

function writeCell(): void {
  const p = current();
  if (!p || selected < 0) return;
  const op = Number(edOp.value);
  const num = (el: HTMLInputElement, max: number): number =>
    Math.max(0, Math.min(max, Math.round(Number(el.value) || 0)));
  p.brain.mem[selected] =
    op === 1 ? jumpCell(num(edJump, 99))
    : op === 2 ? useCell(num(edIdx, 99), edParams.map(el => num(el, 99)))
    : OP_REST;
  paintPanel();
}

edOp.addEventListener("change", () => { syncEditor(); writeCell(); });
for (const el of [edJump, edIdx, ...edParams]) {
  el.addEventListener("input", writeCell);
}
for (const el of [edJump, edIdx, ...edParams]) {
  el.addEventListener("focus", () => {
    // clicking into a field should not lose the cell you are editing
  });
}

$("edrandom").addEventListener("click", () => {
  const p = current();
  if (!p) return;
  const seat = Math.floor(Math.random() * 1e9);
  p.brain.mem = randomMemory(mulberry32(seat));
  p.brain.pc = 0;
  seedEl.textContent = `🎲 ${seat}`;
  if (selected >= 0) selectCell(selected);
  paintPanel();
});

$("eddemo").addEventListener("click", () => {
  const p = current();
  if (!p) return;
  p.brain.mem = demoMemory();
  p.brain.pc = 0;
  seedEl.textContent = "демо";
  if (selected >= 0) selectCell(selected);
  paintPanel();
});

function openPanel(next: Sel): void {
  sel = next;
  selected = -1;
  if (next?.kind === "creature") {
    const p = world.creatures.find(c => c.id === next.id);
    if (p) fillMutations(p);
  }
  panel.hidden = false;
  paintPanel();
}

$("pclose").addEventListener("click", () => { sel = null; panel.hidden = true; });

canvas.addEventListener("click", (e) => {
  const { s, ox, oy } = viewTransform(innerWidth, innerHeight);
  const wx = (e.clientX - ox) / s, wy = (e.clientY - oy) / s;

  const creature = world.creatures[0];
  const plant = [...world.organics].reverse().find(o => Math.hypot(wx - o.x, wy - o.y) <= o.size * 1.2);

  const next: Sel =
    creature && Math.hypot(wx - creature.x, wy - creature.y) <= creature.size / 2
      ? { kind: "creature", id: creature.id }
      : plant ? { kind: "organic", id: plant.id } : null;

  if (!next) { sel = null; panel.hidden = true; return; }
  if (sel && sel.kind === next.kind && sel.id === next.id) {   // second click closes it
    sel = null;
    panel.hidden = true;
    return;
  }
  openPanel(next);
});

// --- loop --------------------------------------------------------------------
const TICK_MS = 1000 / TICK_HZ;
let acc = 0;
let last = performance.now();
let shownTick = -1;
let paused = true;                    // the world starts frozen and waits for a key press
let started = false;

// --- ticking with a rewind buffer ---------------------------------------------
const history: Snapshot[] = [];

function stepForward(): void {
  history.push(snapshot(world));
  if (history.length > HISTORY_TICKS) history.shift();
  stepWorld(world);
}

function stepBack(): void {
  const s = history.pop();
  if (s) restore(world, s);
}

function setPaused(v: boolean): void {
  paused = v;
  acc = 0;                            // drop the backlog so we don't jump on resume
  stateEl.textContent = v ? "пауза (пробел)" : "идёт (пробел)";
  stateEl.style.color = v ? "#ffd76e" : "";
  hintEl.style.display = v && !started ? "" : "none";
}

addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (!RESPAWN && world.creatures.length === 0 && world.organics.length === 0) return;   // nothing left to run
    if (paused) started = true;
    setPaused(!paused);
    return;
  }
  if (e.code === "ArrowRight" || e.code === "ArrowDown") {
    e.preventDefault();
    started = true;
    setPaused(true);                  // stepping by hand means you want it held
    stepForward();
    return;
  }
  if (e.code === "ArrowLeft" || e.code === "ArrowUp") {
    e.preventDefault();
    started = true;
    setPaused(true);
    stepBack();
  }
});

setPaused(true);

function frame(now: number): void {
  acc = paused ? 0 : acc + (now - last);
  last = now;
  let guard = 0;                       // never freeze on a long tab switch
  while (acc >= TICK_MS && guard++ < 5) { stepForward(); acc -= TICK_MS; }

  draw(ctx, world, innerWidth, innerHeight, sel);
  if (world.tick !== shownTick) {
    shownTick = world.tick;
    tickEl.textContent = `тик ${world.tick}`;
    if (sel) paintPanel();
  }

  const p = world.creatures[0];
  $("who").textContent = p ? "Плюша" : "мир";
  $("peek").hidden = !p;
  nEl.textContent = String(world.creatures.length);
  orgEl.textContent = String(world.organics.length);
  energyEl.textContent = p ? fmt(p.brain.energy) : "—";
  packetEl.textContent = p ? fmt(p.brain.packet.energy) : "—";
  histEl.textContent = String(history.length);
  lightEl.textContent = `${Math.round(lightAt(world, p ? p.x : W / 2) * 100)}%`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
