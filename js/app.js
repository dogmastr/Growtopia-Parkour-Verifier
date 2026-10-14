/* ================= app: level, editor, game loop, route checker UI ================= */
const P = Object.assign({}, GAME);
const ACT_DIR = [1, 1, 0, 0, -1, -1], ACT_JUMP = [0, 1, 0, 1, 0, 1];
let LEVEL = null, world = null, levelVersion = 0;
let mode = "play";
let tool = "soil";
let player = null, prev = null;
const input = { left: false, right: false, up: false, down: false, jump: false, jumpPressed: false };
let camX = 0, camY = 0, viewW = 640, viewH = 360;
let slow = false, acc = 0, last = performance.now();
const trails = [];
let trailClock = 0;
const runState = { t: 0, started: false, finished: false, deaths: 0, best: null, flash: 0, banner: 0 };
let replay = null;
const overlay = { route: null, closest: null, A: null, B: null };
let picking = null;
let hover = null;

/* ---------- level storage ---------- */
function cloneLevel(L) { return { W: L.W, H: L.H, map: L.map.slice(), water: L.water.slice(), start: Object.assign({}, L.start), finish: L.finish ? Object.assign({}, L.finish) : null, signs: (L.signs || []).map(s => Object.assign({}, s)) }; }
const STORE_KEY = "tile-hopper-lab.level.v1";
let saveTimer = 0;
function saveLevel() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify({ code: encodeLevel(LEVEL), signs: LEVEL.signs })); } catch (e) { /* storage off: level lives for this visit only */ } }, 250);
}
// The spike course as first published, when spikes only killed on their teeth. A browser still holding
// exactly that layout gets the retuned course instead; anything the viewer built is left alone.
const OLD_SPIKE_RUN = "THL1|88|20|3,14|84,14|0nz.27.029.57.017.29.07.52.01n.21.0a.59.06.24.0e.25.0z.21.03.21.03.21.0j.26.0e.25.0z.21.03.21.03.21.0j.26.0e.25.0h.1a.03.13.5d.17.53.1h.56.1a.52.11.52.1l.53.16z.42g";
function loadSaved() {
  try { const raw = localStorage.getItem(STORE_KEY); if (!raw) return null; const o = JSON.parse(raw); if (o.code === OLD_SPIKE_RUN) return null; const L = decodeLevel(o.code); L.signs = Array.isArray(o.signs) ? o.signs : []; return L; } catch (e) { return null; }
}

/* ---------- undo ---------- */
const undoStack = [];
function pushUndo() { undoStack.push(cloneLevel(LEVEL)); if (undoStack.length > 60) undoStack.shift(); updateBuildButtons(); }
function undo() { if (!undoStack.length) return; setLevel(undoStack.pop(), { keepCamera: true }); updateBuildButtons(); }

function setLevel(L, opts) {
  opts = opts || {};
  LEVEL = L; world = makeWorld(L.W, L.H, L.map, L.water); levelVersion++;
  renderWorld();
  invalidateChecks();
  respawn();
  if (!opts.keepCamera) centerCameraOn(player.x, player.y - P.hitH / 2);
  saveLevel();
}
function startPos() { return levelStartPos(LEVEL); }
function finishGoal() { return levelFinishGoal(LEVEL); }

/* ---------- art ---------- */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function tex(draw) { const c = document.createElement("canvas"); c.width = c.height = T; const g = c.getContext("2d"); draw(g); return c; }
function px(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }
function soilTex(seed) {
  return tex(g => {
    const r = rng(seed);
    px(g, 0, 0, T, T, "#7b5436");
    for (let i = 0; i < 26; i++) px(g, (r() * 31) | 0, (r() * 31) | 0, 2, 2, r() < .5 ? "#6a4529" : "#8a6242");
    for (let i = 0; i < 3; i++) { const x = (r() * 27) | 0, y = (r() * 27) | 0; px(g, x, y, 4, 3, "#9c8a78"); px(g, x, y + 2, 4, 1, "#6f6255"); }
  });
}
function turfTex(seed) {
  return tex(g => {
    g.drawImage(soilTex(seed), 0, 0);
    const r = rng(seed * 7 + 3);
    px(g, 0, 0, T, 6, "#4fa83f"); px(g, 0, 0, T, 2, "#7fd05c");
    for (let x = 0; x < T; x += 2) { const d = 5 + ((r() * 4) | 0); px(g, x, 5, 2, d - 4, "#4fa83f"); if (r() < .35) px(g, x, 0, 1, 1, "#b4ec86"); }
  });
}
function stoneTex() {
  return tex(g => {
    px(g, 0, 0, T, T, "#8b939a"); px(g, 0, 0, T, 2, "#b8c0c6"); px(g, 0, 0, 2, T, "#aab2b8");
    px(g, 0, T - 2, T, 2, "#5f676e"); px(g, T - 2, 0, 2, T, "#6c747b");
    px(g, 9, 11, 7, 1, "#737b82"); px(g, 15, 11, 1, 6, "#737b82"); px(g, 20, 21, 6, 1, "#737b82");
  });
}
function plankTex() {
  return tex(g => {
    px(g, 0, 0, T, T, "#b98452");
    for (let y = 0; y < T; y += 8) { px(g, 0, y, T, 1, "#8e5f34"); px(g, 0, y + 1, T, 1, "#cf9c69"); }
    px(g, 6, 3, 1, 4, "#8e5f34"); px(g, 22, 11, 1, 4, "#8e5f34"); px(g, 12, 19, 1, 4, "#8e5f34"); px(g, 27, 27, 1, 4, "#8e5f34"); px(g, 0, 0, 1, T, "#8e5f34");
  });
}
function bedrockTex() { return tex(g => { px(g, 0, 0, T, T, "#3c4048"); const r = rng(99); for (let i = 0; i < 14; i++) px(g, (r() * 30) | 0, (r() * 30) | 0, 3, 2, "#2c2f35"); }); }
function spikeTex(dir) {
  // Teeth fill the whole tile edge to edge, over a red wash, because the whole tile is deadly.
  const up = tex(g => {
    g.fillStyle = "rgba(170, 32, 40, 0.24)"; g.fillRect(0, 0, T, T);
    px(g, 0, 28, T, 4, "#3b3f46"); px(g, 0, 28, T, 1, "#6b717b");
    for (let i = 0; i < 4; i++) {
      const cx = 4 + i * 8;
      for (let y = 0; y < 28; y++) {
        const half = Math.max(1, Math.round((y + 1) * 4 / 28));
        px(g, cx - half, y, half * 2, 1, "#2f333a");
        if (half > 1) px(g, cx - half + 1, y, half * 2 - 2, 1, y < 7 ? "#f1f3f5" : "#c3c9d1");
        if (half > 2) px(g, cx - half + 1, y, 1, 1, "#e4e8ec");
      }
      px(g, cx - 1, 0, 2, 3, "#d64545");
    }
  });
  if (dir === 0) return up;
  const c = document.createElement("canvas"); c.width = c.height = T; const g = c.getContext("2d");
  g.translate(T / 2, T / 2); g.rotate(dir === 1 ? Math.PI : dir === 2 ? Math.PI / 2 : -Math.PI / 2); g.drawImage(up, -T / 2, -T / 2);
  return c;
}
const TEX = {};
// Not solid: a see-through violet box with rising chevrons, so the tile reads as a zone, not a block.
function fieldTex() {
  return tex(g => {
    px(g, 0, 0, T, T, "rgba(124, 92, 255, 0.24)");
    px(g, 0, 0, T, 1, "rgba(124, 92, 255, 0.8)"); px(g, 0, T - 1, T, 1, "rgba(124, 92, 255, 0.8)");
    px(g, 0, 0, 1, T, "rgba(124, 92, 255, 0.8)"); px(g, T - 1, 0, 1, T, "rgba(124, 92, 255, 0.8)");
    for (const oy of [6, 18]) for (let i = 0; i < 6; i++) { px(g, 15 - 2 * i, oy + i, 2, 2, "#ece7ff"); px(g, 15 + 2 * i, oy + i, 2, 2, "#ece7ff"); }
  });
}
// A belt with chevrons pointing right, the way it pushes. Not solid either: you run through it.
function conveyorTex() {
  return tex(g => {
    px(g, 0, 0, T, T, "#4a4f57"); px(g, 0, 0, T, 4, "#6b727c"); px(g, 0, T - 4, T, 4, "#2f3338");
    for (let x = 3; x < T - 6; x += 10) for (let i = 0; i < 7; i++) { px(g, x + i, 9 + i, 2, 2, "#f2c14e"); px(g, x + i, 21 - i, 2, 2, "#f2c14e"); }
  });
}
// See-through blue; a lighter line on top where the tile above is dry. Drawn under the tile's own block, if any.
function waterTex(surface) {
  return tex(g => {
    px(g, 0, 0, T, T, "rgba(46, 118, 214, 0.42)");
    const r = rng(surface ? 5 : 9);
    for (let i = 0; i < 6; i++) px(g, (r() * 28) | 0, 4 + ((r() * 24) | 0), 4, 1, "rgba(180, 220, 255, 0.45)");
    if (surface) { px(g, 0, 0, T, 2, "rgba(200, 230, 255, 0.9)"); px(g, 0, 2, T, 1, "rgba(120, 180, 245, 0.7)"); }
  });
}
// A see-through sheet of falling water: pale streaks in columns. Not solid, but it turns a rise away.
function waterfallTex() {
  return tex(g => {
    px(g, 0, 0, T, T, "rgba(70, 150, 235, 0.30)");
    const r = rng(41);
    for (let x = 1; x < T - 1; x += 4) {
      const len = 8 + ((r() * 14) | 0), y0 = (r() * (T - len)) | 0;
      px(g, x, 0, 2, T, "rgba(120, 185, 250, 0.35)");
      px(g, x, y0, 2, len, "rgba(225, 242, 255, 0.85)");
    }
    px(g, 0, 0, 1, T, "rgba(40, 110, 200, 0.55)"); px(g, T - 1, 0, 1, T, "rgba(40, 110, 200, 0.55)");
  });
}
// A round red bumper on a dark plate. Solid: you stand on it, and touching it throws you.
function bumperTex() {
  return tex(g => {
    px(g, 0, 0, T, T, "#2d3548"); px(g, 0, 0, T, 1, "#4a5470"); px(g, 0, T - 1, T, 1, "#1c2230");
    for (let y = 1; y < T - 1; y++) for (let x = 1; x < T - 1; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5);
      const col = d < 4 ? "#fff3b0" : d < 8 ? "#f26a6f" : d < 12 ? "#d1343c" : d < 14 ? "#6e1a20" : null;
      if (col) px(g, x, y, 1, 1, col);
    }
  });
}
// A red-capped mushroom on a dark plate. Solid: you stand on it, and landing on top of it bounces you.
function mushroomTex() {
  return tex(g => {
    px(g, 0, 0, T, T, "#3b3350"); px(g, 0, 0, T, 1, "#5a4f78"); px(g, 0, T - 1, T, 1, "#241f33");
    px(g, 12, 19, 8, 11, "#f0e4c8"); px(g, 17, 19, 3, 11, "#d6c8a6"); px(g, 9, 29, 14, 2, "#d6c8a6");
    for (let y = 4; y <= 18; y++) { const hw = Math.floor(14 * Math.sqrt(1 - ((18 - y) / 14) ** 2)); px(g, 16 - hw, y, hw * 2, 1, "#d1343c"); }
    px(g, 3, 18, 26, 2, "#8e1f27");
    px(g, 8, 8, 4, 2, "#f26a6f");
    for (const [x, y, w, h] of [[11, 11, 4, 3], [19, 8, 5, 4], [23, 14, 3, 3], [15, 15, 3, 2]]) px(g, x, y, w, h, "#fff7f0");
  });
}
// A yellow jelly cube with a shine. Solid: you stand on it, and landing on top of it bounces you by how fast you fell.
function jellyTex() {
  return tex(g => {
    px(g, 0, 0, T, T, "#f2c12e"); px(g, 0, 0, T, 2, "#ffe27a"); px(g, 0, 0, 2, T, "#f7d24f");
    px(g, T - 2, 0, 2, T, "#cf9a1a"); px(g, 0, T - 2, T, 2, "#b8860f");
    px(g, 5, 5, 10, 3, "#fff6c2"); px(g, 5, 8, 3, 6, "#fff6c2");
    for (const [x, y, s] of [[21, 9, 3], [13, 19, 2], [23, 22, 2], [8, 24, 3]]) px(g, x, y, s, s, "#ffe27a");
  });
}
// Glowing lava with brighter blobs. Solid, and touching it from any side throws you.
function lavaTex() {
  return tex(g => {
    px(g, 0, 0, T, T, "#e4571b"); px(g, 0, 0, T, 2, "#ffb03a"); px(g, 0, T - 2, T, 2, "#a8300f");
    for (const [x, y, w, h] of [[4, 6, 8, 4], [18, 4, 9, 3], [10, 15, 10, 4], [22, 17, 6, 4], [3, 24, 9, 3], [17, 26, 10, 3]]) px(g, x, y, w, h, "#ff9a2e");
    for (const [x, y] of [[6, 7], [20, 5], [13, 16], [24, 18], [5, 25], [20, 27]]) px(g, x, y, 3, 1, "#ffe08a");
  });
}
// A blue diving board along the top of the tile, which is where you stand; the rest of the tile is open.
function boardTex() {
  return tex(g => {
    px(g, 0, 0, T, 2, "#ffffff"); px(g, 0, 2, T, 4, "#4f9be0"); px(g, 0, 6, T, 2, "#2c6aa8");
    for (let x = 3; x < T; x += 8) px(g, x, 3, 3, 2, "#cfe6fa");
    px(g, 5, 8, 4, 9, "#7b8794"); px(g, 23, 8, 4, 9, "#7b8794"); px(g, 4, 17, 6, 2, "#5b6672"); px(g, 22, 17, 6, 2, "#5b6672");
  });
}
// A plain wooden plank along the top of the tile, where you stand; the rest of the tile is open.
function platformTex() {
  return tex(g => { px(g, 0, 0, T, 2, "#e0b887"); px(g, 0, 2, T, 4, "#b98452"); px(g, 0, 6, T, 1, "#8e5f34"); for (let x = 5; x < T; x += 9) px(g, x, 3, 1, 2, "#8e5f34"); });
}
function makeTextures() {
  TEX.platform = platformTex();
  TEX.mushroom = mushroomTex(); TEX.board = boardTex(); TEX.jelly = jellyTex(); TEX.lava = lavaTex();
  TEX.bumper = bumperTex(); TEX.fall = waterfallTex();
  TEX.water = [waterTex(false), waterTex(true)];
  TEX.soil = [soilTex(11), soilTex(23), soilTex(37)];
  TEX.turf = [turfTex(5), turfTex(17), turfTex(29)];
  TEX.stone = stoneTex(); TEX.plank = plankTex(); TEX.bed = bedrockTex();
  TEX.spike = [spikeTex(0), spikeTex(1), spikeTex(2), spikeTex(3)];
  TEX.field = fieldTex(); TEX.conveyor = conveyorTex();
}
let worldCanvas = null, wctx = null;
function renderWorld() {
  worldCanvas = document.createElement("canvas");
  worldCanvas.width = LEVEL.W * T; worldCanvas.height = LEVEL.H * T;
  wctx = worldCanvas.getContext("2d"); wctx.imageSmoothingEnabled = false;
  renderTiles(0, 0, LEVEL.W - 1, LEVEL.H - 1);
}
function renderTiles(x0, y0, x1, y1) {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(LEVEL.W - 1, x1); y1 = Math.min(LEVEL.H - 1, y1);
  wctx.clearRect(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * LEVEL.W + x, v = LEVEL.map[i];
    if (LEVEL.water[i]) wctx.drawImage(TEX.water[y > 0 && LEVEL.water[i - LEVEL.W] ? 0 : 1], x * T, y * T);
    if (!v) continue;
    const k = (x * 7 + y * 13) % 3;
    let img = TEX.soil[k];
    if (v === SOIL && !solidAt(world, x, y - 1) && !(y > 0 && LEVEL.map[(y - 1) * LEVEL.W + x] === SPIKE)) img = TEX.turf[k];
    else if (v === STONE) img = TEX.stone;
    else if (v === PLANK) img = TEX.plank;
    else if (v === BEDROCK) img = TEX.bed;
    else if (v === SPIKE) img = TEX.spike[world.sdir[y * LEVEL.W + x]];
    else if (v === FIELD) img = TEX.field;
    else if (v === CONVEYOR) img = TEX.conveyor;
    else if (v === BUMPER) img = TEX.bumper;
    else if (v === WATERFALL) img = TEX.fall;
    else if (v === MUSHROOM) img = TEX.mushroom;
    else if (v === BOARD) img = TEX.board;
    else if (v === PLATFORM) img = TEX.platform;
    else if (v === JELLY) img = TEX.jelly;
    else if (v === LAVA) img = TEX.lava;
    wctx.drawImage(img, x * T, y * T);
  }
}

/* ---------- rendering ---------- */
const cv = document.getElementById("game");
const ctx = cv.getContext("2d");
let zoom = 1, dpr = 1;
// How many times the usual 12 to 20 tiles across the screen shows: 1 is the normal view, 3 shows three times as much.
// The scroll wheel and the buttons change it. panX and panY are how far a right-drag has moved the play camera
// off the player.
const ZOOM_MIN = 0.5, ZOOM_MAX = 3;
let zoomMult = 1, panX = 0, panY = 0;
function resize() {
  const r = cv.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  const tiles = r.width < 520 ? 12 : r.width < 760 ? 16 : 20;
  zoom = cv.width / (tiles * zoomMult * T);
  viewW = cv.width / zoom; viewH = cv.height / zoom;
}
function clampCam() {
  camX = Math.max(0, Math.min(LEVEL.W * T - viewW, camX));
  camY = Math.max(-2 * T, Math.min(LEVEL.H * T - viewH, camY));
}
function centerCameraOn(x, y) { camX = x - viewW / 2; camY = y - viewH / 2; clampCam(); }
const clouds = (() => { const r = rng(7); return Array.from({ length: 9 }, () => ({ x: r() * 1400, y: 20 + r() * 160, s: 0.6 + r() * 0.8 })); })();
function drawBackground() {
  const g = ctx, w = cv.width, h = cv.height;
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, "#7cc6e0"); grd.addColorStop(1, "#d4f0ea");
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.fillStyle = "#a9d7c8";
  const base = (15 * T - camY) * zoom + 4 * zoom, span = 260 * 8;
  for (let i = 0; i < 9; i++) {
    const hx = ((i * 260 - camX * 0.3) % span + span) % span - 260, peak = 70 + (i % 3) * 22;
    g.beginPath(); g.moveTo(hx * zoom, base); g.lineTo((hx + 130) * zoom, base - peak * zoom); g.lineTo((hx + 260) * zoom, base); g.closePath(); g.fill();
  }
  g.fillStyle = "rgba(255,255,255,.85)";
  for (const c of clouds) {
    const x = ((c.x - camX * 0.15) % 1400 + 1400) % 1400 - 60, y = c.y - camY * 0.1, s = c.s * zoom;
    g.fillRect(x * zoom, y * zoom, 48 * s, 12 * s); g.fillRect((x + 10 * c.s) * zoom, (y - 8 * c.s) * zoom, 24 * s, 8 * s);
  }
}
const S = (wx) => (wx - camX) * zoom, SY = (wy) => (wy - camY) * zoom;
function drawGrid() {
  ctx.strokeStyle = "rgba(10,20,15,.22)"; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = Math.floor(camX / T) * T; x <= camX + viewW; x += T) { const sx = Math.round(S(x)) + .5; ctx.moveTo(sx, 0); ctx.lineTo(sx, cv.height); }
  for (let y = Math.floor(camY / T) * T; y <= camY + viewH; y += T) { const sy = Math.round(SY(y)) + .5; ctx.moveTo(0, sy); ctx.lineTo(cv.width, sy); }
  ctx.stroke();
}
function pixelText(text, x, y, size, fg, bg, align) {
  ctx.font = `600 ${Math.round(size * zoom)}px Geist, system-ui, sans-serif`; ctx.textAlign = align || "center"; ctx.textBaseline = "middle";
  if (bg) { const w = ctx.measureText(text).width + 8 * zoom, h = (size + 5) * zoom; const bx = align === "left" ? x - 4 * zoom : x - w / 2; ctx.fillStyle = bg; ctx.fillRect(bx, y - h / 2, w, h); }
  ctx.fillStyle = fg; ctx.fillText(text, x, y + 0.5 * zoom);
}
function drawSigns() {
  for (const s of LEVEL.signs || []) {
    const cx = S(s.x * T), base = SY(15 * T);
    ctx.fillStyle = "#6b4a2c"; ctx.fillRect(cx - 1.5 * zoom, base - 26 * zoom, 3 * zoom, 26 * zoom);
    pixelText(s.text.toUpperCase(), cx, base - 32 * zoom, 8, "#3a2a18", "#e9d2a2");
  }
}
function drawFlag(tx, ty, kind) {
  const x = S(tx * T + 8), y = SY((ty + 1) * T), z = zoom;
  ctx.fillStyle = "#3a3f45"; ctx.fillRect(x, y - 30 * z, 2 * z, 30 * z);
  if (kind === "start") {
    ctx.fillStyle = "#35b25a"; ctx.fillRect(x + 2 * z, y - 30 * z, 14 * z, 9 * z);
    ctx.fillStyle = "#1f7a3a"; ctx.fillRect(x + 2 * z, y - 22 * z, 14 * z, 1 * z);
  } else {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { ctx.fillStyle = (i + j) % 2 ? "#15191d" : "#ffffff"; ctx.fillRect(x + (2 + i * 4) * z, y - (30 - j * 3) * z, 4 * z, 3 * z); }
  }
  pixelText(kind === "start" ? "START" : "FINISH", S(tx * T + 16), y - 38 * z, 7, "#ffffff", "rgba(15,22,18,.72)");
}
function drawDots(pts, color, every) {
  const s = Math.max(2, 3 * zoom);
  for (let i = 0; i < pts.length; i += every) {
    const x = S(pts[i][0]), y = SY(pts[i][1] - P.hitH / 2);
    if (x < -10 || x > cv.width + 10 || y < -10 || y > cv.height + 10) continue;
    ctx.fillStyle = "rgba(20,24,28,.6)"; ctx.fillRect(x - s / 2 - 1, y - s / 2 - 1, s + 2, s + 2);
    ctx.fillStyle = color; ctx.fillRect(x - s / 2, y - s / 2, s, s);
  }
}
const MOD_LABEL = ["ITEM OFF", "", "JET SKI ON", "FLOATIES ON"];   // by P.waterItem after the change (there is no item 1)
function drawRouteOverlay() {
  if (overlay.closest) {
    drawDots(overlay.closest.pts, "#ff5470", 4);
    const e = overlay.closest.pts[overlay.closest.pts.length - 1];
    pixelText("CLOSEST", S(e[0]), SY(e[1] - P.hitH - 10), 7, "#ffffff", "rgba(150,20,40,.85)");
  }
  if (overlay.route) {
    drawDots(overlay.route.pts, "#ffb02e", 4);
    for (const j of overlay.route.jumpAt) { const x = S(j[0]), y = SY(j[1]); ctx.fillStyle = "#15191d"; ctx.beginPath(); ctx.moveTo(x, y - 7 * zoom); ctx.lineTo(x - 5 * zoom, y + 1 * zoom); ctx.lineTo(x + 5 * zoom, y + 1 * zoom); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#ffb02e"; ctx.beginPath(); ctx.moveTo(x, y - 5 * zoom); ctx.lineTo(x - 3 * zoom, y); ctx.lineTo(x + 3 * zoom, y); ctx.closePath(); ctx.fill(); }
    // where the route changes the water item, and to what
    for (const m of overlay.route.mods) { const pt = overlay.route.pts[m.at]; pixelText(MOD_LABEL[m.item], S(pt[0]), SY(pt[1] - P.hitH - 8), 7, "#ffffff", "rgba(20,80,150,.9)"); }
  }
  for (const [key, label] of [["A", "A"], ["B", "B"]]) {
    const m = overlay[key]; if (!m) continue;
    const x = S(m.x), y = SY(m.y - P.hitH - 12);
    ctx.fillStyle = key === "A" ? "#2f6fdb" : "#d9480f"; ctx.beginPath(); ctx.arc(x, y, 8 * zoom, 0, Math.PI * 2); ctx.fill();
    pixelText(label, x, y, 8, "#ffffff", null);
  }
}
function drawTrail() {
  trails.forEach((tr, i) => {
    const alpha = i === trails.length - 1 ? 1 : 0.4, s = Math.max(2, 3 * zoom);
    for (const pt of tr.pts) {
      const sx = S(pt[0]), sy = SY(pt[1]);
      ctx.fillStyle = `rgba(20,28,24,${0.55 * alpha})`; ctx.fillRect(sx - s / 2 - 1, sy - s / 2 - 1, s + 2, s + 2);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`; ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
    }
    if (tr.apexPt && i === trails.length - 1 && tr.done) {
      const ax = S(tr.apexPt[0]), ay = SY(tr.apexPt[1]);
      ctx.fillStyle = "rgba(255,255,255,.95)"; ctx.fillRect(ax - 10 * zoom, ay - 1, 20 * zoom, Math.max(1, zoom));
      pixelText(`${tr.apex.toFixed(0)} px`, ax, ay - 9 * zoom, 8, "#fff", "rgba(15,22,18,.8)");
    }
  });
}
function drawPlayer(p, x, y) {
  const g = ctx, z = zoom;
  let sx = 1, sy = 1;
  if (p.onGround && p.landT < 0.09) { const k = 1 - p.landT / 0.09; sx = 1 + 0.18 * k; sy = 1 - 0.16 * k; }
  else if (!p.onGround && p.vy < -250) { sx = 0.9; sy = 1.1; }
  const bw = 22 * sx, bh = 26 * sy, cx = S(x), fy = SY(y);
  const run = p.onGround && Math.abs(p.vx) > 20, phase = run ? Math.floor(performance.now() / 90) % 2 : 0, f = p.facing;
  g.fillStyle = "#2b3a36";
  const footY = fy - 4 * z;
  if (!p.onGround) { g.fillRect(cx - 8 * z, footY - 1 * z, 6 * z, 4 * z); g.fillRect(cx + 2 * z, footY + 1 * z, 6 * z, 4 * z); }
  else { g.fillRect(cx - 8 * z + (phase ? 2 * z : 0), footY, 6 * z, 4 * z); g.fillRect(cx + 2 * z - (phase ? 2 * z : 0), footY, 6 * z, 4 * z); }
  const top = fy - 4 * z - bh * z, left = cx - bw / 2 * z;
  if (P.doubleJump) drawWings(p, cx, top, bw, bh, f);
  g.fillStyle = "#23645d"; g.fillRect(left - z, top - z, (bw + 2) * z, (bh + 2) * z);
  g.fillStyle = "#3fa396"; g.fillRect(left, top, bw * z, bh * z);
  g.fillStyle = "#63c3b4"; g.fillRect(left, top, bw * z, 3 * z);
  g.fillStyle = "#e9f6ec"; g.fillRect(cx - 5 * z, top + bh * z - 9 * z, 10 * z, 6 * z);
  g.fillStyle = "#3d7d2c"; g.fillRect(cx - 1 * z, top - 6 * z, 2 * z, 6 * z);
  g.fillStyle = "#7fce57"; g.fillRect(cx + (f > 0 ? 1 : -6) * z, top - 8 * z, 5 * z, 3 * z);
  const eyeH = (!p.onGround ? 8 : 6) * z, eyeW = 5 * z, ex = cx + f * 3 * z;
  g.fillStyle = "#ffffff"; g.fillRect(ex - 7 * z, top + 5 * z, eyeW, eyeH); g.fillRect(ex + 2 * z, top + 5 * z, eyeW, eyeH);
  g.fillStyle = "#18221e";
  const pupX = f > 0 ? 2 * z : 0;
  g.fillRect(ex - 7 * z + pupX + z, top + 7 * z, 2 * z, 3 * z); g.fillRect(ex + 2 * z + pupX + z, top + 7 * z, 2 * z, 3 * z);
  if (p.parasolOpen) drawCanopy(cx, top, f);
}
// Wings on the back; they spread for a moment after the air jump, and fold away once it's used.
function drawWings(p, cx, top, bw, bh, f) {
  const g = ctx, z = zoom, back = cx - f * (bw / 2 - 2) * z;
  const flap = p.airJumpT < 0.25, spent = !p.airJump && !p.onGround;
  const span = (flap ? 12 : spent ? 5 : 8) * z, lift = (flap ? 6 : 0) * z, y0 = top + 6 * z - lift;
  const ox = x => back - f * x;
  g.fillStyle = "#6e1f2a";
  g.fillRect(Math.min(ox(0), ox(span)), y0, span, 4 * z);
  g.fillRect(Math.min(ox(2 * z), ox(span - 2 * z)), y0 + 4 * z, span - 4 * z, 4 * z);
  g.fillRect(Math.min(ox(4 * z), ox(span - 4 * z)), y0 + 8 * z, Math.max(z, span - 8 * z), 3 * z);
  g.fillStyle = "#d4424f";
  g.fillRect(Math.min(ox(z), ox(span - z)), y0 + z, span - 2 * z, 2 * z);
}
// An open parasol above the head, the handle down to the hand.
function drawCanopy(cx, top, f) {
  const g = ctx, z = zoom, hx = cx + f * 4 * z, cy = top - 16 * z;
  g.fillStyle = "#e9f6ec"; g.fillRect(hx - z / 2, cy, z, top + 14 * z - cy);
  g.fillStyle = "#2f7f9d"; g.fillRect(hx - 18 * z, cy + 5 * z, 36 * z, 3 * z);
  g.fillStyle = "#8fd6ea"; g.fillRect(hx - 16 * z, cy + 1 * z, 32 * z, 5 * z); g.fillRect(hx - 11 * z, cy - 3 * z, 22 * z, 4 * z); g.fillRect(hx - 5 * z, cy - 5 * z, 10 * z, 2 * z);
  g.fillStyle = "#c3ecf6"; g.fillRect(hx - 9 * z, cy - 2 * z, 6 * z, 2 * z);
}
function drawHover() {
  if (!hover) return;
  const x = S(hover.tx * T), y = SY(hover.ty * T), s = T * zoom;
  ctx.lineWidth = Math.max(1, 2 * zoom / 1.5);
  ctx.strokeStyle = hover.bad ? "rgba(255,70,90,.95)" : "rgba(255,255,255,.95)";
  ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
  if (picking && hover.spot) {
    const sx = S(hover.spot.x), sy = SY(hover.spot.y);
    ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fillRect(sx - 10 * zoom, sy - 2 * zoom, 20 * zoom, 3 * zoom);
  }
}
function render(ix, iy) {
  if (mode === "play") centerCameraOn(ix + panX, iy - P.hitH / 2 + panY);
  else clampCam();
  ctx.imageSmoothingEnabled = false;
  drawBackground();
  if (worldCanvas) {
    const sx = Math.max(0, camX), sy = Math.max(0, camY);
    const sw = Math.min(worldCanvas.width - sx, viewW - (sx - camX)), sh = Math.min(worldCanvas.height - sy, viewH - (sy - camY));
    if (sw > 0 && sh > 0) ctx.drawImage(worldCanvas, sx, sy, sw, sh, S(sx), SY(sy), sw * zoom, sh * zoom);
  }
  if (mode === "build") drawGrid();
  drawSigns();
  drawRouteOverlay();
  if (LEVEL.finish) drawFlag(LEVEL.finish.tx, LEVEL.finish.ty, "finish");
  drawFlag(LEVEL.start.tx, LEVEL.start.ty, "start");
  if (mode === "play") { drawTrail(); drawPlayer(player, ix, iy); }
  drawHover();
  if (runState.flash > 0) { ctx.fillStyle = `rgba(200,30,40,${0.35 * runState.flash})`; ctx.fillRect(0, 0, cv.width, cv.height); }
  if (replay) pixelText(coarse ? "CHECKER'S ROUTE" : "CHECKER'S ROUTE · ESC TO STOP", cv.width / 2, 16 * zoom, 8, "#fff", "rgba(15,22,18,.78)");
  else if (runState.banner > 0 && runState.finished) pixelText(`FINISHED IN ${runState.t.toFixed(2)} S`, cv.width / 2, 22 * zoom, 11, "#fff", "rgba(20,110,50,.88)");
}

/* ---------- game loop ---------- */
function respawn() {
  const s = startPos();
  player = makePlayer(s.x, s.y); prev = { x: player.x, y: player.y };
  trails.length = 0;
  runState.t = 0; runState.started = false; runState.finished = false; runState.banner = 0;
}
function die() {
  runState.deaths++; runState.flash = 1;
  respawn();
}
function replayInput() {
  const r = replay, d = Math.floor(r.i / r.K), k = r.i % r.K;
  if (d >= r.actions.length) return null;
  // a water item change the route makes before this input: the Gear buttons show it, and it costs the air jump
  if (k === 0 && r.mods.has(d)) { P.waterItem = swapItem(P.waterItem, r.mods.get(d)); modChanged(player); syncGear(); }
  const a = r.actions[d], dir = ACT_DIR[a], jump = ACT_JUMP[a];
  const inp = { left: dir < 0, right: dir > 0, jump: !!jump, jumpPressed: k === 0 && !!jump && !r.prevJump };
  if (k === r.K - 1) r.prevJump = !!jump;
  r.i++;
  return inp;
}
function physicsStep() {
  prev = { x: player.x, y: player.y };
  let inp = input;
  if (replay) {
    inp = replayInput();
    if (!inp) { stopReplay(true); inp = { left: false, right: false, jump: false, jumpPressed: false }; }
  } else if (!runState.started && !runState.finished && (input.left || input.right || input.jump)) { runState.started = true; runState.t = 0; }
  const wasGround = player.onGround;
  step(player, inp, P, world);
  if (!replay) input.jumpPressed = false;
  if ((runState.started || replay) && !runState.finished) runState.t += DT;
  if (wasGround && !player.onGround) { trails.push({ pts: [], apex: 0, apexPt: null, done: false }); if (trails.length > 2) trails.shift(); trailClock = 0; }
  const tr = trails[trails.length - 1];
  if (tr && !tr.done) {
    trailClock += DT;
    if (trailClock >= 1 / 30 - 1e-9) { trailClock -= 1 / 30; tr.pts.push([player.x, player.y - P.hitH / 2]); }
    const up = player.jumpStartY - player.y;
    if (up >= tr.apex) { tr.apex = up; tr.apexPt = [player.x, player.y - P.hitH - 2]; }
    if (player.onGround) tr.done = true;
  }
  if (died(world, P, player)) {
    if (replay) { stopReplay(false); }
    die(); return;
  }
  const g = finishGoal();
  if (g && !runState.finished && goalReached(player, g, P)) {
    runState.finished = true; runState.banner = 4;
    if (!replay) { runState.best = runState.best == null ? runState.t : Math.min(runState.best, runState.t); }
  }
}
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (mode === "play") {
    acc += dt * (slow ? 0.25 : 1);
    let n = 0;
    while (acc >= DT && n < 40) { physicsStep(); acc -= DT; n++; }
  } else {
    const pan = 520 * dt;
    if (input.left) camX -= pan; if (input.right) camX += pan;
    if (input.up) camY -= pan; if (input.down) camY += pan;
  }
  runState.flash = Math.max(0, runState.flash - dt * 3);
  runState.banner = Math.max(0, runState.banner - dt);
  const a = acc / DT;
  const x = prev.x + (player.x - prev.x) * a, y = prev.y + (player.y - prev.y) * a;
  render(x, y);
  updateReadout();
  requestAnimationFrame(frame);
}

/* ---------- readout & run stats ---------- */
const R = { x: document.getElementById("r-x"), h: document.getElementById("r-h"), vx: document.getElementById("r-vx"), vy: document.getElementById("r-vy"), j: document.getElementById("r-jump"),
  time: document.getElementById("rs-time"), best: document.getElementById("rs-best"), deaths: document.getElementById("rs-deaths") };
let readoutT = 0;
function updateReadout() {
  const now = performance.now(); if (now - readoutT < 80) return; readoutT = now;
  const groundY = (LEVEL.start.ty + 1) * T;
  R.x.innerHTML = `${(player.x / T).toFixed(1)} <small>t</small>`;
  const hpx = groundY - player.y;
  R.h.innerHTML = `${hpx.toFixed(0)} <small>px · ${(hpx / T).toFixed(2)} t</small>`;
  R.vx.innerHTML = `${Math.abs(player.vx).toFixed(0)} <small>px/s</small>`;
  R.vy.innerHTML = `${(-player.vy).toFixed(0)} <small>px/s</small>`;
  if (player.lastApex != null) R.j.innerHTML = `${player.lastApex.toFixed(0)} px <small>${(player.lastApex / T).toFixed(2)} t · ${player.lastAir.toFixed(2)} s air · held ${player.lastHold.toFixed(2)} s</small>`;
  R.time.textContent = `${runState.t.toFixed(2)} s`;
  R.best.textContent = runState.best == null ? "—" : `${runState.best.toFixed(2)} s`;
  R.deaths.textContent = String(runState.deaths);
}

/* ---------- modes ---------- */
const mPlay = document.getElementById("m-play"), mBuild = document.getElementById("m-build");
const toolsEl = document.getElementById("tools"), buildRow = document.getElementById("buildrow"), readoutEl = document.getElementById("readout");
const runStat = document.getElementById("runstat"), hint = document.getElementById("hint"), hintText = document.getElementById("hint-text");
const keysPlay = document.getElementById("keys-play"), keysBuild = document.getElementById("keys-build");
const padPlay = document.getElementById("pad-play"), padBuild = document.getElementById("pad-build");
function setMode(m) {
  if (m === mode) return;
  stopReplay(false);
  mode = m; panX = panY = 0;
  mPlay.setAttribute("aria-selected", m === "play"); mBuild.setAttribute("aria-selected", m === "build");
  toolsEl.hidden = m !== "build"; buildRow.hidden = m !== "build"; readoutEl.hidden = m !== "play"; runStat.hidden = m !== "play";
  keysPlay.hidden = m !== "play"; keysBuild.hidden = m !== "build";
  padPlay.hidden = m !== "play"; padBuild.hidden = m !== "build";
  input.left = input.right = input.up = input.down = input.jump = false;
  hover = null;
  if (m === "build") { centerCameraOn(player.x, player.y - P.hitH / 2); hintText.textContent = coarse ? "Tap to place tiles" : "Click to build"; }
  else { respawn(); hintText.textContent = coarse ? "Use the buttons below" : "Click to play"; }
  updateHint();
}
mPlay.addEventListener("click", () => setMode("play"));
mBuild.addEventListener("click", () => setMode("build"));

/* ---------- editor ---------- */
const TOOLS = [
  { id: "soil", label: "Dirt", code: SOIL, key: "1" },
  { id: "spike", label: "Spike", code: SPIKE, key: "2", title: "Spike: a full deadly block. Moving into any side of it kills, like in Growtopia, unless a trampoline, a bumper or lava to its left acts first." },
  { id: "start", label: "Start", key: "3" },
  { id: "finish", label: "Finish", key: "4" },
  { id: "field", label: "Antigravity", code: FIELD, key: "5", title: "Antigravity field: not solid. While the middle of your body is inside it, gravity is 0.375 times as strong, you can jump again while falling, and a jump started in it saves one more jump for the air." },
  { id: "conveyor", label: "Conveyor", code: CONVEYOR, key: "6", title: "Conveyor block: not solid. While the middle of your body is inside it you're pushed right at top speed; running left against it gets you 100 px/s at most." },
  { id: "water", label: "Water", key: "7", title: "Water: a flag on the tile, so it can share a tile with a block or a field, and it isn't solid. While the middle of your body is in it, gravity and the fall cap are 0.3 times, running tops out at 125 px/s, a jump is 0.6 times as strong and works while sinking, and a parasol won't open. Erase takes a block out first, then the water." },
  { id: "bumper", label: "Pinball", code: BUMPER, key: "8", title: "Pinball bumper (also the jelly blocks and the energy pulser): solid, and touching it, or standing on it, throws you at 500 px/s straight away from its centre. You go slippery until you land, and the game forgets you're holding jump until you press it again." },
  { id: "fall", label: "Waterfall", code: WATERFALL, key: "9", title: "Waterfall (and the juice waterfall): not solid, and not water. You walk and fall through it and it never changes your gravity or speed. It only refuses any move up that would leave your body in it: from below it's a ceiling, and inside it you can't rise, so a jump there goes nowhere." },
  { id: "mushroom", label: "Mushroom", code: MUSHROOM, key: "M", title: "Mushroom (a trampoline): a solid block. Landing on top of it sets your upward speed to 800 px/s, whatever your fall speed was, and your run and your held jump are left alone: hold jump and you rise about 320 px, let go and about 53. From the side it's a plain wall." },
  { id: "board", label: "Diving board", code: BOARD, key: "B", title: "Diving board (a trampoline platform): solid only from above, so you pass through it from below and from the sides. Landing on top of it bounces you to 800 px/s upward, like the Mushroom." },
  { id: "jelly", label: "Lemon Jelly", code: JELLY, key: "J", title: "Lemon Jelly Block (a trampoline): a solid block. Landing on top of it bounces you by how fast you fell: 1200 px/s up after a full-speed fall, never less than 531. Gravity is weaker for the first few frames of the rise, so after a full-speed fall with jump held you rise about 772 px (24 tiles). From the side it's a plain wall." },
  { id: "lava", label: "Lava", code: LAVA, key: "L", title: "Lava: a solid block that throws you. Landing on it or standing on it throws you up at 800 px/s; jumping up into it sends you back down. Either way you go sideways at 300 px/s or more and are in knockback until you land: much stronger gravity, weak steering, no slowing down. Touching its side flips your sideways speed. In the game 5 hits in a row kill you; here lava never kills." },
  { id: "platform", label: "Platform", code: PLATFORM, key: "P", title: "Platform: solid only from above. You pass through it from below and from the sides, and stand on top of it." },
  { id: "erase", label: "Erase", code: EMPTY, key: "E" }
];
function toolIcon(t) {
  const c = document.createElement("canvas"); c.width = c.height = T; const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
  if (t.id === "soil") g.drawImage(TEX.turf[0], 0, 0);
  else if (t.id === "spike") { g.fillStyle = "#9fd8e6"; g.fillRect(0, 0, T, T); g.drawImage(TEX.spike[0], 0, 0); }
  else if (t.id === "field" || t.id === "conveyor" || t.id === "bumper" || t.id === "fall" || t.id === "mushroom" || t.id === "board" || t.id === "jelly" || t.id === "lava" || t.id === "platform") { g.fillStyle = "#9fd8e6"; g.fillRect(0, 0, T, T); g.drawImage(TEX[t.id], 0, 0); }
  else if (t.id === "water") { g.fillStyle = "#9fd8e6"; g.fillRect(0, 0, T, T); g.drawImage(TEX.water[1], 0, 0); }
  else if (t.id === "start" || t.id === "finish") {
    g.fillStyle = "#9fd8e6"; g.fillRect(0, 0, T, T); g.fillStyle = "#3a3f45"; g.fillRect(9, 4, 3, 26);
    if (t.id === "start") { g.fillStyle = "#35b25a"; g.fillRect(12, 4, 14, 10); }
    else for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { g.fillStyle = (i + j) % 2 ? "#15191d" : "#fff"; g.fillRect(12 + i * 4, 4 + j * 4, 4, 4); }
  } else { g.fillStyle = "#e8ecef"; g.fillRect(0, 0, T, T); g.strokeStyle = "#d64545"; g.lineWidth = 4; g.beginPath(); g.moveTo(8, 8); g.lineTo(24, 24); g.moveTo(24, 8); g.lineTo(8, 24); g.stroke(); }
  return c.toDataURL();
}
function buildTools() {
  toolsEl.replaceChildren(...TOOLS.map(t => {
    const b = document.createElement("button"); b.type = "button"; b.dataset.tool = t.id; b.setAttribute("aria-pressed", t.id === tool);
    if (t.title) b.title = t.title;
    const img = document.createElement("img"); img.src = toolIcon(t); img.alt = "";
    const k = document.createElement("kbd"); k.textContent = t.key;
    b.append(img, document.createTextNode(t.label), k);
    b.addEventListener("click", () => selectTool(t.id));
    return b;
  }));
}
function selectTool(id) { tool = id; toolsEl.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.tool === id)); }
function isMarker(tx, ty) { return (LEVEL.start.tx === tx && LEVEL.start.ty === ty) || (LEVEL.finish && LEVEL.finish.tx === tx && LEVEL.finish.ty === ty); }
function paintAt(tx, ty, erase) {
  if (tx < 0 || ty < 0 || tx >= LEVEL.W || ty >= LEVEL.H) return false;
  const i = ty * LEVEL.W + tx, t = TOOLS.find(t => t.id === (erase ? "erase" : tool));
  if (t.id === "start" || t.id === "finish") {
    if (LEVEL.map[i] !== EMPTY) return false;
    if (t.id === "start") { if (LEVEL.finish && LEVEL.finish.tx === tx && LEVEL.finish.ty === ty) return false; LEVEL.start = { tx, ty }; }
    else { if (LEVEL.start.tx === tx && LEVEL.start.ty === ty) return false; LEVEL.finish = { tx, ty }; }
  } else if (t.id === "water") {
    if (LEVEL.water[i]) return false;
    LEVEL.water[i] = 1;
    renderTiles(tx - 1, ty - 1, tx + 1, ty + 1);
  } else {
    if (t.code !== EMPTY && isMarker(tx, ty)) return false;
    // erasing: a block goes first, and on a tile that's already empty the water goes
    const drains = t.code === EMPTY && LEVEL.map[i] === EMPTY && LEVEL.water[i] === 1;
    if (LEVEL.map[i] === t.code && !drains) return false;
    if (drains) LEVEL.water[i] = 0; else LEVEL.map[i] = t.code;
    refreshSpikes(world, tx - 1, ty - 1, tx + 1, ty + 1);
    refreshFalls(world);
    renderTiles(tx - 1, ty - 1, tx + 1, ty + 1);
  }
  levelVersion++;
  invalidateChecks();
  saveLevel();
  return true;
}
function tileFromEvent(e) {
  const r = cv.getBoundingClientRect();
  const wx = camX + (e.clientX - r.left) * dpr / zoom, wy = camY + (e.clientY - r.top) * dpr / zoom;
  return { tx: Math.floor(wx / T), ty: Math.floor(wy / T), wx, wy };
}
let painting = null;
cv.addEventListener("contextmenu", e => e.preventDefault());
// A right-drag pans the camera. A right-click that doesn't move still erases the tile in Build.
let panning = null;
cv.addEventListener("pointerdown", e => {
  const t = tileFromEvent(e);
  hintUsed = true;
  cv.focus({ preventScroll: true });
  if (picking) { e.preventDefault(); pickSpot(t); return; }
  if (e.button === 2) {
    e.preventDefault(); cv.setPointerCapture(e.pointerId);
    panning = { x: e.clientX, y: e.clientY, t, moved: false };
    return;
  }
  if (mode !== "build") return;
  e.preventDefault();
  cv.setPointerCapture(e.pointerId);
  const erase = tool === "erase";
  pushUndo();
  painting = { erase, last: t, changed: paintAt(t.tx, t.ty, erase) };
});
cv.addEventListener("pointermove", e => {
  if (panning) {
    const dx = e.clientX - panning.x, dy = e.clientY - panning.y;
    if (panning.moved || Math.abs(dx) + Math.abs(dy) > 4) {
      panning.moved = true; panning.x = e.clientX; panning.y = e.clientY;
      if (mode === "play") { panX -= dx * dpr / zoom; panY -= dy * dpr / zoom; }
      else { camX -= dx * dpr / zoom; camY -= dy * dpr / zoom; clampCam(); }
    }
    return;
  }
  const t = tileFromEvent(e);
  if (mode === "build" || picking) {
    hover = { tx: t.tx, ty: t.ty };
    if (picking) { const sp = resolveSpot(t, picking === "B"); hover.spot = sp && sp.stand ? { x: sp.x, y: sp.y } : null; hover.bad = !sp; }
  }
  if (!painting || tool === "start" || tool === "finish") return;
  // paint every tile along the drag so fast strokes leave no gaps
  const a = painting.last, n = Math.max(Math.abs(t.tx - a.tx), Math.abs(t.ty - a.ty));
  for (let i = 1; i <= n; i++) {
    const tx = Math.round(a.tx + (t.tx - a.tx) * i / n), ty = Math.round(a.ty + (t.ty - a.ty) * i / n);
    if (paintAt(tx, ty, painting.erase)) painting.changed = true;
  }
  painting.last = t;
});
function endPaint() { if (painting && !painting.changed) undoStack.pop(); painting = null; updateBuildButtons(); }
function endPointer(e) {
  if (panning) {
    const p = panning; panning = null;
    if (!p.moved && e.type === "pointerup" && mode === "build") { pushUndo(); if (!paintAt(p.t.tx, p.t.ty, true)) undoStack.pop(); updateBuildButtons(); }
    return;
  }
  endPaint();
}
cv.addEventListener("pointerup", endPointer); cv.addEventListener("pointercancel", endPointer);
cv.addEventListener("pointerleave", () => { hover = null; });
cv.addEventListener("wheel", e => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });

const bUndo = document.getElementById("b-undo");
function updateBuildButtons() { bUndo.disabled = undoStack.length === 0; }
bUndo.addEventListener("click", undo);
const presetSel = document.getElementById("b-preset");
PRESETS.forEach((p, i) => presetSel.appendChild(new Option(p.name, String(i))));
presetSel.addEventListener("change", () => {
  const p = PRESETS[+presetSel.value]; presetSel.value = "";
  if (p) { pushUndo(); setLevel(decodeLevel(p.code)); }
});
document.getElementById("b-clear").addEventListener("click", () => { pushUndo(); setLevel(presetBlankSized(WORLD_W, WORLD_H)); });
// A Growtopia world: 100 x 60 tiles, empty but for the bedrock row at the bottom. The start and the finish
// stand on it, at the two ends.
const WORLD_W = 100, WORLD_H = 60;
function presetBlankSized(W, H) {
  const L = { W, H, map: new Uint8Array(W * H), water: new Uint8Array(W * H), start: { tx: 3, ty: H - 2 }, finish: { tx: W - 4, ty: H - 2 }, signs: [] };
  for (let x = 0; x < W; x++) L.map[(H - 1) * W + x] = BEDROCK;
  return L;
}
const codeBox = document.getElementById("codebox"), codeIn = document.getElementById("code-in"), codeMsg = document.getElementById("code-msg");
document.getElementById("b-copy").addEventListener("click", () => {
  const code = encodeLevel(LEVEL);
  codeBox.hidden = false; codeIn.value = code; codeMsg.textContent = "";
  const done = () => { codeMsg.textContent = "Copied. Anyone can paste it into Load a code."; };
  try { navigator.clipboard.writeText(code).then(done, () => { codeIn.select(); codeMsg.textContent = "Select the code above and copy it."; }); } catch (e) { codeIn.select(); codeMsg.textContent = "Select the code above and copy it."; }
});
document.getElementById("b-paste").addEventListener("click", () => { codeBox.hidden = false; codeIn.value = ""; codeMsg.textContent = "Paste a level code, then Load."; codeIn.focus(); });
document.getElementById("code-go").addEventListener("click", () => {
  try { const L = decodeLevel(codeIn.value); pushUndo(); setLevel(L); codeMsg.textContent = `Loaded a ${L.W} × ${L.H} level.`; }
  catch (err) { codeMsg.textContent = err.message; }
});

/* ---------- keyboard ---------- */
const KEYMAP = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", Space: "jump", KeyW: "jump", ArrowUp: "jump", ArrowDown: "down", KeyS: "down" };
function press(k, down) {
  if (mode === "build") { if (k === "jump") k = "up"; input[k] = down; return; }
  if (k === "jump") { if (down && !input.jump) input.jumpPressed = true; input.jump = down; }
  else if (k === "left" || k === "right") input[k] = down;
}
cv.addEventListener("keydown", e => {
  if (e.key === "Escape") { if (replay) stopReplay(false); if (picking) cancelPicking(); return; }
  if (mode === "build") {
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") { e.preventDefault(); undo(); return; }
    const t = TOOLS.find(t => t.key.toLowerCase() === e.key.toLowerCase());
    if (t && !e.ctrlKey && !e.metaKey) { selectTool(t.id); return; }
  } else if (e.code === "KeyR") { stopReplay(false); respawn(); return; }
  const k = KEYMAP[e.code]; if (!k) return;
  e.preventDefault();
  if (replay && mode === "play") return;
  if (!e.repeat) press(k, true);
});
cv.addEventListener("keyup", e => { const k = KEYMAP[e.code]; if (!k) return; e.preventDefault(); press(k, false); });
let focused = false;
const coarse = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);
// On touch screens the hint goes away for good once the pads or the screen are used; with a keyboard it returns whenever the game loses focus.
let hintUsed = false;
function updateHint() { hint.hidden = focused || !!picking || (coarse && hintUsed); }
cv.addEventListener("focus", () => { focused = true; updateHint(); });
cv.addEventListener("blur", () => { focused = false; updateHint(); input.left = input.right = input.up = input.down = input.jump = false; });
function bindPad(root) {
  root.querySelectorAll("button").forEach(b => {
    const k = b.dataset.key;
    const on = e => { e.preventDefault(); b.classList.add("on"); press(k, true); hintUsed = true; updateHint(); };
    const off = e => { e.preventDefault(); b.classList.remove("on"); press(k, false); };
    b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointercancel", off); b.addEventListener("pointerleave", off);
  });
}
bindPad(padPlay); bindPad(padBuild);
document.getElementById("b-reset").addEventListener("click", () => { panX = panY = 0; stopReplay(false); if (mode === "play") respawn(); else centerCameraOn(startPos().x, startPos().y); cv.focus({ preventScroll: true }); });
const bZoomOut = document.getElementById("b-zoomout"), bZoomIn = document.getElementById("b-zoomin");
// Zoom by a factor; in Build the point under the pointer (cx, cy, client px) stays where it is.
function zoomBy(f, cx, cy) {
  const old = zoomMult;
  zoomMult = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, old * f));
  bZoomOut.disabled = zoomMult >= ZOOM_MAX - 1e-9; bZoomIn.disabled = zoomMult <= ZOOM_MIN + 1e-9;
  if (zoomMult === old) return;
  const at = mode === "build" && cx != null ? tileFromEvent({ clientX: cx, clientY: cy }) : null;
  resize();
  if (at) { const r = cv.getBoundingClientRect(); camX = at.wx - (cx - r.left) * dpr / zoom; camY = at.wy - (cy - r.top) * dpr / zoom; }
  clampCam();
}
bZoomOut.addEventListener("click", () => { zoomBy(1.25); cv.focus({ preventScroll: true }); });
bZoomIn.addEventListener("click", () => { zoomBy(1 / 1.25); cv.focus({ preventScroll: true }); });
const bSlow = document.getElementById("b-slow");
bSlow.addEventListener("click", () => { slow = !slow; bSlow.setAttribute("aria-pressed", slow); cv.focus({ preventScroll: true }); });

/* ---------- route checker ---------- */
const ckRoute = document.getElementById("ck-route"), ckJump = document.getElementById("ck-jump");
const ckBox = document.getElementById("ck-result"), ckIc = document.getElementById("ck-ic"), ckText = document.getElementById("ck-text"), ckSub = document.getElementById("ck-sub"), ckActs = document.getElementById("ck-acts");
const ckNoLimit = document.getElementById("ck-nolimit");   // read when a check starts
const ckSwap = document.getElementById("ck-swap");         // the checker may change the water item on the way; read then too
// How often the checker may change its inputs, in game frames; the slider is read when a check starts.
const ckRate = document.getElementById("ck-rate"), ckRateVal = document.getElementById("ck-rate-val");
const every = k => k === 1 ? "game frame" : `${k} game frames`;
const showRate = () => { ckRateVal.textContent = `${every(+ckRate.value)} (${Math.round(+ckRate.value * DT * 1000)} ms)`; };
ckRate.addEventListener("input", showRate); showRate();
document.getElementById("ck-cap").textContent = fmtNodes(FASTEST_MAX_NODES);
const IDLE_TEXT = "Check whether the start can reach the finish, or test a single jump between two spots.";
function showResult(state, text, sub, actions) {
  ckBox.dataset.state = state;
  ckIc.textContent = state === "ok" ? "✓" : state === "bad" ? "✕" : state === "busy" ? "…" : "?";
  ckText.textContent = text; ckSub.textContent = sub || "";
  ckActs.replaceChildren(...(actions || []).map(([label, fn, primary]) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; if (primary) b.className = "primary"; b.addEventListener("click", fn); return b; }));
}
function clearOverlays() { overlay.route = overlay.closest = null; }
function invalidateChecks() {
  cancelCheck();
  const had = overlay.route || overlay.closest;
  clearOverlays(); overlay.A = overlay.B = null;
  if (picking) cancelPicking();
  if (replay) stopReplay(false);
  if (had || ckBox.dataset.state !== "idle") showResult("idle", "The level or physics changed, so earlier results were cleared.", "Run a check again to see where things stand.");
}
function onPhysicsChanged() { invalidateChecks(); }
let worker = null, job = null, jobSeq = 0, workerBroken = false;
function ensureWorker() {
  if (worker || workerBroken) return worker;
  try {
    worker = new Worker("js/worker.js");   // loads core.js and levels.js itself
    worker.onmessage = onWorkerMessage;
    // If the page isn't allowed a worker, or it fails, run the same search on this thread in slices.
    worker.onerror = e => { if (e && e.preventDefault) e.preventDefault(); workerBroken = true; worker = null; if (job) runSync(job); };
  } catch (err) { workerBroken = true; worker = null; }
  return worker;
}
function cancelCheck() {
  if (!job) return;
  job = null;
  if (worker) { worker.terminate(); worker = null; }
  setBusyButtons(false);
}
function setBusyButtons(b) { ckRoute.disabled = b; }
const PASSES = CHECK_PASSES;   // defined in core.js
// The passes run coarsest first, so say which precision the count is at
const passNote = (j, pass) => !j.passes[pass] ? "" : ` at ${j.passes[pass].cellPx} px precision`;
function startJob(kind, start, goal, bounds, passes, extra) {
  cancelCheck();
  const noLimit = ckNoLimit.checked;
  passes = noLimit ? unlimitedPasses(passes) : passes;   // no limit also lifts the finest pass's budget
  const steps = +ckRate.value, swap = ckSwap.checked;
  passes = passes.map(p => Object.assign({}, p, { stepsPerDecision: steps, swap }));
  const j = Object.assign({ id: ++jobSeq, kind, start, goal, bounds, passes, noLimit, swap, P: Object.assign({}, P), level: levelVersion }, extra || {});
  job = j;
  setBusyButtons(true);
  showResult("busy", "Searching for a way through…", `Trying runs and jumps${swap ? " and water item changes" : ""} with inputs every ${every(steps)}.`, [["Stop", () => { cancelCheck(); showResult("idle", "Stopped.", ""); }]]);
  const msg = { id: j.id, W: LEVEL.W, H: LEVEL.H, map: LEVEL.map.slice(), water: LEVEL.water.slice(), P: j.P, start, goal, bounds, passes, noLimit: j.noLimit, frameMs: Math.round(DT * 1000) };
  const w = ensureWorker();
  if (w) w.postMessage(msg); else runSync(j, msg);
}
// The worker's job on this thread, in slices: the passes, then (once a route is found) the fastest route.
function runSync(j, msg) {
  msg = msg || { id: j.id, W: LEVEL.W, H: LEVEL.H, map: LEVEL.map.slice(), water: LEVEL.water.slice(), P: j.P, start: j.start, goal: j.goal, bounds: j.bounds, passes: j.passes, noLimit: j.noLimit };
  const w = makeWorld(msg.W, msg.H, msg.map, msg.water);
  const send = data => onWorkerMessage({ data: Object.assign({ id: j.id }, data) });
  const passes = makePasses(w, msg.P, msg.start, msg.goal, msg.bounds, msg.passes);
  let search = null, lastNote = 0;   // search: the fastest-route search, once a route is found
  const slice = () => {
    if (!job || job.id !== j.id) return;
    const t0 = performance.now(); let res = null;
    if (search) {
      while (!(res = search.run(1000)) && performance.now() - t0 < 12) {}
      if (!res) { setTimeout(slice, 0); return; }
      send({ type: "done", res }); return;
    }
    while (!(res = passes.run(1000)) && performance.now() - t0 < 12) {}
    if (!res) {
      if (t0 - lastNote > 250) { lastNote = t0; send({ type: "progress", pass: passes.pass(), nodes: passes.nodes() }); }
      setTimeout(slice, 0); return;
    }
    if (!res.found) { send({ type: "done", res }); return; }
    send({ type: "found", res });
    search = makeSearch(w, msg.P, msg.start, msg.goal, fastestOptions(msg.bounds, res,
      (ex, nodes, low) => send({ type: "progress", fastest: true, nodes, low }), (actions, time) => send({ type: "better", actions, time }), msg.noLimit));
    setTimeout(slice, 0);
  };
  setTimeout(slice, 30);
}
function onWorkerMessage(e) {
  const m = e.data;
  if (!job || m.id !== job.id) return;
  const j = job;
  if (m.type === "progress") {
    if (m.fastest) { j.low = m.low; ckSub.textContent = `Looking for a faster route… nothing under ${floor2(m.low)} s so far (${fmtNodes(m.nodes)} positions).`; }
    else ckSub.textContent = `Checked ${Math.round(m.nodes / 1000)}k positions${passNote(j, m.pass)}…`;
    return;
  }
  // A route is found: show it while the worker goes on to the fastest one, which a new check may cut short.
  if (m.type === "found") { j.phase = "fastest"; j.K = m.res.K; setBusyButtons(false); showRoute(j, m.res.actions, false, "Looking for a faster route…"); return; }
  if (m.type === "better") { showRoute(j, m.actions, false, "Found a faster one. Still looking…"); return; }
  job = null; setBusyButtons(false);
  if (j.level !== levelVersion) return;
  if (j.phase === "fastest") showFastest(j, m.res); else handleResult(j, m.res);
}
function fmtNodes(n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + " million" : Math.round(n / 1000) + "k"; }
const floor2 = s => (Math.floor(s * 100) / 100).toFixed(2);   // a lower bound, rounded down
// Draws a found route and says how long it takes. note: the line under that.
function showRoute(j, actions, fastest, note) {
  const rep = replayRoute(world, j.P, j.start, actions, j.K, j.goal);
  overlay.route = { pts: rep.pts, jumpAt: findJumps(rep.pts), mods: rep.mods, actions, K: j.K, start: j.start, goal: j.goal, kind: j.kind };
  overlay.closest = null;
  const what = j.kind === "route" ? "the finish" : "B", secs = ((rep.pts.length - 1) * DT).toFixed(2);
  const jumps = `${rep.jumps} jump${rep.jumps === 1 ? "" : "s"}${rep.mods.length ? ` and ${rep.mods.length} water item change${rep.mods.length === 1 ? "" : "s"}` : ""}`;
  const looking = job === j;
  showResult("ok", `${fastest ? "Possible. The fastest route reaches" : "Possible. The checker reached"} ${what} in ${secs} s with ${jumps}.`, note,
    [["Watch it", () => startReplay(), true], ...(looking ? [["Stop looking", () => stopLooking(j)]] : []),
     ["Hide path", () => { if (job === j) cancelCheck(); overlay.route = null; showResult("idle", IDLE_TEXT, ""); }]]);
}
function stopLooking(j) {
  if (job !== j) return;
  cancelCheck();
  if (overlay.route) showRoute(j, overlay.route.actions, false,
    `Stopped looking for a faster route${j.low ? `; one would take at least ${floor2(j.low)} s` : ""}. The yellow dots are its path.`);
}
function showFastest(j, res) {
  const what = j.kind === "route" ? "the finish" : "B";
  showRoute(j, res.actions, res.optimal, res.optimal
    ? `Nothing reaches ${what} sooner with inputs every ${every(res.K)}${j.kind === "jump" ? " inside the test area" : ""}. The yellow dots are its path. Watch it to see the exact inputs play out in the game.`
    : res.outOfMemory
    ? `A faster route would take at least ${floor2(res.lowerBound)} s, but the search for one ran out of memory after ${fmtNodes(res.nodes)} positions. The yellow dots are its path.`
    : `A faster route would take at least ${floor2(res.lowerBound)} s, but the search for one stopped after ${fmtNodes(res.nodes)} positions. Tick "No limit" and check again to settle it. The yellow dots are its path.`);
}
function handleResult(j, res) {
  const what = j.kind === "route" ? "the finish" : "B";
  if (res.found) {
    j.K = res.K;
    showRoute(j, res.actions, false, "The yellow dots are its path. Watch it to see the exact inputs play out in the game.");
  } else {
    if (res.closest && res.closest.length) {
      const rep = replayRoute(world, j.P, j.start, res.closest, res.K, null);
      overlay.closest = { pts: rep.pts };
    }
    overlay.route = null;
    const hide = [["Hide", () => { overlay.closest = null; showResult("idle", IDLE_TEXT, ""); }]];
    const tip = j.kind === "route" ? " For an exact answer on one gap, use Test one jump next to the red dots." : "";
    const more = j.noLimit ? "" : ' Tick "No limit" and check again to search every position.';
    if (res.exhausted && res.cellPx <= 1) {
      showResult("bad", `Not possible with these physics: nothing reaches ${what}.`,
        `Every run and jump${j.swap ? " and water item change" : ""} was tried, with inputs every ${every(res.K)}, until nothing new turned up (${fmtNodes(res.nodes)} positions; spots within ${res.cellPx} px and ${res.cellSpeed} px/s count as the same). Red dots show how close it got.`, hide);
    } else if (res.exhausted) {
      const f = res.finer;
      showResult("bad", `Probably not possible: nothing reaches ${what}.`,
        `The finest search${f ? ` (${f.cellPx} px)` : ""} ran out of ${f && f.outOfMemory ? "memory" : "room"}${f ? ` after ${fmtNodes(f.nodes)} positions` : ""}, so this comes from a coarser one that counted spots within ${res.cellPx} px and ${res.cellSpeed} px/s as the same. A route with only that much to spare could slip through.${more}${tip} Red dots show how close it got.`, hide);
    } else {
      showResult("bad", "No route found, but the level is too big to rule one out.",
        `The checker ${res.outOfMemory ? "ran out of memory" : "stopped"} after ${fmtNodes(res.nodes)} positions. Red dots show how far it got.${more}${tip || " Try a smaller gap."}`, hide);
    }
  }
}
function findJumps(pts) {
  const out = [];
  for (let i = 2; i < pts.length; i++) if (pts[i - 1][1] === pts[i - 2][1] && pts[i][1] < pts[i - 1][1] - 0.5) out.push([pts[i - 1][0], pts[i - 1][1]]);
  return out;
}
ckRoute.addEventListener("click", () => {
  if (picking) cancelPicking();
  const g = finishGoal();
  if (!g) { showResult("bad", "Place a finish flag first.", "Switch to Build, pick Finish, and click an empty tile."); return; }
  overlay.A = overlay.B = null; clearOverlays();
  startJob("route", startPos(), g, null, PASSES);
});

/* jump test: pick A (stand) then B (stand or touch) */
function resolveSpot(t, allowTouch) {
  const { tx, ty } = t;
  if (tx < 0 || tx >= LEVEL.W || ty < 0 || ty >= LEVEL.H) return null;
  const v = LEVEL.map[ty * LEVEL.W + tx];
  // The top of the block in row y. A diving board is stood on from above like a block. A trampoline or lava
  // throws you off at once, so as the landing spot (B) it's the tile just above it that has to be touched.
  const top = (y, u) => ({ stand: !(allowTouch && (u === MUSHROOM || u === BOARD || u === JELLY || u === LAVA)), tx, ty: y - 1, x: tx * T + T / 2, y: y * T });
  if (isSolidCode(v) || v === BOARD || v === PLATFORM) {
    if (ty > 0 && isPassableCode(LEVEL.map[(ty - 1) * LEVEL.W + tx])) return top(ty, v);
    return null;
  }
  if (v === SPIKE) return null;
  for (let y = ty + 1; y <= Math.min(LEVEL.H - 1, ty + 3); y++) {
    const u = LEVEL.map[y * LEVEL.W + tx];
    if (isSolidCode(u) || u === BOARD || u === PLATFORM) return top(y, u);
    if (!isPassableCode(u)) break;
  }
  return allowTouch ? { stand: false, tx, ty, x: tx * T + T / 2, y: (ty + 1) * T } : null;
}
function cancelPicking() { picking = null; ckJump.setAttribute("aria-pressed", "false"); hover = null; updateHint(); }
ckJump.addEventListener("click", () => {
  if (picking) { cancelPicking(); showResult("idle", IDLE_TEXT, ""); return; }
  cancelCheck(); clearOverlays(); overlay.A = overlay.B = null;
  picking = "A"; ckJump.setAttribute("aria-pressed", "true"); updateHint();
  showResult("idle", "Click the spot to jump from (A).", "Click a block to stand on it. Esc cancels.");
});
function pickSpot(t) {
  const sp = resolveSpot(t, picking === "B");
  if (!sp) { ckSub.textContent = "That spot has nothing to stand on. Pick a block or the air just above one."; return; }
  if (picking === "A") {
    overlay.A = { x: sp.x, y: sp.y }; picking = "B";
    showResult("idle", "Now click where to land (B).", "Click a block to land on it, or an empty tile to just touch it.");
    return;
  }
  overlay.B = { x: sp.x, y: sp.y };
  const A = overlay.A;
  const goal = sp.stand ? { kind: "stand", x0: sp.tx * T, x1: (sp.tx + 1) * T, y: sp.y } : { kind: "touch", x0: sp.tx * T, y0: sp.ty * T, x1: (sp.tx + 1) * T, y1: (sp.ty + 1) * T };
  const bounds = [Math.min(A.x, sp.x) - 6 * T, Math.min(A.y, sp.y) - headroomTiles(P, LEVEL.map.some(v => v === MUSHROOM || v === BOARD), LEVEL.map.includes(JELLY)) * T, Math.max(A.x, sp.x) + 6 * T, Math.max(A.y, sp.y) + 3 * T];
  picking = null; ckJump.setAttribute("aria-pressed", "false"); hover = null; updateHint();
  startJob("jump", { x: A.x, y: A.y }, goal, bounds, PASSES);
}

/* replay the checker's route in the game */
function startReplay() {
  const r = overlay.route; if (!r) return;
  if (replay) stopReplay(true);   // a replay still running: back to the water item it started with
  if (mode !== "play") setMode("play");
  player = makePlayer(r.start.x, r.start.y);
  step(player, { left: false, right: false, jump: false, jumpPressed: false }, P, world);
  prev = { x: player.x, y: player.y };
  trails.length = 0;
  runState.t = 0; runState.started = true; runState.finished = false;
  // The route's water item changes take no frame, so they are set apart: mods says before which input each
  // comes. item is the one worn now, to go back to when the replay ends.
  const acts = [], mods = new Map();
  for (const a of r.actions) { if (a >= 6) mods.set(acts.length, a); else acts.push(a); }
  replay = { actions: acts, mods, K: r.K, i: 0, prevJump: false, item: P.waterItem };
  acc = 0;
  cv.focus({ preventScroll: true });
}
function stopReplay(completed) {
  if (!replay) return;
  if (P.waterItem !== replay.item) { P.waterItem = replay.item; syncGear(); }
  replay = null;
  input.left = input.right = input.jump = false;
  if (!completed) respawn();
}
