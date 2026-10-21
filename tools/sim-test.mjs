// Headless self-check of the pure simulation core.
import assert from "node:assert/strict";
import { createWorld, stepWorld, W, H, HEAD } from "../src/sim.ts";

const a = createWorld(42), b = createWorld(42);
for (let i = 0; i < 5000; i++) { stepWorld(a); stepWorld(b); }

assert.equal(a.creatures.length, 1, "в мире одна Плюша");
assert.equal(a.tick, 5000, "тик идёт");
assert.deepEqual(a.creatures, b.creatures, "один seed — одно состояние");

const p = a.creatures[0];
assert.deepEqual([p.x, p.y], [Math.round((W - HEAD) / 2), Math.round((H - HEAD) / 2)], "стоит по центру");
assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.size <= W && p.y + p.size <= H, "голова внутри сетки");

console.log(`ok — ${a.creatures.length} существо, тик ${a.tick}, голова ${p.size}×${p.size} в центре`);
