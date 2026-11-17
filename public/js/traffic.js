// Hlídání překryvů vozidel (ALFA 0.4).
// Žádné dvě vozidla (auta, vagony) se nesmí kreslit „jedno v druhém“. Brzdění podle vozidla vpředu (sim.js) a mezera
// při vzniku vozidla to zajišťují samy; tahle stráž je navíc poslední pojistka a zároveň měřidlo:
//   • každý snímek zkontroluje všechny dvojice (orientované obdélníky půdorysu, bez malé tolerance),
//   • dvojice ve stejné výšce, které se překrývají, spočítá (sim.guard.pairs) a vozidlo vzadu na 0,35 s zastaví,
//   • vozidlo na mostě a vozidlo pod ním (jiná výška) se nepočítají.

function vehFootprint(item) { const m = modelFor(item), S = CFG.S * CFG.VSCALE; return { hl: m.len * S / 2, hw: m.wid * S / 2 }; }
function obbOverlap(a, b, k) {
  const ax = [[a.c, a.s], [-a.s, a.c], [b.c, b.s], [-b.s, b.c]];
  for (const [nx, ny] of ax) {
    const ca = a.x * nx + a.y * ny, cb = b.x * nx + b.y * ny;
    const ra = k * (a.hl * Math.abs(a.c * nx + a.s * ny) + a.hw * Math.abs(-a.s * nx + a.c * ny));
    const rb = k * (b.hl * Math.abs(b.c * nx + b.s * ny) + b.hw * Math.abs(-b.s * nx + b.c * ny));
    if (Math.abs(ca - cb) >= ra + rb) return false;
  }
  return true;
}
function trafficBoxes(sim) {
  const map = state.map, hw = !!(map && map.hw && map.hw.size), out = [];
  const add = (owner, x, y, ang, item, under) => {
    const f = vehFootprint(item);
    out.push({ owner, x, y, c: Math.cos(ang), s: Math.sin(ang), hl: f.hl, hw: f.hw, z: hw && !under ? hwZAt(map, state.net, x, y) : 0 });
  };
  const scan = u => {
    if (u.hidden) return;
    if (u.kind === 'road') { if (u.x === undefined || (u.fade !== undefined && u.fade < 0.35)) return; add(u, u.x, u.y, u.ang, u.model, !!u.under); }
    else if (u.kind === 'rail') { const ps = u.poses || (u.ok && u.paths ? trainPoses(u) : []); for (const p of ps) add(u, p.x, p.y, p.ang, p.item, false); }
  };
  for (const u of sim.units) scan(u);
  if (sim.ambList) for (const u of sim.ambList) scan(u);
  return out;
}
function trafficGuard(sim, opt) {
  const g = sim.guard || (sim.guard = { frames: 0, pairs: 0, stops: 0, last: [] });
  g.frames++;
  const B = trafficBoxes(sim);
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
    const a = B[i], b = B[j];
    if (a.owner === b.owner || Math.abs(a.z - b.z) > 0.12) continue;
    if (Math.abs(a.x - b.x) > 60 || Math.abs(a.y - b.y) > 60) continue;
    if (!obbOverlap(a, b, 0.97)) continue;
    g.pairs++;
    if (g.last.length < 12) g.last.push([+(sim.t || 0).toFixed(1), a.owner.kind + ':' + (a.owner.model || 'vlak'), b.owner.kind + ':' + (b.owner.model || 'vlak'), Math.round(a.x), Math.round(a.y)]);
    if (opt && opt.noEnforce) continue;
    const stop = (me, other, first) => {
      const u = me.owner; if (u.kind !== 'road') return;
      const ahead = (other.x - me.x) * me.c + (other.y - me.y) * me.s;                // druhé vozidlo je před tím mým
      const beh = (me.x - other.x) * other.c + (me.y - other.y) * other.s;
      if (ahead > 0 && (beh <= 0 || first)) { u.guardUntil = (sim.t || 0) + 0.35; g.stops++; }
    };
    stop(a, b, false); stop(b, a, true);
  }
  return g;
}
