// Lodě a přístavy: plavba po řekách (map.nav), přístav = překladiště libovolného zboží.
const SHIP_TRIM = 0.5 * A;
function isPort(tk) { return !!tk && !!TOKEN_TYPES[tk.type] && !!TOKEN_TYPES[tk.type].port; }

// Vodní pole vedle přístavu (hrana k vodě); null = přístav nemá přístup k vodě.
function portDock(map, tk) {
  if (!map || !map.nav) return null;
  for (const [dc, dr] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { const k = (tk.c + dc) + ',' + (tk.r + dr); if (map.nav.has(k)) return { c: tk.c + dc, r: tk.r + dr }; }
  return null;
}

function buildShipGraph(map) {
  const nodes = new Map();
  const get = (id, x, y) => { let n = nodes.get(id); if (!n) { n = { id, x, y, adj: [] }; nodes.set(id, n); } return n; };
  const link = (n1, n2, poly) => {
    const len = polyLength(poly), e1 = { from: n1, to: n2, len, poly }, e2 = { from: n2, to: n1, len, poly: poly.slice().reverse() };
    e1.rev = e2; e2.rev = e1; n1.adj.push(e1); n2.adj.push(e2);
  };
  if (map && map.nav) {
    for (const k of map.nav) { const [c, r] = k.split(',').map(Number); get('N' + k, c * A, r * A); }
    for (const k of map.nav) {
      const [c, r] = k.split(',').map(Number);
      for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) { const k2 = (c + dc) + ',' + (r + dr); if (map.nav.has(k2) && !(dc && dr && (map.nav.has((c + dc) + ',' + r) || map.nav.has(c + ',' + (r + dr))))) { const a = nodes.get('N' + k), b = nodes.get('N' + k2); link(a, b, [{ x: a.x, y: a.y }, { x: b.x, y: b.y }]); } }
    }
    for (const tk of map.tokens) {
      if (!isPort(tk)) continue;
      const d = portDock(map, tk); if (!d) continue;
      const c0 = tokenCenter(tk), tn = get('T' + tk.id, c0.x, c0.y), dn = nodes.get('N' + d.c + ',' + d.r);
      if (dn) link(tn, dn, [{ x: tn.x, y: tn.y }, { x: dn.x, y: dn.y }]);
    }
  }
  return { kind: 'ship', nodes, list: [...nodes.values()] };
}

function unloadable(u, tk) {
  if (u.kind === 'ship') { const acc = tokenAccepts(tk); return (u.holds || []).some(h => h.amt > 0.01 && acc.includes(h.g) && (STOCK_CAP - (tk.stock[h.g] || 0)) > 1); }
  return u.amt > 0.01 && tokenAccepts(tk).includes(u.goods) && (STOCK_CAP - (tk.stock[u.goods] || 0)) > 1;
}
function shipSum(u) { return (u.holds || []).reduce((s, h) => s + h.amt, 0); }
function doLoadShip(u, tk) {
  let tot = 0; const eff = ageEff(u);
  for (const h of u.holds) {
    const room = h.cap * eff - h.amt, take = Math.max(0, Math.min(room, tk.stock[h.g] || 0));
    if (take > 0) { h.amt += take; tk.stock[h.g] -= take; addInfl(tk, u.pid, take * GOODS[h.g].value * INFL_PER_VALUE); tot += take; }
  }
  u.amt = shipSum(u); u.loaded = u.amt > 0.01; return tot;
}
function doUnloadShip(u, tk, sim) {
  const acc = tokenAccepts(tk), ta = tokenById(u.A); let any = false, inc = 0;
  for (const h of u.holds) {
    if (!(h.amt > 0.01) || !acc.includes(h.g)) continue;
    let free = STOCK_CAP - (tk.stock[h.g] || 0); if (isCity(tk) && h.g === 'cement') free = 1e9;
    const del = Math.max(0, Math.min(h.amt, free)); if (del <= 0) continue;
    h.amt -= del; any = true;
    if (isCity(tk) && h.g === 'cement') tk.cementIn += del; else tk.stock[h.g] = (tk.stock[h.g] || 0) + del;
    const gd = GOODS[h.g], income = Math.round(del * u.routeCells * ECON.RATE.ship * gd.value);
    addMoney(u.pid, income, 'freight'); u.earned += income; inc += income;
    addInfl(tk, u.pid, del * gd.value * INFL_PER_VALUE);
    if (ta && ta.owner && ta.owner !== u.pid) transfer(u.pid, ta.owner, del * gd.value * SALE_PER_T * 0.5, 'goodsBuy', 'goodsSale', 'goods');
  }
  u.amt = shipSum(u); u.loaded = u.amt > 0.01;
  if (any) { u.trips++; const c = tokenCenter(tk); floatAt(c.x, c.y, '+' + fmtMoney(inc), '#8cf59a', [u.pid]); }
}

let SHIP_RS = null;
function rightNormal(a) {
  if (SHIP_RS === null) { try { const t = offsetRight([{ x: 0, y: 0 }, { x: 10, y: 0 }], 1); SHIP_RS = t[0].y > 0 ? 1 : -1; } catch (e) { SHIP_RS = 1; } }
  return { x: -Math.sin(a) * SHIP_RS, y: Math.cos(a) * SHIP_RS };
}
function shipPose(u) {
  const path = unitPath(u), p = path.pose(u.s, 0.3 * CFG.S), n = rightNormal(p.ang);
  u.x = p.x + n.x * (u.lat || 0); u.y = p.y + n.y * (u.lat || 0); u.ang = p.ang;
}
// Pohyb lodi po řece: odstup za lodí vpředu, protijedoucí uhnou doprava, při křížení má přednost loď s vyšší náhodnou prioritou.
function stepShipMotion(u, dt, vmax, tgt) {
  const S = CFG.S, path = unitPath(u), sim = state.sim;
  const hl = modelFor(u.model).len * CFG.VSCALE * S / 2;
  if (u.prio === undefined) u.prio = Math.random();
  let vt = vmax * S, latT = 0;
  const a0 = path.pose(u.s, 0.3 * S).ang, a1 = path.pose(Math.min(path.len, u.s + 0.9 * S), 0.3 * S).ang;
  vt *= 1 / (1 + 0.9 * Math.abs(normAng(a1 - a0)));
  if (u.guardT > 0) u.guardT -= dt;
  const cs = Math.cos(u.ang || 0), sn = Math.sin(u.ang || 0);
  u.waitShip = false;
  for (const w of sim.units) {
    if (w === u || w.kind !== 'ship' || w.hidden || w.x === undefined || u.x === undefined) continue;
    const dx = w.x - u.x, dy = w.y - u.y, fwd = dx * cs + dy * sn, lat = -dx * sn + dy * cs;
    if (fwd <= -0.3 * S || fwd > 3.4 * S || Math.abs(lat) > 1.2 * S) continue;
    const dang = Math.abs(normAng((w.ang || 0) - (u.ang || 0))), wl = modelFor(w.model).len * CFG.VSCALE * S / 2;
    const gap = fwd - hl - wl - 0.15 * S;
    if (dang < 1.2) { if (Math.abs(lat) < 0.55 * S && fwd > 0) vt = Math.min(vt, Math.sqrt(2 * BRK * S * Math.max(0, gap))); }
    else if (u.guardT > 0) continue;
    else if (dang > 2.0) { latT = Math.max(latT, 0.34 * S); if (Math.abs(lat) < 0.45 * S && fwd > 0 && fwd < 1.6 * S && (w.prio || 0) > u.prio) { vt = Math.min(vt, Math.sqrt(2 * BRK * S * Math.max(0, gap))); u.waitShip = true; } }
    else if (fwd > 0 && fwd < 2.0 * S && (w.prio || 0) > u.prio) { vt = Math.min(vt, Math.sqrt(2 * BRK * S * Math.max(0, gap))); u.waitShip = true; }
  }
  vt = Math.min(vt, Math.sqrt(2 * BRK * S * Math.max(0, tgt - u.s)) + 0.08 * S);
  if (u.v < 0.05 * S && vt < 0.05 * S) u.stuck += dt; else u.stuck = 0;
  if (u.stuck > 7) { u.guardT = 3; u.stuck = 0; }
  u.v += clamp(vt - u.v, -BRK * S * dt, 1.4 * S * dt);
  u.s = Math.min(tgt, u.s + u.v * dt);
  u.lat = (u.lat || 0) + (latT - (u.lat || 0)) * Math.min(1, dt * 1.8);
  shipPose(u);
  return u.s >= tgt - 0.02 * S;
}
