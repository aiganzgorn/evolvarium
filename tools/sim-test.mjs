// Headless self-check of the pure simulation core.
import assert from "node:assert/strict";
import { createWorld, stepWorld, opOf, argOf, OP_REST, OP_JUMP, OP_USE } from "../src/sim.ts";
import {
  W, H, SIZE, MEM_CELLS, START_ENERGY, HEAD_MAX, PACKET_MAX, JUMP_COST, USE_COST, LIGHT, ORG_BASE,
} from "../src/config.ts";

const near = (a, b) => Math.abs(a - b) < 1e-9;

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
assert.equal(p.mutations.length, 1, "одна мутация");
assert.equal(p.mutations[0].id, "photosynthesis", "это фотосинтез");
assert.equal(opOf(p.brain.mem[0]), OP_USE, "первая ячейка — использование мутации");
assert.equal(argOf(p.brain.mem[0]), 0, "параметр — индекс мутации 0");
assert.equal(p.brain.mem[MEM_CELLS - 1], OP_JUMP, "последняя ячейка — прыжок в начало");

// --- photosynthesis: 2 energy at 100% light, so 1.5 at 75% --------------------
assert.equal(p.mutations[0].act({ self: p, world: a, light: 1 }), 2, "100% света — 2");
assert.equal(p.mutations[0].act({ self: p, world: a, light: 0 }), 0, "0% света — 0");
assert.equal(p.mutations[0].act({ self: p, world: a, light: 0.75 }), 1.5, "75% света — 1.5");

// --- first use: pay from the head, result goes into the packet -----------------
const w = createWorld(1);
stepWorld(w);
let b = w.creatures[0].brain;
assert.equal(b.energy, START_ENERGY - USE_COST, "использование стоит USE_COST");
assert.equal(b.packet.energy, 1.5, "результат лёг в пакет");
assert.deepEqual(b.packet.last, { label: "Фотосинтез", amount: 1.5 }, "пакет помнит последний вклад");

// --- second use: the packet pays for itself ------------------------------------
stepWorld(w);
assert.equal(b.energy, START_ENERGY - USE_COST, "голова больше не платит");
assert.equal(b.packet.energy, 2, "пакет оплатил стоимость и принял результат");

// --- full pass: the packet flushes into the head on wrap -----------------------
for (let i = 2; i < MEM_CELLS; i++) stepWorld(w);
assert.equal(b.pc, 0, "вернулась в первую ячейку");
assert.equal(b.packet.energy, 0, "пакет опустошён");
assert.equal(b.packet.last, null, "вклад из пакета ушёл в голову");
assert.ok(near(b.energy, START_ENERGY + 1), `за проход +1 энергии, а не ${b.energy}`);

// --- caps: head cannot overflow, packet has its own ceiling --------------------
const capped = createWorld(1);
capped.creatures[0].brain.mem.fill(OP_USE);      // 60 uses in a row: far more than the caps allow
capped.creatures[0].brain.energy = HEAD_MAX;
for (let i = 0; i < MEM_CELLS; i++) stepWorld(capped);
b = capped.creatures[0].brain;
assert.equal(b.energy, HEAD_MAX, "голова не переполняется");
assert.equal(b.packet.energy, PACKET_MAX - 1, "излишек остался в пакете под его потолком");

// --- costs eat the packet first, the head only when it is empty ---------------
const poor = createWorld(1);
poor.creatures[0].brain.mem.fill(0);
poor.creatures[0].brain.mem[0] = 52;             // use mutation #5 — её нет
stepWorld(poor);
assert.equal(poor.creatures[0].brain.energy, START_ENERGY - USE_COST, "неизвестная мутация всё равно стоит");
assert.equal(poor.creatures[0].brain.packet.energy, 0, "и ничего не возвращает");

// --- determinism ---------------------------------------------------------------
const x = createWorld(42), y = createWorld(42);
for (let i = 0; i < 300; i++) { stepWorld(x); stepWorld(y); }
assert.deepEqual(x.creatures, y.creatures, "один seed — одно состояние");

// --- death by jumps only, organic left behind, world stops --------------------
const dying = createWorld(1);
dying.creatures[0].brain.mem.fill(OP_JUMP);      // 1 energy per tick, nothing comes back
const dieAt = START_ENERGY / JUMP_COST;
for (let i = 0; i < dieAt - 1; i++) stepWorld(dying);
assert.equal(dying.creatures.length, 1, "ещё жива перед последним тиком");
stepWorld(dying);
assert.equal(dying.creatures.length, 0, "на нуле энергии умерла");
assert.equal(dying.tick, dieAt, "умерла ровно на своём тике");
assert.equal(dying.organics.length, 1, "оставила органику");
assert.equal(dying.organics[0].amount, ORG_BASE, "органика = ORG_BASE + оставшаяся энергия");
assert.deepEqual([dying.organics[0].x, dying.organics[0].y], [W / 2, H / 2], "органика на месте смерти");

const frozen = dying.tick;
for (let i = 0; i < 50; i++) stepWorld(dying);
assert.equal(dying.tick, frozen, "без живых тик стоит");
assert.equal(dying.organics.length, 1, "органика не копится");

console.log(`ok — фотосинтез 1.5 при 75% света, проход +1 энергии, потолки ${HEAD_MAX}/${PACKET_MAX}, смерть на тике ${dieAt}`);
