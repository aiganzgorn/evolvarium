// Headless self-check of the pure simulation core.
import assert from "node:assert/strict";
import { createWorld, stepWorld, W, H } from "../src/sim.ts";

const a = createWorld(42), b = createWorld(42);
for (let i = 0; i < 500; i++) { stepWorld(a); stepWorld(b); }

assert.deepEqual(a.creatures, b.creatures, "один seed — одно состояние");
assert.ok(a.creatures.every(c => c.x >= 0 && c.x < W && c.y >= 0 && c.y < H), "все внутри сетки");
assert.ok(new Set(a.creatures.map(c => `${c.x},${c.y}`)).size > 1, "существа разошлись по миру");

console.log(`ok — ${a.creatures.length} существ, тик ${a.tick}`);
