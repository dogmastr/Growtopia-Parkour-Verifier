/* ===== core.js: physics, collision, spikes and the route checker =====
   The same text runs in two places: the game in the page and the route checker's Web Worker
   (js/worker.js imports this file). That is why a route the checker finds replays frame-for-frame in the game.
   The movement is the game's own, frame by frame, as read from the decompiled client
   (growtopia-player-physics.md; the § numbers below are its sections). Like the client it works in
   whole frames, whole pixels and 32-bit floats.
   Units: game pixels (1 tile = 32 px), seconds, y grows downward. A player's (x, y) is the
   middle of the feet: the hitbox spans x - hitW/2 .. x + hitW/2 and y - hitH .. y. */
var T = 32;
var EMPTY = 0, SOIL = 1, STONE = 2, PLANK = 3, BEDROCK = 4, SPIKE = 5, FIELD = 6, CONVEYOR = 7, BUMPER = 8, WATERFALL = 9;
var MUSHROOM = 10, BOARD = 11;   // trampolines: a solid block, and a platform (solid only from above)
var PLATFORM = 12;               // a plain platform: solid only from above, no bounce
var DT = 0.016;      // one game frame. The client's frame time is a whole number of ms (§1): 16 at a steady 63 fps shown, 17 at 59 (mechanics.html#frame-time)
var INPUT_STEPS = 1;   // frames per input choice in the route checker: the game reads keys once a frame
var F = Math.fround, DTF = F(DT);
// Changes the frame length (whole ms) for every step after it: the game, the checker and replays. Every frame
// is that long: the game's mix of 16 and 17 at 60 fps isn't modelled. The page and its worker each run their
// own copy of this file, so the worker is told with each check (js/worker.js).
function setFrameMs(ms) { DT = ms / 1000; DTF = F(DT); FLOAT_FRAMES = Math.ceil(3 / DT); }
// The client's numbers. runSpeed, runAccel and gravity are its defaults, which the server can change
// (§2.1); the rest are built in (§3). The hitbox is the usual spawn box (§2.1).
// jumpCut is the extra gravity while rising with jump let go; glide is what a parasol does to gravity.
var GAME = {
  runSpeed: 250, runAccel: 1200, runDecel: 1200,
  jumpSpeed: 450, gravity: 1000, jumpCut: 5000,
  maxFall: 400, glide: 0.3, hitW: 20, hitH: 30,
  waterSpeed: 125   // the run's top speed in water; the server sends it (§2.1), 125 is the usual one (§8)
};
// Gear isn't a constant: P.doubleJump (wings: one jump in the air, §6.2) and P.parasol (hold jump while
// falling to float down, §6.1). Both are off unless the page or a caller turns them on.
// P.speedItems (0 or 3) and P.highJump reach the client as a top speed and a gravity sent by the server
// (§6.3, §6.4), and the reference doesn't have those numbers. The two factors below are the ones this
// page had before it: 3 speed items multiply runSpeed, the high jump item multiplies gravity.
// P.waterItem: 0 none, 1 a float item (3 s), 2 a float item with no time limit, 3 floaties (see FLOAT_FRAMES).
var GEAR = { doubleJump: false, parasol: false, speedItems: 0, highJump: false, waterItem: 0 };
var SPEED_ITEMS = { 0: 1, 3: 1.75 };
var HIGH_JUMP = { gravity: 0.713 };
// The antigravity field and the conveyor block have no box test: they act while the middle point of the
// box (10 px in, 15 px down for 20 x 30) is inside their tile (§7.4). In a field gravity is FIELD_GRAVITY
// times as strong, a press while falling jumps, and any jump started in it stores one air jump (§4.6).
// A conveyor sets the run to CONVEYOR_PUSH to the right, capped at top speed; against it, CONVEYOR_BACK at most (§4.3).
var FIELD_GRAVITY = 0.375, CONVEYOR_PUSH = 1000, CONVEYOR_BACK = 100;
// Water is a flag on a tile (w.water), not a block, so it shares a tile with a block, a field or a spike.
// It acts on the same middle point: while that point is in water, gravity and the fall cap are WATER_SLOW
// times as strong, the run's top speed is P.waterSpeed, a jump is WATER_JUMP times as strong and works
// while sinking, and a parasol doesn't open (§4.2, §4.3, §4.6, §6.1).
var WATER_SLOW = 0.3, WATER_JUMP = 0.6;
// Water gear (from the user's notes, not the reference). A float item is checked on the frame you enter the
// water: while you float, gravity and the fall cap are both zero, so you stop at the surface, and a jump can
// be made at any time. It ends 3 s after you enter (never for the Fishing Dinghy and the Jet Skis) or when
// you touch ground, and the time restarts on each entry. p.floatF is the frames left (FLOAT_NO_LIMIT: none).
// Floaties: in water, sinking is cut to FLOATIE_SINK and pushed back up at FLOATIE_SINK_PUSH, and rising gets
// a push of FLOATIE_RISE_PUSH and is capped at FLOATIE_RISE_CAP, jumps included. Gravity isn't used.
var FLOAT_FRAMES = Math.ceil(3 / DT), FLOAT_NO_LIMIT = 255;
var FLOATIE_SINK = 40, FLOATIE_SINK_PUSH = 320, FLOATIE_RISE_PUSH = 12, FLOATIE_RISE_CAP = 120;
// A pinball bumper (the same block type as the jelly blocks and the energy pulser; the bouncy turret is a
// platform in the game, which this page has no tile for) is solid, and a touch sets your velocity to
// PINBALL_SPEED straight away from its centre, whatever it was (§7.3), and takes you off the ground. It
// also makes you slippery until you land: no slowing down on your own, steering at
// SLIPPERY_STEER while rising, and a wall throws you back at SLIPPERY_BOUNCE of your speed (§4.3, §5.3).
// And it makes the game forget that jump is held (p.jumpLost) until the next press.
var PINBALL_SPEED = 500, SLIPPERY_STEER = 0.15, SLIPPERY_BOUNCE = 0.7;
// A trampoline (the Mushroom: a solid block; the Diving Board: a platform, solid only from above) acts in the
// contact test, the Y one only, before the jump and the move. Standing on it, or falling the last pixel onto
// it, with the feet at or above its top and gravity on, it sets the upward speed to TRAMPOLINE_SPEED, whatever
// the fall speed was, and takes you off the ground. The run, the held-jump state, the ledge grace, slippery
// and the air jump are left as they are, so the usual jump brake applies to the rise. From the side the
// Mushroom is an ordinary wall (§7.3).
var TRAMPOLINE_SPEED = 800;
function topSpeed(P) { return F(P.runSpeed * (SPEED_ITEMS[P.speedItems] || 1)); }
function gravityOf(P) { return F(P.highJump ? P.gravity * HIGH_JUMP.gravity : P.gravity); }
// How far above the higher end a single-jump check searches, in tiles: a full jump (3.3 tiles; 4.6 with
// the high jump item), twice that with wings, and room to spare. A trampoline held all the way up rises
// 10 tiles, and more with the high jump item or an air jump at the top.
function headroomTiles(P, trampolines) {
  if (trampolines) return 12 + (P.doubleJump ? 4 : 0) + (P.highJump ? 4 : 0);
  return (P.doubleJump ? 8 : 6) + (P.highJump ? (P.doubleJump ? 3 : 1) : 0);
}

function isSolidCode(v) { return (v >= 1 && v <= 4) || v === BUMPER || v === MUSHROOM; }   // blocks that are safe to stand on (a spike is a block too, see touches)
function isPassableCode(v) { return v === EMPTY || v === FIELD || v === CONVEYOR || v === WATERFALL || v === BOARD || v === PLATFORM; }   // open air as far as getting through goes (a platform is solid only from above)
// The index (row * W + column) of the 32 x 32 cell that holds the point (x, y), left and top edges in;
// -1 outside the level.
function cellAt(w, x, y) {
  var tx = Math.floor(x / T), ty = Math.floor(y / T);
  return tx < 0 || ty < 0 || tx >= w.W || ty >= w.H ? -1 : ty * w.W + tx;
}
// Can a press while falling jump from the point (x, y)? That's so in an antigravity field and in water.
function jumpsFalling(w, x, y) {
  var i = cellAt(w, x, y);
  return i >= 0 && (w.map[i] === FIELD || w.water[i] === 1);
}

// water: optional Uint8Array(W * H), 1 where a tile is water. It is kept apart from map so that a tile can be both.
function makeWorld(W, H, map, water) {
  var w = { W: W, H: H, map: map || new Uint8Array(W * H), water: water || new Uint8Array(W * H), sdir: new Int8Array(W * H), hasFall: false };
  refreshSpikes(w, 0, 0, W - 1, H - 1);
  refreshFalls(w);
  return w;
}
// Whether the level has any waterfall at all, so the move loop only looks for one when there is.
// Call it after changing tiles.
function refreshFalls(w) {
  w.hasFall = false;
  for (var i = 0; i < w.map.length; i++) if (w.map[i] === WATERFALL) { w.hasFall = true; break; }
}
function solidAt(w, tx, ty) {
  if (tx < 0 || tx >= w.W) return true;          // world edges are walls
  if (ty < 0 || ty >= w.H) return false;
  return isSolidCode(w.map[ty * w.W + tx]);
}
// Spikes point away from whatever they're attached to: 0 up, 1 down, 2 right, 3 left.
function refreshSpikes(w, x0, y0, x1, y1) {
  for (var ty = Math.max(0, y0); ty <= Math.min(w.H - 1, y1); ty++)
    for (var tx = Math.max(0, x0); tx <= Math.min(w.W - 1, x1); tx++) {
      var i = ty * w.W + tx;
      if (w.map[i] !== SPIKE) { w.sdir[i] = 0; continue; }
      w.sdir[i] = solidAt(w, tx, ty + 1) ? 0 : solidAt(w, tx, ty - 1) ? 1 : (tx > 0 && solidAt(w, tx - 1, ty)) ? 2 : (tx < w.W - 1 && solidAt(w, tx + 1, ty)) ? 3 : 0;
    }
}
// (Which way the teeth point, above, is only for drawing: the whole tile is the spike.)
// What the box l..r, t..b lies over: 2 if any of its tiles is a spike, else 3 if any is a pinball bumper,
// else 4 if any is a trampoline, else 1 if any is a block, else 0. (4 is a block too; step looks closer.)
// A tile counts only if the box reaches into it; one that just meets the box's edge doesn't (§4.5).
// Every tile is its full 32 px square, and a spike stops you like any block (§5.2). A field or a
// conveyor isn't a block here: you go through it (it acts on the box's middle point, see step).
// A platform (the Diving Board, the plain Platform) is a block only for a test that is a step or a look downward, and only when
// the box's bottom before it, feet, is at or above the platform's top: that is the one argument that
// asks for platforms. From the sides, from below and from inside it, it isn't there.
function touches(w, l, t, r, b, feet) {
  var tx0 = Math.max(0, Math.floor(l / T)), tx1 = Math.min(w.W - 1, Math.ceil(r / T) - 1);
  var ty0 = Math.max(0, Math.floor(t / T)), ty1 = Math.min(w.H - 1, Math.ceil(b / T) - 1), hit = 0;
  for (var ty = ty0; ty <= ty1; ty++) for (var tx = tx0; tx <= tx1; tx++) {
    var v = w.map[ty * w.W + tx];
    if (v === SPIKE) return 2;
    if (v === BUMPER) hit = 3;
    else if (v === MUSHROOM || (v === BOARD && feet <= ty * T)) { if (hit !== 3) hit = 4; }
    else if (hit === 0 && (isSolidCode(v) || (v === PLATFORM && feet <= ty * T))) hit = 1;
  }
  return hit;
}
// The tiles of a contact test come in the game's order: column by column, left to right (and, as far as is
// known, top to bottom inside a column). The first one that acts ends the test. This returns its index, or -1:
// a spike (it kills), a pinball bumper (it throws you) or, when feet is given, a trampoline (it bounces you).
// feet is the box's bottom before the test, given only to a downward test while you fall or stand, and the
// trampoline's top has to be at or below it. A tile counts when the box strictly overlaps it, as in touches.
function contactIn(w, l, t, r, b, feet) {
  var tx0 = Math.max(0, Math.floor(l / T)), tx1 = Math.min(w.W - 1, Math.ceil(r / T) - 1);
  var ty0 = Math.max(0, Math.floor(t / T)), ty1 = Math.min(w.H - 1, Math.ceil(b / T) - 1);
  for (var tx = tx0; tx <= tx1; tx++) for (var ty = ty0; ty <= ty1; ty++) {
    var v = w.map[ty * w.W + tx];
    if (v === SPIKE || v === BUMPER || ((v === MUSHROOM || v === BOARD) && feet <= ty * T)) return ty * w.W + tx;
  }
  return -1;
}
// Does the box l..r, t..b reach into a waterfall (or a juice waterfall; one tile code)?
// A waterfall isn't a block: sideways, falling and the ground check never see it. It only refuses
// upward steps that would leave the box in it (collision kind 7, §5.2), so from below it's a ceiling,
// and a box already in one can't rise at all. Upward speed isn't cancelled, as under any ceiling.
function fallIn(w, l, t, r, b) {
  var tx0 = Math.max(0, Math.floor(l / T)), tx1 = Math.min(w.W - 1, Math.ceil(r / T) - 1);
  var ty0 = Math.max(0, Math.floor(t / T)), ty1 = Math.min(w.H - 1, Math.ceil(b / T) - 1);
  for (var ty = ty0; ty <= ty1; ty++) for (var tx = tx0; tx <= tx1; tx++) if (w.map[ty * w.W + tx] === WATERFALL) return true;
  return false;
}
// A bumper hit: the speed becomes PINBALL_SPEED along the line from the bumper's centre to the centre of
// the box (as it is now, before this frame's move), the old speed is dropped, and you're slippery with
// the held-jump state forgotten. It also takes you off the ground and ends the ledge grace frame, so a
// press in this same frame is no ground jump and gravity acts from the next frame (§7.3). Returns
// whether it fired.
function bump(p, w, P, i) {
  if (i < 0) return false;
  var dx = p.x - ((i % w.W) * T + T / 2), dy = (p.y - P.hitH / 2) - (Math.floor(i / w.W) * T + T / 2);
  var len = F(Math.sqrt(F(F(dx * dx) + F(dy * dy))));
  if (len === 0) { dx = 0; dy = -1; len = 1; }
  p.vx = F(PINBALL_SPEED * F(dx / len)); p.vy = F(PINBALL_SPEED * F(dy / len));
  launched(p);
  p.slippery = true; p.jumpLost = true;
  return true;
}
// A launch that takes you off the ground (a bumper, a trampoline): the readout's last jump starts here.
function launched(p) {
  if (p.onGround) { p.jumpStartY = p.y; p.apex = 0; p.airTime = 0; p.holdTime = 0; p.jumpT = 0; }
  p.onGround = false;
}
// remX, remY: the part of a pixel not moved yet, carried to the next frame.
// airJump is the game's one stored air jump: landing fills it with wings, a jump started in a field fills it
// whatever the gear, and an air jump or a jump on the ledge grace frame empties it. airJumps counts how many
// air jumps were used (the replay's tally).
// spawnJump: a player who has just spawned at the checkpoint can jump at once, whatever is under them (they
// may be in the air), and with wings has the second jump ready too, except right above a spike, where it
// has only the spawn jump. A jump or a landing uses it up.
function makePlayer(x, y) {
  return { x: x, y: y, vx: 0, vy: 0, remX: 0, remY: 0, onGround: true, dead: false, spawnJump: true,
           facing: 1, prevJump: false, airJump: false, airJumps: 0, slippery: false, jumpLost: false, parasolOpen: false, airJumpT: 1,
           jumpStartY: y, apex: 0, airTime: 0, holdTime: 0, holding: false, lastApex: null, lastAir: null, lastHold: null, landT: 1, jumpT: 0,
           floatF: FLOAT_NO_LIMIT };
}

// One game frame. input = { left, right, jump (held), jumpPressed (went down this frame) }
// The client's order: gravity and running (§4.2, §4.3), then the ground check, the contact test, the
// jump and the move (§4.4 to §4.7). Touching a spike sets p.dead and ends the frame there.
function step(p, input, P, w) {
  var hw = P.hitW / 2, hh = P.hitH;
  // A fresh spawn has the wings' second jump ready, unless a spike is right under the checkpoint: then
  // the spawn jump is the only one. (A spike under the feet at spawn is 2 px away; 3 px reaches into it.)
  if (p.spawnJump && P.doubleJump && touches(w, p.x - hw, p.y, p.x + hw, p.y + 3) !== 2) p.airJump = true;
  if (input.jumpPressed) p.jumpLost = false;   // a new press brings back the held state a bumper cleared
  var held = !!input.jump && !p.jumpLost;
  var dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir !== 0) p.facing = dir;
  // The cell at the middle of the box, where the frame starts: a field, a conveyor and water act on that
  // point only. Water is a flag next to the tile, so a cell can be both.
  var ci = cellAt(w, p.x, p.y - hh / 2), under = ci < 0 ? EMPTY : w.map[ci], inWater = ci >= 0 && w.water[ci] === 1;
  // A float item (P.waterItem 1 or 2): the time is full whenever you're out of the water, so each entry
  // restarts it, and it runs down only while you're in the water and floating. A landing empties it (below).
  var floating = false, floaties = inWater && P.waterItem === 3;
  if (P.waterItem === 1 || P.waterItem === 2) {
    var fullF = P.waterItem === 2 ? FLOAT_NO_LIMIT : FLOAT_FRAMES;
    if (!inWater || p.floatF > fullF) p.floatF = fullF;
    floating = inWater && p.floatF > 0;
    if (floating && p.floatF !== FLOAT_NO_LIMIT) p.floatF--;
  }
  // Gravity: none on the ground. Rising with jump let go, P.jumpCut is added to it; that brakes the
  // rise, it doesn't stop it. With a parasol,
  // holding jump while falling scales it by P.glide (not in
  // water). In a field all of that is scaled by FIELD_GRAVITY, in water by WATER_SLOW, which also scales
  // the fall cap: a faster fall is cut to it in the first frame in water. Otherwise falls are capped at
  // P.maxFall; the parasol never brakes one that's already faster. Floating takes both to zero, so you
  // stop where the water begins. Floaties replace gravity with an upward push (sinking is cut first).
  if (p.onGround) { if (p.vy > 0) p.vy = 0; }
  else {
    var g = gravityOf(P), cap = P.maxFall;
    if (p.vy < 0 && !held) g = F(g + P.jumpCut);
    if (p.vy > 0 && held && P.parasol && !inWater) g = F(g * F(P.glide));
    if (under === FIELD) g = F(g * F(FIELD_GRAVITY));
    if (inWater) { g = F(g * F(WATER_SLOW)); cap = F(cap * WATER_SLOW); }
    if (floating) { g = 0; cap = 0; }
    else if (floaties) {
      if (p.vy > FLOATIE_SINK) p.vy = FLOATIE_SINK;
      g = p.vy > 0 ? -FLOATIE_SINK_PUSH : -FLOATIE_RISE_PUSH;
    }
    p.vy = F(p.vy + F(DTF * g));
    if (p.vy > cap) p.vy = cap;
    if (floaties && !floating && p.vy < -FLOATIE_RISE_CAP) p.vy = -FLOATIE_RISE_CAP;
  }
  // Running, the same on the ground and in the air: speed up toward the key up to top speed (the water
  // speed in water). With no key, both keys, or already at top speed, slow down instead. So a held run
  // flickers between top speed and one frame of braking below it, and averages a little under it.
  var a = dir * P.runAccel, max = inWater ? F(P.waterSpeed) : topSpeed(P), sped = false;
  // Slippery (after a bumper, until you land): steering is SLIPPERY_STEER while rising, and nothing
  // slows you down on its own.
  if (p.slippery && p.vy <= 0) a = F(a * F(SLIPPERY_STEER));
  if (a > 0 && p.vx < max) { p.vx = F(p.vx + F(DTF * a)); if (p.vx > max) p.vx = max; sped = true; }
  if (a < 0 && p.vx > -max) { p.vx = F(p.vx + F(DTF * a)); if (p.vx < -max) p.vx = -max; sped = true; }
  if (!sped && p.vx !== 0 && !p.slippery) { var d = F(DTF * P.runDecel); p.vx = p.vx > d ? F(p.vx - d) : p.vx < -d ? F(p.vx + d) : 0; }
  // A conveyor block (not flipped) has the last word on the run: a standstill or a run to the right
  // becomes CONVEYOR_PUSH, cut to top speed; a run to the left is cut to CONVEYOR_BACK.
  if (under === CONVEYOR) {
    if (p.vx < -CONVEYOR_BACK) p.vx = -CONVEYOR_BACK;
    else if (p.vx >= 0 && p.vx < CONVEYOR_PUSH) p.vx = CONVEYOR_PUSH;
    if (p.vx > max) p.vx = max;
  }

  var L = p.x - hw, top = p.y - hh, wasGround = p.onGround, coyote = false;
  // Ground check, only while not rising: a tile 1 px under the feet. Landing gives the air jump back
  // (with wings only). In the frame you're first found off a ledge, a press still jumps (coyote), but
  // that jump uses up the air jump (see the jump below).
  if (p.vy >= 0 && touches(w, L, p.y, L + P.hitW, p.y + 1, p.y)) {
    if (!wasGround) { p.lastApex = p.apex; p.lastAir = p.airTime; p.lastHold = p.holdTime; p.landT = 0; p.holding = false; }
    p.onGround = true; if (P.doubleJump) p.airJump = true;
    p.slippery = false;   // a normal floor ends it (there's no ice here)
    p.spawnJump = false;  // you've landed: the spawn's jump is just the ground now
    if (P.waterItem === 1 || P.waterItem === 2) p.floatF = 0;   // touching ground ends floating
  } else { coyote = wasGround && p.vy >= 0; p.onGround = false; }
  // Contact test: the box where this frame's rounded movement would put it, sideways, and then up or
  // down (at most 1 px down; 1 px down when standing), each from where it is now. The two tests are separate,
  // and each goes through the tiles it overlaps in the game's order, column by column from the left, and
  // stops at the first that acts (contactIn). A spike kills. A bumper sets the velocity (bump), and you move
  // with it this same frame. A trampoline bounces
  // you. So when two of them are under you the one further left wins, and a bumper or a trampoline on its
  // left saves you from a spike. A block in the sideways test stops the run before the move (slippery, it
  // throws you back at SLIPPERY_BOUNCE), so you close the last few px to a wall from a standstill. A ceiling
  // doesn't take your upward speed: you stay pinned under it.
  var tX = Math.trunc(F(F(p.remX + Math.max(-32, Math.min(32, F(DTF * p.vx)))) + 0.5));
  var tY = Math.trunc(F(F(p.remY + Math.max(-32, Math.min(1, F(DTF * p.vy)))) + 0.5));
  if (tY === 0 && p.onGround) tY = 1;
  var bumped = false, hi, hv;
  var c = tX ? touches(w, L + tX, top, L + tX + P.hitW, p.y) : 0;
  if (c === 2 || c === 3) {   // a spike or a bumper is in the way: which comes first?
    hi = contactIn(w, L + tX, top, L + tX + P.hitW, p.y);
    hv = w.map[hi];
    if (hv === SPIKE) { p.dead = true; return; }
    bumped = bump(p, w, P, hi);
  } else if (c === 1 || c === 4) {   // a wall (a Mushroom is one too)
    p.vx = p.slippery ? F(p.vx * F(-SLIPPERY_BOUNCE)) : 0;
  }
  // The downward test comes next and reads the speed as the sideways one left it. A trampoline acts only in
  // this test, while you fall or stand (not rise) with gravity on, and when your feet are at or above its top,
  // so you are flush on it: the upward speed is set, not added, and you're off the ground. The held-jump
  // state, the ledge grace and the air jump are left alone (a press this frame is no ground jump).
  var cy = tY ? touches(w, L, top + tY, L + P.hitW, p.y + tY, tY > 0 ? p.y : undefined) : 0;
  var feet = tY > 0 && p.vy >= 0 && !floating ? p.y : undefined;
  if (cy === 2 || cy === 3 || (cy === 4 && feet !== undefined)) {
    hi = contactIn(w, L, top + tY, L + P.hitW, p.y + tY, feet);
    hv = hi < 0 ? EMPTY : w.map[hi];
    if (hv === SPIKE) { p.dead = true; return; }
    if (hv === BUMPER) { if (bump(p, w, P, hi)) bumped = true; }
    else if (hv === MUSHROOM || hv === BOARD) { p.vy = F(-TRAMPOLINE_SPEED); launched(p); }
  }
  if (bumped) coyote = false;
  if (p.jumpLost) held = false;
  // Jump: on the ground, in the coyote frame, with the stored air jump (wings, or one a field stored),
  // or falling inside a field or in water, or floating (§4.6). A jump started in a field stores an air
  // jump first: a ground jump keeps it for later, an air jump spends it at once. Water stores nothing. It
  // sets the upward speed, whatever it was, WATER_JUMP times as strong in water.
  // The coyote frame's jump empties the stored air jump, as an air jump does (read from the client's code).
  // The frame before it, the last one still on the ground (the edge jump), is a
  // ground jump and keeps it. A fresh spawn's jump is left as it was.
  var ground = p.onGround || coyote || p.spawnJump;
  if (input.jumpPressed && (ground || p.airJump || floating || (p.vy > 0 && (under === FIELD || inWater)))) {
    if (under === FIELD) p.airJump = true;
    if (ground) { p.jumpStartY = p.y; p.apex = 0; p.airTime = 0; p.holdTime = 0; p.jumpT = 0; if (coyote && !p.spawnJump) p.airJump = false; p.spawnJump = false; }
    else { p.airJump = false; p.airJumps++; p.airJumpT = 0; }   // the readout keeps measuring from the ground
    p.vy = F(-P.jumpSpeed); if (inWater) p.vy = F(p.vy * F(WATER_JUMP));
    p.onGround = false; p.holding = true;
  }
  if (p.holding) { if (held) p.holdTime += DT; else p.holding = false; }
  // Move: whole pixels, sideways first and then up or down, 1 px at a time until a block or the
  // world's side or top edge is in the way. The bottom is open, and falling out of it kills.
  var fx = F(p.remX + F(DTF * p.vx)), fy = F(p.remY + F(DTF * p.vy));
  var mx = Math.trunc(F(fx + 0.5)), my = Math.trunc(F(fy + 0.5)), s, i;
  p.remX = F(fx - mx); p.remY = F(fy - my);
  for (s = mx < 0 ? -1 : 1, i = Math.abs(mx); i > 0; i--) {
    var nl = L + s;
    if (nl < 0 || nl + P.hitW > w.W * T || touches(w, s > 0 ? L + P.hitW : nl, top, s > 0 ? nl + P.hitW : L, top + hh)) break;
    L = nl;
  }
  for (s = my < 0 ? -1 : 1, i = Math.abs(my); i > 0; i--) {
    var nt = top + s;
    if (nt < 0 || touches(w, L, s > 0 ? top + hh : nt, L + P.hitW, s > 0 ? nt + hh : top, s > 0 ? top + hh : undefined)) break;
    if (s < 0 && w.hasFall && fallIn(w, L, nt, L + P.hitW, nt + hh)) break;   // a waterfall refuses a rise
    top = nt;
  }
  p.x = L + hw; p.y = top + hh;
  p.parasolOpen = !!P.parasol && !p.onGround && held && p.vy > 0 && !inWater;
  if (!p.onGround) { p.airTime += DT; p.apex = Math.max(p.apex, p.jumpStartY - p.y); }
  p.landT += DT; p.jumpT += DT; p.airJumpT += DT;
}

function fellOut(w, P, p) { return p.y - P.hitH > w.H * T; }
function died(w, P, p) { return p.dead || fellOut(w, P, p); }

// Goals: { kind: "touch", x0, y0, x1, y1 } (hitbox overlaps a rect) or { kind: "stand", x0, x1, y } (standing on a surface)
function goalReached(p, goal, P) {
  var hw = P.hitW / 2, hh = P.hitH;
  if (goal.kind === "stand") return p.onGround && Math.abs(p.y - goal.y) < 0.01 && p.x + hw > goal.x0 && p.x - hw < goal.x1;
  return p.x + hw > goal.x0 && p.x - hw < goal.x1 && p.y > goal.y0 && p.y - hh < goal.y1;
}

// A time p can't reach goal sooner than, whatever the inputs (the fastest-route search's heuristic):
// the longest of running at it flat out, rising at jump speed (no jump, double jumps included, rises
// faster), and dropping in free fall. Moving away counts as standing still. These are smooth curves,
// and the game's whole frames and whole pixels can run up to a frame and a pixel or two ahead of them,
// so each distance is cut by SLACK_PX and the answer by a frame.
// ups: which speed-ups the level has, { conveyor, bumper, trampoline } (or nothing). A conveyor puts you
// at top speed at once, so there's no run-up to wait for; a bumper does that at 500 px/s, which beats top
// speed, the jump speed and the fall cap, so the three bounds below are loosened to it. A trampoline only
// loosens the rise, to its 800 px/s.
var SLACK_PX = 2;
function minTimeTo(p, goal, P, ups) {
  var hw = P.hitW / 2;
  var dx = Math.max(goal.x0 - (p.x + hw), (p.x - hw) - goal.x1) - SLACK_PX;
  var up = (goal.kind === "stand" ? p.y - goal.y : p.y - P.hitH - goal.y1) - SLACK_PX;
  var down = (goal.kind === "stand" ? goal.y : goal.y0) - p.y - SLACK_PX;
  // a rise that's let go can be braked into a fall within one frame, at up to that frame's worth of speed
  var vy = p.vy >= 0 ? p.vy : (gravityOf(P) + P.jumpCut) * DT;
  var boost = ups && ups.bumper ? PINBALL_SPEED : 0, vmax = Math.max(topSpeed(P), boost);
  var rise = Math.max(P.jumpSpeed, boost, ups && ups.trampoline ? TRAMPOLINE_SPEED : 0);   // a trampoline sets 800 straight up
  return Math.max(0, Math.max(dx > 0 ? (ups && (ups.conveyor || ups.bumper) ? dx / vmax : minRunTime(dx, Math.max(0, goal.x0 > p.x ? p.vx : -p.vx), P)) : 0,
    up > 0 ? up / rise : 0, down > 0 ? minFallTime(down, vy, P, Math.max(P.maxFall, boost)) : 0) - DT);
}
// shortest time to run D px, starting at speed u (>= 0) toward the target
function minRunTime(D, u, P) {
  var vmax = topSpeed(P);
  if (u >= vmax) return D / u;
  var ta = (vmax - u) / P.runAccel, da = (u + vmax) / 2 * ta;
  if (D <= da) return (Math.sqrt(u * u + 2 * P.runAccel * D) - u) / P.runAccel;
  return ta + (D - da) / vmax;
}
// shortest time to drop D px, starting at vertical speed vy (gravity at its strongest, up to the fall
// cap: P.maxFall unless cap says otherwise; gmax, if given, is the strongest pull there can be)
function minFallTime(D, vy, P, cap, gmax) {
  cap = cap || P.maxFall;
  if (vy >= cap) return D / cap;
  var g = gmax || gravityOf(P) * Math.max(1, P.parasol ? P.glide : 0);
  var tc = (cap - vy) / g, dc = (vy + cap) / 2 * tc;
  if (D <= dc) return (Math.sqrt(vy * vy + 2 * g * D) - vy) / g;
  return tc + (D - dc) / cap;
}

// A guide for the first-route search: roughly how long it takes to get from each spot to the goal going
// round the level's blocks, not straight at it. It's a grid of 8 px cells, open where the tile is empty
// or a field or conveyor (shut for blocks, spikes and, in a jump test, anywhere outside the window). Stepping between neighbouring
// cells costs what that much running, rising at jump speed or dropping at the fall cap would take.
// It ignores jump limits and timing, so it's only a guess; it isn't used when hunting the fastest route,
// which needs a bound that never overestimates. What it stops is the search packing every nook that merely
// lies close to the goal (a start hemmed in beside a pit, say) before it tries the way that leads round.
var GUIDE_CELL = 8;
function guideField(w, P, goal, B) {
  var CS = GUIDE_CELL, cw = Math.ceil(w.W * T / CS), ch = Math.ceil(w.H * T / CS), n = cw * ch;
  var open = new Uint8Array(n), dist = new Float64Array(n), i, cx, cy;
  for (i = 0; i < n; i++) dist[i] = Infinity;
  // a state inside the window can have its middle a body-length outside it, so the guide's window is wider
  var wx0 = B ? B[0] - T : -Infinity, wy0 = B ? B[1] - T : -Infinity, wx1 = B ? B[2] + T : Infinity, wy1 = B ? B[3] + T : Infinity;
  for (cy = 0; cy < ch; cy++) for (cx = 0; cx < cw; cx++) {
    var px = (cx + 0.5) * CS, py = (cy + 0.5) * CS;
    open[cy * cw + cx] = isPassableCode(w.map[Math.floor(py / T) * w.W + Math.floor(px / T)]) && px >= wx0 && px <= wx1 && py >= wy0 && py <= wy1 ? 1 : 0;
  }
  var stepX = CS / topSpeed(P), stepUp = CS / P.jumpSpeed, stepDown = CS / P.maxFall;
  var HD = [], HC = [];   // binary min-heap of (distance, cell)
  function push(d, c) {
    var k = HD.length; HD.push(d); HC.push(c);
    while (k > 0) { var pk = (k - 1) >> 1; if (HD[pk] <= d) break; HD[k] = HD[pk]; HC[k] = HC[pk]; k = pk; }
    HD[k] = d; HC[k] = c;
  }
  function pop() {
    var top = HC[0], d = HD.pop(), c = HC.pop(), last = HD.length;
    if (last > 0) {
      var k = 0;
      for (;;) {
        var m = 2 * k + 1; if (m >= last) break;
        if (m + 1 < last && HD[m + 1] < HD[m]) m++;
        if (HD[m] >= d) break;
        HD[k] = HD[m]; HC[k] = HC[m]; k = m;
      }
      HD[k] = d; HC[k] = c;
    }
    return top;
  }
  // the goal: cells whose middle is inside the box you'd count as being there
  var gy0 = goal.kind === "stand" ? goal.y - T : goal.y0, gy1 = goal.kind === "stand" ? goal.y : goal.y1;
  for (cy = 0; cy < ch; cy++) for (cx = 0; cx < cw; cx++) {
    var qx = (cx + 0.5) * CS, qy = (cy + 0.5) * CS;
    if (open[cy * cw + cx] && qx > goal.x0 && qx < goal.x1 && qy > gy0 && qy < gy1) { dist[cy * cw + cx] = 0; push(0, cy * cw + cx); }
  }
  while (HD.length) {
    var d0 = HD[0], u = pop();
    if (d0 > dist[u]) continue;
    var ux = u % cw, uy = (u - ux) / cw;
    for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      var vx = ux + ox, vy = uy + oy;
      if (vx < 0 || vy < 0 || vx >= cw || vy >= ch || !open[vy * cw + vx]) continue;
      if (ox && oy && !(open[uy * cw + vx] && open[vy * cw + ux])) continue;   // no cutting corners
      // the step goes from v to u: with v below u (oy > 0) that's a rise, with v above it a drop
      var cost = Math.max(ox ? stepX : 0, oy > 0 ? stepUp : oy < 0 ? stepDown : 0), nd = d0 + cost, v = vy * cw + vx;
      if (nd < dist[v]) { dist[v] = nd; push(nd, v); }
    }
  }
  return { at: function (x, y) {   // Infinity where the goal can't be reached through open tiles
    var gx = Math.floor(x / CS), gy = Math.floor(y / CS);
    return gx < 0 || gy < 0 || gx >= cw || gy >= ch ? Infinity : dist[gy * cw + gx];
  } };
}

/* ---------- route checker: weighted A* over physics states ----------
   Inputs change every K game frames (K = INPUT_STEPS = 1: the game reads keys once a frame).
   Six choices each time: run left / none / right, with jump held or not.
   States that land in the same small cell (cellPx, cellSpeed, same flags) are merged, which is
   what lets the search run out of new states and report that no route exists.
   With opts.fastest it finds the fastest route instead of the first one. It merges only identical
   states, so nothing is lost, runs plain A* with minTimeTo (which never overestimates) as the
   heuristic, and keeps going after a route until nothing left could beat the best one by a physics
   step. That route is then the fastest there is with inputs every K steps, inside opts.bounds.
   opts.bound = { time, actions } is a route found earlier to beat, which keeps the search small. */
function solveRoute(w, P, start, goal, opts) {
  var search = makeSearch(w, P, start, goal, opts), r;
  while (!(r = search.run(1073741824))) {}
  return r;
}
// The same search, resumable: run(n) expands up to n more states and returns null until it has an answer.
function makeSearch(w, P, start, goal, opts) {
  opts = opts || {};
  var K = opts.stepsPerDecision || INPUT_STEPS;
  var maxNodes = opts.maxNodes || 600000;   // Infinity for no limit
  var explore = !goal, fastest = !!opts.fastest && !explore;
  var weight = fastest ? 1 : opts.weight == null ? 1.6 : opts.weight;
  var maxTime = opts.maxTime || 240;
  var onProgress = opts.onProgress || null;   // (expansions, nodes, lowerBound) every 16384 expansions
  var onBetter = opts.onBetter || null;       // fastest mode: (actions, time) for each faster route
  var B = opts.bounds || null;   // optional search window in px: [x0, y0, x1, y1]
  // fastest mode: the best route so far, and a lower bound on any faster one
  var bestT = fastest && opts.bound ? opts.bound.time : Infinity, bestActs = fastest && opts.bound ? opts.bound.actions : null;
  var lowT = 0, HALF = DT / 2;   // route times are whole steps, so "faster" means by at least DT
  var hw = P.hitW / 2, hh = P.hitH;
  // Which of the special tiles the level has: without them the search is exactly what it was.
  // hasFallJump: a field or water, where a press while falling jumps.
  var hasFallJump = false, ups = { conveyor: false, bumper: false, trampoline: false };
  for (var wi = 0; wi < w.map.length; wi++) {
    if (w.map[wi] === FIELD || w.water[wi] === 1) hasFallJump = true;
    if (w.map[wi] === CONVEYOR) ups.conveyor = true;   // a conveyor can hold water too, so no else
    if (w.map[wi] === BUMPER) ups.bumper = true;
    if (w.map[wi] === MUSHROOM || w.map[wi] === BOARD) ups.trampoline = true;
  }
  // With wings, holding jump through a landing on a trampoline can't be had by letting go and pressing later:
  // that press would spend the air jump the landing gave back. So holding is never skipped on such levels.
  var holdMatters = P.parasol || (ups.trampoline && P.doubleJump);
  var guide = explore || fastest || opts.guide === false ? null : guideField(w, P, goal, B);
  // node storage in typed arrays
  var cap = 1 << 16;
  var NX = new Float64Array(cap), NY = new Float64Array(cap), NVX = new Float64Array(cap),
      NVY = new Float64Array(cap), NRX = new Float64Array(cap), NRY = new Float64Array(cap), NF = new Uint8Array(cap),
      NP = new Int32Array(cap), NA = new Int8Array(cap), NG = new Float64Array(cap), NT = new Uint8Array(cap);
  var floatGear = P.waterItem === 1 || P.waterItem === 2;   // the float item's time is part of the state only then
  var count = 0;
  // binary min-heap of (f, node)
  var HF = new Float64Array(cap), HI = new Int32Array(cap), hsize = 0, popF = 0;
  function grow() {
    var c2 = Math.min(maxNodes, cap * 2);
    function g(a) { var b = new a.constructor(c2); b.set(a); return b; }
    NX = g(NX); NY = g(NY); NVX = g(NVX); NVY = g(NVY); NRX = g(NRX); NRY = g(NRY); NF = g(NF); NP = g(NP); NA = g(NA); NG = g(NG); NT = g(NT);
    HF = g(HF); HI = g(HI); cap = c2;
  }
  function hpush(f, i) {
    var k = hsize++;
    while (k > 0) { var pk = (k - 1) >> 1; if (HF[pk] <= f) break; HF[k] = HF[pk]; HI[k] = HI[pk]; k = pk; }
    HF[k] = f; HI[k] = i;
  }
  function hpop() {
    var top = HI[0]; popF = HF[0]; hsize--;
    if (hsize > 0) {
      var f = HF[hsize], i = HI[hsize], k = 0;
      for (;;) {
        var c = 2 * k + 1; if (c >= hsize) break;
        if (c + 1 < hsize && HF[c + 1] < HF[c]) c++;
        if (HF[c] >= f) break;
        HF[k] = HF[c]; HI[k] = HI[c]; k = c;
      }
      HF[k] = f; HI[k] = i;
    }
    return top;
  }
  // closed set: open-addressing hash of keys in two parts, kHi (stored +1 so 0 means empty) and kLo, each an
  // integer a double holds exactly
  var SCAP = 1 << 17, SMASK = SCAP - 1, SK = new Float64Array(SCAP), SL = new Float64Array(SCAP), SN = 0;
  function sHash(k, l) {
    var h = Math.imul((k % 4294967296) ^ Math.imul((k / 4294967296) | 0, 0x27d4eb2d), 0x9e3779b1);
    h ^= Math.imul((l % 4294967296) ^ Math.imul((l / 4294967296) | 0, 0x165667b1), 0x85ebca6b);
    h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
    return h;
  }
  function sGrow() {
    var oldK = SK, oldL = SL; SCAP *= 2; SMASK = SCAP - 1; SK = new Float64Array(SCAP); SL = new Float64Array(SCAP);
    for (var j = 0; j < oldK.length; j++) {
      var v = oldK[j];
      if (v !== 0) { var i = sHash(v, oldL[j]) & SMASK; while (SK[i] !== 0) i = (i + 1) & SMASK; SK[i] = v; SL[i] = oldL[j]; }
    }
  }
  function sAdd(s) {   // true if the state's cell (keyOf) was new
    keyOf(s);
    var k = kHi + 1, l = kLo;
    if (SN * 2 >= SCAP) sGrow();
    var i = sHash(k, l) & SMASK;
    for (;;) {
      var v = SK[i];
      if (v === 0) { SK[i] = k; SL[i] = l; SN++; return true; }
      if (v === k && SL[i] === l) return false;
      i = (i + 1) & SMASK;
    }
  }
  // Fastest mode merges only identical states, so nothing is lost: a table of node indices (+1)
  // keyed by the exact state.
  var ECAP = 1 << 17, ET = new Int32Array(ECAP), EH = new Int32Array(ECAP), EN = 0, eSlot = 0;
  var FB = new Float64Array(1), FI = new Int32Array(FB.buffer);
  function fmix(h, v) { FB[0] = v + 0; h = Math.imul(h ^ FI[0], 0x9e3779b1); h = Math.imul(h ^ FI[1], 0x85ebca6b); return h ^ (h >>> 15); }
  function eGrow() {
    var oT = ET, oH = EH; ECAP *= 2; ET = new Int32Array(ECAP); EH = new Int32Array(ECAP);
    for (var j = 0; j < oT.length; j++) if (oT[j]) { var i = oH[j] & (ECAP - 1); while (ET[i]) i = (i + 1) & (ECAP - 1); ET[i] = oT[j]; EH[i] = oH[j]; }
  }
  // The state's yes/no parts as one number: what's stored per node, and part of both kinds of key.
  function flagsOf(s) {
    return (s.onGround ? 1 : 0) | (s.prevJump ? 2 : 0) | (s.airJump ? 4 : 0) | (s.slippery ? 8 : 0) | (s.jumpLost ? 16 : 0) | (s.spawnJump ? 32 : 0);
  }
  // Looks up state s: returns the node holding it (-1 if none) and leaves its slot in eSlot.
  function eFind(s) {
    if (EN * 2 >= ECAP) eGrow();
    var fl = flagsOf(s);
    var hs = fmix(fmix(fmix(fmix(fmix(fmix(fmix(fl + 1, s.x), s.y), s.vx), s.vy), s.remX), s.remY), s.floatF), i = hs & (ECAP - 1);
    for (;;) {
      var e = ET[i] - 1;
      if (e < 0) { eSlot = i; EH[i] = hs; return -1; }
      if (EH[i] === hs && NF[e] === fl && NX[e] === s.x && NY[e] === s.y && NVX[e] === s.vx && NVY[e] === s.vy && NRX[e] === s.remX && NRY[e] === s.remY &&
          NT[e] === s.floatF) { eSlot = i; return e; }
      i = (i + 1) & (ECAP - 1);
    }
  }
  var QP = opts.cellPx || 2, QV = opts.cellSpeed || 20, QYOFF = Math.ceil(4096 / QP);
  // The state's cell, in two integers: kHi is where it is, kLo the rest (speeds, the yes/no parts and, only when
  // the level or the gear makes them matter, the float item's time in 13-frame steps).
  var kHi = 0, kLo = 0;
  function keyOf(s) {
    var qx = Math.round(s.x / QP) + 64, qy = Math.min(8191, Math.max(0, Math.round(s.y / QP) + QYOFF));
    var qvx = Math.round(s.vx / QV) + 64;
    var qvy = s.onGround ? 0 : Math.round(s.vy / QV) + 128;
    var fb = floatGear ? (s.floatF === FLOAT_NO_LIMIT ? 15 : Math.min(14, (s.floatF / 13) | 0)) : 0;
    kHi = qx * 8192 + qy;
    kLo = ((qvx * 512 + qvy) * 128 + flagsOf(s)) * 16 + fb;
  }
  function h(s) {
    if (explore) return 0;
    if (fastest) return minTimeTo(s, goal, P, ups);
    var dx = Math.max(0, goal.x0 - (s.x + hw), (s.x - hw) - goal.x1);
    var top = s.y - hh, gy = goal.kind === "stand" ? goal.y : goal.y1;
    var dyUp = Math.max(0, (goal.kind === "stand" ? s.y - goal.y : top - gy));
    var straight = Math.max(dx / topSpeed(P), dyUp / P.jumpSpeed);
    if (!guide) return straight;
    var way = guide.at(s.x, s.y - hh / 2);   // the way round, where the level has one
    return way > straight && way < Infinity ? way : straight;
  }
  function store(s, parent, a, g) {
    if (count >= cap) grow();
    var i = count++;
    NX[i] = s.x; NY[i] = s.y; NVX[i] = s.vx; NVY[i] = s.vy; NRX[i] = s.remX; NRY[i] = s.remY;
    NF[i] = flagsOf(s); NT[i] = s.floatF;
    NP[i] = parent; NA[i] = a; NG[i] = g;
    return i;
  }
  function load(i, s) {
    s.x = NX[i]; s.y = NY[i]; s.vx = NVX[i]; s.vy = NVY[i]; s.remX = NRX[i]; s.remY = NRY[i]; s.floatF = NT[i];
    var f = NF[i]; s.onGround = !!(f & 1); s.prevJump = !!(f & 2); s.airJump = !!(f & 4); s.slippery = !!(f & 8); s.jumpLost = !!(f & 16); s.spawnJump = !!(f & 32); s.holding = false;
  }
  function path(i, lastA) {
    var acts = []; if (lastA != null) acts.push(lastA);
    while (i > 0) { acts.push(NA[i]); i = NP[i]; }
    return acts.reverse();
  }
  var AD = [1, 1, 0, 0, -1, -1], AJ = [0, 1, 0, 1, 0, 1];
  var K0 = K, B0 = B, goal0 = goal;
  var s0 = makePlayer(start.x, start.y);
  // settle onto the floor so the first state is exactly what the game spawns into
  step(s0, { left: false, right: false, jump: false, jumpPressed: false }, P, w);
  s0.prevJump = false;
  var root = store(s0, -1, -1, 0);
  if (fastest) { eFind(s0); ET[eSlot] = root + 1; EN++; } else sAdd(s0);
  hpush(h(s0), root);
  var stand = explore ? new Set() : null;
  var best = { h: h(s0), i: root }, expansions = 0;
  var S1 = makePlayer(0, 0), S2 = makePlayer(0, 0), INP = { left: false, right: false, jump: false, jumpPressed: false };
  var result = null;
  // Fastest mode's answer. optimal: nothing left can beat the route (else the budget ran out, and
  // lowerBound is the time any faster route would at least need).
  function fastestDone(optimal) {
    return (result = { found: !!bestActs, optimal: optimal, actions: bestActs, time: bestT, lowerBound: optimal ? bestT : lowT,
      exhausted: optimal && !bestActs, expansions: expansions, nodes: count, K: K0, closest: bestActs ? null : path(best.i) });
  }
  // With no node budget the arrays can outgrow memory (a RangeError when they grow). Then it
  // answers with what it has, as if it had hit a budget.
  function run(budget) {
    try { return expand(budget); }
    catch (err) {
      if (!(err instanceof RangeError)) throw err;
      if (fastest) fastestDone(false);
      else result = { found: false, exhausted: false, expansions: expansions, nodes: count, closest: path(best.i), closestH: best.h, K: K0, stand: stand };
      result.outOfMemory = true;
      return result;
    }
  }
  function expand(budget) {
  if (result) return result;
  // locals for the hot loop
  var s = S1, n = S2, inp = INP, K = K0, B = B0, goal = goal0, ACT_DIR = AD, ACT_JUMP = AJ;
  while (hsize > 0) {
    if (budget-- <= 0) return null;
    var idx = hpop();
    if (NG[idx] > maxTime) continue;
    load(idx, s);
    if (fastest) {
      if (popF > bestT - HALF) break;   // A* pops in order of g + h, so nothing left is faster
      lowT = popF;
      if (eFind(s) !== idx) continue;   // this state was reached sooner since
    }
    expansions++;
    if (onProgress && (expansions & 16383) === 0) onProgress(expansions, count, lowT);
    // Holding jump only matters while rising (letting go brakes), as a fresh press (a jump, the stored air
    // jump, or a jump while falling in a field or in water), or with a parasol. Anywhere else, letting go
    // reaches the same spot and can press sooner, so holding is skipped there.
    var holdUseless = !holdMatters && s.vy >= 0 && (s.onGround ? s.prevJump
      : s.prevJump || !(s.airJump || s.spawnJump || (hasFallJump && jumpsFalling(w, s.x, s.y - hh / 2))));
    for (var a = 0; a < 6; a++) {
      var dir = ACT_DIR[a], jump = ACT_JUMP[a];
      if (jump && holdUseless) continue;
      n.x = s.x; n.y = s.y; n.vx = s.vx; n.vy = s.vy; n.remX = s.remX; n.remY = s.remY; n.floatF = s.floatF; n.dead = false; n.onGround = s.onGround;
      n.prevJump = s.prevJump; n.holding = s.holding; n.airJump = s.airJump; n.slippery = s.slippery; n.jumpLost = s.jumpLost; n.spawnJump = s.spawnJump;
      var dead = false, reached = false;
      for (var k = 0; k < K; k++) {
        inp.left = dir < 0; inp.right = dir > 0; inp.jump = !!jump;
        inp.jumpPressed = k === 0 && !!jump && !s.prevJump;
        step(n, inp, P, w);
        if (died(w, P, n)) { dead = true; break; }
        if (goal && goalReached(n, goal, P)) { reached = true; break; }
      }
      if (dead) continue;
      if (B && !reached && (n.x < B[0] || n.x > B[2] || n.y < B[1] || n.y > B[3])) continue;
      n.prevJump = !!jump;
      var g = NG[idx] + K * DT;
      if (reached) {
        var t = NG[idx] + (k + 1) * DT;   // the step it got there
        if (!fastest) return (result = { found: true, actions: path(idx, a), time: t, expansions: expansions, nodes: count, K: K });
        if (t < bestT - HALF) { bestT = t; bestActs = path(idx, a); if (onBetter) onBetter(bestActs, bestT); }
        continue;
      }
      if (count >= maxNodes) return fastest ? fastestDone(false) : (result = { found: false, exhausted: false, expansions: expansions, nodes: count, closest: path(best.i), closestH: best.h, K: K, stand: stand });
      var hv = h(n);
      if (fastest) {
        if (g + hv > bestT - HALF) continue;   // can't beat the best route by a step
        var e = eFind(n);
        if (e >= 0 && NG[e] <= g + HALF) continue;   // already reached as soon
      } else if (!sAdd(n)) continue;
      var ni = store(n, idx, a, g);
      if (fastest) { ET[eSlot] = ni + 1; if (e < 0) EN++; }
      if (stand && n.onGround) stand.add(Math.floor(n.x / T) + "," + Math.round(n.y / T));
      if (hv < best.h) best = { h: hv, i: ni };
      hpush(g + weight * hv, ni);
    }
  }
  if (fastest) return fastestDone(true);
  return (result = { found: false, exhausted: true, expansions: expansions, nodes: count, closest: path(best.i), closestH: best.h, K: K, stand: stand });
  }
  return { run: run, nodes: function () { return count; } };
}

// The page's checker settings, finest first. Each pass merges states that land in the same cell, so a
// finer one keeps more routes alive and costs more. weights are the A* weights it tries in turn (see
// makePasses); a spread of them is what lets a coarse pass that ran dry get a second and third look.
var CHECK_PASSES = [
  { cellPx: 1, cellSpeed: 10, maxNodes: 1500000, weights: [2.5] },
  { cellPx: 2, cellSpeed: 20, maxNodes: 2500000, weights: [1.6, 3, 6] },
  { cellPx: 4, cellSpeed: 40, maxNodes: 2500000, weights: [1.6, 3, 6] }
];
// The same passes with no node budget on the finest one: it runs until it finds a route or proves there
// isn't one, or memory runs out.
function unlimitedPasses(passes) {
  passes = passes || CHECK_PASSES;
  return passes.map(function (p, i) { var o = {}; for (var k in p) o[k] = p[k]; if (i === 0) o.maxNodes = Infinity; return o; });
}
/* The route check as a run of passes, resumable like makeSearch: run(n) returns null until there's an answer.
   Passes come finest first but run coarsest first. The coarse ones are quick and find most routes, and a
   route found at any precision is real: replayRoute plays it in the game. Only the finest pass can prove a
   level impossible. A coarse pass that runs dry has merged states, so a route with less to spare than its
   cells could be lost with them, in a level with a thin window. So a dry coarse pass gets another go with
   the next weight in its list (another order to search in, so other states survive the merging) before the
   next finer pass starts. The answer:
     found            a route (res.pass says which pass found it)
     exhausted, cellPx <= 1   the finest pass ran dry: nothing reaches the goal, proven
     exhausted, coarser       only a coarser pass ran dry; the finest ran out of room (res.finer says how far
                              it got): probably not possible, but not proven
     neither          every pass ran out of room
   res.closest is the way of the state nearest the goal over every attempt. */
function makePasses(w, P, start, goal, bounds, passes, onProgress) {
  passes = passes || CHECK_PASSES;
  var at = passes.length - 1, attempt = 0, search = null;
  var dry = null, last = null, closest = null, closestH = Infinity;
  function begin() {
    var p = passes[at], o = {}, pi = at;
    for (var k in p) o[k] = p[k];
    o.bounds = bounds || null;
    if (p.weights) o.weight = p.weights[attempt];
    if (onProgress) o.onProgress = function (ex, n) { onProgress(pi, n); };
    search = makeSearch(w, P, start, goal, o);
  }
  function finish(res) {
    if (!res.found) { res.closest = closest; res.closestH = closestH; }
    return res;
  }
  function run(budget) {
    for (;;) {
      if (!search) begin();
      var res = search.run(budget);
      if (!res) return null;
      var p = passes[at];
      res.pass = at; res.cellPx = p.cellPx; res.cellSpeed = p.cellSpeed;
      if (res.closestH < closestH) { closestH = res.closestH; closest = res.closest; }
      if (res.found || (res.exhausted && at === 0)) return finish(res);   // a route, or a proof
      if (res.exhausted) {
        if (!dry || at < dry.pass) dry = res;   // the finest pass that ran dry
        if (p.weights && attempt + 1 < p.weights.length) { attempt++; search = null; continue; }
      }
      last = res;
      if (at === 0) break;
      at--; attempt = 0; search = null;
    }
    if (!dry) return finish(last);
    dry.finer = { cellPx: last.cellPx, cellSpeed: last.cellSpeed, nodes: last.nodes, outOfMemory: !!last.outOfMemory };
    return finish(dry);
  }
  return { run: run, nodes: function () { return search ? search.nodes() : 0; }, pass: function () { return at; } };
}
// Runs the passes to an answer. The result also says which pass gave it (res.pass, res.cellPx, res.cellSpeed).
function solveWithPasses(w, P, start, goal, bounds, passes, onProgress) {
  var runner = makePasses(w, P, start, goal, bounds, passes, onProgress), r;
  while (!(r = runner.run(1073741824))) {}
  return r;
}
// Once a route is found, the checker goes on to the fastest one. Merging nothing, it can hit its
// budget on a big level; then it answers with the best route so far and a lower bound.
// noLimit drops the budget: it runs until the route is proven fastest, or memory runs out.
var FASTEST_MAX_NODES = 1500000;
function fastestOptions(bounds, first, onProgress, onBetter, noLimit) {
  return { fastest: true, maxNodes: noLimit ? Infinity : FASTEST_MAX_NODES, bounds: bounds || null, bound: first && first.found ? { time: first.time, actions: first.actions } : null,
    stepsPerDecision: first && first.found ? first.K : undefined,   // the same input rate as the route it's beating
    onProgress: onProgress || null, onBetter: onBetter || null };
}

// Replays an action list through the same physics; returns positions every step and how it ended.
function replayRoute(w, P, start, actions, K, goal) {
  var p = makePlayer(start.x, start.y);
  step(p, { left: false, right: false, jump: false, jumpPressed: false }, P, w);
  p.prevJump = false;
  var pts = [[p.x, p.y]], jumps = 0, airJumps = 0, airAt = [], end = "ran out";
  var ACT_DIR = [1, 1, 0, 0, -1, -1], ACT_JUMP = [0, 1, 0, 1, 0, 1];
  outer:
  for (var d = 0; d < actions.length; d++) {
    var a = actions[d], dir = ACT_DIR[a], jump = ACT_JUMP[a];
    for (var k = 0; k < K; k++) {
      var pressed = k === 0 && !!jump && !p.prevJump;
      var was = p.onGround, usedAir = p.airJumps;
      step(p, { left: dir < 0, right: dir > 0, jump: !!jump, jumpPressed: pressed }, P, w);
      if (was && !p.onGround && p.vy < 0) jumps++;
      pts.push([p.x, p.y]);
      if (p.airJumps > usedAir) { jumps++; airJumps++; airAt.push(pts.length - 2); }   // index of the point it jumped from
      if (died(w, P, p)) { end = "died"; break outer; }
      if (goal && goalReached(p, goal, P)) { end = "reached"; break outer; }
    }
    p.prevJump = !!jump;
  }
  return { pts: pts, jumps: jumps, airJumps: airJumps, airAt: airAt, end: end };
}
