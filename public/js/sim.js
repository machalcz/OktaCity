// Simulace dopravy: okolní auta (stafáž), nasazená vozidla hráče, vlaky, přejezdy se závorami.
//
// Města a průmysl jsou tokeny (tokens.js). Vozidlo vyjede z okraje tokenu, dojede k okraji cílového tokenu,
// uvnitř "zmizí" (nakládka / vykládka, časový limit) a pak zase vyjede. Tím odpadá otáčení na silnici.
// Kapacita: město neomezená, průmysl 2 vozidla na každou připojenou silnici a 2 vlaky na každou kolej.
// Když je token plný, vozidlo čeká před ním (na okraji).
//
// Vozidla jezdí po drahách (lomených čarách) spočítaných z grafu silnic / kolejí.
// Auta jezdí vpravo (posun dráhy o LANE). Vlak jezdí po ose koleje.
// Přejezd: závory se zavřou, když je čelo vlaku 2 pole (2·A) před přejezdem, a otevřou, až je konec vlaku 2 pole za ním.

const LANE = 0.1 * CFG.S;
const TWO_TILES = 2 * A;
const ACC_ROAD = 2.8, BRK = 7.0, ACC_TRAIN = 1.5, BRK_TRAIN = 2.4;   // v násobcích S/s²
const AMB_COLORS = ['#f2f2ee', '#c3c8cf', '#2c3036', '#3f6fb3', '#3f8f5b', '#c9a43a', '#8e3b3b', '#7d8590', '#5aa0b8', '#b87333'];
const GAP_TRAIN = 0.04;
const TRIM = 0.45 * CFG.S;        // dráha silničního vozidla začíná / končí takto daleko od středu tokenu
const FADE = 0.5 * CFG.S;         // na tak dlouhém úseku se vozidlo objevuje / mizí
const RIM = 0.9 * CFG.S;          // vlak je vidět jen mezi okraji obou tokenů

function newSim() {
  return {
    units: [], cross: {}, crossList: [], floaters: [],
    gRoad: null, gRail: null, amb: { nodes: [], cum: [], sum: 0, target: 0 },
    spawnT: 0, netVer: -1, t: 0
  };
}

function normAng(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function trainLength(items) {
  let L = 0;
  items.forEach((it, i) => { L += modelFor(it).len * CFG.VSCALE * CFG.S + (i ? GAP_TRAIN * CFG.S : 0); });
  return L;
}
function unitPath(u) { return u.paths[u.idx]; }
function unitCross(u) { return u.crossings[u.idx]; }
function unitWagons(u) { return u.kind === 'rail' ? Math.max(1, u.items.filter(k => ECON.ITEMS[k].wagon).length) : u.kind === 'ship' ? Math.max(1, (u.goodsList || []).length) : 1; }
function dwellTimeFor(u, tk) { return tokenDwell(tk) * unitWagons(u); }
function canEnter(u, tk) { return isCity(tk) || !tk.owner || tk.owner === u.pid || !tk.access.closed; }
function curToken(u) { return tokenById(u.at === 'A' ? u.A : u.B); }
function destToken(u) { return tokenById(u.at === 'A' ? u.B : u.A); }
function tokenHasPort(id, kind) { const t = tokenById(id); if (kind === 'ship') return isPort(t); return !!t && (kind === 'road' ? t.road : t.rail).length > 0; }

// Ořízne lomenou čáru: odebere délku a od začátku a b od konce.
function trimPoly(pts, a, b) {
  const total = polyLength(pts), from = a, to = total - b, out = [];
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1], seg = Math.hypot(q.x - p.x, q.y - p.y);
    if (seg < 1e-9) continue;
    const s0 = acc, s1 = acc + seg;
    if (s1 > from && s0 < to) {
      const f0 = Math.max(0, (from - s0) / seg), f1 = Math.min(1, (to - s0) / seg);
      if (!out.length) out.push({ x: p.x + (q.x - p.x) * f0, y: p.y + (q.y - p.y) * f0 });
      out.push({ x: p.x + (q.x - p.x) * f1, y: p.y + (q.y - p.y) * f1 });
    }
    acc = s1;
  }
  return out.length >= 2 ? out : pts;
}

// ---------- přestavba po změně sítě ----------
function rebuildSim() {
  const sim = state.sim, S = CFG.S;
  sim.netVer = state.net.ver;
  sim.gRoad = buildGraph(state.net, 'road');
  sim.gRail = buildGraph(state.net, 'rail');
  sim.gShip = buildShipGraph(state.map);
  for (const tk of state.map.tokens) {
    tk.occ = { road: [], rail: [], ship: [] };
    if (!tk.outletT) tk.outletT = { road: 0, rail: 0, ship: 0 };
    if (tk.visits === undefined) tk.visits = 0;
  }

  // přejezdy
  sim.crossList = [];
  const seen = new Set();
  for (const e of state.net.entries()) {
    const rec = e.rec;
    if (!(rec.road && rec.rail.length) || !isLandCell(state.map, e.cell)) continue;
    const key = cellKey(e.cell);
    const roadArm = armsOf(rec.road)[0];
    const th = angleBetween(e.cell, roadArm, rec.rail[0][0]) * Math.PI / 180;
    const off = Math.max(0.55 * S, 0.34 * S / Math.max(0.35, Math.abs(Math.sin(th))) + 0.14 * S);
    sim.crossList.push({ key, cell: e.cell, off });
    seen.add(key);
    if (!sim.cross[key]) sim.cross[key] = { closed: false, eff: false, gate: 0, effT: 0, off };
    sim.cross[key].off = off;
  }
  for (const k of Object.keys(sim.cross)) if (!seen.has(k)) delete sim.cross[k];

  // okolní provoz
  sim.units = sim.units.filter(u => u.owner);
  computeAmbient(sim);

  // vozidla hráče: znovu naplánovat; ztracená přípojka => vozidlo zpět do skladu
  sim.units = sim.units.filter(u => {
    if (!tokenHasPort(u.A, u.kind) || !tokenHasPort(u.B, u.kind)) { returnToInventory(u); return false; }
    return true;
  });
  for (const u of sim.units) {
    if (!u.owner) continue;
    const snap = u.ok && u.routeSig ? snapUnit(u) : null;
    planUnit(u);
    if (snap && u.ok && u.routeSig === snap.sig) restoreUnit(u, snap);
  }
}

function routeSigOf(a, b) {
  const f = p => { const n = p.length, k = Math.max(1, Math.floor(n / 10)); let s = n + ':' + Math.round(polyLength(p)); for (let i = 0; i < n; i += k) s += ',' + Math.round(p[i].x) + '/' + Math.round(p[i].y); return s; };
  return f(a) + '|' + f(b);
}
const KEEP_FIELDS = ['idx', 'dir', 's', 'v', 'state', 'at', 'did', 'loaded', 'reserved', 'fade', 'crashT', 'lastCell', 'bx', 'by', 'ba', 'stuck', 'freeT', 't', 'dwellT', 'waited', 'hidden', 'x', 'y', 'ang', 'status', 'waitCross', 'delay'];
function snapUnit(u) { const o = { sig: u.routeSig }; for (const k of KEEP_FIELDS) o[k] = u[k]; return o; }
function restoreUnit(u, o) {
  for (const k of KEEP_FIELDS) u[k] = o[k];
  const cur = curToken(u), dst = destToken(u);
  if ((u.state === 'dwell' || u.state === 'ready') && cur) occEnter(cur, u.kind, u);
  if (u.reserved && dst) occEnter(dst, u.kind, u);
}

function returnToInventory(u) {
  const P = state.players && state.players[u.pid]; if (!P) return;
  if (u.kind === 'road' || u.kind === 'ship') P.inv[u.model] = (P.inv[u.model] || 0) + 1;
  else for (const it of u.items) P.inv[it] = (P.inv[it] || 0) + 1;
}

// Políčka, kterými trať prochází (bez polí s tokeny) – pro hlídání jednokolejné trati.
function routeCellSet(pts) {
  const set = new Set(), rp = resamplePoly(pts, 0.4 * CFG.S);
  for (const p of rp) {
    const c = hitTest(p.x, p.y);
    if (c && c.t === 'o' && !tokenAt(state.map, c)) set.add(cellKey(c));
  }
  return set;
}
function routeCellList(pts) {
  const out = [], seen = new Set(), rp = resamplePoly(pts, 0.4 * CFG.S);
  for (const p of rp) { const c = hitTest(p.x, p.y); if (c && !seen.has(cellKey(c))) { seen.add(cellKey(c)); out.push(c); } }
  return out;
}
function railConflict(u, sim) {
  for (const v of sim.units) {
    if (v === u || v.kind !== 'rail' || !v.ok || (v.state !== 'run' && v.state !== 'hold') || !v.cells) continue;
    for (const k of u.cells) if (v.cells.has(k)) return true;
  }
  return false;
}

// ---------- plánování tras hráčových vozidel ----------
function planUnit(u) {
  const sim = state.sim, S = CFG.S;
  u.ok = false; u.paths = null; u.hidden = true;
  const g = u.kind === 'road' ? sim.gRoad : u.kind === 'ship' ? sim.gShip : sim.gRail;
  const nA = g.nodes.get('T' + u.A), nB = g.nodes.get('T' + u.B);
  if (!tokenById(u.A) || !tokenById(u.B) || u.A === u.B || !nA || !nB) { u.status = 'Chybí přípojka'; return false; }
  const fw = routeNodes(g, nA, nB), rv = routeNodes(g, nB, nA);
  if (!fw || !rv) { u.status = 'Bez trasy: místa nejsou propojená'; return false; }
  if (u.kind === 'rail') {
    for (const c of routeCellList(fw)) { const rec = state.net.get(c); if (rec && rec.rail.length && ownRail(rec) && ownRail(rec) !== u.pid) { u.status = 'Koleje patří jinému hráči – po cizí trati jezdit nelze'; return false; } }
  }
  if (!canEnter(u, tokenById(u.A)) || !canEnter(u, tokenById(u.B))) { u.status = 'Vjezd do podniku je zakázán'; return false; }
  const gd = u.goods && GOODS[u.goods];
  if (!gd) { u.status = 'Není vybráno zboží'; return false; }
  const ta = tokenById(u.A), tb = tokenById(u.B);
  if (u.kind === 'ship') {
    if (!isPort(ta) || !isPort(tb)) { u.status = 'Lodě jezdí jen mezi přístavy'; return false; }
    for (const gg of (u.goodsList || [])) { if (!tokenAccepts(tb).includes(gg)) { u.status = 'Cíl toto zboží nepřijímá'; return false; } }
  } else {
    if (!tokenOutputs(ta).includes(u.goods)) { u.status = 'Z tohoto místa se zboží nevyváží'; return false; }
    if (!tokenAccepts(tb).includes(u.goods)) { u.status = 'Cíl toto zboží nepřijímá'; return false; }
  }
  u.routeCells = Math.max(1, polyLength(fw) / A);
  u.routeSig = routeSigOf(fw, rv);

  if (u.kind === 'ship') {
    const mk = pts => { let rp = resamplePoly(trimPoly(pts, SHIP_TRIM, SHIP_TRIM), PATHN); rp = smoothPts(rp, 3, 4); return makePath(rp); };
    u.paths = [mk(fw), mk(rv)]; u.crossings = [[], []]; u.s0 = 0; u.lat = 0;
  } else if (u.kind === 'road') {
    const mk = pts => {
      let rp = resamplePoly(trimPoly(pts, TRIM, TRIM), PATHN);
      rp = smoothPts(rp, 3, 3);
      return makePath(offsetRight(rp, LANE));
    };
    u.paths = [mk(fw), mk(rv)];
    u.crossings = u.paths.map(p => pathCrossings(p, sim.crossList, 0.55 * S));
    u.s0 = 0;
  } else {
    const Lt = trainLength(u.items), ext = Lt + 2 * S;
    let pts = extendPoly(fw, ext, ext);
    pts = resamplePoly(pts, PATHN);
    pts = smoothPts(pts, 2, 2);
    const pf = makePath(pts), pr = makePath(pts.slice().reverse());
    u.Lt = Lt;
    u.paths = [pf, pr];
    u.crossings = u.paths.map(p => pathCrossings(p, sim.crossList, 0.3 * S));
    u.sA = ext; u.sB = pf.len - ext;
    u.s0 = u.sA; u.send = u.sB - RIM + Lt;
    u.cells = routeCellSet(fw);
  }
  u.ok = true;
  u.idx = 0; u.dir = 1; u.s = u.s0; u.v = 0;
  u.state = 'wait'; u.at = 'A'; u.did = false; u.loaded = (u.amt || 0) > 0; u.reserved = false; u.fade = 1; u.crashT = 0; u.lastCell = null;
  u.bx = u.by = u.ba = 0; u.stuck = 0; u.freeT = 0;
  u.status = 'Čeká na volné stání';
  return true;
}

function createUnit(spec) {
  const it = ECON.ITEMS;
  const u = {
    id: ++state.nextId, owner: true, pid: spec.pid || 1, kind: spec.kind, model: spec.model, items: spec.items || [spec.model],
    A: spec.A, B: spec.B, goods: spec.goods || null, amt: spec.amt || 0, age: spec.age || 0, earned: 0, trips: 0, fees: 0, tolls: 0,
    speed: 0, cap: 0, ok: false, status: '', delay: spec.delay || 0, hidden: true, crashT: 0
  };
  if (spec.kind === 'road') { u.speed = it[spec.model].speed; u.cap = it[spec.model].cap; }
  else if (spec.kind === 'ship') {
    const I = it[spec.model]; u.goodsList = (spec.goodsList || []).slice(0, I.holds);
    u.holds = u.goodsList.map(g => ({ g, amt: 0, cap: I.holdCap })); u.goods = u.goodsList[0] || null; u.speed = I.speed; u.cap = u.holds.length * I.holdCap; u.items = [spec.model];
  }
  else {
    u.speed = it[spec.items[0]].speed;
    const cls = spec.goods && GOODS[spec.goods] ? GOODS[spec.goods].cls : null;
    u.cap = spec.items.reduce((s, k) => s + (it[k].wagon && (!cls || it[k].cargo === cls) ? it[k].cap : 0), 0);
  }
  u.price = unitPrice(u);
  return u;
}

// ---------- okolní provoz ----------
function computeAmbient(sim) {
  const am = sim.amb;
  am.nodes = []; am.cum = []; am.sum = 0;
  for (const tk of state.map.tokens) {
    const n = sim.gRoad.nodes.get('T' + tk.id);
    if (!n) continue;
    const w = tk.type === 'city' ? Math.pow(tk.level, 1.4) : 0.5;      // u velkých měst hustší provoz
    am.nodes.push({ n, w, tk });
    am.sum += w; am.cum.push(am.sum);
  }
  am.target = am.nodes.length >= 2 ? Math.min(14, Math.round(am.sum * 0.8)) : 0;
}
function pickWeighted(am) {
  const r = Math.random() * am.sum;
  let lo = 0, hi = am.cum.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (am.cum[mid] >= r) hi = mid; else lo = mid + 1; }
  return am.nodes[lo].n;
}

function ambientRoute(u, startNode) {
  const sim = state.sim, am = sim.amb;
  for (let tries = 0; tries < 5; tries++) {
    const dest = pickWeighted(am);
    if (dest === startNode) continue;
    const pts = routeNodes(sim.gRoad, startNode, dest);
    if (!pts || pts.length < 2) continue;
    let rp = resamplePoly(trimPoly(pts, TRIM, TRIM), PATHN);
    rp = smoothPts(rp, 3, 3);
    const path = makePath(offsetRight(rp, LANE));
    if (path.len < 1.2 * CFG.S) continue;
    u.paths = [path]; u.idx = 0; u.s = 0;
    u.crossings = [pathCrossings(path, sim.crossList, 0.55 * CFG.S)];
    return true;
  }
  return false;
}

function spawnAmbient(sim) {
  const am = sim.amb;
  if (am.nodes.length < 2) return false;
  const start = pickWeighted(am);
  const u = {
    owner: false, kind: 'road', model: 'car', color: AMB_COLORS[Math.floor(Math.random() * AMB_COLORS.length)],
    speed: 2.0 + Math.random() * 0.7, v: 0, fade: 0, dir: 1, idx: 0, s: 0, bx: 0, by: 0, ba: 0, stuck: 0, freeT: 0, ok: true
  };
  if (!ambientRoute(u, start)) return false;
  const p0 = unitPath(u).pts[0];
  for (const w of sim.units) if (w.kind === 'road' && w.x !== undefined && !w.hidden && Math.hypot(w.x - p0.x, w.y - p0.y) < 1.1 * CFG.S) return false;
  applyPose(u, unitPath(u), 0);
  sim.units.push(u);
  return true;
}

// ---------- pohyb ----------
function applyPose(u, path, s) {
  const p = path.pose(s, 0.2 * CFG.S);
  u.x = p.x + (u.bx || 0); u.y = p.y + (u.by || 0); u.ang = p.ang + (u.ba || 0);
}
function decayBlend(u, dt) {
  if (!u.bx && !u.by && !u.ba) return;
  const k = Math.exp(-dt * 3.2);
  u.bx *= k; u.by *= k; u.ba *= k;
  if (Math.abs(u.bx) + Math.abs(u.by) < 0.01 * CFG.S && Math.abs(u.ba) < 0.01) u.bx = u.by = u.ba = 0;
}

// Cílová rychlost silničního vozidla: omezení zatáčkou, závorou a vozidlem vpředu.
function roadTargetSpeed(u, vmax) {
  const S = CFG.S, sim = state.sim, path = unitPath(u);
  const hl = modelFor(u.model).len * CFG.VSCALE * S / 2;
  let vt = vmax;
  u.waitCross = false;
  if (u.guardUntil > sim.t) return 0;                  // stráž proti překryvu (traffic.js): vozidlo vzadu chvíli stojí

  const a0 = path.pose(u.s, 0.2 * S).ang, a1 = path.pose(Math.min(path.len, u.s + 0.9 * S), 0.2 * S).ang;
  vt *= 1 / (1 + 1.1 * Math.abs(normAng(a1 - a0)));

  for (const c of unitCross(u)) {
    const cs = sim.cross[c.key];
    if (!cs) continue;
    const gap = c.s - cs.off - 0.32 * S - hl - u.s;
    if (!cs.eff) {
      // závory ještě nejsou dole, ale vlak už jede: vjet smí jen vozidlo, které přejezd stihne opustit
      if (gap < -0.25 * S || cs.eta === Infinity) continue;
      const clear = (c.s + 0.5 * S + hl - u.s) / Math.max(u.v, 0.9 * S);
      if (cs.eta > clear * 1.15 + 0.5) continue;
    } else if (gap < -0.25 * S) continue;
    vt = Math.min(vt, Math.sqrt(2 * BRK * S * Math.max(0, gap)));
    if (gap < 0.9 * S) u.waitCross = true;
  }

  if (u.freeT > 0) return vt;
  const cos = Math.cos(u.ang), sin = Math.sin(u.ang);
  if (u.mergeZ && u.s < u.mergeZ.s0 + 0.15 * S) {                  // zařazení do dálnice: přednost má provoz na dálnici
    const z = u.mergeZ; let blocked = false;
    for (const w of sim.units) {
      if (w === u || w.kind !== 'road' || w.x === undefined || w.hidden || w.mergeZ) continue;
      const lat = Math.abs((w.x - z.p.x) * -z.d.y + (w.y - z.p.y) * z.d.x);
      if (lat > 0.24 * S) continue;                                // jede v jiném pruhu
      const fw = (w.x - u.x) * z.d.x + (w.y - u.y) * z.d.y;
      if (fw > -1.7 * S && fw < 1.3 * S) { blocked = true; break; }
    }
    if (blocked) { vt = Math.min(vt, Math.sqrt(2 * BRK * S * Math.max(0, z.s0 - hl - u.s))); u.waitCross = true; }   // počká na začátku zaústění
  }
  for (const w of sim.units) {
    if (w === u || w.kind !== 'road' || w.x === undefined || w.hidden) continue;
    const dx = w.x - u.x, dy = w.y - u.y;
    const fwd = dx * cos + dy * sin;
    if (fwd <= 0 || fwd > 3.4 * S) continue;
    if (Math.abs(-dx * sin + dy * cos) > (u.latLimit || 0.3) * S) continue;     // na dálnici (u.latLimit) jsou pruhy blíž u sebe
    if (Math.abs(normAng(w.ang - u.ang)) > 1.1) continue;
    const gap = fwd - hl - modelFor(w.model).len * CFG.VSCALE * S / 2 - 0.16 * S;
    vt = Math.min(vt, Math.sqrt(2 * BRK * S * Math.max(0, gap)));
  }
  return vt;
}

// floor – nejnižší rychlost při dojezdu (vozidlo, které mizí v tokenu, nebrzdí až do zastavení)
function stepRoadMotion(u, dt, vmax, tgt, floor) {
  const S = CFG.S, path = unitPath(u);
  if (tgt === undefined) tgt = path.len;
  let vt = roadTargetSpeed(u, vmax * S);
  vt = Math.min(vt, Math.sqrt(2 * BRK * S * Math.max(0, tgt - u.s)) + (floor === undefined ? 0.08 * S : floor));
  if (u.v < 0.05 * S && vt < 0.05 * S && !u.waitCross) u.stuck += dt; else u.stuck = 0;
  if (u.stuck > 6) { u.freeT = 2.2; u.stuck = 0; }
  if (u.freeT > 0) u.freeT -= dt;
  u.v += clamp(vt - u.v, -BRK * S * dt, ACC_ROAD * S * dt);
  u.s += u.v * dt;
  decayBlend(u, dt);
  if (u.s >= tgt) u.s = tgt;
  applyPose(u, path, u.s);
  return u.s >= tgt - 0.02 * S;
}

function stepAmbient(u, dt) {
  if (u.dying) { u.v = 0; u.fade -= dt / 0.7; return u.fade > 0; }
  const path = unitPath(u);
  const arrived = stepRoadMotion(u, dt, u.speed, path.len, 0.9 * CFG.S);
  u.fade = clamp(Math.min(u.s / FADE + 0.02, (path.len - u.s) / FADE), 0, 1);
  return !arrived;                                       // v cíli zmizí v tokenu
}

// Vozidlo dojelo do tokenu: zmizí, zaplatí vstupné a odbavuje se (každý vagon zvlášť).
function enterToken(u, dest) {
  u.at = u.at === 'A' ? 'B' : 'A';
  u.state = 'dwell'; u.hidden = true; u.reserved = false; u.v = 0; u.did = false; u.waited = 0;
  u.dwellT = u.t = dest ? dwellTimeFor(u, dest) : 3;
  if (dest && dest.owner && dest.owner !== u.pid && (dest.access.fee || 0) > 0) {
    const fee = dest.access.fee * unitWagons(u);
    transfer(u.pid, dest.owner, fee, 'feeOut', 'feeIn', 'fee'); dest.earnedFees += fee; u.fees += fee;
    const c = tokenCenter(dest);
    floatAt(c.x, c.y + 10, '+' + fmtMoney(fee), '#ffe08a', [dest.owner]);
    floatAt(c.x, c.y + 10, '−' + fmtMoney(fee), '#ff9a9a', [u.pid]);
  }
}

function doLoad(u, tk) {
  if (u.kind === 'ship') return doLoadShip(u, tk);
  const g = u.goods; if (!g) return 0;
  const room = capEff(u) - (u.amt || 0);
  const take = Math.max(0, Math.min(room, tk.stock[g] || 0));
  if (take > 0) { u.amt = (u.amt || 0) + take; tk.stock[g] -= take; addInfl(tk, u.pid, take * GOODS[g].value * INFL_PER_VALUE); }
  u.loaded = u.amt > 0.01;
  return take;
}
function doUnload(u, tk, sim) {
  if (u.kind === 'ship') return doUnloadShip(u, tk, sim);
  const g = u.goods;
  if (!(u.amt > 0.01) || !tokenAccepts(tk).includes(g)) { u.loaded = u.amt > 0.01; return; }
  let free = STOCK_CAP - (tk.stock[g] || 0);
  if (isCity(tk) && g === 'cement') free = 1e9;
  const del = Math.max(0, Math.min(u.amt, free));
  if (del <= 0) return;
  u.amt -= del;
  if (isCity(tk) && g === 'cement') tk.cementIn += del; else tk.stock[g] = (tk.stock[g] || 0) + del;
  const gd = GOODS[g], income = Math.round(del * u.routeCells * ECON.RATE[u.kind] * gd.value);
  addMoney(u.pid, income, 'freight'); u.earned += income; u.trips++;
  addInfl(tk, u.pid, del * gd.value * INFL_PER_VALUE);
  const ta = tokenById(u.A);
  if (ta && ta.owner && ta.owner !== u.pid) { const buy = del * gd.value * SALE_PER_T * 0.5; transfer(u.pid, ta.owner, buy, 'goodsBuy', 'goodsSale', 'goods'); }
  const c = tokenCenter(tk);
  floatAt(c.x, c.y, '+' + fmtMoney(income), '#8cf59a', [u.pid]);
  u.loaded = u.amt > 0.01;
}

function breakVehicle(u, secs, label, costK) {
  u.crashT = secs; u.v = 0; u.status = label;
  addMoney(u.pid, -u.price * costK, 'repair');
  if (u.x !== undefined) floatAt(u.x, u.y, label === 'Nehoda' ? '💥 nehoda' : '🔧 porucha', '#ffb36b', [u.pid]);
  notify(u.pid, `${unitName(u)}: ${label.toLowerCase()} – oprava ${fmtMoney(u.price * costK)}`, true);
}

function tollStep(u) {
  if (u.kind !== 'road' || u.hidden || u.x === undefined) return;
  const c = hitTest(u.x, u.y); if (!c) return;
  const k = cellKey(c); if (k === u.lastCell) return;
  u.lastCell = k;
  const rec = state.net.get(c);
  if (state.map.hwx && hwxBuilt(state.map, c) && !(rec && rec.road)) { u.tolls += HWY_TOLL; addMoney(u.pid, -HWY_TOLL, 'tollOut'); return; }
  if (!rec || !rec.road) return;
  const o = ownRoad(rec); if (!o.length || o.includes(u.pid)) return;
  u.tolls += TOLL;
  for (const p of o) transfer(u.pid, p, TOLL / o.length, 'tollOut', 'tollIn', 'toll');
}

function stepPlayer(u, dt, sim) {
  const S = CFG.S;
  if (!u.ok) return;
  const kind = u.kind;

  // ---- uvnitř tokenu: čekání na stání, nakládka / vykládka, čekání na výjezd ----
  if (u.state === 'wait' || u.state === 'dwell' || u.state === 'ready') {
    u.hidden = true; u.v = 0;
    const tk = curToken(u);
    if (!tk) return;
    if (u.state === 'wait') {
      u.status = 'Čeká na volné stání';
      if (tokenFree(tk, kind)) {
        occEnter(tk, kind, u);
        u.state = 'dwell'; u.dwellT = u.t = dwellTimeFor(u, tk) + (u.delay || 0); u.delay = 0; u.did = false; u.waited = 0;
      }
      return;
    }
    if (u.state === 'dwell') {
      u.t -= dt;
      u.status = u.at === 'A' ? 'Nakládá' : 'Vykládá';
      if (!u.did && u.t < u.dwellT * 0.5) { u.did = true; if (u.at === 'A') doLoad(u, tk); else doUnload(u, tk, sim); }
      if (u.t <= 0) u.state = 'ready';
      return;
    }
    // ready: u A se doplňuje náklad, pak výjezd, jakmile je volný výjezd a (u vlaků) volná trať
    if (u.at === 'A') {
      u.waited += dt;
      doLoad(u, tk);
      if (u.amt < 0.6 * capEff(u) && u.waited < 20) { u.status = 'Čeká na náklad'; return; }
    } else if (unloadable(u, tk) && u.waited < 30) {
      u.waited += dt; doUnload(u, tk, sim); u.status = 'Dovykládá'; return;
    }
    u.status = 'Čeká na výjezd';
    if (sim.t < tk.outletT[kind]) return;
    if (kind === 'rail' && railConflict(u, sim)) { u.status = 'Čeká na volnou trať'; return; }
    u.loaded = u.amt > 0.01;
    u.idx = u.at === 'A' ? 0 : 1;
    u.s = u.s0; u.v = 0; u.reserved = false; u.stuck = 0; u.freeT = 0;
    u.bx = u.by = u.ba = 0; u.lastCell = null;
    occLeave(tk, kind, u); tk.visits++;
    tk.outletT[kind] = sim.t + (kind === 'road' ? 1.3 : 3 + u.Lt / (0.45 * S * u.speed));
    u.state = 'run'; u.hidden = false; u.fade = 0; u.lat = 0;
    if (kind === 'road') applyPose(u, unitPath(u), u.s); else if (kind === 'ship') shipPose(u);
    return;
  }

  // ---- porucha / nehoda ----
  if (u.crashT > 0) {
    u.crashT -= dt; u.v = 0;
    u.status = u.status === 'Nehoda' ? 'Nehoda' : 'Porucha';
    if (u.crashT <= 0) u.status = 'Jede';
    if (kind === 'road') applyPose(u, unitPath(u), u.s);
    return;
  }

  // ---- stárnutí a náhodné události ----
  u.age += dt;
  const old = Math.max(0, (u.age - AGE0) / AGE0);
  if (Math.random() < dt * (0.00003 * (1 + 2 * old))) { breakVehicle(u, 18 + Math.random() * 10, 'Porucha', 0.04); return; }
  if (old > 0 && Math.random() < dt * 0.00006 * old) {
    u.dead = true; u.hidden = true;
    const dd = destToken(u); if (dd) occLeave(dd, kind, u);
    if (u.x !== undefined) floatAt(u.x, u.y, '💥 zničeno', '#ff8a6b', [u.pid]);
    notify(u.pid, `${unitName(u)} se na stará kolena porouchal a vybouchl`, true);
    return;
  }
  const eff = ageEff(u);

  // ---- jízda ----
  const dest = destToken(u);
  if (kind === 'road') {
    const path = unitPath(u), hl = modelFor(u.model).len * CFG.VSCALE * S / 2;
    const holdS = path.len - 0.6 * S - hl;               // zastavení před plným tokenem
    if (!u.reserved && dest && u.s >= holdS - 0.35 * S && tokenFree(dest, 'road') && canEnter(u, dest)) { occEnter(dest, 'road', u); u.reserved = true; }
    const tgt = (u.reserved || !dest) ? path.len : holdS;
    const arrived = stepRoadMotion(u, dt, u.speed * eff, tgt, u.reserved ? 0.9 * S : undefined);
    u.fade = clamp(Math.min(u.s / FADE + 0.02, (path.len - u.s) / FADE), 0, 1);
    const holding = !u.reserved && u.v < 0.05 * S && u.s >= holdS - 0.15 * S;
    u.state = holding ? 'hold' : 'run';
    u.status = holding ? (dest && !canEnter(u, dest) ? 'Vjezd zakázán majitelem' : 'Čeká před plným místem') : u.waitCross ? 'Čeká na přejezd' : (u.v < 0.05 * S ? 'Stojí v koloně' : 'Jede');
    tollStep(u);
    if (arrived && u.reserved) enterToken(u, dest);
  } else if (kind === 'ship') {
    const path = unitPath(u), hl = modelFor(u.model).len * CFG.VSCALE * S / 2;
    const holdS = path.len - 0.5 * S - hl;
    if (!u.reserved && dest && u.s >= holdS - 0.4 * S && tokenFree(dest, 'ship') && canEnter(u, dest)) { occEnter(dest, 'ship', u); u.reserved = true; }
    const tgt = (u.reserved || !dest) ? path.len : holdS;
    const arrived = stepShipMotion(u, dt, u.speed * eff, tgt);
    u.fade = clamp(Math.min(u.s / FADE + 0.02, (path.len - u.s) / FADE), 0, 1);
    const holding = !u.reserved && u.v < 0.05 * S && u.s >= holdS - 0.15 * S;
    u.state = holding ? 'hold' : 'run';
    u.status = holding ? 'Čeká před plným přístavem' : u.waitShip ? 'Dává přednost jiné lodi' : (u.v < 0.05 * S ? 'Stojí' : 'Pluje');
    if (arrived && u.reserved) enterToken(u, dest);
  } else {
    const l0 = modelFor(u.items[0]).len * CFG.VSCALE * S;
    const hs = u.sB - RIM - 0.6 * S + l0 / 2;            // poloha čela před plným nádražím
    if (!u.reserved && dest && u.s >= hs - 0.4 * S && tokenFree(dest, 'rail') && canEnter(u, dest)) { occEnter(dest, 'rail', u); u.reserved = true; }
    const tgt = (u.reserved || !dest) ? u.send : hs;
    const vt = Math.min(u.speed * eff * S, Math.sqrt(2 * BRK_TRAIN * S * Math.max(0, tgt - u.s)) + (u.reserved ? 0.9 * S : 0.1 * S));
    u.v += clamp(vt - u.v, -BRK_TRAIN * S * dt, ACC_TRAIN * S * dt);
    u.s = Math.min(tgt, u.s + u.v * dt);
    const holding = !u.reserved && u.v < 0.05 * S && u.s >= hs - 0.15 * S;
    u.state = holding ? 'hold' : 'run';
    u.status = holding ? (dest && !canEnter(u, dest) ? 'Vjezd zakázán majitelem' : 'Čeká před plným místem') : 'Jede';
    if (u.reserved && u.s >= u.send - 0.02 * S) enterToken(u, dest);
  }
}

// Pozice všech kusů vlaku (lokomotiva první); kusy uvnitř tokenů se nekreslí.
function trainPoses(u) {
  if (!u.ok || !u.paths || u.hidden) return [];
  const S = CFG.S, path = unitPath(u), out = [];
  let off = 0;
  for (let ii = 0; ii < u.items.length; ii++) {
    const item = u.items[ii];
    const l = modelFor(item).len * CFG.VSCALE * S;
    const sc = u.s - off - l / 2;
    off += l + GAP_TRAIN * S;
    if (sc < u.sA + RIM || sc > u.sB - RIM) continue;
    const p = path.pose(sc, 0.25 * S);
    out.push({ x: p.x, y: p.y, ang: p.ang, item, i: ii });
  }
  return out;
}

// ---------- přejezdy ----------
function updateCrossings(dt) {
  const sim = state.sim;
  for (const k in sim.cross) { sim.cross[k].closed = false; sim.cross[k].eta = Infinity; }
  for (const u of sim.units) {
    if (u.kind !== 'rail' || !u.ok) continue;
    const head = u.s, tail = u.s - u.Lt;
    for (const c of unitCross(u)) {
      const cs = sim.cross[c.key];
      if (!cs) continue;
      const running = u.state === 'run' || u.state === 'hold';
      const near = running && head >= c.s - TWO_TILES && tail <= c.s + TWO_TILES;
      const covers = running && tail <= c.s && head >= c.s;
      if (near || covers) cs.closed = true;
      if (running && tail <= c.s + 0.5 * CFG.S && head >= c.s - 0.5 * CFG.S) cs.eta = 0;                   // vlak je na přejezdu
      else if (head < c.s && running) cs.eta = Math.min(cs.eta, (c.s - head) / Math.max(u.v, 0.6 * u.speed * CFG.S));
      else if (head < c.s) cs.eta = Math.min(cs.eta, (u.state === 'dwell' ? Math.max(0, u.t) : 0) + 1.5 + (c.s - head) / (0.6 * u.speed * CFG.S));
    }
  }
  for (const k in sim.cross) {
    const cs = sim.cross[k];
    cs.eff = cs.closed || state.trainOn;                 // semafory blikají a auta zastavují hned
    cs.effT = cs.eff ? (cs.effT || 0) + dt : 0;
    const want = cs.eff && cs.effT > 0.3 ? 1 : 0;        // závory sjíždějí s malým zpožděním (auta stihnou ujet)
    cs.gate += (want - cs.gate) * Math.min(1, dt * (want ? 4.5 : 3.2));
    if (Math.abs(cs.gate - want) < 0.003) cs.gate = want;
  }
}

// ---------- hlavní krok ----------
function simStep(dt) {
  const sim = state.sim;
  if (typeof hwxApplyTime === 'function' && state.map && state.map.hwx && hwxApplyTime(state.map, Math.floor(sim.t / 20) * 20)) state.net.ver++;
  if (sim.netVer !== state.net.ver) rebuildSim();
  sim.t += dt;

  updateCrossings(dt);
  econStep(dt);

  // srážky vozidel různých hráčů (náhoda): jen když se opravdu překrývají
  const rd = sim.units.filter(u => u.owner && u.kind === 'road' && !u.hidden && u.x !== undefined && !(u.crashT > 0));
  for (let i = 0; i < rd.length; i++) for (let j = i + 1; j < rd.length; j++) {
    const a = rd[i], b = rd[j];
    if (a.pid === b.pid) continue;
    if (Math.hypot(a.x - b.x, a.y - b.y) < 0.3 * CFG.S && (a.v > 0.3 * CFG.S || b.v > 0.3 * CFG.S) && Math.random() < 1 - Math.exp(-0.6 * dt)) {
      breakVehicle(a, 18, 'Nehoda', 0.08); breakVehicle(b, 18, 'Nehoda', 0.08);
    }
  }

  // okolní provoz: doplnit / ubrat
  const am = sim.amb;
  let alive = 0;
  for (const u of sim.units) if (!u.owner && !u.dying && !u.hwAmb) alive++;
  sim.spawnT -= dt;
  if (alive < am.target && sim.spawnT <= 0) { if (spawnAmbient(sim)) alive++; sim.spawnT = 0.7; }
  if (typeof hwAmbientStep === 'function') hwAmbientStep(sim, dt);       // provoz na dálnici: vzniká a zaniká jen v městech

  for (let i = sim.units.length - 1; i >= 0; i--) {
    const u = sim.units[i];
    if (u.owner) { stepPlayer(u, dt, sim); if (u.dead) sim.units.splice(i, 1); continue; }
    if (!stepAmbient(u, dt)) sim.units.splice(i, 1);
  }
  if (typeof trafficGuard === 'function') trafficGuard(sim);
  for (let i = sim.floaters.length - 1; i >= 0; i--) {
    sim.floaters[i].t += dt;
    if (sim.floaters[i].t > 2.2) sim.floaters.splice(i, 1);
  }
}

function runSim(dtReal) {
  const speed = state.simSpeed;
  if (!speed) return;
  let dt = Math.min(dtReal, 0.1) * speed;
  while (dt > 0) { const h = Math.min(dt, 0.04); simStep(h); dt -= h; }
}
