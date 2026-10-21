// Headless self-check of the pure simulation core.
import assert from "node:assert/strict";
import { createWorld, stepWorld, W, H, SIZE } from "../src/sim.ts";

const a = createWorld(42), b = createWorld(42);
for (let i = 0; i < 5000; i++) { stepWorld(a); stepWorld(b); }

assert.equal(a.creatures.length, 1, "в мире одна Плюша");
assert.equal(a.tick, 5000, "тик идёт");
assert.deepEqual(a.creatures, b.creatures, "один seed — одно состояние");

const p = a.creatures[0];
assert.deepEqual([p.x, p.y], [W / 2, H / 2], "стоит по центру");
assert.equal(p.size, SIZE, "размер задан в координатах");
assert.ok(p.x - p.size / 2 >= 0 && p.y - p.size / 2 >= 0 && p.x + p.size / 2 <= W && p.y + p.size / 2 <= H, "внутри мира");

console.log(`ok — ${a.creatures.length} существо, тик ${a.tick}, размер ${p.size} в точке (${p.x}, ${p.y})`);
