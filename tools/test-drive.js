// Jízda vozidla po dálnici: napojí jeden podnik na státní síť (jako by to postavil hráč) a pustí auto do vzdáleného města.
const { G, S, m } = require('./test-world.js');
const X = G._x, A = 36 * (1 + Math.SQRT2);
const reg = G.register('Tester', '#ff8800', m.tokens.find(t => t.level === 1 && t.type === 'city').id);
const pid = reg.pid, P = S.players[pid];
const prods = m.tokens.filter(t => t.road.length && X.tokenOutputs(t).length);
const land = c => X.isLandCell(m, c) && !X.tokenAt(m, c) && !m.hwx.has(X.cellKey(c));
const wanted = process.argv[2];
function mkO(c, r) { return { t: 'o', c, r }; }
const hwOf = u => { let h = 0; for (const q of u.paths[0].pts) { const c = X.hitTest(q.x, q.y); if (c && m.hwx.has(X.cellKey(c)) && X.hwxBuilt(m, c)) h++; } return h; };
const cities = m.tokens.filter(t => t.type === 'city' && t.road.length && X.tokenAccepts(t).length);
let best = null, a = null, tested = 0;
for (const cand of prods.filter(t => !wanted || t.name === wanted || t.type === wanted)) {
  if (!X.tokenOutputs(cand).some(g => cities.some(c => X.tokenAccepts(c).includes(g)))) continue;
  const tcell = X.mkO(cand.c, cand.r); let route = null;
  for (const pk of cand.road) {
    const nb = X.neighborAcross(tcell, pk); if (!X.cellExists(nb.cell) || !land(nb.cell)) continue;
    route = X.hwxRoute({ starts: [{ cell: nb.cell, inE: nb.k, g: 0 }], step: X.hwxTurnStep, mult: c => land(c) || m.preRoads.has(X.cellKey(c)) ? 1 : Infinity,
      goal: (c, inE) => m.preRoads.has(X.cellKey(c)) && c.t === 'o' && ((m.preRoads.get(X.cellKey(c)) >> inE) & 1) === 0 && X.hwxCount(m.preRoads.get(X.cellKey(c))) < 3 });
    if (route && route.length < 40) break; route = null;
  }
  if (!route) continue; tested++;
  const added = [];
  for (const e of route) {
    const bits = (e.inE >= 0 ? 1 << e.inE : 0) | (e.out >= 0 ? 1 << e.out : 0), prev = S.net.get(e.cell);
    S.net.set(e.cell, { road: (prev ? prev.road : 0) | bits, rail: [], own: { road: [pid], rail: 0 } });
  }
  X.rebuildSim();
  for (const b of cities) {
    const gs = X.tokenOutputs(cand).filter(g => X.tokenAccepts(b).includes(g)); if (!gs.length) continue;
    const u = X.createUnit({ kind: 'road', model: 'kamionDump', A: cand.id, B: b.id, goods: gs[0], pid });
    if (!X.planUnit(u)) continue;
    const h = hwOf(u); if (!best || h > best.h) { best = { u, b, g: gs[0], h }; a = cand; }
  }
  if (best && best.h > 25) break;
}
console.log('\nnapojeno podniků', tested, '| nejlepší nalezená trasa po dálnici:', best ? best.h + ' bodů' : 'žádná');
if (!best) process.exit(0);
const { u, b } = best;
console.log('trasa:', a.name, '→', b.name, '| délka', (u.paths[0].len / 36).toFixed(1), 'S | bodů na dálnici', best.h, 'z', u.paths[0].pts.length);
S.sim.units.push(u); P.money = 100000; const m0 = P.money, t0 = S.sim.t;
let arrived = false, left = false, minV = 1e9, maxV = 0, hwTime = 0, last = u.at;
console.log('start: stav', u.state, 'at', u.at);
for (let i = 0; i < 20000; i++) {
  G.step(0.1);
  if (u.x !== undefined && !u.hidden) { left = true; const c = X.hitTest(u.x, u.y); if (c && m.hwx.has(X.cellKey(c)) && X.hwxBuilt(m, c)) { hwTime += 0.1; maxV = Math.max(maxV, u.v / 36); } }
  if (left && u.at === 'B' && (u.hidden || u.state === 'dwell')) { arrived = true; break; }
}
console.log('odjelo:', left, '| dojelo do cíle:', arrived, '| čas', (S.sim.t - t0).toFixed(0), 's | na dálnici', hwTime.toFixed(0), 's, max rychlost', maxV.toFixed(2), 'S/s');
console.log('mýtné u.tolls =', u.tolls.toFixed(1), '| změna peněz', (P.money - m0).toFixed(1), '| stav', u.state, u.status || '');

// dokončit vykládku a vrátit se -> zisk za celý okruh
let cycles = 0, lastT = u.trips || 0;
for (let i = 0; i < 40000 && (u.trips || 0) < 1; i++) G.step(0.1);
console.log('po 1. dokončeném okruhu: trips', u.trips, '| čas', (S.sim.t - t0).toFixed(0), 's | zaplaceno mýto', u.tolls.toFixed(0), '| earned', (u.earned || 0).toFixed(0), '| čistá změna peněz', (P.money - m0).toFixed(0));
