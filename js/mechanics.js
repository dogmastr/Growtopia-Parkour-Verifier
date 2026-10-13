/* ===== mechanics.js: the Mechanics page's tab bar, and the Bounce cancel numbers =====
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
})();
