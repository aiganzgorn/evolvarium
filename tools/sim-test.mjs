// Headless self-check of the pure simulation core.
import assert from "node:assert/strict";
import {
  createWorld, stepWorld, snapshot, restore, demoMemory, randomMemory, lightAt, lightCenter, plantMemory,
  opOf, mutationOf, paramsOf, jumpTarget, jumpCell, useCell,
  OP_REST, OP_JUMP, OP_USE, OP_SEED,
} from "../src/sim.ts";
import { mulberry32 } from "../src/rng.ts";
import { attachPoint, legTip } from "../src/mutations.ts";
import {
  W, H, SIZE, MEM_CELLS, START_ENERGY, HEAD_MAX, PACKET_MAX, JUMP_COST, USE_COST, LIGHT_MIN, LIGHT_MAX, ORG_BASE,
  EAT_RATE, EAT_RANGE, PUSH_DIST,
  LEG_LENGTH, LEG_STEP_DEG, LIGHT_PERIOD, LEG_MIN, LEG_MAX,
  BUSHES, ORGANIC_CELLS, ORGANIC_SIZE, SEED_SIZE, MAX_ORGANICS, SEED_NEIGHBOURS,
} from "../src/config.ts";

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const deg = (d) => (d * Math.PI) / 180;
// Mutation objects carry functions, so deepEqual can only compare the data.
const shape = (w) => ({
  creatures: w.creatures.map(c => ({
    id: c.id, x: c.x, y: c.y, angle: c.angle, size: c.size, genome: c.genome,
    brain: c.brain, legs: c.mutations.map(m => m.leg ?? null),
  })),
  organics: w.organics.map(o => ({ id: o.id, x: o.x, y: o.y, energy: o.energy, size: o.size, mem: o.mem, pc: o.pc })),
});

// --- the cell language -------------------------------------------------------
assert.equal(opOf(0), OP_REST, "0 — отдых");
assert.equal(opOf(99), OP_REST, "мелкое число — отдых, а не прыжок");
assert.equal(opOf(100), OP_JUMP, "100 — прыжок");
assert.equal(jumpTarget(100), 0, "100 — в нулевую ячейку");
assert.equal(opOf(155), OP_JUMP, "155 — прыжок");
assert.equal(jumpTarget(155), 55, "155 — в 55-ю ячейку");
assert.equal(jumpCell(0), 100, "кодируем прыжок в 0");
assert.equal(jumpCell(55), 155, "кодируем прыжок в 55");

assert.equal(opOf(200), OP_USE, "200 — вызов мутации");
assert.equal(mutationOf(200), 0, "200 — мутация 00");
assert.deepEqual(paramsOf(200), [0, 0, 0, 0], "200 — параметры пустые");
assert.equal(opOf(20101120000), OP_USE, "20101120000 — вызов мутации");
assert.equal(mutationOf(20101120000), 1, "индекс 01");
assert.deepEqual(paramsOf(20101120000), [1, 12, 0, 0], "параметры 01 12 00 00");
assert.equal(useCell(0), 200, "мутация 00 без параметров");
assert.equal(useCell(1, [1, 12]), 2010112, "хвостовые нули можно опускать");
assert.equal(opOf(useCell(1, [1, 12])), OP_USE, "короткая запись читается");
assert.deepEqual(paramsOf(useCell(1, [1, 12])), [1, 12, 0, 0], "и даёт те же параметры");
assert.equal(mutationOf(useCell(7, [3, 90, 4, 5])), 7, "индекс на месте");
assert.deepEqual(paramsOf(useCell(7, [3, 90, 4, 5])), [3, 90, 4, 5], "все четыре параметра");

// --- shape -------------------------------------------------------------------
const a = createWorld(42);
assert.equal(a.creatures.length, 1, "в мире одна Плюша");

const p = a.creatures[0];
assert.deepEqual([p.x, p.y], [W / 2, H / 2], "стоит по центру");
assert.equal(p.size, SIZE, "размер задан в координатах");
assert.equal(p.brain.mem.length, MEM_CELLS, "память на 60 ячеек");
assert.equal(p.brain.energy, START_ENERGY, "энергия на старте");
assert.equal(p.brain.packet.energy, 0, "пакет пуст");
assert.deepEqual(p.mutations.map(m => m.id), ["photosynthesis", "leg", "leg", "mouth", "push"], "фотосинтез, две ножки, рот, толчок");
assert.equal(a.organics.length, BUSHES, "на старте пара кустов");
for (const o of a.organics) {
  assert.equal(o.mem.length, ORGANIC_CELLS, "у органики восемь ячеек");
  assert.equal(o.mem[ORGANIC_CELLS - 2], OP_SEED, "одна ячейка — семечко");
  assert.equal(o.mem[ORGANIC_CELLS - 1], jumpCell(0), "последняя — возврат в начало");
  assert.ok(o.energy > 0 && o.size > 0, "куст живой и растущий");
}
assert.deepEqual(createWorld(4).organics.map(o => [Math.round(o.x), Math.round(o.y)]),
  createWorld(4).organics.map(o => [Math.round(o.x), Math.round(o.y)]), "кусты расставлены от сида");

// --- the starting memory comes from the seed ---------------------------------
const seedA = createWorld(7), seedB = createWorld(7), seedC = createWorld(8);
assert.deepEqual(seedA.creatures[0].brain.mem, seedB.creatures[0].brain.mem, "один seed — одна память");
assert.notDeepEqual(seedA.creatures[0].brain.mem, seedC.creatures[0].brain.mem, "другой seed — другая");
assert.deepEqual(seedA.creatures[0].brain.mem, randomMemory(mulberry32(7)), "randomMemory детерминирован");

const random = createWorld(3).creatures[0].brain.mem;
for (const cell of random) assert.ok([OP_REST, OP_JUMP, OP_USE].includes(opOf(cell)), `ячейка ${cell} читается`);
assert.ok(random.filter(c => c === useCell(0)).length >= 3, "в случайной памяти есть топливо");

// --- photosynthesis: 2 energy at 100% light, so 1.5 at 75% --------------------
const photo = p.mutations[0];
const act = (self, mut, params, light, world = a) => mut.act({ self, world, light, params, packet: { energy: 0, last: null } });
assert.equal(act(p, photo, [0, 0, 0, 0], 1), 2, "100% света — 2");
assert.equal(act(p, photo, [0, 0, 0, 0], 0), 0, "0% света — 0");
assert.equal(act(p, photo, [0, 0, 0, 0], 0.75), 1.5, "75% света — 1.5");
assert.equal(act(p, photo, [9, 9, 9, 9], 0.75), 1.5, "параметры фотосинтезу не мешают");

// --- leg: p1 picks the action, p2 the degrees --------------------------------
const lw = createWorld(5);
const c = lw.creatures[0];
const legMut = c.mutations[1];
const doIt = (params) => legMut.act({ self: c, world: lw, light: lw.light, params, packet: { energy: 0, last: null } });
const leg = legMut.leg;

assert.ok(leg && !leg.grabbed, "ножка есть и землю не держит");
assert.ok(leg.length >= LEG_MIN && leg.length <= LEG_MAX, "длина задана при рождении, в пределах тела");
assert.equal(leg.angle, 0, "стартовый угол");

doIt([2, 20]);                                           // turn right by 20°
assert.ok(near(leg.angle, deg(20)), "p2 задаёт угол поворота");
doIt([1, 5]);                                            // turn left by 5°
assert.ok(near(leg.angle, deg(15)), "01 — влево");

doIt([1, 0]);                                            // no degrees given
assert.ok(near(leg.angle, deg(15) - deg(LEG_STEP_DEG)), "без p2 работает шаг по умолчанию");
assert.ok(near(c.x, W / 2) && near(c.y, H / 2), "свободная ножка тело не двигает");

const tipBefore = legTip(c, leg);
doIt([3]);                                               // grab
assert.ok(leg.grabbed, "03 — земля схвачена");
assert.deepEqual([leg.x, leg.y], [tipBefore.x, tipBefore.y], "точка захвата — кончик ножки");
assert.ok(near(Math.hypot(leg.x - attachPoint(c, leg.attach).x, leg.y - attachPoint(c, leg.attach).y), leg.length), "ножка не растянулась");

const anchor = { x: leg.x, y: leg.y };
const before = { x: c.x, y: c.y, angle: c.angle };
doIt([2, 30]);                                           // turn right while holding
assert.ok(near(c.angle, before.angle + deg(30)), "тело повернулось вместе с ножкой");
assert.ok(!near(c.x, before.x) || !near(c.y, before.y), "тело сдвинулось");
assert.ok(near(Math.hypot(c.x - anchor.x, c.y - anchor.y), Math.hypot(before.x - anchor.x, before.y - anchor.y)), "радиус поворота сохранён");

doIt([4]);                                               // release
assert.ok(!leg.grabbed, "04 — земля отпущена");
const freeBefore = { x: c.x, y: c.y };
doIt([2, 30]);
assert.ok(near(c.x, freeBefore.x) && near(c.y, freeBefore.y), "без захвата тело больше не едет");

// length belongs to the mutation, not to the world
leg.length = 140;
const t3 = legTip(c, leg);
assert.ok(near(Math.hypot(t3.x - attachPoint(c, leg.attach).x, t3.y - attachPoint(c, leg.attach).y), LEG_MAX), "длинная ножка упирается в предел LEG_MAX");
leg.length = 20;
const t4 = legTip(c, leg);
assert.ok(near(Math.hypot(t4.x - attachPoint(c, leg.attach).x, t4.y - attachPoint(c, leg.attach).y), 20), "короткая — ближе");

// --- the demo program walks: swings cancel, the body stays upright -----------
for (const seed of [1, 7, 42]) {
  const walker = createWorld(seed);
  walker.creatures[0].brain.mem = demoMemory();
  const start = { x: walker.creatures[0].x, y: walker.creatures[0].y };
  let last = { x: start.x, y: start.y, angle: 0 };
  for (let t = 0; t < 400 && walker.creatures.length; t++) {
    stepWorld(walker);
    const q = walker.creatures[0];
    if (!q) break;
    last = { x: q.x, y: q.y, angle: q.angle };
  }
  const moved = Math.hypot(last.x - start.x, last.y - start.y);
  assert.ok(moved > 25, `seed ${seed}: ушла на ${moved.toFixed(1)} ед.`);
  assert.ok(Math.abs(last.angle) <= deg(49), `seed ${seed}: тело не кувыркается, курс в пределах ±48° (${(last.angle * 180 / Math.PI).toFixed(0)}°)`);
}

// --- light: a band moves, and photosynthesis reads light where she stands -----
const bandAt = (tick, x) => lightAt({ tick }, x);
assert.ok(near(lightCenter({ tick: 0 }), W / 2), "в начале полоса по центру");
assert.ok(lightCenter({ tick: 60 }) > W / 2, "полоса едет вправо");
assert.ok(bandAt(0, W / 2) > bandAt(0, 0), "в центре светлее, чем у левого края");
assert.ok(near(bandAt(0, 700), bandAt(LIGHT_PERIOD, 700)), "через период свет повторяется");
for (let t = 0; t < LIGHT_PERIOD; t++) {
  const v = bandAt(t, W / 3);
  assert.ok(v > 0 && v <= 1, `свет ${v} в диапазоне 0..1`);
}

// --- costs, death, organic, and the world stops -------------------------------
const w = createWorld(1);
const mem = w.creatures[0].brain.mem;
mem.fill(OP_REST);
mem[0] = useCell(0); mem[1] = useCell(0);                // two calls of photosynthesis
mem[MEM_CELLS - 1] = jumpCell(0);
const x0 = w.creatures[0].x;
for (let i = 0; i < MEM_CELLS; i++) stepWorld(w);
const expected = START_ENERGY - 3 + 2 * bandAt(1, x0) + 2 * bandAt(2, x0);
assert.ok(near(w.creatures[0].brain.energy, expected, 1e-9),
  `два фотосинтеза и прыжок: ${w.creatures[0].brain.energy} вместо ${expected}`);
assert.equal(w.creatures[0].brain.packet.energy, 0, "пакет опустошён на переходе");

const unknown = createWorld(1);
unknown.creatures[0].brain.mem.fill(OP_REST);
unknown.creatures[0].brain.mem[0] = useCell(55);
stepWorld(unknown);
assert.equal(unknown.creatures[0].brain.energy, START_ENERGY - USE_COST, "неизвестная мутация стоит энергии");
assert.equal(unknown.creatures[0].brain.packet.energy, 0, "и ничего не возвращает");

const dying = createWorld(1);
dying.organics.length = 0;                               // start with an empty field
dying.creatures[0].brain.mem.fill(jumpCell(0));          // jump to itself, 1 energy per tick
const dieAt = START_ENERGY / JUMP_COST;
for (let i = 0; i < dieAt - 1; i++) stepWorld(dying);
assert.equal(dying.creatures.length, 1, "ещё жива перед последним тиком");
assert.equal(dying.creatures[0].id, 0, "это всё ещё первая Плюша");
stepWorld(dying);
assert.equal(dying.tick, dieAt, "умерла ровно на своём тике");
assert.equal(dying.organics.length, 1, "оставила органику");
assert.equal(dying.organics[0].energy, ORG_BASE, "органика = ORG_BASE + оставшаяся энергия");
assert.equal(dying.organics[0].size, SEED_SIZE, "и начинает как семечко");

// the last one died — a fresh one arrives
assert.equal(dying.creatures.length, 1, "вместо неё родилась новая Плюша");
assert.equal(dying.creatures[0].id, 1, "с новым id");
assert.equal(dying.creatures[0].brain.energy, START_ENERGY, "и полной энергией");
assert.ok(dying.creatures[0].x >= SIZE / 2 && dying.creatures[0].x <= W - SIZE / 2, "внутри мира по x");
assert.ok(dying.creatures[0].y >= SIZE / 2 && dying.creatures[0].y <= H - SIZE / 2, "и по y");

// the world keeps turning while anything is alive
const afterDeath = dying.tick;
for (let i = 0; i < 200; i++) stepWorld(dying);
assert.equal(dying.tick, afterDeath + 200, "мир живёт дальше");
assert.ok(dying.creatures.length <= 1, "плюша одна");
assert.ok(dying.organics.every(o => o.energy > 0), "у живой органики энергия положительная");

// --- two legs: mirrored hinges, one foot on the ground at a time ---------------
const tl = createWorld(5);
const tc = tl.creatures[0];
assert.deepEqual(tc.mutations.map(m => m.id), ["photosynthesis", "leg", "leg", "mouth", "push"], "две ножки, рот и толчок");
const [left, right] = [tc.mutations[1], tc.mutations[2]];
assert.ok(left.leg.attach < right.leg.attach, "петли зеркальные");
for (const m of [left, right]) {
  assert.ok(m.leg.length >= LEG_MIN && m.leg.length <= LEG_MAX,
    `длина ${m.leg.length} в пределах ${LEG_MIN}..${LEG_MAX}`);
}
const fire = (m, params, self = tc, world = tl) => m.act({ self, world, light: 0.8, params, packet: { energy: 0, last: null } });
fire(left, [3]);
assert.ok(left.leg.grabbed && !right.leg.grabbed, "левая схватила");
fire(right, [3]);
assert.ok(right.leg.grabbed && !left.leg.grabbed, "правая схватила — левая отпустила сама");

// a leg is never longer than twice the body, whatever the state says
left.leg.length = 999;
const longTip = legTip(tc, left.leg);
const hinge = attachPoint(tc, left.leg.attach);
assert.ok(near(Math.hypot(longTip.x - hinge.x, longTip.y - hinge.y), LEG_MAX), "длина ограничена двумя телами");

// --- the world edges hold: the leg cannot reach out, the body cannot be dragged out
const edge = createWorld(1);
const ec = edge.creatures[0];
ec.x = W - ec.size / 2 - 1;                              // one pixel from the right wall
const el = ec.mutations[1];
const eDo = (params) => el.act({ self: ec, world: edge, light: 0.8, params, packet: { energy: 0, last: null } });

for (let i = 0; i < 40; i++) eDo([2, 40]);              // keep turning right: the tip hits the wall
const tip = legTip(ec, el.leg);
assert.ok(tip.x <= W && tip.y >= 0 && tip.y <= H, `кончик внутри мира (${tip.x.toFixed(1)}, ${tip.y.toFixed(1)})`);

eDo([3]);                                                // grab
for (let i = 0; i < 40; i++) eDo([2, 40]);               // and try to drag the body out
assert.ok(ec.x <= W - ec.size / 2 + 1e-9, `тело не вышло за правый край (${ec.x.toFixed(1)})`);
assert.ok(ec.x >= ec.size / 2 - 1e-9 && ec.y >= ec.size / 2 - 1e-9 && ec.y <= H - ec.size / 2 + 1e-9, "и не вышло за остальные");

// --- a crowded patch stops reproducing --------------------------------------
const crowd = createWorld(9);
crowd.creatures.length = 0;
crowd.organics.length = 0;
const addBush = (x, y, mem) =>
  crowd.organics.push({ id: crowd.nextOrganicId++, x, y, energy: 60, size: ORGANIC_SIZE, mem, pc: 0 });
addBush(W / 2, H / 2, new Array(ORGANIC_CELLS).fill(OP_SEED));                    // tries to seed every tick
for (let k = 0; k < SEED_NEIGHBOURS; k++) {
  addBush(W / 2 + 30 + k * 20, H / 2, new Array(ORGANIC_CELLS).fill(OP_REST));
}
const crowdedBefore = crowd.organics.length;
for (let i = 0; i < 40; i++) stepWorld(crowd);
assert.equal(crowd.organics.length, crowdedBefore,
  `рядом уже ${SEED_NEIGHBOURS} куста — новые семена не появляются (${crowd.organics.length})`);
const garden = createWorld(3);
garden.creatures[0].brain.energy = 0;                    // she dies, the garden stays
for (let i = 0; i < 150; i++) stepWorld(garden);
assert.ok(garden.organics.length > BUSHES, `кусты размножились (${garden.organics.length})`);
assert.ok(garden.organics.some(o => o.size < ORGANIC_SIZE * 0.9), "среди них есть подрастающее семечко");
for (let i = 0; i < 900; i++) stepWorld(garden);
assert.ok(garden.organics.length <= MAX_ORGANICS, `и не вышли за предел (${garden.organics.length})`);
for (const o of garden.organics) {
  assert.ok(o.x >= ORGANIC_SIZE && o.x <= W - ORGANIC_SIZE, "куст не выглядывает за край по x");
  assert.ok(o.y >= ORGANIC_SIZE && o.y <= H - ORGANIC_SIZE, "куст не выглядывает за край по y");
  assert.ok(o.energy > 0, "живой куст не в минусе");
  assert.ok(o.size <= ORGANIC_SIZE, "куст не перерастает себя");
}

// --- mouth: bites a bush and takes its energy --------------------------------
const fed = createWorld(1);
fed.organics.length = 0;
fed.organics.push({ id: 99, x: W / 2 + 30, y: H / 2, energy: 40, size: ORGANIC_SIZE, mem: plantMemory(), pc: 0 });
const eater = fed.creatures[0];
const mouthMut = eater.mutations[3];
const bite = mouthMut.act({ self: eater, world: fed, light: 0.5, params: [0, 0, 0, 0], packet: { energy: 0, last: null } });
assert.equal(bite, EAT_RATE, "кусает не больше EAT_RATE");
assert.equal(fed.organics[0].energy, 40 - EAT_RATE, "у куста стало меньше энергии");
fed.organics[0].x = W - 10;                              // far away now
assert.equal(mouthMut.act({ self: eater, world: fed, light: 0.5, params: [], packet: { energy: 0, last: null } }), 0,
  "далеко — не достаёт");

// --- push: a shove moves the body, and the walls still hold -------------------
const shoved = createWorld(1);
const body = shoved.creatures[0];
const pushMut = body.mutations[4];
const beforePush = { x: body.x, y: body.y };
pushMut.act({ self: body, world: shoved, light: 0.5, params: [0], packet: { energy: 0, last: null } });
assert.ok(near(body.x - beforePush.x, PUSH_DIST), "толчок сдвинул тело вперёд");
body.x = W - body.size / 2 - 2;
pushMut.act({ self: body, world: shoved, light: 0.5, params: [100], packet: { energy: 0, last: null } });
assert.ok(body.x <= W - body.size / 2, "даже сильный толчок не выносит за край");

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
assert.deepEqual(shape(rew), shape(ref), "мир восстановлен бит в бит");

for (let i = 0; i < 40; i++) { stepWorld(ref); stepWorld(rew); }
assert.deepEqual(shape(rew), shape(ref), "после отката мир идёт тем же путём");

const keep = snapshot(rew);
const keptTick = keep.tick, keptEnergy = keep.creatures[0].brain.energy;
for (let i = 0; i < 30; i++) stepWorld(rew);
assert.equal(keep.tick, keptTick, "снимок не изменился");
assert.equal(keep.creatures[0].brain.energy, keptEnergy, "энергия в снимке не изменилась");

console.log(`ok — язык ячеек (200/155/20101120000), ножка по параметрам, органика с семечками, откат, смерть`);
