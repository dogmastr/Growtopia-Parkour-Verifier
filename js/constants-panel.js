/* ---------- constants panel ---------- */
const CONSTS = [
  // shown and edited as the speed you run at with the speed items worn (runSpeed itself is without them)
  { key: "runSpeed", label: "Top speed", unit: "px/s", min: 80, max: 600, step: 1, scale: () => SPEED_ITEMS[P.speedItems] || 1,
    worn: () => P.speedItems === 3 ? " · 3 speed items" : "", note: "Default <b>250 px/s</b>, ground and air. A held run averages 240 (it brakes every other frame). 3 speed items: ×1.75, a guess; the server sends the real value." },
  { key: "runAccel", label: "Acceleration", unit: "px/s²", min: 200, max: 6000, step: 10, note: "Default. Top speed <b>0.22 s</b> after pressing; reversing slows you this fast too." },
  // shown and edited as it is with the high jump item worn, like the top speed
  { key: "gravity", label: "Gravity", unit: "px/s²", min: 200, max: 4000, step: 10, scale: () => P.highJump ? HIGH_JUMP.gravity : 1,
    worn: () => P.highJump ? " · high jump" : "", note: "Default, same rising and falling; also sets how long you stay pinned under a ceiling. High jump item: ×0.713, a guess; the server sends the real value." },
  { key: "waterSpeed", label: "Water top speed", unit: "px/s", min: 20, max: 600, step: 1, note: "Server value, usually <b>125 px/s</b>. Replaces top speed while your body's middle is in water; acceleration is unchanged and speed items don't affect it." }
];
// Built into the game: shown, never edited, so no sliders. [label, value, what it does (the tooltip)]
const BUILTIN = [
  ["Deceleration", () => `${P.runDecel} px/s²`, "Used with no key held: you slide 24 px from full speed."],
  ["Jump speed", () => `${P.jumpSpeed} px/s`, "A jump sets the upward speed to this, whatever it was."],
  ["Extra gravity on release", () => `${P.jumpCut} px/s²`, "Letting go while rising adds this to gravity, braking the rise: a 1-frame tap hops 20 px."],
  ["Fall speed cap", () => `${P.maxFall} px/s`, "Falls stop speeding up here, after about 83 px."],
  ["Parasol gravity", () => `×${P.glide.toFixed(2)}`, "Holding jump while falling with a parasol leaves this share of gravity; it never brakes a faster fall."],
  ["Hitbox", () => `${P.hitW} × ${P.hitH} px`, "The usual spawn box."],
  ["Antigravity field", () => `gravity ×${FIELD_GRAVITY}`, "Acts on the middle of your body."],
  ["Conveyor push · back", () => `${CONVEYOR_PUSH} · ${CONVEYOR_BACK} px/s`, "Pushes right, cut to top speed; running back against it gets this much at most."],
  ["Water gravity · fall cap", () => `×${WATER_SLOW} · ${Math.round(P.maxFall * WATER_SLOW)} px/s`, "A faster fall is cut to the cap on your first frame in; going up isn't capped."],
  ["Water jump", () => `×${WATER_JUMP} · ${Math.round(P.jumpSpeed * WATER_JUMP)} px/s`, "Works from the bottom, or in open water while you're sinking."],
  ["Bumper launch", () => `${PINBALL_SPEED} px/s`, "Straight away from the bumper's centre; your old speed is dropped."],
  ["Slippery steering · wall bounce", () => `${Math.round(SLIPPERY_STEER * 100)}% · ${Math.round(SLIPPERY_BOUNCE * 100)}%`, "After a bumper, until you land: steering while rising, and the share of your speed a wall throws back."],
  ["Trampoline bounce", () => `${TRAMPOLINE_SPEED} px/s`, "Mushroom and Diving Board: your upward speed is set to this on landing."],
  ["Float item time", () => `${Math.round(FLOAT_FRAMES * DT)} s`, "From entering the water; the Fishing Dinghy and the Jet Skis have no limit."],
  ["Floaties: sink cut · push", () => `${FLOATIE_SINK} px/s · ${FLOATIE_SINK_PUSH} px/s²`, "Sinking is cut to this speed and pushed back up, so you sink only 2 to 3 px."],
  ["Floaties: rise push · cap", () => `${FLOATIE_RISE_PUSH} px/s² · ${FLOATIE_RISE_CAP} px/s`, "Rising gets a gentle push, and upward speed (jumps too) is capped."]
];
const constsEl = document.getElementById("consts");
const bMeasured = document.getElementById("b-measured");
function fmtVal(c, v) { return (c.fmt ? c.fmt(v) : Math.round(v).toString()) + " " + c.unit; }
function buildConsts() {
  const frag = document.createDocumentFragment();
  for (const c of CONSTS) {
    const row = document.createElement("div"); row.className = "const";
    row.innerHTML = `<label for="c-${c.key}">${c.label}<span class="worn"></span>${c.est ? '<span class="chip est">estimate</span>' : ""}<span class="chip edit" hidden>edited</span></label>
      <output id="o-${c.key}" for="c-${c.key}"></output>
      <input type="range" id="c-${c.key}" min="${c.min}" max="${c.max}" step="${c.step}" value="${P[c.key]}">
      <p class="note">${c.note}</p>`;
    frag.appendChild(row);
    const inp = row.querySelector("input"), out = row.querySelector("output"), chip = row.querySelector(".chip.edit"), worn = row.querySelector(".worn");
    const scale = () => c.scale ? c.scale() : 1;
    const sync = () => {
      out.textContent = fmtVal(c, P[c.key] * scale()); worn.textContent = c.worn ? c.worn() : "";
      chip.hidden = Math.abs(P[c.key] - GAME[c.key]) < 1e-9;
    };
    inp.addEventListener("input", () => { P[c.key] = parseFloat(inp.value) / scale(); sync(); onConstChange(); });
    c.sync = () => { inp.value = P[c.key] * scale(); sync(); };
    c.sync();
  }
  constsEl.appendChild(frag);
}
bMeasured.addEventListener("click", () => { Object.assign(P, GAME); CONSTS.forEach(c => c.sync && c.sync()); onConstChange(); });
function edited() { return Object.keys(GAME).some(k => P[k] !== GAME[k]); }

/* gear: wings (a double jump), a parasol, 3 speed items, the high jump item and one water item, remembered in this browser */
const GEAR_KEY = "tile-hopper-lab.gear.v1";
const gearBtns = { doubleJump: document.getElementById("g-wings"), parasol: document.getElementById("g-parasol"), highJump: document.getElementById("g-highjump") };
const speedBtn = document.getElementById("g-speed");   // pressed: 3 speed items, else none
// P.waterItem, one at a time: 1 a float item (3 s), 2 the Fishing Dinghy or a Jet Ski (no limit), 3 floaties
const waterBtns = { 1: document.getElementById("g-float"), 2: document.getElementById("g-jet"), 3: document.getElementById("g-floaties") };
function syncGear() {
  for (const k in gearBtns) gearBtns[k].setAttribute("aria-pressed", String(!!P[k]));
  speedBtn.setAttribute("aria-pressed", String(P.speedItems === 3));
  for (const k in waterBtns) waterBtns[k].setAttribute("aria-pressed", String(P.waterItem === +k));
}
function loadGear() {
  try {
    const g = JSON.parse(localStorage.getItem(GEAR_KEY) || "null");
    if (g) { P.doubleJump = !!g.doubleJump; P.parasol = !!g.parasol; P.speedItems = g.speedItems === 3 ? 3 : 0; P.highJump = !!g.highJump; P.waterItem = [1, 2, 3].includes(g.waterItem) ? g.waterItem : 0; }
  } catch (e) { /* storage off: no gear */ }
  syncGear();
}
function gearChanged() {
  syncGear();
  CONSTS.forEach(c => c.sync && c.sync());   // the top speed and gravities shown depend on the items worn
  try { localStorage.setItem(GEAR_KEY, JSON.stringify({ doubleJump: !!P.doubleJump, parasol: !!P.parasol, speedItems: P.speedItems === 3 ? 3 : 0, highJump: !!P.highJump, waterItem: P.waterItem || 0 })); } catch (e) { /* this visit only */ }
  onConstChange();
}
for (const k in gearBtns) gearBtns[k].addEventListener("click", () => { P[k] = !P[k]; gearChanged(); });
speedBtn.addEventListener("click", () => { P.speedItems = P.speedItems === 3 ? 0 : 3; gearChanged(); });
for (const k in waterBtns) waterBtns[k].addEventListener("click", () => { P.waterItem = P.waterItem === +k ? 0 : +k; gearChanged(); });

/* frame length: every frame 16 ms (the game showing 63 fps) or 17 ms (59 fps), for the game and the checker alike */
const frameBtns = { 16: document.getElementById("f-16"), 17: document.getElementById("f-17") };
for (const ms in frameBtns) frameBtns[ms].addEventListener("click", () => {
  setFrameMs(+ms);
  for (const k in frameBtns) frameBtns[k].setAttribute("aria-pressed", String(k === ms));
  showRate(); onConstChange();
});

const derivedEl = document.getElementById("derived"), builtinEl = document.getElementById("builtin");
const FLAT = (() => { const w = makeWorld(300, 14); for (let y = 10; y < 14; y++) for (let x = 0; x < 300; x++) w.map[y * 300 + x] = SOIL; return w; })();
const FX = 60 * T, FY = 10 * T;
function simJump(holdS, maxT = 3) {
  const p = makePlayer(FX, FY); const ts = [0], hs = [0]; let t = 0, first = true;
  while (t < maxT) {
    step(p, { left: false, right: false, jump: t < holdS - 1e-9, jumpPressed: first }, P, FLAT);
    first = false; t += DT; ts.push(t); hs.push(FY - p.y);
    if (p.onGround && t > 0.02) break;
  }
  return { ts, hs, apex: Math.max(...hs), air: p.lastAir != null ? p.lastAir : t };
}
// the highest a jump plus a double jump at its top gets, and a held jump's air time with the parasol
function simGear() {
  const Q = Object.assign({}, P, { doubleJump: true, parasol: true });
  const p = makePlayer(FX, FY); let t = 0, i = 0, best = 0, air = null, topAt = null;
  while (t < 6) {
    const falling = p.vy >= 0 && !p.onGround;
    if (falling && topAt == null) topAt = i;
    const jump = topAt == null || i > topAt + 1;           // hold, let go for a step at the top, press again
    step(p, { left: false, right: false, jump, jumpPressed: i === 0 || (topAt != null && i === topAt + 2) }, Q, FLAT);
    t += DT; i++; best = Math.max(best, FY - p.y);
    if (p.onGround && t > 0.02) break;
  }
  const f = makePlayer(FX, FY); let ft = 0;
  while (ft < 6) { step(f, { left: false, right: false, jump: true, jumpPressed: ft === 0 }, Q, FLAT); ft += DT; if (f.onGround && ft > 0.02) break; }
  return { both: best, floatAir: ft };
}
function updateDerived() {
  const full = simJump(3), tap = simJump(DT), gear = simGear(), vmax = topSpeed(P);   // with the speed items worn
  const rows = [
    ["Full jump", `${full.apex.toFixed(0)} px · ${(full.apex / T).toFixed(2)} t`],
    ["Highest ledge", `${Math.floor((full.apex + 0.001) / T)} t`],
    ["Air time", `${full.air.toFixed(2)} s`],
    ["Tap hop", `${tap.apex.toFixed(0)} px · ${(tap.apex / T).toFixed(2)} t`],
    ["To top speed", `${(vmax / P.runAccel).toFixed(2)} s`],
    ["Stop slide", `${(vmax * vmax / (2 * P.runDecel)).toFixed(0)} px`],
    ["Running jump covers", `${(vmax * full.air).toFixed(0)} px · ${(vmax * full.air / T).toFixed(1)} t`],
    ["Wings, double at top", `${gear.both.toFixed(0)} px · ${(gear.both / T).toFixed(2)} t`],
    ["Parasol air time", `${gear.floatAir.toFixed(2)} s`]
  ];
  const fill = (el, list) => el.replaceChildren(...list.flatMap(([k, v, tip]) => { const dt = document.createElement("dt"); dt.textContent = k; if (tip) dt.title = tip; const dd = document.createElement("dd"); dd.textContent = v; return [dt, dd]; }));
  fill(derivedEl, rows);
  fill(builtinEl, BUILTIN.map(([k, v, tip]) => [k, v(), tip]));
}

let pending = false;
function onConstChange() {
  bMeasured.disabled = !edited();
  if (typeof onPhysicsChanged === "function") onPhysicsChanged();
  if (pending) return; pending = true;
  requestAnimationFrame(() => { pending = false; updateDerived(); });
}

