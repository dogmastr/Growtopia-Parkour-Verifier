# Growtopia Parkour Verifier

A rebuild of the Growtopia character's run, jump and fall, with a parkour level editor and a route checker. The checker either finds inputs that beat a course or a single jump, or proves that no inputs can. A route it finds is a real input recording, and "Watch it" replays it frame for frame in the game.

Fan-made and not affiliated with Growtopia or Ubisoft. All art is original.

**Live:** https://dogmastr.github.io/Growtopia-Parkour-Verifier/ — or open `index.html` in a browser. There is no build step and nothing to install.

## Files

```
index.html             the page
mechanics.html         the Mechanics page: how bounces, blocks and the player work, one topic per tab
css/base.css           layout, controls, theme
css/editor.css         build tools, route checker, touch pads
css/mechanics.css      the Mechanics page's tab bar and text
js/core.js             physics, collision, route checker (runs in the page and the worker)
js/levels.js           built-in levels and level codes
js/app.js              level state, drawing, editor, game loop, checker UI
js/constants-panel.js  the Constants sliders
js/mechanics.js        the Mechanics page's tabs, and its numbers and chart (worked out by core.js)
js/boot.js             startup
js/worker.js           the route checker's Web Worker
```

Opened straight from disk, Chrome refuses workers, so the checker then runs on the page's own thread in short slices: same answers, a little slower. From a web server (including GitHub Pages) the worker is used.

## Physics

The movement follows the reverse-engineered Android 5.59 client: one step per frame, whole pixels, 32-bit floats. A frame is 16 ms, or 17 ms with the Frame length buttons (the game runs both; see the Mechanics page). Units are px and seconds; a tile is 32 px.

| | |
|---|---|
| Top speed / acceleration / braking | 250 px/s, 1200 px/s², 1200 px/s² |
| Jump | 450 px/s up; gravity 1000 px/s² |
| Letting go while rising | +5000 px/s² (brakes the rise) |
| Fall cap | 400 px/s |
| Hitbox | 20 × 30 px |

**Spawn:** at the checkpoint your head is at the top of its tile, 2 px above whatever is under it. You can jump at once even in the air, and with wings the second jump is ready too, unless a spike is right under the checkpoint (then you get only the one jump); a jump or a landing uses the spawn jump up.

**Tiles:** dirt, spike (deadly, full block), antigravity field, conveyor block, pinball bumper, waterfall, Mushroom and Diving Board (trampolines), and water (a flag that can share a tile with a block).
**Gear:** double jump (wings), parasol, 3 speed items, high jump item, and one water item: a Jet Ski or floaties.

- **Antigravity field, conveyor, water:** act on the centre point of your box, not its edges. Field: gravity ×0.375, you can jump while falling. Conveyor: run set to top speed, rightwards. Water: gravity and fall cap ×0.3 (300 px/s², 120 px/s), run 125 px/s, jump ×0.6 (270 px/s).
- **Changing mods:** putting an item on or taking one off takes away the stored double jump; in the air it stays gone until you land. A Gear button does that while you play. In the game a change can be sent once every 333 ms and lands when the server answers. See the Mechanics page.
- **Water items:** a Jet Ski (the Jet Ski or the Golden Jet Ski) stops gravity and the fall cap from the frame you enter the water (you rest at the surface and can jump any time), with no time limit, until you touch ground or change any item; then it takes a new entry to float again. The game's 3-second float items and the Fishing Dinghy aren't modelled. Floaties cut sinking to 40 px/s and push up at 320 px/s², give rising a 12 px/s² push and cap upward speed at 120 px/s. One at a time.
- **Waterfall:** not solid and not water. It only refuses upward steps that would leave your box in it, so it's a ceiling from below and you can't rise inside it.
- **Pinball bumper:** solid; a touch sets your speed to 500 px/s straight away from its centre, takes you off the ground, makes you slippery until you land, and clears the held-jump state until the next press. (The bouncy turret, a platform, and the fire-flag bumper aren't modelled.)
- **Trampolines:** landing on top of the Mushroom (solid) or the Diving Board (a platform, solid only from above) sets your upward speed to 800 px/s, whatever your fall speed was, and nothing else; jump held or let go then rises about 320 or 53 px.
- **Blocks side by side:** the contact test goes through the blocks under your box column by column from the left, and the first that acts ends it (a spike kills, a trampoline bounces, a bumper throws). A trampoline or bumper on the left of a spike saves you while 1 px of your box is over it; a spike on the left kills you.

The sliders in the Constants panel change the numbers (the ones built into the game are listed, not editable); the notes under the game explain each rule.

## Route checker

A best-first search over the game's own physics. Every game frame (16 or 17 ms) it tries run left, stand or run right, each with jump held or let go. States that land in the same small cell are merged, at 1, 2 and 4 px precision; only the 1 px pass can say "not possible". Once it has a route it goes on to the fastest one. "Test one jump" checks a single jump between two spots.

With "Water items can be changed on the way" ticked, the checker may also put a water item on, take it off or swap it at any moment of a route: at least 21 frames after the last change (the game's 333 ms; 20 in 17 ms frames), and each change takes away the double jump until the next landing. A Jet Ski put on in the water does nothing until you leave the water and come back. The other gear stays as ticked.

## Level codes

```
THL1|W|H|startX,startY|finishX,finishY|runs[|waterRuns]
```

`runs` is the map row by row from the top, as `<tile code><count in base 36>` joined with `.`; `waterRuns` is the water layer the same way and is left off when there's no water. The tile code is one base-36 character: `0` empty, `1` dirt, `2` stone, `3` wood, `4` bedrock, `5` spike, `6` antigravity field, `7` conveyor, `8` pinball bumper, `9` waterfall, `a` Mushroom, `b` Diving Board, `c` Platform. Build > Copy level code / Load a code.
