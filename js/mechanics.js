/* ===== mechanics.js: the Mechanics page's tab bar, the Bounce cancel numbers, and the jump-height-by-frame-rate figure =====
   The numbers and the chart are worked out by core.js, the same physics the verifier and its route checker run,
   so what this page says about a bounce is what the checker assumes. */
(function () {
  "use strict";

  /* ---------- tabs: one topic at a time, chosen by the link's #id ---------- */
  var links = Array.prototype.slice.call(document.querySelectorAll(".tabs a"));
  var topics = Array.prototype.slice.call(document.querySelectorAll(".topic"));
  function show(id, toTop) {
    var cur = topics.filter(function (t) { return t.id === id; })[0] || topics[0];
    topics.forEach(function (t) { t.hidden = t !== cur; });
    links.forEach(function (a) {
      if (a.getAttribute("href") === "#" + cur.id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    document.title = cur.dataset.title + " · Growtopia Mechanics";
    if (toTop) window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", function () { show(location.hash.slice(1), true); });
  show(location.hash.slice(1), false);
  // The hash only picks a tab. The browser would also scroll to the topic's heading, past the page's top.
  if (location.hash) { window.scrollTo(0, 0); window.addEventListener("load", function () { window.scrollTo(0, 0); }); }

  /* ---------- a bounce, simulated ---------- */
  var DTS = 0.016;   // one game frame
  // The heights (px above the trampoline's top) of every frame of one bounce from a standing start on a Mushroom,
  // holding jump for holdFrames frames and then letting go. A plain avatar: no gear, so no air jump to spend.
  function bounce(holdFrames) {
    var ROW = 16;   // the Mushroom's row: 16 tiles up there is room for the tallest bounce under the world's ceiling
    var w = makeWorld(20, 20);
    for (var y = ROW; y < 20; y++) for (var x = 0; x < 20; x++) w.map[y * 20 + x] = SOIL;
    w.map[ROW * 20 + 10] = MUSHROOM;
    var P = Object.assign({}, GAME, GEAR);
    var p = makePlayer(10 * T + T / 2, ROW * T);
    p.spawnJump = false;
    var h = [0];
    for (var n = 0; n < 400; n++) {
      step(p, { left: false, right: false, jump: n < holdFrames, jumpPressed: false }, P, w);
      h.push(ROW * T - p.y);
      if (n > 3 && ROW * T - p.y <= 0) break;   // back on top of it
    }
    return h;
  }
  function peak(h) { return Math.max.apply(null, h); }

  // the table's last column
  Array.prototype.forEach.call(document.querySelectorAll("#rise-table [data-t]"), function (td) {
    var frames = +td.dataset.t >= 0.8 ? Infinity : Math.round(+td.dataset.t / DTS);
    td.textContent = Math.round(peak(bounce(frames))) + " px";
  });

  /* ---------- the chart: height against time for three ways of holding jump ---------- */
  // blue, orange and aqua: the first three slots of the validated categorical palette, in order
  var SERIES = [
    { name: "Hold jump the whole way", frames: Infinity, color: "#2a78d6" },
    { name: "Let go after 0.3 s", frames: Math.round(0.3 / DTS), color: "#eb6834" },
    { name: "Let go straight away", frames: 0, color: "#1baf7a" }
  ];
  SERIES.forEach(function (s) { s.h = bounce(s.frames); s.top = peak(s.h); });
  var N = Math.max.apply(null, SERIES.map(function (s) { return s.h.length; }));   // frames on the time axis

  var plot = document.getElementById("bounce-plot"), legend = document.getElementById("bounce-legend");
  var tip = document.getElementById("bounce-tip"), fig = document.getElementById("bounce-figure"), table = document.getElementById("bounce-table");
  if (!plot) return;

  var NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  var VW = 640, VH = 300, M = { l: 46, r: 18, t: 14, b: 34 };
  var tMax = Math.ceil(N * DTS * 2) / 2;   // seconds, to the next half second
  var yMax = 350;
  function X(t) { return M.l + (VW - M.l - M.r) * t / tMax; }
  function Y(v) { return VH - M.b - (VH - M.t - M.b) * v / yMax; }

  SERIES.forEach(function (s) {
    var span = document.createElement("span"), key = document.createElement("i");
    key.style.setProperty("--c", s.color);
    span.appendChild(key); span.appendChild(document.createTextNode(s.name));
    legend.appendChild(span);
  });

  var svg = el("svg", { viewBox: "0 0 " + VW + " " + VH, role: "img", tabindex: "0",
    "aria-label": "Line chart of height above the trampoline against time after landing. Holding jump the whole way peaks at about " +
      Math.round(SERIES[0].top) + " px after 0.8 s, letting go after 0.3 s at about " + Math.round(SERIES[1].top) +
      " px, and letting go straight away at about " + Math.round(SERIES[2].top) + " px after 0.13 s. The table view has the numbers." });
  plot.appendChild(svg);

  // grid and axes: solid hairlines, labels in muted ink
  var g = el("g", {}, svg);
  [0, 100, 200, 300].forEach(function (v) {
    el("line", { x1: M.l, x2: VW - M.r, y1: Y(v), y2: Y(v), stroke: v === 0 ? "#c3c7cd" : "#e8eaed", "stroke-width": 1 }, g);
    var t = el("text", { x: M.l - 8, y: Y(v) + 4, "text-anchor": "end" }, g); t.textContent = v;
  });
  for (var s = 0; s <= tMax + 1e-9; s += 0.5) {
    var tt = el("text", { x: X(s), y: VH - M.b + 18, "text-anchor": "middle" }, g); tt.textContent = s.toFixed(1);
  }
  var xl = el("text", { x: VW - M.r, y: VH - 4, "text-anchor": "end" }, g); xl.textContent = "seconds after landing";
  var yl = el("text", { x: M.l - 8, y: M.t - 2, "text-anchor": "end" }, g); yl.textContent = "px up";

  // the lines, 2 px, tallest first so the short one sits on top
  SERIES.forEach(function (s) {
    var d = s.h.map(function (v, i) { return (i ? "L" : "M") + X(i * DTS).toFixed(1) + " " + Y(v).toFixed(1); }).join("");
    el("path", { d: d, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
  });
  // the end dots and the three direct labels at the tops (a 2 px surface ring keeps them clear of the lines)
  SERIES.forEach(function (s) {
    var i = s.h.indexOf(s.top);
    el("circle", { cx: X(i * DTS), cy: Y(s.top), r: 5, fill: s.color, stroke: "#fff", "stroke-width": 2 }, svg);
    var lab = el("text", { x: X(i * DTS) + 12, y: Y(s.top) - 8, class: "lab" }, svg);   // above-right, clear of the flat top
    lab.textContent = Math.round(s.top) + " px";
  });

  // crosshair and tooltip: it snaps to the nearest frame, and the arrow keys move it
  var cross = el("line", { y1: M.t, y2: VH - M.b, stroke: "#9aa1ab", "stroke-width": 1, visibility: "hidden" }, svg);
  var dots = SERIES.map(function (s) { return el("circle", { r: 4, fill: s.color, stroke: "#fff", "stroke-width": 2, visibility: "hidden" }, svg); });
  var cur = -1;
  function at(i) {
    i = Math.max(0, Math.min(N - 1, i)); cur = i;
    cross.setAttribute("x1", X(i * DTS)); cross.setAttribute("x2", X(i * DTS)); cross.setAttribute("visibility", "visible");
    tip.replaceChildren();
    var head = document.createElement("b"); head.textContent = (i * DTS).toFixed(2) + " s after landing"; tip.appendChild(head);
    SERIES.forEach(function (s, k) {
      var v = i < s.h.length ? s.h[i] : 0;
      dots[k].setAttribute("cx", X(i * DTS)); dots[k].setAttribute("cy", Y(v)); dots[k].setAttribute("visibility", "visible");
      var row = document.createElement("div"), key = document.createElement("i"), val = document.createElement("strong");
      key.style.setProperty("--c", s.color); val.textContent = Math.round(v) + " px";
      row.appendChild(key); row.appendChild(val); row.appendChild(document.createTextNode(s.name)); tip.appendChild(row);
    });
    tip.hidden = false;
    var box = svg.getBoundingClientRect(), host = fig.getBoundingClientRect();
    var px = (X(i * DTS) / VW) * box.width + (box.left - host.left);
    var left = px + 14; if (left + tip.offsetWidth > host.width - 8) left = px - tip.offsetWidth - 14;
    tip.style.left = Math.max(8, left) + "px"; tip.style.top = (box.top - host.top + 28) + "px";
  }
  function off() {
    cur = -1; tip.hidden = true; cross.setAttribute("visibility", "hidden");
    dots.forEach(function (d) { d.setAttribute("visibility", "hidden"); });
  }
  svg.addEventListener("pointermove", function (e) {
    var r = svg.getBoundingClientRect(), vx = (e.clientX - r.left) / r.width * VW;
    at(Math.round((vx - M.l) / (VW - M.l - M.r) * tMax / DTS));
  });
  svg.addEventListener("pointerleave", off);
  svg.addEventListener("blur", off);
  svg.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") { at((cur < 0 ? 0 : cur) + 4); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { at((cur < 0 ? 0 : cur) - 4); e.preventDefault(); }
    else if (e.key === "Escape") off();
  });

  // the table twin: every 0.2 s
  var head = document.createElement("thead"), hr = document.createElement("tr");
  ["Seconds after landing"].concat(SERIES.map(function (s) { return s.name; })).forEach(function (t, k) {
    var th = document.createElement("th"); th.textContent = t; if (k) th.className = "num"; hr.appendChild(th);
  });
  head.appendChild(hr); table.appendChild(head);
  var body = document.createElement("tbody");
  for (var q = 0; q <= tMax + 1e-9; q += 0.2) {
    var i = Math.round(q / DTS), tr = document.createElement("tr"), c0 = document.createElement("td");
    c0.textContent = q.toFixed(1); tr.appendChild(c0);
    SERIES.forEach(function (s) { var c = document.createElement("td"); c.className = "num"; c.textContent = Math.round(i < s.h.length ? s.h[i] : 0) + " px"; tr.appendChild(c); });
    body.appendChild(tr);
  }
  table.appendChild(body);

  /* ---------- jump height by frame rate: six small panels, one line each ---------- */
  // The highest point (px) of each jump with frames of 16, 17, ..., 100 whole ms, worked out frame by frame.
  // At x fps a frame is 1000 / x ms. Below 10 fps every frame still counts as 100 ms, so the line stays at the last value.
  var FPS = [
    { name: "Plain held jump", px: [104,104,104,105,105,105,105,105,106,106,106,106,107,107,107,107,107,108,108,108,109,109,109,109,109,109,110,110,110,110,111,111,111,111,112,112,112,113,113,113,113,113,114,114,114,114,115,115,115,115,115,116,116,116,117,117,117,117,117,117,118,118,118,119,119,119,120,120,120,120,120,120,120,120,120,121,121,122,122,123,123,123,123,124,124] },
    { name: "High Jump", px: [145,145,145,145,146,146,146,146,146,147,147,147,147,148,148,148,148,148,149,149,149,149,150,150,150,150,150,151,151,151,152,152,152,152,152,153,153,153,153,154,154,154,154,155,155,155,155,155,156,156,156,156,157,157,157,157,158,158,158,158,159,159,159,159,159,160,160,160,161,161,161,161,161,161,161,162,162,162,163,163,163,164,164,164,164] },
    { name: "Jump started in water", px: [123,123,123,123,123,123,123,124,124,124,124,124,124,124,125,125,125,125,125,125,125,126,126,126,126,126,126,126,127,127,127,127,127,127,127,127,128,128,128,128,128,128,128,129,129,129,129,129,129,129,130,130,130,130,130,130,130,131,131,131,131,131,131,131,131,132,132,132,132,132,132,133,133,133,133,133,133,133,134,134,134,134,134,134,134] },
    { name: "Antigravity Generator world", px: [273,273,273,273,274,274,274,274,274,275,275,275,275,276,276,276,276,276,277,277,277,277,278,278,278,278,279,279,279,279,279,280,280,280,280,281,281,281,281,281,282,282,282,282,282,283,283,283,284,284,284,284,284,285,285,285,285,286,286,286,286,287,287,287,287,287,288,288,288,288,288,289,289,289,290,290,290,290,290,291,291,291,291,291,292] },
    { name: "Trampoline bounce, held", px: [325,326,326,327,327,327,328,328,329,329,329,330,330,331,331,331,332,332,333,333,334,334,334,335,335,336,336,336,337,337,338,338,338,339,339,340,340,340,341,341,342,342,342,343,343,344,344,345,345,345,346,346,347,347,348,348,348,348,349,350,350,351,351,351,351,352,352,353,353,354,354,354,355,355,355,356,357,357,358,358,358,359,359,359,359] },
    { name: "Lava bounce", px: [67,67,67,68,68,69,69,69,70,70,71,71,72,72,72,73,73,74,74,75,75,75,75,76,77,77,78,78,79,79,80,80,80,80,80,80,81,82,83,83,84,85,85,86,86,87,87,88,88,88,89,89,89,90,90,90,90,90,90,90,90,91,92,93,93,94,95,96,96,97,98,98,99,100,100,101,102,102,103,104,104,105,105,106,107] }
  ];
  var fpsHost = document.getElementById("fps-panels"), fpsTip = document.getElementById("fps-tip");
  var fpsFig = document.getElementById("fps-figure"), fpsTable = document.getElementById("fps-table");
  if (!fpsHost) return;
  // Each panel is drawn at its real width (and again when that changes), so its text stays 11 px on a phone and on a wide screen.
  var FH = 170, FM = { l: 34, r: 50, t: 20, b: 22 };
  function fpsPanel(s) {
    var last = s.px[s.px.length - 1], pts = [];
    for (var x = 1; x < 10; x++) pts.push({ x: x, v: last });
    for (var k = s.px.length - 1; k >= 0; k--) pts.push({ x: 1000 / (16 + k), v: s.px[k] });
    var lo = Math.min.apply(null, s.px) - 5, hi = Math.max.apply(null, s.px) + 6;
    var box = document.createElement("div"), h = document.createElement("h4"), sub = document.createElement("p");
    h.textContent = s.name; sub.className = "sub"; sub.textContent = s.px[0] + " px at 62.5 fps, " + last + " px at 10 fps and below";
    box.appendChild(h); box.appendChild(sub); fpsHost.appendChild(box);
    var svg = el("svg", { role: "img", tabindex: "0", "aria-label": "Line chart of the highest point of a " + s.name.toLowerCase() +
      " against frames per second: " + s.px[0] + " px at 62.5 fps, rising in steps to " + last + " px at 10 fps, and flat below that. The table view has the numbers." }, box);
    var W = 0, cur = -1, cross, dot;
    function X(x) { return FM.l + (W - FM.l - FM.r) * (x - 1) / 62; }
    function Y(v) { return FH - FM.b - (FH - FM.t - FM.b) * (v - lo) / (hi - lo); }
    function text(attrs, str) { var t = el("text", attrs, svg); t.textContent = str; }
    function draw() {
      W = box.clientWidth; if (!W) return;   // a hidden tab has no width; it draws when it is shown
      off(); svg.replaceChildren(); svg.setAttribute("viewBox", "0 0 " + W + " " + FH);
      var v;
      for (v = Math.ceil(lo / 32) * 32; v <= hi; v += 32) {   // whole tiles
        el("line", { class: "grid", x1: FM.l, x2: W - FM.r, y1: Y(v), y2: Y(v) }, svg);
        text({ x: W - FM.r + 6, y: Y(v) + 4 }, v / 32 + " tiles");
      }
      el("line", { class: "grid", x1: X(10), x2: X(10), y1: FM.t, y2: FH - FM.b }, svg);
      text({ x: X(10), y: FM.t - 7, "text-anchor": "middle" }, "100 ms cap");
      el("line", { class: "axis", x1: FM.l, x2: W - FM.r, y1: FH - FM.b, y2: FH - FM.b }, svg);
      [1, 10, 20, 30, 40, 50, 63].forEach(function (x) { text({ x: X(x), y: FH - 6, "text-anchor": "middle" }, x); });
      for (v = Math.ceil(lo / 10) * 10; v <= hi; v += 10) text({ x: FM.l - 6, y: Y(v) + 4, "text-anchor": "end" }, v);
      el("path", { class: "val", d: pts.map(function (p, i) { return (i ? "L" : "M") + X(p.x).toFixed(1) + " " + Y(p.v).toFixed(1); }).join("") }, svg);
      cross = el("line", { class: "cross", y1: FM.t, y2: FH - FM.b, visibility: "hidden" }, svg);
      dot = el("circle", { class: "dot", r: 4, visibility: "hidden" }, svg);
    }
    function at(i) {
      i = Math.max(0, Math.min(pts.length - 1, i)); cur = i;
      var p = pts[i];
      cross.setAttribute("x1", X(p.x)); cross.setAttribute("x2", X(p.x)); cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", X(p.x)); dot.setAttribute("cy", Y(p.v)); dot.setAttribute("visibility", "visible");
      fpsTip.replaceChildren();
      var head = document.createElement("b"), row = document.createElement("div"), val = document.createElement("strong");
      head.textContent = +p.x.toFixed(1) + " fps (" + Math.round(1000 / p.x) + " ms frames)";
      val.textContent = p.v + " px, " + Math.floor(p.v / 32) + " whole tiles";
      row.appendChild(val); fpsTip.appendChild(head); fpsTip.appendChild(row);
      if (p.x < 10) { var capped = document.createElement("div"); capped.textContent = "physics step capped at 100 ms"; fpsTip.appendChild(capped); }
      fpsTip.hidden = false;
      var r = svg.getBoundingClientRect(), host = fpsFig.getBoundingClientRect();
      var px = r.left - host.left + X(p.x) * r.width / W;
      var left = px + 14; if (left + fpsTip.offsetWidth > host.width - 8) left = px - fpsTip.offsetWidth - 14;
      fpsTip.style.left = Math.max(8, left) + "px"; fpsTip.style.top = (r.top - host.top + 8) + "px";
    }
    function off() {
      if (cur < 0) return;
      cur = -1; fpsTip.hidden = true; cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden");
    }
    svg.addEventListener("pointermove", function (e) {
      var r = svg.getBoundingClientRect(), vx = (e.clientX - r.left) / r.width * W, best = 0;
      pts.forEach(function (p, i) { if (Math.abs(X(p.x) - vx) < Math.abs(X(pts[best].x) - vx)) best = i; });
      at(best);
    });
    svg.addEventListener("pointerleave", off);
    svg.addEventListener("blur", off);
    svg.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { at(cur < 0 ? 0 : cur + 1); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { at(cur < 0 ? 0 : cur - 1); e.preventDefault(); }
      else if (e.key === "Escape") off();
    });
    return draw;
  }
  var fpsDraws = FPS.map(fpsPanel);
  new ResizeObserver(function () { fpsDraws.forEach(function (d) { d(); }); }).observe(fpsHost);

  // the table twin: a few frame rates per setup
  var COLS = [[16, "62.5 fps (16 ms)"], [33, "30 fps (33 ms)"], [50, "20 fps (50 ms)"], [67, "15 fps (67 ms)"], [83, "12 fps (83 ms)"], [100, "10 fps and below (100 ms)"]];
  var fhead = document.createElement("thead"), fhr = document.createElement("tr");
  ["Setup"].concat(COLS.map(function (c) { return c[1]; })).forEach(function (t, k) {
    var th = document.createElement("th"); th.textContent = t; if (k) th.className = "num"; fhr.appendChild(th);
  });
  fhead.appendChild(fhr); fpsTable.appendChild(fhead);
  var fbody = document.createElement("tbody");
  FPS.forEach(function (s) {
    var tr = document.createElement("tr"), c0 = document.createElement("td");
    c0.textContent = s.name; tr.appendChild(c0);
    COLS.forEach(function (c) { var td = document.createElement("td"); td.className = "num"; td.textContent = s.px[c[0] - 16] + " px"; tr.appendChild(td); });
    fbody.appendChild(tr);
  });
  fpsTable.appendChild(fbody);
})();
