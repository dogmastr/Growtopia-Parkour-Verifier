/* ===== worker.js: the route checker's Web Worker =====
   Loads the same core.js and levels.js the page runs (so a route it finds replays frame for frame in
   the game), then answers one check per message from app.js. If the browser won't start it (Chrome blocks
   workers on file:// pages), app.js runs the same search on the page's own thread instead. */
importScripts("core.js", "levels.js");

self.onmessage = function (e) {
  var d = e.data;
  if (d.frameMs) setFrameMs(d.frameMs);
  var w = makeWorld(d.W, d.H, d.map, d.water);
  var res = solveWithPasses(w, d.P, d.start, d.goal, d.bounds, d.passes, function (pass, nodes) {
    self.postMessage({ type: "progress", id: d.id, pass: pass, nodes: nodes });
  });
  if (!res.found) { self.postMessage({ type: "done", id: d.id, res: res }); return; }
  // show this route, then keep going for the fastest one
  self.postMessage({ type: "found", id: d.id, res: res });
  var fast = solveRoute(w, d.P, d.start, d.goal, fastestOptions(d.bounds, res,
    function (ex, nodes, low) { self.postMessage({ type: "progress", id: d.id, fastest: true, nodes: nodes, low: low }); },
    function (actions, time) { self.postMessage({ type: "better", id: d.id, actions: actions, time: time }); }, d.noLimit));
  self.postMessage({ type: "done", id: d.id, res: fast });
};
