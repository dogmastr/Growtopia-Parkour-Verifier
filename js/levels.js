/* ===== levels.js: built-in levels, level codes, and where a level starts and ends =====
   A level is { W, H, map: Uint8Array(W*H) of tile codes, water: Uint8Array(W*H) of 0/1, start: {tx, ty}, finish: {tx, ty} | null, signs: [{x, text}] }.
   start and finish are the empty tiles the flags stand in; the player spawns in the start tile with the head at its top, 2 px above whatever is below it.
   Runs in the page and the checker's worker, next to core.js (it uses core's tile codes and T). */
function presetFill(L, x0, y0, x1, y1, v) { for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) L.map[y * L.W + x] = v; }
function presetBase(W, H, G) {
  var L = { W: W, H: H, map: new Uint8Array(W * H), water: new Uint8Array(W * H), start: { tx: 3, ty: G - 1 }, finish: null, signs: [] };
  presetFill(L, 0, G, W - 1, H - 2, SOIL); presetFill(L, 0, H - 1, W - 1, H - 1, BEDROCK);
  return L;
}
function presetTestCourse() {
  var G = 15, L = presetBase(104, 20, G);
  L.start = { tx: 4, ty: G - 1 }; L.finish = { tx: 101, ty: G - 1 };
  [[10, 1], [14, 2], [19, 3], [24, 4]].forEach(function (a) { presetFill(L, a[0], G - a[1], a[0] + 1, G - 1, STONE); L.signs.push({ x: a[0] - 1.5, text: a[1] + (a[1] === 1 ? " tile" : " tiles") }); });
  [[31, 3], [38, 4], [46, 5], [55, 6], [65, 7]].forEach(function (a) { presetFill(L, a[0], G, a[0] + a[1] - 1, G + 2, EMPTY); L.signs.push({ x: a[0] - 2.2, text: "gap " + a[1] }); });
  [[76, 2], [78, 4], [80, 6], [82, 8]].forEach(function (a) { presetFill(L, a[0], G - a[1], a[0] + 1, G - 1, PLANK); });
  presetFill(L, 84, G - 10, 86, G - 1, PLANK); L.signs.push({ x: 73.3, text: "drop 10" });
  presetFill(L, 93, G - 4, 99, G - 2, STONE); L.signs.push({ x: 90.3, text: "crawl" });
  return L;
}
function presetSpikeRun() {
  // Spikes are full blocks: touching any side of one is fatal, so every gap below is measured in whole tiles.
  var G = 15, L = presetBase(88, 20, G);
  L.start = { tx: 3, ty: G - 1 }; L.finish = { tx: 84, ty: G - 1 };
  // 1. spike pit, 3 wide
  presetFill(L, 10, G, 12, G + 1, EMPTY); presetFill(L, 10, G + 1, 12, G + 1, SPIKE);
  // 2. pillar hops over a spike floor
  presetFill(L, 16, G, 28, G, SPIKE);
  presetFill(L, 18, G - 2, 18, G - 1, STONE); presetFill(L, 22, G - 3, 22, G - 1, STONE); presetFill(L, 26, G - 2, 26, G - 1, STONE);
  // 3. spike tunnel: a ceiling of hanging spikes over two floor spikes, so only a medium hop gets across
  presetFill(L, 33, G - 5, 43, G - 5, STONE); presetFill(L, 33, G - 4, 43, G - 4, SPIKE);
  presetFill(L, 37, G, 38, G, SPIKE);
  // 4. step up onto a block with two spikes on top, then over them
  presetFill(L, 47, G - 2, 48, G - 1, STONE); presetFill(L, 49, G - 3, 52, G - 1, STONE); presetFill(L, 50, G - 4, 51, G - 4, SPIKE);
  // 5. long jump over five spikes
  presetFill(L, 57, G, 61, G, SPIKE);
  // 6. drop off a ledge under a spike ceiling into a two-tile notch between spikes, then jump out
  presetFill(L, 66, G - 3, 70, G - 1, STONE);
  presetFill(L, 72, G, 73, G, SPIKE); presetFill(L, 76, G, 77, G, SPIKE);
  presetFill(L, 71, G - 7, 78, G - 7, STONE); presetFill(L, 71, G - 6, 78, G - 6, SPIKE);
  return L;
}

// What a first visit starts with, when no level was saved in the browser.
const DEFAULT_LEVEL = "THL1|100|60|3,58|15,58|048w.1e.02d.12.51.03.58.11.02b.13.51.02.81.04.72.03.11.02b.11.03.b1.51.11.51.03.52.03.11.02a.42s";
// Levels the page offers to load, by name (the Preset list in Build).
const PRESETS = [
  { name: "KYDERBY", code: "THL1|100|60|12,51|53,33|02hi.1x.0o.1c.0u.12.0v.11.0m.13.0a.11.0t.12.03.1u.0k.13.04.16.02.11.0m.18.04.11.0r.12.0i.13.03.14.05.11.01.11.0i.15.09.13.01.14.01.16.01.13.01.18.03.11.0i.11.05.11.05.11.02.11.01.11.0i.11.05.1b.06.11.04.11.05.11.06.11.c1.11.01.17.0c.11.01.15.05.11.04.11.0h.12.01.15.07.13.01.16.01.12.01.17.02.13.01.11.01.11.01.13.03.11.0c.11.01.11.06.19.0g.12.02.11.05.15.01.12.02.11.07.11.07.11.04.11.01.11.03.13.01.11.01.16.03.15.01.11.02.15.07.11.0g.11.02.12.01.13.01.11.03.11.01.12.01.12.02.1c.01.13.02.11.01.13.05.11.01.11.05.14.03.11.01.11.01.12.03.11.01.14.02.11.0f.12.02.11.06.11.01.11.01.11.04.11.03.11.0a.11.06.11.04.16.03.13.06.11.01.11.01.11.02.11.01.11.01.11.01.11.05.11.0f.11.02.12.01.16.01.11.01.16.01.13.01.17.02.1a.07.13.05.16.c1.11.01.11.02.11.01.11.03.11.02.14.0f.11.02.11.02.11.06.11.06.11.01.11.03.11.05.11.02.11.03.11.04.11.02.12.05.17.04.11.01.11.01.12.01.11.01.11.03.11.05.11.09.17.c1.01.11.01.12.01.1b.03.11.03.11.02.11.02.11.c1.01.11.01.11.01.11.01.12.01.19.09.12.03.11.01.11.02.11.01.15.05.11.0i.11.02.11.05.11.05.15.01.13.02.11.02.11.02.11.01.11.01.11.01.11.02.11.07.1g.01.11.02.11.05.14.02.11.0a.16.02.11.02.15.01.11.01.13.01.11.03.11.01.11.04.11.05.11.01.11.c1.11.01.11.02.11.01.15.01.11.07.11.04.13.01.11.01.15.02.11.05.11.09.c1.11.04.11.02.12.01.11.05.11.01.11.03.11.01.11.01.11.01.11.02.19.01.11.03.11.01.12.01.11.05.11.01.15.01.11.04.13.01.11.08.11.02.14.0a.11.01.12.01.14.02.11.01.15.01.11.01.13.01.11.03.11.0c.11.03.11.04.11.01.15.01.11.03.11.01.11.01.12.01.13.01.11.08.11.05.11.0c.12.07.11.07.11.05.11.03.11.0c.15.04.11.07.11.01.11.01.11.03.12.05.1a.05.11.09.118.03.1e.01.11.01.1d.03.11.03.14.02.11.09.11.018.11.0g.11.0f.11.03.11.07.11.09.12j.0gx.42s" }
];

/* ---------- level codes ----------
   "THL1|W|H|sx,sy|fx,fy|runs[|waterRuns]": runs are "<tile code><count in base 36>" joined by ".", row by row
   from the top. The tile code is one character, in base 36 (0-9 as always, then a = Mushroom, b = Diving
   Board, c = Platform, d = Lemon Jelly, e = Lava). The finish part is empty when there is no finish flag. waterRuns is the same for the water
   layer (0 dry, 1 water) and is left off when the level has no water, so such codes are what they always were. */
function rleRuns(a) {
  const runs = []; let cur = a[0], n = 0;
  for (let i = 0; i < a.length; i++) { if (a[i] === cur) n++; else { runs.push(cur.toString(36) + n.toString(36)); cur = a[i]; n = 1; } }
  runs.push(cur.toString(36) + n.toString(36));
  return runs.join(".");
}
function unRleRuns(str, size, maxV, what) {
  const a = new Uint8Array(size); let i = 0;
  for (const r of str.split(".")) {
    const v = parseInt(r[0], 36), n = parseInt(r.slice(1), 36);
    if (!(v >= 0 && v <= maxV) || !(n > 0) || i + n > size) throw new Error(`The ${what} data in that code is damaged.`);
    a.fill(v, i, i + n); i += n;
  }
  if (i !== size) throw new Error(`The ${what} data in that code is incomplete.`);
  return a;
}
function encodeLevel(L) {
  const parts = ["THL1", L.W, L.H, L.start.tx + "," + L.start.ty, L.finish ? L.finish.tx + "," + L.finish.ty : "", rleRuns(L.map)];
  if (L.water && L.water.some(Boolean)) parts.push(rleRuns(L.water));
  return parts.join("|");
}
function decodeLevel(str) {
  const parts = String(str).trim().split("|");
  if (parts[0] !== "THL1" || (parts.length !== 6 && parts.length !== 7)) throw new Error("That doesn't look like a level code from this page. Codes start with THL1|.");
  const W = +parts[1], H = +parts[2];
  if (!(W >= 16 && W <= 200 && H >= 8 && H <= 60)) throw new Error("The level size in that code is outside 16–200 by 8–60 tiles.");
  const map = unRleRuns(parts[5], W * H, LAVA, "tile");
  const water = parts.length === 7 ? unRleRuns(parts[6], W * H, 1, "water") : new Uint8Array(W * H);
  const [sx, sy] = parts[3].split(",").map(Number);
  if (!(sx >= 0 && sx < W && sy >= 0 && sy < H)) throw new Error("The start position in that code is outside the level.");
  let finish = null;
  if (parts[4]) { const [fx, fy] = parts[4].split(",").map(Number); if (fx >= 0 && fx < W && fy >= 0 && fy < H) finish = { tx: fx, ty: fy }; }
  return { W, H, map, water, start: { tx: sx, ty: sy }, finish, signs: [] };
}

// The checkpoint puts the player's head at the top of the start tile, so the feet are (32 - 30 =) 2 px above
// the tile's bottom edge: a spike or a floor right below the tile is 2 px away at spawn, not touching it.
function levelStartPos(L) { return { x: L.start.tx * T + T / 2, y: L.start.ty * T + GAME.hitH }; }
function levelFinishGoal(L) { var f = L.finish; return f ? { kind: "touch", x0: f.tx * T, y0: f.ty * T, x1: (f.tx + 1) * T, y1: (f.ty + 1) * T } : null; }

function presetBlank() {
  var G = 15, L = presetBase(64, 20, G);
  L.start = { tx: 3, ty: G - 1 }; L.finish = { tx: 60, ty: G - 1 };
  return L;
}
