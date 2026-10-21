// Headless self-check of the pure simulation core.
import assert from "node:assert/strict";
import {
  createWorld, stepWorld, W, H, SIZE,
  MEM_CELLS, START_ENERGY, OP_REST, OP_JUMP,
} from "../src/sim.ts";

// --- shape -------------------------------------------------------------------
const a = createWorld(42);
assert.equal(a.creatures.length, 1, "в мире одна Плюша");

const p = a.creatures[0];
assert.deepEqual([p.x, p.y], [W / 2, H / 2], "стоит по центру");
assert.equal(p.size, SIZE, "размер задан в координатах");
assert.equal(p.brain.mem.length, MEM_CELLS, "память на 60 ячеек");
assert.equal(p.brain.energy, START_ENERGY, "энергия на старте");
assert.deepEqual(p.mutations, [], "мутаций пока нет");
assert.ok(p.brain.mem.slice(0, MEM_CELLS - 1).every(c => c === OP_REST), "все ячейки, кроме последней, — отдых");
assert.equal(p.brain.mem[MEM_CELLS - 1], OP_JUMP, "последняя ячейка — прыжок в начало");

// --- one pass through memory costs exactly 1 energy ---------------------------
const pass = createWorld(1);
for (let i = 0; i < MEM_CELLS - 1; i++) stepWorld(pass);
assert.equal(pass.creatures[0].brain.energy, START_ENERGY, "отдых энергии не тратит");
stepWorld(pass);                                     // reads the jump
assert.equal(pass.creatures[0].brain.energy, START_ENERGY - 1, "прыжок стоит 1");
assert.equal(pass.creatures[0].brain.pc, 0, "вернулась в первую ячейку");

// --- determinism -------------------------------------------------------------
const x = createWorld(42), y = createWorld(42);
for (let i = 0; i < 300; i++) { stepWorld(x); stepWorld(y); }
assert.deepEqual(x.creatures, y.creatures, "один seed — одно состояние");

// --- death, and the world stops ---------------------------------------------
const w = createWorld(1);
const dieAt = START_ENERGY * MEM_CELLS;
for (let i = 0; i < dieAt - 1; i++) stepWorld(w);
assert.equal(w.creatures.length, 1, "ещё жива перед последним прыжком");
stepWorld(w);
assert.equal(w.creatures.length, 0, "на нуле энергии умерла");
assert.equal(w.tick, dieAt, "умерла ровно на своём цикле");

const frozen = w.tick;
for (let i = 0; i < 50; i++) stepWorld(w);
assert.equal(w.tick, frozen, "без живых тик стоит");

console.log(`ok — память ${MEM_CELLS}, энергия ${START_ENERGY}, смерть на тике ${dieAt}, тик остановился`);
