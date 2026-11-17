// Hlavní logika: stav, vstup (myš / dotyk / klávesnice), kamera, ukládání.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

const state = {
  map: null,
  net: new RoadNet(),
  kind: 'road',       // co se právě staví: 'road' | 'rail'
  sel: null,          // vybrané pole
  pick: null,         // první vybraný konektor (číslo hrany nebo CENTER)
  hoverConn: null,
  bulldoze: false,
  view: 'tilt',       // 'top' | 'tilt'
  viewStep: 0,        // otočení o násobky 45° (0..7)
  trainOn: false,
  me: 0, players: {}, money: 0, inv: {}, company: null, ledger: {}, paid: {}, locks: {}, lockKey: {},
  player: { color: '#d8402f' },
  sim: null, simSpeed: 1, buildMode: false, sites: [], seedNum: 7,
  tool: null, lastKind: 'road', objType: null, objSite: null, follow: null, followZ: 1.3, glide: null,
  cam: { x: 0, y: 0, zoom: 1 },
  seed: 1,
  msg: '', warn: false
};

let W = 0, H = 0, DPR = 1, dirty = true, spaceDown = false, msgTimer = 0;
const pointers = new Map();
let gesture = null;

// ---------- ukládání ----------
function save() {
  try { localStorage.setItem(CFG.STORAGE_KEY + '_prefs', JSON.stringify({ view: state.view, step: state.viewStep })); } catch (e) {}
}
function loadPrefs() {
  try { if (localStorage.getItem('hx_borders') === '0') state.showBorders = false; } catch (e) {}
  try { const p = JSON.parse(localStorage.getItem(CFG.STORAGE_KEY + '_prefs') || 'null'); if (p && VIEWS[p.view]) { state.view = p.view; state.viewStep = ((p.step | 0) % 8 + 8) % 8; } } catch (e) {}
}
function newClientSim() { return { units: [], ambList: [], cross: {}, crossList: [], floaters: [], t: 0 }; }

// ---------- zprávy ----------
function say(text, warn) {
  state.msg = text; state.warn = !!warn;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { state.msg = ''; state.warn = false; updateStatus(); }, 3500);
  updateStatus();
}
function updateStatus() {
  statusEl.textContent = state.msg || '';
  statusEl.classList.toggle('hidden', !state.msg);
  statusEl.classList.toggle('warn', state.warn);
  if (typeof renderCellbar === 'function') renderCellbar();
}

// ---------- mapa ----------

// ---------- počáteční silniční síť (staví hra za soupeře / obec) ----------

// ---------- soupeři ----------

// ---------- stavba objektů ----------
function startObject(type) {
  const T = TOKEN_TYPES[type];
  if (state.money < T.cost) { say('Nemáš dost peněz (' + fmtMoney(T.cost) + ')', true); return; }
  const sites = computeSites(type);
  if (!sites.length) { say('Pro tento objekt není na mapě volné místo', true); return; }
  resetSheet();
  state.tool = 'object'; state.objType = type; state.buildMode = true; state.sites = sites; state.objSite = null; state.sel = null; state.pick = null; state.bulldoze = false;
  unlockCell(state.me); say(T.name + ': vyber jedno z označených míst'); updateToolbar(); updateStatus(); dirty = true;
}
function pickSite(cell) {
  if (!cell || cell.t !== 'o') return false;
  const st = state.sites.find(x => x.c === cell.c && x.r === cell.r);
  if (!st) { state.objSite = null; unlockCell(state.me); renderCellbar(); dirty = true; return false; }
  const lk = lockedBy(cell, state.me);
  if (lk) { say('Toto místo si právě vybral ' + playerName(lk), true); return true; }
  state.objSite = st; lockCell(cell, state.me); renderCellbar(); dirty = true; return true;
}
function confirmObject() {
  const st = state.objSite, type = state.objType; if (!st || !type) return;
  const T = TOKEN_TYPES[type];
  if (state.money < T.cost) { say('Nemáš dost peněz', true); return; }
  send({ t: 'buildObject', type: type, c: st.c, r: st.r });
  setTool(null);
}
function clearMyRoads() {
  if (!confirm('Zbourat všechny moje silnice a koleje?')) return;
  send({ t: 'clearMine' }); state.pick = null; dirty = true;
}

// ---------- nástroje ----------
function setTool(t) {
  if (t === 'back') t = state.lastKind || 'road';
  if (t === 'object') t = null;
  state.tool = t; state.bulldoze = t === 'bulldoze';
  if (t === 'road' || t === 'rail') { state.kind = t; state.lastKind = t; }
  state.pick = null; state.hoverConn = null;
  if (t !== 'object') { state.buildMode = false; state.sites = []; state.objSite = null; }
  if (!t) { state.sel = null; unlockCell(state.me); }
  if (t && SH.view) resetSheet();
  if (t && state.sel && tokenAt(state.map, state.sel)) { state.sel = null; unlockCell(state.me); }
  updateToolbar(); updateStatus(); dirty = true;
}

// ---------- kamera ----------
function fitCamera() {
  updateView();
  const pad = A * 0.3;
  const x0 = -AP - pad, x1 = (CFG.COLS - 1) * A + AP + pad;
  const y0 = -AP - pad, y1 = (CFG.ROWS - 1) * A + AP + pad;
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) {
    const q = projDelta(x - (x0 + x1) / 2, y - (y0 + y1) / 2);
    u0 = Math.min(u0, q.x); u1 = Math.max(u1, q.x); v0 = Math.min(v0, q.y); v1 = Math.max(v1, q.y);
  }
  const reserve = W > 700 ? 240 : 0;
  const lift = VIEW.lift * CFG.S;
  const z = Math.min((W - reserve) / (u1 - u0), (H - 50) / (v1 - v0 + lift));
  state.cam.zoom = z;
  const d = unprojDelta(reserve / 2 / z, lift / 2);
  state.cam.x = (x0 + x1) / 2 - d.x;
  state.cam.y = (y0 + y1) / 2 - d.y;
  dirty = true;
}
function anchorY() { return (W <= 820 && SH.view) ? H * 0.27 : H / 2; }
function focusWorld(x, y, zoom) { state.follow = null; state.glide = { x, y, z: zoom || state.cam.zoom }; }
function camTarget(x, y, z) {                 // střed kamery tak, aby bod (x,y) ležel v odkrytém místě obrazovky
  const d = unprojDelta(0, (H / 2 - anchorY()) / z);
  return { x: x + d.x, y: y + d.y };
}
function unitWorldPos(u) {
  if (u.hidden) { const tk = curToken(u) || destToken(u); return tk ? tokenCenter(tk) : null; }
  if (u.kind === 'road' || u.kind === 'ship') return u.x === undefined ? null : { x: u.x, y: u.y };
  const ps = u.poses; return ps && ps.length ? { x: ps[0].x, y: ps[0].y } : null;
}
function stepCamera(dtReal) {
  const k = 1 - Math.pow(0.0005, dtReal);
  let tgt = null;
  if (state.follow != null) {
    const u = state.sim.units.find(x => x.id === state.follow);
    if (!u) state.follow = null;
    else { const p = unitWorldPos(u); if (p) { const z = state.followZ; tgt = Object.assign(camTarget(p.x, p.y, z), { z }); } }
  } else if (state.glide) {
    const g = state.glide; tgt = Object.assign(camTarget(g.x, g.y, g.z), { z: g.z });
  }
  if (!tgt) return;
  const z0 = state.cam.zoom;
  state.cam.zoom += (tgt.z - state.cam.zoom) * k;
  state.cam.x += (tgt.x - state.cam.x) * k; state.cam.y += (tgt.y - state.cam.y) * k;
  if (state.glide && state.follow == null && Math.hypot(tgt.x - state.cam.x, tgt.y - state.cam.y) < 2 && Math.abs(tgt.z - z0) < 0.01) state.glide = null;
  dirty = true;
}
function unitAtScreen(sx, sy) {
  let best = null, bd = Math.max(20, 0.5 * CFG.S * state.cam.zoom);
  for (const u of state.sim.units) {
    if (!u.owner || u.hidden || u.pid !== state.me) continue;
    const pts = (u.kind === 'road' || u.kind === 'ship') ? (u.x !== undefined ? [{ x: u.x, y: u.y }] : []) : (u.poses || []);
    for (const p of pts) { const q = w2s(p.x, p.y, true), d = Math.hypot(q.x - sx, q.y - (sy + 6)); if (d < bd) { bd = d; best = u; } }
  }
  return best;
}
function focusCity() {
  const hm = state.company && state.company.home ? tokenById(state.company.home) : null;
  const c = hm || state.map.tokens[0] || { c: 21, r: 21 };
  state.cam.x = c.c * A + 2.5 * A; state.cam.y = c.r * A + 0.5 * A; state.cam.zoom = Math.max(0.5, Math.min(0.9, (W - (W > 820 ? 400 : 0)) / (11 * A)));
  dirty = true;
}
function zoomAt(sx, sy, factor) {
  const before = s2w(sx, sy, false);
  state.cam.zoom = Math.max(0.12, Math.min(8, state.cam.zoom * factor));
  const after = s2w(sx, sy, false);
  state.cam.x += before.x - after.x;
  state.cam.y += before.y - after.y;
  dirty = true;
}
function panBy(dxPx, dyPx, base) {         // posun kamery o tah prstem / myší v pixelech obrazovky
  const d = unprojDelta(dxPx / state.cam.zoom, dyPx / state.cam.zoom);
  state.cam.x = base.x - d.x;
  state.cam.y = base.y - d.y;
}
function setView(v) {
  state.view = v;
  const c = s2w(W / 2, H / 2, false);        // střed obrazovky zůstane na místě
  updateView();
  document.querySelectorAll('.view').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  const q = s2w(W / 2, H / 2, false);
  state.cam.x += c.x - q.x; state.cam.y += c.y - q.y;
  save(); dirty = true;
}
function rotateView(dir) {
  const c = s2w(W / 2, H / 2, false);
  state.viewStep = ((state.viewStep + dir) % 8 + 8) % 8;
  updateView();
  const q = s2w(W / 2, H / 2, false);
  state.cam.x += c.x - q.x; state.cam.y += c.y - q.y;
  save(); dirty = true;
}

// ---------- logika stavby ----------
// Úroveň, na které se vybrané pole kreslí: pevnina a mosty ve výšce, hladina dole.
function selLifted() {
  const sel = state.sel;
  if (!sel) return true;
  return isLandCell(state.map, sel) || !!state.net.get(sel);
}

function nearestConnector(sx, sy) {
  if (!state.sel) return null;
  const hr = connectorHitPx(state.cam.zoom), lifted = selLifted();
  let best = null, bd = hr;
  for (const cn of connectorsOf(state.map, state.net, state.sel)) {
    const p = w2s(cn.x, cn.y, lifted);
    const d = Math.hypot(p.x - sx, p.y - sy);
    if (d <= bd) { bd = d; best = cn; }
  }
  return best;
}

// Které pole leží pod ukazatelem (sx, sy v pixelech obrazovky).
function pickCell(sx, sy) {
  let w = s2w(sx, sy, true);
  let cell = hitTest(w.x, w.y);
  if (cell && (isLandCell(state.map, cell) || state.net.get(cell))) return cell;   // vršek pevniny nebo most
  w = s2w(sx, sy, false);
  cell = hitTest(w.x, w.y);
  if (cell && !isLandCell(state.map, cell)) return cell;                            // hladina
  return null;
}

function selectCell(cell, opt) {
  state.pick = null; state.hoverConn = null;
  let ok = true;
  if (cell && state.tool && state.tool !== 'object') {
    const lk = lockedBy(cell, state.me);
    if (lk) { say(`Pole právě upravuje ${playerName(lk)} – zkus to později`, true); cell = null; ok = false; }
  }
  if (!cell) { state.sel = null; unlockCell(state.me); }
  else if (!isLandCell(state.map, cell) && cell.t !== 'o') { state.sel = null; unlockCell(state.me); say('Přes vodu jde postavit jen rovný most přes celý osmiúhelník', true); ok = false; }
  else { state.sel = cell; if (state.tool) lockCell(cell, state.me); else unlockCell(state.me); }
  const tk = state.sel ? tokenAt(state.map, state.sel) : null;
  if (tk && !state.tool) showTokenCard(tk, opt); else if (!tk && SH.view === 'token') hideTokenCard();
  updateStatus(); dirty = true;
  return ok && !!state.sel;
}


function connectorClick(cn, shift) {
  const cell = state.sel;
  const tk = tokenAt(state.map, cell);
  if (tk) { say(cn.own ? 'Přípojku určila hra – navaž na ni silnici nebo kolej z vedlejšího pole' : 'Tady přípojka není a hráč ji přidat nemůže (přibyde při povýšení)', !cn.own); return; }
  if (state.tool === 'bulldoze' || shift) {
    const before = state.net.get(cell);
    if (before) {
      const isArm = cn.id === CENTER ? (before.road !== 0 && !before.rail.length) : ((before.road >> cn.id) & 1) === 1;
      const bothKinds = cn.id === CENTER && before.road && before.rail.length;
      if (!mayRemove(before, isArm || !!bothKinds, state.me) || (bothKinds && !mayRemove(before, false, state.me))) { say(isArm ? 'Tuhle silnici sdílí i jiný hráč nebo patří jemu – nemůžeš ji zbourat' : 'Tyto koleje patří jinému hráči', true); return; }
    }
    send({ t: 'bulldoze', cell: cell, id: cn.id });
    lockCell(cell, state.me); state.pick = null; updateStatus(); dirty = true;
    return;
  }
  if (state.pick === null) {
    if (cn.id === CENTER && !state.net.mask(cell)) return;
    state.pick = cn.id;
  } else if (state.pick === cn.id) {
    state.pick = null;
  } else {
    const res = checkPair(state.map, state.net, cell, state.kind, state.pick, cn.id);
    if (!res.ok) { if (res.reason) say(res.reason, true); return; }
    const need = recCost(state.map, cell, res.next) - recCost(state.map, cell, state.net.get(cell));
    if (need > state.money) { say('Nemáš dost peněz (potřebuješ ' + fmtMoney(need) + ')', true); return; }
    send({ t: 'build', cell: cell, kind: state.kind, a: state.pick, b: cn.id });
    lockCell(cell, state.me); state.pick = null;
  }
  updateStatus(); dirty = true;
}

function handleClick(e) {
  const r = canvas.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  if (state.tool === 'object') { pickSite(pickCell(sx, sy)); return; }
  if (!state.tool) {
    const u = unitAtScreen(sx, sy);
    if (u) { if (state.sel) selectCell(null); SH.stack = SH.view ? SH.stack : []; openRoot('vehicle', u.id); return; }
  }
  const cn = nearestConnector(sx, sy);
  if (cn) { connectorClick(cn, e.shiftKey); return; }
  const cell = pickCell(sx, sy);
  if (!cell) { if (state.tool) { selectCell(null); } else if (state.sel) selectCell(null); else if (SH.view && SH.view !== 'token') closeSheet(); return; }
  if (cell && sameCell(cell, state.sel)) selectCell(null);
  else { if (!state.tool && SH.view && SH.view !== 'token') SH.stack = []; if (!state.tool && SH.view && SH.view !== 'token') { SH.view = null; } selectCell(cell); }
}


function setKind(kind) { setTool(kind); }
function toggleTrain() {}
function setBulldoze(on) { if (on) setTool('bulldoze'); else if (state.tool === 'bulldoze') setTool(state.lastKind || 'road'); }
function setBuildMode(on) { if (!on) setTool(null); }

// ---------- vstup ----------
canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    gesture = {
      kind: 'one', sx: e.clientX, sy: e.clientY, cx: state.cam.x, cy: state.cam.y,
      button: e.button, moved: false,
      pan: e.button === 1 || e.button === 2 || spaceDown
    };
    if (gesture.pan) canvas.classList.add('panning');
  } else if (pointers.size === 2) {
    const [p, q] = [...pointers.values()];
    state.follow = null; state.glide = null;
    gesture = { kind: 'pinch', dist: Math.hypot(p.x - q.x, p.y - q.y), mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 };
  }
});

canvas.addEventListener('pointermove', e => {
  const rect = canvas.getBoundingClientRect();
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (gesture && gesture.kind === 'pinch' && pointers.size >= 2) {
    const [p, q] = [...pointers.values()];
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    const dd = unprojDelta((mx - gesture.mx) / state.cam.zoom, (my - gesture.my) / state.cam.zoom);
    state.cam.x -= dd.x; state.cam.y -= dd.y;
    if (gesture.dist > 0) zoomAt(mx - rect.left, my - rect.top, d / gesture.dist);
    gesture.dist = d; gesture.mx = mx; gesture.my = my;
    dirty = true;
    return;
  }

  if (gesture && gesture.kind === 'one' && pointers.size === 1) {
    const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy;
    if (!gesture.moved && Math.hypot(dx, dy) > 6) { gesture.moved = true; state.follow = null; state.glide = null; if (SH.view === 'vehicle') SH.last = ''; }
    if (gesture.pan || gesture.moved) {
      panBy(dx, dy, { x: gesture.cx, y: gesture.cy });
      canvas.classList.add('panning');
      dirty = true;
      return;
    }
  }

  // najetí myší nad konektor
  const cn = nearestConnector(e.clientX - rect.left, e.clientY - rect.top);
  const id = cn ? cn.id : null;
  if (id !== state.hoverConn) { state.hoverConn = id; dirty = true; }
});

function endPointer(e) {
  const g = gesture;
  pointers.delete(e.pointerId);
  if (g && g.kind === 'one' && !g.moved && !g.pan && g.button === 0 && e.type === 'pointerup') handleClick(e);
  if (pointers.size === 0) { gesture = null; canvas.classList.remove('panning'); }
  else if (pointers.size === 1) {
    const p = [...pointers.values()][0];
    gesture = { kind: 'one', sx: p.x, sy: p.y, cx: state.cam.x, cy: state.cam.y, button: 0, moved: true, pan: true };
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
}, { passive: false });

window.addEventListener('keydown', e => {
  if (e.code === 'Space') { if (!/INPUT|SELECT|TEXTAREA/.test((e.target.tagName || ''))) { spaceDown = true; e.preventDefault(); } return; }
  if (/INPUT|SELECT|TEXTAREA/.test((e.target.tagName || ''))) return;
  if ($('found') && !$('found').classList.contains('hidden')) return;
  switch (e.key) {
    case 'Escape':
      if (state.tool === 'object' && state.objSite) { state.objSite = null; unlockCell(state.me); renderCellbar(); }
      else if (state.tool) setTool(null);
      else if (state.sel) selectCell(null);
      else closeSheet();
      updateStatus(); dirty = true; break;
    case 'Delete': case 'Backspace': clearSelectedCell(); break;
    case 'x': case 'X': setTool(state.tool === 'bulldoze' ? (state.lastKind || 'road') : 'bulldoze'); break;
    case 'b': case 'B': toggleRoot('objects'); break;
    case 'c': case 'C': toggleRoot('company'); break;
    case 'v': case 'V': setView({ top: 'tilt', tilt: 'top' }[state.view]); break;
    case 'q': case 'Q': rotateView(-1); break;
    case 'e': case 'E': rotateView(1); break;
    case '1': setTool(state.tool === 'road' ? null : 'road'); break;
    case '2': setTool(state.tool === 'rail' ? null : 'rail'); break;
  }
});
window.addEventListener('keyup', e => { if (e.code === 'Space') spaceDown = false; });

function clearSelectedCell() {
  if (!state.sel || tokenAt(state.map, state.sel)) return;
  const before = state.net.get(state.sel);
  if (before && !(mayRemove(before, before.road !== 0, state.me) && mayRemove(before, false, state.me))) { say('Pole patří (i) jinému hráči – nelze smazat', true); return; }
  send({ t: 'clearCell', cell: state.sel }); state.pick = null; updateStatus(); dirty = true;
}

document.getElementById('rotL').addEventListener('click', () => rotateView(-1));
document.getElementById('rotR').addEventListener('click', () => rotateView(1));
document.getElementById('zoomIn').addEventListener('click', () => zoomAt(W / 2, H / 2, 1.25));
document.getElementById('zoomOut').addEventListener('click', () => zoomAt(W / 2, H / 2, 1 / 1.25));
document.getElementById('zoomFit').addEventListener('click', () => { state.follow = null; if (state.cam.zoom > 0.45) fitCamera(); else focusCity(); });

// ---------- smyčka ----------
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 3);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  dirty = true;
}
window.addEventListener('resize', resize);

let lastT = performance.now();
function frame(now) {
  const dtReal = Math.min(0.1, Math.max(0, (now - lastT) / 1000)); lastT = now;
  if (state.map) {
    if (typeof netFrame === 'function') netFrame(now, dtReal);
    stepCamera(dtReal);
    updateHud();
    updateView();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d2236';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawWorld(ctx, state);
  }
  requestAnimationFrame(frame);
}

// ---------- start ----------
resize();
state.sim = newClientSim();
loadPrefs();
updateView();
initPanels();
var initUIDone = true;
requestAnimationFrame(frame);
