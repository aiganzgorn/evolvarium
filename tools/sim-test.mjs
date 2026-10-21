// Headless self-check of the pure simulation core.
import assert from "node:assert/strict";
import {
  createWorld, stepWorld, snapshot, restore, opOf, argOf, useCell, mutationOf, actionOf,
  OP_REST, OP_JUMP, OP_USE,
} from "../src/sim.ts";
import { attachPoint, legTip } from "../src/mutations.ts";
import {
  W, H, SIZE, MEM_CELLS, START_ENERGY, HEAD_MAX, PACKET_MAX, JUMP_COST, USE_COST, LIGHT, ORG_BASE,
  LEG_LENGTH, LEG_STEP,
} from "../src/config.ts";

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
// Mutation objects carry functions, so deepEqual can only compare the data.
const shape = (w) => w.creatures.map(c => ({
  id: c.id, x: c.x, y: c.y, angle: c.angle, size: c.size, genome: c.genome,
  brain: c.brain, legs: c.mutations.map(m => m.leg ?? null),
}));

// --- shape -------------------------------------------------------------------
const a = createWorld(42);
assert.equal(a.creatures.length, 1, "в мире одна Плюша");

const p = a.creatures[0];
assert.deepEqual([p.x, p.y], [W / 2, H / 2], "стоит по центру");
assert.equal(p.size, SIZE, "размер задан в координатах");
assert.equal(p.brain.mem.length, MEM_CELLS, "память на 60 ячеек");
assert.equal(p.brain.energy, START_ENERGY, "энергия на старте");
assert.equal(p.brain.packet.energy, 0, "пакет пуст");
assert.equal(a.light, LIGHT, "глобальный свет");
assert.deepEqual(p.mutations.map(m => m.id), ["photosynthesis", "leg"], "две мутации");
assert.equal(opOf(p.brain.mem[0]), OP_USE, "программа начинается с фотосинтеза");
assert.equal(mutationOf(argOf(p.brain.mem[0])), 0, "первая ячейка — мутация 0");
assert.ok(p.brain.mem.filter(v => v === useCell(1, 2)).length >= 2, "в программе минимум два захвата");
assert.ok(p.brain.mem.includes(useCell(1, 0)) && p.brain.mem.includes(useCell(1, 1)), "повороты в обе стороны");
assert.equal(p.brain.mem.filter(v => opOf(v) === OP_JUMP).length, 1, "ровно один прыжок");
assert.equal(p.brain.mem[MEM_CELLS - 1], OP_JUMP, "последняя ячейка — прыжок в начало");

// --- photosynthesis: 2 energy at 100% light, so 1.5 at 75% --------------------
const photo = p.mutations[0];
const act = (self, mut, action, light) => mut.act({ self, world: a, light, action });
assert.equal(act(p, photo, 0, 1), 2, "100% света — 2");
assert.equal(act(p, photo, 0, 0), 0, "0% света — 0");
assert.equal(act(p, photo, 0, 0.75), 1.5, "75% света — 1.5");

// --- leg: a stick that turns, grabs the ground and drags the body -------------
const lw = createWorld(5);
const c = lw.creatures[0];
const legMut = c.mutations[1];
const doAction = (action) => legMut.act({ self: c, world: lw, light: lw.light, action });
const leg = legMut.leg;

assert.ok(leg && !leg.grabbed, "ножка есть и землю не держит");
assert.equal(leg.length, LEG_LENGTH, "длина задана при рождении");
assert.equal(leg.angle, 0, "стартовый угол");

const startTip = legTip(c, leg);
doAction(0);                                            // turn while free
assert.ok(near(leg.angle, LEG_STEP), "свободный поворот меняет угол ножки");
assert.ok(near(c.x, W / 2) && near(c.y, H / 2), "тело при этом стоит");
assert.ok(near(c.angle, 0), "и не вращается");

for (let i = 0; i < 40; i++) doAction(0);
assert.ok(near(leg.angle, Math.PI), "угол упирается в 180°");

const lw2 = createWorld(5);
const c2 = lw2.creatures[0];
const m2 = c2.mutations[1];
const act2 = (action) => m2.act({ self: c2, world: lw2, light: lw2.light, action });
const tipBefore = legTip(c2, m2.leg);
act2(2);                                                // grab
assert.ok(m2.leg.grabbed, "земля схвачена");
assert.deepEqual([m2.leg.x, m2.leg.y], [tipBefore.x, tipBefore.y], "точка захвата — кончик ножки");
assert.ok(near(Math.hypot(m2.leg.x - attachPoint(c2).x, m2.leg.y - attachPoint(c2).y), LEG_LENGTH), "ножка не растянулась");

const anchor = { x: m2.leg.x, y: m2.leg.y };
const before = { x: c2.x, y: c2.y, angle: c2.angle };
act2(0);                                                // turn while grabbed
assert.ok(near(c2.angle, before.angle + LEG_STEP), "тело повернулось вместе с ножкой");
assert.ok(!near(c2.x, before.x) || !near(c2.y, before.y), "тело сдвинулось");
assert.ok(near(c2.x - anchor.x, (before.x - anchor.x) * Math.cos(LEG_STEP) - (before.y - anchor.y) * Math.sin(LEG_STEP)), "поворот вокруг точки захвата");
assert.ok(near(Math.hypot(c2.x - anchor.x, c2.y - anchor.y), Math.hypot(before.x - anchor.x, before.y - anchor.y)), "радиус поворота сохранён");

act2(3);                                                // release
assert.ok(!m2.leg.grabbed, "земля отпущена");
const freeBefore = { x: c2.x, y: c2.y };
act2(0);
assert.ok(near(c2.x, freeBefore.x) && near(c2.y, freeBefore.y), "без захвата тело больше не едет");

// length belongs to the mutation, not to the world
const lw3 = createWorld(5);
const c3 = lw3.creatures[0], m3 = c3.mutations[1];
m3.leg.length = 140;
const t3 = legTip(c3, m3.leg);
assert.ok(near(Math.hypot(t3.x - attachPoint(c3).x, t3.y - attachPoint(c3).y), 140), "длинная ножка достаёт дальше");
m3.leg.length = 20;
const t4 = legTip(c3, m3.leg);
assert.ok(near(Math.hypot(t4.x - attachPoint(c3).x, t4.y - attachPoint(c3).y), 20), "короткая — ближе");

// --- the starting program comes from the seed ---------------------------------
const seedA = createWorld(7), seedB = createWorld(7), seedC = createWorld(8);
assert.deepEqual(seedA.creatures[0].brain.mem, seedB.creatures[0].brain.mem, "один seed — одна программа");
assert.notDeepEqual(seedA.creatures[0].brain.mem, seedC.creatures[0].brain.mem, "другой seed — другая программа");

// --- she walks: the swing reverses every step, so the body stays upright ------
const walk = (seed, ticks) => {
  const w = createWorld(seed);
  const start = { x: w.creatures[0].x, y: w.creatures[0].y };
  let last = { x: start.x, y: start.y, angle: 0 };
  let died = 0;
  for (let t = 0; t < ticks; t++) {
    stepWorld(w);
    const c = w.creatures[0];
    if (!c) { died = t + 1; break; }
    last = { x: c.x, y: c.y, angle: c.angle };
  }
  return { start, last, died };
};

for (const seed of [1, 3, 7, 42]) {
  const r = walk(seed, 400);
  const moved = Math.hypot(r.last.x - r.start.x, r.last.y - r.start.y);
  assert.ok(moved > 25, `seed ${seed}: ушла на ${moved.toFixed(1)} ед.`);
  assert.ok(Math.abs(r.last.angle) < 1e-6, `seed ${seed}: повороты гасятся, тело не кувыркается (${r.last.angle})`);
}

// --- a hand-built program: photosynthesis pays for the leg --------------------
const w = createWorld(1);
const mem = w.creatures[0].brain.mem;
const program = [
  useCell(0), useCell(0), useCell(0), useCell(0),   // four calls of photosynthesis
  useCell(1, 2), useCell(1, 0), useCell(1, 3),      // grab, one turn, let go
];
mem.fill(OP_REST);
program.forEach((v, i) => { mem[i] = v; });
mem[MEM_CELLS - 1] = OP_JUMP;

for (let i = 0; i < MEM_CELLS; i++) stepWorld(w);
let b = w.creatures[0].brain;
assert.equal(w.tick, MEM_CELLS, "прошёл один проход");
assert.equal(b.pc, 0, "вернулась в первую ячейку");
assert.equal(b.packet.energy, 0, "пакет опустошён на переходе");
assert.ok(near(b.energy, START_ENERGY + 6 - 8), `за проход ${START_ENERGY + 6 - 8}, а не ${b.energy}`);

// --- death, organic left behind, and the world stops --------------------------
const dying = createWorld(1);
dying.creatures[0].brain.mem.fill(OP_JUMP);            // 1 energy per tick, nothing comes back
const dieAt = START_ENERGY / JUMP_COST;
for (let i = 0; i < dieAt - 1; i++) stepWorld(dying);
assert.equal(dying.creatures.length, 1, "ещё жива перед последним тиком");
stepWorld(dying);
assert.equal(dying.creatures.length, 0, "на нуле энергии умерла");
assert.equal(dying.tick, dieAt, "умерла ровно на своём тике");
assert.equal(dying.organics.length, 1, "оставила органику");
assert.equal(dying.organics[0].amount, ORG_BASE, "органика = ORG_BASE + оставшаяся энергия");

// the world stops when the last creature dies, and organic does not pile up
const frozen = dying.tick;
for (let i = 0; i < 50; i++) stepWorld(dying);
assert.equal(dying.tick, frozen, "без живых тик стоит");
assert.equal(dying.organics.length, 1, "органика не копится");

// --- costs: packet first, head only when it is empty --------------------------
const poor = createWorld(1);
poor.creatures[0].brain.mem.fill(OP_REST);
poor.creatures[0].brain.mem[0] = useCell(5);           // mutation 5 does not exist
stepWorld(poor);
assert.equal(poor.creatures[0].brain.energy, START_ENERGY - USE_COST, "неизвестная мутация стоит энергии");
assert.equal(poor.creatures[0].brain.packet.energy, 0, "и ничего не возвращает");

// --- determinism -------------------------------------------------------------
const x = createWorld(42), y = createWorld(42);
for (let i = 0; i < 300; i++) { stepWorld(x); stepWorld(y); }
assert.deepEqual(shape(x), shape(y), "один seed — одно состояние");

// --- rewind: a snapshot goes back exactly where it came from -------------------
const rew = createWorld(3);
for (let i = 0; i < 10; i++) stepWorld(rew);
const snap = snapshot(rew);
for (let i = 0; i < 15; i++) stepWorld(rew);
assert.notEqual(rew.tick, snap.tick, "после 15 тиков состояние ушло вперёд");

restore(rew, snap);
assert.equal(rew.tick, snap.tick, "вернулись на тот же тик");

const ref = createWorld(3);
for (let i = 0; i < 10; i++) stepWorld(ref);
assert.deepEqual(rew.creatures[0].brain, ref.creatures[0].brain, "мозг восстановлен бит в бит");
assert.deepEqual(rew.creatures[0].mutations.map(m => m.leg), ref.creatures[0].mutations.map(m => m.leg), "состояние ножки восстановлено");

for (let i = 0; i < 40; i++) { stepWorld(ref); stepWorld(rew); }
assert.deepEqual(shape(rew), shape(ref), "после отката мир идёт тем же путём");

// a snapshot is not a live view: later ticks must not change it
const keep = snapshot(rew);
const keptTick = keep.tick, keptEnergy = keep.creatures[0].brain.energy;
for (let i = 0; i < 30; i++) stepWorld(rew);
assert.equal(keep.tick, keptTick, "снимок не изменился");
assert.equal(keep.creatures[0].brain.energy, keptEnergy, "энергия в снимке не изменилась");

console.log(`ok — фотосинтез 1.5 при 75%, ножка ${LEG_LENGTH} ед., программа из сида, потолки ${HEAD_MAX}/${PACKET_MAX}, смерть и остановка мира`);
