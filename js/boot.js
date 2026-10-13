/* ---------- boot ---------- */
function start(saved) {
  if (saved && saved.P) Object.assign(P, saved.P);
  makeTextures();
  buildTools();
  let L = null;
  if (saved && saved.code && saved.code !== OLD_SPIKE_RUN) { try { L = decodeLevel(saved.code); L.signs = saved.signs || []; } catch (e) { L = null; } }
  if (!L) L = loadSaved();
  if (!L) L = decodeLevel(DEFAULT_LEVEL);
  resize();
  setLevel(L);
  if (saved && saved.P && "doubleJump" in saved.P) syncGear(); else loadGear();
  buildConsts();
  window.addEventListener("resize", resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);
  onConstChange();
  showResult("idle", IDLE_TEXT, "");
  hintText.textContent = coarse ? "Use the buttons below" : "Click to play";
  if (coarse) {
    keysPlay.innerHTML = "Hold <kbd>◀</kbd> <kbd>▶</kbd> to run · hold <kbd>Jump</kbd> longer to jump higher";
    keysBuild.innerHTML = "Tap or drag to place tiles · pick Erase to remove them · <kbd>◀</kbd> <kbd>▶</kbd> <kbd>▲</kbd> <kbd>▼</kbd> move the view";
  }
  updateBuildButtons();
  if (document.fonts && document.fonts.load) document.fonts.load("600 8px Geist").catch(() => {});
  requestAnimationFrame(t => { last = t; frame(t); });
}
start();
