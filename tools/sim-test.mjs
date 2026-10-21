// Headless self-check of the pure simulation core.
import assert from "node:assert/strict";
import { createWorld, stepWorld, W, H } from "../src/sim.ts";

const a = createWorld(42), b = createWorld(42);
for (let i = 0; i < 2000; i++) { stepWorld(a); stepWorld(b); }

assert.equal(a.creatures.length, 1, "в мире одна Плюша");
assert.deepEqual(a.creatures, b.creatures, "один seed — одно состояние");

const p = a.creatures[0];
const start = createWorld(42).creatures[0];
assert.ok(Math.abs(p.x - start.x) + Math.abs(p.y - start.y) > 0, "Плюша куда-то сдвинулась");

// 2000 ticks with random walls and turns: the 10×10 head must never leave the grid
const walk = createWorld(7);
for (let i = 0; i < 5000; i++) {
  stepWorld(walk);
  const c = walk.creatures[0];
  assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.size <= W && c.y + c.size <= H, `вне сетки на тике ${i}`);
}

console.log(`ok — ${a.creatures.length} существо, тик ${a.tick}, голова ${p.size}×${p.size} клеток`);
