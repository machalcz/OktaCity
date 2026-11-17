// Dálnice na mapě ČR (ALFA 0.4): převod čar z mapy na pole, která splňují pravidla stavby silnic.
//
// Data:  map.hwx = Map(cellKey -> { mask, st, id, ids[], taper? })
//          mask   = bity hran, kterými dálnice pole opouští (2 hrany = průjezd, 3–4 = odbočka / sjezd, střed pole)
//          st     = 'built' (hotová, zpoplatněná) | 'cons' (ve výstavbě) | 'plan' (plánovaná)
//          taper  = hrana, na které se dálnice zužuje na silnici (u Prahy)
//        map.hw  = jen hotová pole, kterými dálnice vede rovně vodorovně / svisle (tam může stát most a napojení)
//        map.preRoads = Map(cellKey -> maska silnice): silnice, které už stojí při založení světa (přístup k Praze)
//
// Pravidla (stejná jako při stavbě silnice): v osmiúhelníku úhel ramen aspoň 90° (zatáčka nejvýš o 90°),
// ve čtverečku jen rovně, do středu pole nejvýš 4 ramena, odbočka jen kolmo (min. 90° ke všem ostatním ramenům).
// Dálnice nevede přes město ani přes pole, na které ústí přípojka města. Dálnice se nekříží.

// Vzdálenosti jsou odvozené z kilometrů, takže fungují pro libovolný rastr (5 km → 3 km …).
const HWX_K = 5 / ((typeof CR_DATA !== 'undefined' && CR_DATA.CELL_KM) || 5);
const HWX = { RING: Math.round(7 * HWX_K), DEPTH: [1, 1.3, 1.7, 2.2, 2.8, 3.5, 4.3, 5.2].slice(0, Math.max(5, Math.round(5 * HWX_K))), ORDER_FIRST: ['D1'], K: HWX_K };

function hwxAt(map, cell) { return map && map.hwx && cell ? (map.hwx.get(cellKey(cell)) || null) : null; }
function hwxOnly(map, cell) { return !!hwxAt(map, cell) && !hwAt(map, cell); }
function hwxBuilt(map, cell) { const h = hwxAt(map, cell); return !!h && h.st === 'built'; }
function hwxRank(st) { return st === 'built' ? 3 : st === 'cons' ? 2 : 1; }

class HwxHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(c, v) { const a = this.a; a.push([c, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
}

function hwxCellOf(o) { return o.t === 'o' ? mkO(o.c, o.r) : mkS(o.c, o.r); }
function hwxNeighbors(cell) { const out = []; for (let k = 0; k < edgeCount(cell); k++) { const nb = neighborAcross(cell, k); if (cellExists(nb.cell)) out.push(nb.cell); } return out; }
function hwxCount(m) { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; }
function hwxArms(m) { const o = []; for (let k = 0; k < 8; k++) if ((m >> k) & 1) o.push(k); return o; }

// Odbočka (větev) na existující dálnici: nová hrana e aspoň 90° od všech stávajících, celkem nejvýš 4 ramena.
function hwxJoinOk(cell, mask, e) {
  if (cell.t !== 'o' || ((mask >> e) & 1) || hwxCount(mask) + 1 > CFG.MAX_ARMS) return false;
  return hwxArms(mask).every(a => angleBetween(cell, a, e) >= 90);
}

// Hledání trasy ve stavech (pole, hrana vjezdu).
// o = { starts[{cell,inE,g}], step(cell,inE,out)->délka|-1, mult(cell)->násobek|Infinity, goal(cell,inE)->bool }
// Vrací [{ cell, inE, out }] od začátku do cílového pole (poslední má out = -1).
function hwxRoute(o) {
  const open = new HwxHeap(), best = new Map(), par = new Map(), info = new Map();
  const key = (cell, inE) => cellKey(cell) + ':' + inE;
  for (const s of o.starts) {
    const k = key(s.cell, s.inE);
    if (!best.has(k) || s.g < best.get(k)) { best.set(k, s.g); par.set(k, null); info.set(k, { cell: s.cell, inE: s.inE }); open.push(s.g, k); }
  }
  let guard = 0;
  while (open.size && guard++ < 800000) {
    const [g, k] = open.pop();
    if (g > best.get(k) + 1e-9) continue;
    const st = info.get(k);
    if (st.end) {
      const seq = []; let cur = k, out = -1;
      while (cur) { const s2 = info.get(cur); seq.push({ cell: s2.cell, inE: s2.inE, out }); const p = par.get(cur); if (!p) break; out = p.out; cur = p.pk; }
      return seq.reverse();
    }
    const { cell, inE } = st, m = o.mult(cell);
    for (let out = 0; out < edgeCount(cell); out++) {
      if (out === inE) continue;
      const len = o.step(cell, inE, out);
      if (len < 0) continue;
      const nb = neighborAcross(cell, out);
      if (!cellExists(nb.cell)) continue;
      const ng = g + len * (m === Infinity ? 1 : m), nc = nb.cell;
      if (o.goal(nc, nb.k)) {
        const ek = 'END:' + key(nc, nb.k);
        if (ng < (best.has(ek) ? best.get(ek) : Infinity)) { best.set(ek, ng); par.set(ek, { pk: k, out }); info.set(ek, { cell: nc, inE: nb.k, end: true }); open.push(ng, ek); }
        continue;
      }
      if (o.mult(nc) === Infinity) continue;
      const k2 = key(nc, nb.k);
      if (ng < (best.has(k2) ? best.get(k2) : Infinity)) { best.set(k2, ng); par.set(k2, { pk: k, out }); info.set(k2, { cell: nc, inE: nb.k }); open.push(ng, k2); }
    }
  }
  return null;
}

// Délka průchodu polem a pokuta za zatáčku (zatáčka nejvýš o 90°, ve čtverečku jen rovně).
function hwxTurnStep(cell, inE, out) {
  const A_ = A, S_ = CFG.S;
  if (cell.t === 's') return inE < 0 || out === oppositeEdge(cell, inE) ? S_ : -1;
  if (inE < 0) return A_ * 0.5;
  const ang = angleBetween(cell, inE, out);
  if (ang < 90) return -1;
  return ang === 180 ? A_ : A_ * (ang === 135 ? 0.95 : 0.85) + 0.35 * A_ * (180 - ang) / 45;
}

function hwxBuild(map, D) {
  const REP = hwxBuildInner(map, D); hwxSchedule(map); return REP;
}
function hwxBuildInner(map, D) {
  const S_ = CFG.S, rep = { hw: [], problems: [], approach: null };
  map.hwx = new Map(); map.hw = new Map(); const pre = new Map(); map.preRoads = pre;
  const tokenCells = new Set();
  for (const t of map.tokens) { for (const q of tokenCellList(t)) tokenCells.add(cellKey(mkO(q.c, q.r))); for (const q of (t.sq || [])) tokenCells.add(cellKey(mkS(q.c, q.r))); }
  const portNb = new Set();
  for (const t of map.tokens) for (const code of t.road.concat(t.rail)) { const pi = portInfo(t, code); portNb.add(cellKey(neighborAcross(pi.cell, pi.k).cell)); }
  const praha = map.tokens.find(t => t.name === 'Praha');
  const pc = praha ? tokenCenter(praha) : null;
  const dPraha = cell => { const c = cellCenter(cell); return pc ? Math.hypot(c.x - pc.x, c.y - pc.y) / A : 1e9; };
  const land = cell => isLandCell(map, cell);

  function corridor(cells) {                            // hloubka (v polích) od původní čáry z mapy
    const d = new Map(), q = [];
    for (const c of cells) { const k = cellKey(c); if (!d.has(k)) { d.set(k, 0); q.push(c); } }
    for (let i = 0; i < q.length; i++) { const c = q[i], dd = d.get(cellKey(c)); if (dd >= HWX.DEPTH.length - 1) continue; for (const n of hwxNeighbors(c)) { const k = cellKey(n); if (!d.has(k)) { d.set(k, dd + 1); q.push(n); } } }
    return d;
  }
  const put = (cell, bits, st, id, extra) => {
    const k = cellKey(cell); let h = map.hwx.get(k);
    if (!h) { h = { mask: 0, st, id, ids: [] }; map.hwx.set(k, h); }
    h.mask |= bits; if (!h.ids.includes(id)) h.ids.push(id);
    if (hwxRank(st) > hwxRank(h.st)) h.st = st;
    if (extra) Object.assign(h, extra);
  };

  // pořadí: nejdelší dálnice první (ostatní se na ni napojují)
  const list = D.highways.map(h => {
    const orig = [], origSt = [];
    for (const sg of h.segs) for (const c of sg.cells) { const cell = hwxCellOf(c); if (orig.length && sameCell(orig[orig.length - 1], cell)) continue; orig.push(cell); origSt.push(sg.st); }
    return { id: h.id, name: h.name, orig, origSt };
  }).sort((a, b) => b.orig.length - a.orig.length);

  const transitions = [];                               // dálnice, které se u Prahy mění na silnici
  const freeEnds = [];                                  // volné konce dálnic (napojí se státní silnicí na nejbližší velké město)
  const queue = list.slice();
  while (queue.length) {
    const h = queue.shift();
    let orig = h.orig, origSt = h.origSt;
    // čára, která kříží už postavenou dálnici, se v místě křížení rozdělí; každá část se na ni napojí zvlášť (dálnice se nekříží)
    if (!h.split) {
      const hit = []; orig.forEach((c, i) => { if (map.hwx.has(cellKey(c))) hit.push(i); });
      if (hit.length) {
        const bad = new Set(); for (const i of hit) for (let d = -1; d <= 1; d++) bad.add(i + d);
        let run = [], runSt = [];
        const parts = [];
        orig.forEach((c, i) => { if (bad.has(i)) { if (run.length >= 3) parts.push({ id: h.id, name: h.name, orig: run, origSt: runSt, split: true }); run = []; runSt = []; } else { run.push(c); runSt.push(origSt[i]); } });
        if (run.length >= 3) parts.push({ id: h.id, name: h.name, orig: run, origSt: runSt, split: true });
        queue.unshift(...parts); continue;
      }
    }
    // směr: od vzdáleného konce k Praze (u dálnic, které končí v okruhu kolem Prahy)
    const nearStart = dPraha(orig[0]) <= HWX.RING + Math.round(3 * HWX.K), nearEnd = dPraha(orig[orig.length - 1]) <= HWX.RING + Math.round(3 * HWX.K);
    if (nearStart) { orig = orig.slice().reverse(); origSt = origSt.slice().reverse(); }
    const toPraha = nearStart || nearEnd;
    if (toPraha) {                                      // useknout část uvnitř okruhu
      let n = orig.length; while (n > 1 && dPraha(orig[n - 1]) <= HWX.RING) n--;
      orig = orig.slice(0, n); origSt = origSt.slice(0, n);
    }
    const cor = corridor(orig);
    const okCell = c => land(c) && !tokenCells.has(cellKey(c)) && !portNb.has(cellKey(c));
    const first = orig.find(c => c.t === 'o' && okCell(c)), last = orig.slice().reverse().find(c => c.t === 'o' && okCell(c));
    if (!first || !last) { rep.problems.push(h.id + ': žádné použitelné pole'); continue; }
    // napojení na jinou dálnici: začátek / konec do 2 polí od cizí dálnice
    const near = (anchor, depth) => {
      const out = [], seen = new Map([[cellKey(anchor), 0]]), q = [anchor];
      for (let i = 0; i < q.length; i++) { const c = q[i], dd = seen.get(cellKey(c)); if (map.hwx.has(cellKey(c)) && c.t === 'o') out.push({ cell: c, depth: dd }); if (dd >= depth) continue; for (const n of hwxNeighbors(c)) { const k = cellKey(n); if (!seen.has(k)) { seen.set(k, dd + 1); q.push(n); } } }
      return out;
    };
    const JD = Math.round(2 * HWX.K) + 3, startJoin = near(first, JD), sk = new Set(startJoin.map(j => cellKey(j.cell))), endJoin = toPraha ? [] : near(last, JD).filter(j => !sk.has(cellKey(j.cell)));
    const mult = c => {
      if (!land(c) || tokenCells.has(cellKey(c)) || portNb.has(cellKey(c)) || map.hwx.has(cellKey(c))) return Infinity;
      const d = cor.get(cellKey(c)); return d === undefined ? Infinity : HWX.DEPTH[d];
    };
    const starts = [];
    if (startJoin.length) for (const j of startJoin.filter(j => hwxCount(map.hwx.get(cellKey(j.cell)).mask) + 1 <= CFG.MAX_ARMS)) starts.push({ cell: j.cell, inE: -1, g: j.depth * A, join: true });
    else starts.push({ cell: first, inE: -1, g: 0 });
    const endKeys = new Set(endJoin.map(j => cellKey(j.cell)));
    const step = (cell, inE, out) => {
      const h0 = map.hwx.get(cellKey(cell));
      if (inE < 0) { if (h0 && !hwxJoinOk(cell, h0.mask, out)) return -1; }
      else if (h0 && !endKeys.has(cellKey(cell))) return -1;    // jiná dálnice: do jejího pole se trasa nevrací
      return hwxTurnStep(cell, inE, out);
    };
    const goal = (nc, inE) => {
      const k = cellKey(nc);
      if (endKeys.has(k)) return hwxJoinOk(nc, map.hwx.get(k).mask, inE);
      return k === cellKey(last) && !endKeys.size;
    };
    const route = hwxRoute({ starts, step, mult: c => { const h0 = map.hwx.get(cellKey(c)); return h0 && starts.some(s => sameCell(s.cell, c)) ? 1 : mult(c); }, goal });
    if (!route) { rep.problems.push(h.id + ': trasu se nepodařilo najít'); continue; }
    // zapsat pole; stav podle nejbližšího pole původní čáry
    const stOf = cell => { const c = cellCenter(cell); let b = 0, bd = 1e18; orig.forEach((o, i) => { const q = cellCenter(o), d = Math.hypot(q.x - c.x, q.y - c.y); if (d < bd) { bd = d; b = i; } }); return origSt[b]; };
    route.forEach((e, i) => {
      let bits = (e.inE >= 0 ? 1 << e.inE : 0) | (e.out >= 0 ? 1 << e.out : 0);
      const isFirst = i === 0, isLast = i === route.length - 1;
      const stc = stOf(e.cell);
      if (isFirst && !startJoin.length && e.out >= 0) freeEnds.push({ id: h.id, cell: e.cell, dirE: e.out, st: stc });            // volný začátek
      if (isLast && !toPraha && !endJoin.length && e.inE >= 0) freeEnds.push({ id: h.id, cell: e.cell, dirE: e.inE, st: stc });   // volný konec
      put(e.cell, bits, stc, h.id);
    });
    rep.hw.push({ id: h.id, cells: route.length, join: [startJoin.length > 0, endJoin.length > 0], praha: toPraha });
    if (toPraha) {
      const lastE = route[route.length - 1];
      transitions.push({ id: h.id, cell: lastE.cell, inE: lastE.inE, st: stOf(lastE.cell) });
    }
  }

  // ---------- napojení dálnic na města: státní silnice od konce dálnice k přípojce města ----------
  // Praha: všechny dálnice, které sem vedou. Ostatní: volné konce hotových dálnic -> nejbližší město od úrovně 2.
  {
    const links = transitions.map(t => ({ id: t.id, cell: t.cell, dirE: t.inE, st: t.st, cands: praha ? [praha] : [] }));
    for (const fe of freeEnds) {
      const c0 = cellCenter(fe.cell);
      const cands = map.tokens.filter(t => isCity(t) && t.level >= 2 && t.road.length)
        .map(t => { const q = tokenCenter(t); return { t, d: Math.hypot(q.x - c0.x, q.y - c0.y) / A }; })
        .filter(x => x.d <= Math.round(14 * HWX.K)).sort((a, b) => a.d - b.d).slice(0, 3).map(x => x.t);
      links.push({ id: fe.id, cell: fe.cell, dirE: fe.dirE, st: fe.st, cands, free: true });
    }
    links.sort((a, b) => (a.free === true) - (b.free === true));
    const linkedCells = new Set();
    rep.linkCity = new Map(); rep.praCells = [];
    for (const t of links) {
      let done = false;
      if (t.st === 'built') for (const tk of t.cands) {
        const tc = tokenCenter(tk), ports = tokenPortList(tk, 'road');
        const dTo = cell => { const c = cellCenter(cell); return Math.hypot(c.x - tc.x, c.y - tc.y) / A; };
        const d0 = dTo(t.cell);
        const roadOk = c => land(c) && !tokenCells.has(cellKey(c)) && !map.hwx.has(cellKey(c)) && dTo(c) <= Math.max(HWX.RING + Math.round(4 * HWX.K), d0 + Math.round(3 * HWX.K));
        const roadStep = (cell, inE, out) => {
          const ex = pre.get(cellKey(cell)) || 0;
          if (ex) {
            if (cell.t === 's') return inE >= 0 && ex === ((1 << inE) | (1 << out)) ? S_ * 0.4 : -1;
            const u = ex | (inE >= 0 ? 1 << inE : 0) | (1 << out);
            return hwxCount(u) > CFG.MAX_ARMS ? -1 : A * 0.18;
          }
          return hwxTurnStep(cell, inE, out);
        };
        const roadMult = c => { const ex = pre.get(cellKey(c)); return roadOk(c) ? (ex ? 0.35 : 1) : Infinity; };
        const roadGoal = (nc, inE) => ports.some(p => sameCell(nc, p.cell) && p.k === inE);
        // výstupní hrana poslední dálniční dlaždice: směrem k městu, zatáčka nejvýš 90°
        const cand = [];
        for (let e = 0; e < 8; e++) {
          if (e === t.dirE || angleBetween(t.cell, t.dirE, e) < 90) continue;
          const nb = neighborAcross(t.cell, e); if (!cellExists(nb.cell) || !roadOk(nb.cell)) continue;
          cand.push({ e, nb, d: dTo(nb.cell) });
        }
        const straight = oppositeEdge(t.cell, t.dirE);
        cand.sort((a, b) => ((a.e === straight ? 0 : 1) - (b.e === straight ? 0 : 1)) || (a.d - b.d));      // rovně dál má přednost
        for (const best of cand.slice(0, 4)) {
          const route = hwxRoute({ starts: [{ cell: best.nb.cell, inE: best.nb.k, g: 0 }], step: roadStep, mult: roadMult, goal: roadGoal });
          if (!route) continue;
          put(t.cell, 1 << best.e, t.st, t.id, { taper: best.e });
          for (const e of route) {
            if (tokenCells.has(cellKey(e.cell))) continue;
            const bits = (e.inE >= 0 ? 1 << e.inE : 0) | (e.out >= 0 ? 1 << e.out : 0);
            pre.set(cellKey(e.cell), (pre.get(cellKey(e.cell)) || 0) | bits);
          }
          done = true; if (tk === praha) rep.praCells.push(cellKey(t.cell)); (rep.linkCity.get(tk.id) || rep.linkCity.set(tk.id, []).get(tk.id)).push(t.cell); rep.links = (rep.links || 0) + 1; (rep.linked || (rep.linked = [])).push(t.id + '→' + tk.name);
          break;
        }
        if (done) break;
      }
      if (!done) {
        if (t.free) put(t.cell, 1 << oppositeEdge(t.cell, t.dirE), t.st, t.id);          // slepý konec: rovně k hraně pole
        else if (t.st === 'built') rep.problems.push(t.id + ': u Prahy není kudy vyjet');
      }
    }
    rep.approach = { cells: pre.size };
  }

  // ---------- sjezdy: každé větší město u hotové dálnice dostane státní silnici k nejbližšímu kolmému napojení ----------
  {
    // hlavní síť = největší souvislá skupina hotových polí dálnice; sjezdy se napojují vždy na ni
    const compOf = new Map(), compSize = [];
    for (const [k0, h0] of map.hwx) {
      if (h0.st !== 'built' || compOf.has(k0)) continue;
      const id = compSize.length; let n = 0; const q = [k0]; compOf.set(k0, id);
      for (let i = 0; i < q.length; i++) {
        const c = cellFromKey(q[i]), h = map.hwx.get(q[i]); n++;
        for (const e of hwxArms(h.mask)) { if (e >= edgeCount(c)) continue; const nb = neighborAcross(c, e), kk = cellKey(nb.cell), oh = map.hwx.get(kk); if (oh && oh.st === 'built' && ((oh.mask >> nb.k) & 1) && !compOf.has(kk)) { compOf.set(kk, id); q.push(kk); } }
      }
      compSize.push(n);
    }
    // dálnice napojené na Prahu tvoří jednu síť (spojuje je státní silnice u Prahy, ne sousedství polí)
    const par = compSize.map((_, i) => i), find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    const praIds = rep.praCells.map(k => compOf.get(k)).filter(i => i !== undefined);
    for (const i of praIds) par[find(i)] = find(praIds[0]);
    const grpSize = new Map(); compSize.forEach((n, i) => grpSize.set(find(i), (grpSize.get(find(i)) || 0) + n));
    const mainId = praIds.length ? find(praIds[0]) : [...grpSize].sort((a, b) => b[1] - a[1])[0][0];
    const inMain = k => compOf.has(k) && find(compOf.get(k)) === mainId;
    const built = [...map.hwx].filter(([k, h]) => h.st === 'built' && inMain(k)).map(([k]) => cellFromKey(k)).filter(c => c.t === 'o');
    const nearJoin = nc => {                              // už je do 3 polí po dálnici jiný sjezd / napojení?
      const q = [[nc, 0]], seen = new Set([cellKey(nc)]);
      for (let i = 0; i < q.length; i++) {
        const [c, d] = q[i], hh = map.hwx.get(cellKey(c));
        if (hh && (hh.joins || hh.taper !== undefined)) return true;
        if (d >= 3 || !hh) continue;
        for (const e of hwxArms(hh.mask)) { if (e >= edgeCount(c)) continue; const nb = neighborAcross(c, e).cell, k = cellKey(nb); if (!seen.has(k) && map.hwx.has(k)) { seen.add(k); q.push([nb, d + 1]); } }
      }
      return false;
    };
    const exitNet = new Set();                            // pole státních silnic, které už vedou na hlavní síť
    const stOkJoin = (nc, inE) => { const k = cellKey(nc), h = map.hwx.get(k); return !!h && h.st === 'built' && inMain(k) && nc.t === 'o' && hwxJoinOk(nc, h.mask, inE) && !(h.taper !== undefined) && h.ids.length === 1 && !nearJoin(nc); };
    rep.exits = [];
    for (const tk of map.tokens.filter(t => isCity(t) && t.level >= 2 && t.road.length)) {
      const tc = tokenCenter(tk);
      let near = 1e9; for (const c of built) { const q = cellCenter(c); near = Math.min(near, Math.hypot(q.x - tc.x, q.y - tc.y) / A); }
      if (near > Math.round(7 * HWX.K)) continue;
      // už je město napojené (silnice z hlavního napojení dálnice končí v jeho přípojce)?
      const tports = tokenPortList(tk, 'road');
      if ((rep.linkCity.get(tk.id) || []).some(c => inMain(cellKey(c)))) continue;          // už napojené na hlavní síť
      const roadOk = c => land(c) && !tokenCells.has(cellKey(c)) && !map.hwx.has(cellKey(c)) && Math.hypot(cellCenter(c).x - tc.x, cellCenter(c).y - tc.y) / A <= near + Math.round(4 * HWX.K);
      const roadStep = (cell, inE, out) => {
        const ex = pre.get(cellKey(cell)) || 0;
        if (ex) {
          if (cell.t === 's') return inE >= 0 && ex === ((1 << inE) | (1 << out)) ? S_ * 0.4 : -1;
          return hwxCount(ex | (inE >= 0 ? 1 << inE : 0) | (1 << out)) > CFG.MAX_ARMS ? -1 : A * 0.18;
        }
        return hwxTurnStep(cell, inE, out);
      };
      const roadMult = c => { const ex = pre.get(cellKey(c)); return roadOk(c) ? (ex ? 0.35 : 1) : Infinity; };
      let route = null;
      for (const pk of tports) {
        const nb = neighborAcross(pk.cell, pk.k); if (!cellExists(nb.cell) || !roadOk(nb.cell)) continue;
        route = hwxRoute({ starts: [{ cell: nb.cell, inE: nb.k, g: 0 }], step: roadStep, mult: roadMult, goal: (nc, inE) => stOkJoin(nc, inE) || (exitNet.has(cellKey(nc)) && nc.t === 'o' && !map.hwx.has(cellKey(nc)) && hwxJoinOk(nc, pre.get(cellKey(nc)), inE)) });
        if (route) { route.portEdge = pk; break; }
      }
      if (!route) { rep.exits.push(tk.name + ': ✖'); continue; }
      const end = route[route.length - 1], hh = map.hwx.get(cellKey(end.cell));
      if (hh) { hh.mask |= 1 << end.inE; (hh.joins || (hh.joins = [])).push(end.inE); }
      else pre.set(cellKey(end.cell), (pre.get(cellKey(end.cell)) || 0) | (1 << end.inE));               // napojeno na sjezd jiného města
      for (const e of route) exitNet.add(cellKey(e.cell));
      for (const e of route.slice(0, -1)) {
        if (tokenCells.has(cellKey(e.cell))) continue;
        const bits = (e.inE >= 0 ? 1 << e.inE : 0) | (e.out >= 0 ? 1 << e.out : 0);
        pre.set(cellKey(e.cell), (pre.get(cellKey(e.cell)) || 0) | bits);
      }
      rep.exits.push(tk.name + ': ' + route.length);
    }
  }

  // ---------- Praha: každá silniční přípojka dostane státní silnici, která se napojí na nejbližší existující silnici ----------
  if (praha) {
    const pcen = tokenCenter(praha), lim = Math.round(16 * HWX.K);
    const okc = c => land(c) && !tokenCells.has(cellKey(c)) && !map.hwx.has(cellKey(c)) && Math.hypot(cellCenter(c).x - pcen.x, cellCenter(c).y - pcen.y) / A <= lim;
    const rstep = (cell, inE, out) => {
      const ex = pre.get(cellKey(cell)) || 0;
      if (ex) { if (cell.t === 's') return inE >= 0 && ex === ((1 << inE) | (1 << out)) ? S_ * 0.4 : -1; return hwxCount(ex | (inE >= 0 ? 1 << inE : 0) | (1 << out)) > CFG.MAX_ARMS ? -1 : A * 0.18; }
      return hwxTurnStep(cell, inE, out);
    };
    const rgoal = (nc, inE) => { const ex = pre.get(cellKey(nc)); return !!ex && nc.t === 'o' && !map.hwx.has(cellKey(nc)) && hwxJoinOk(nc, ex, inE); };
    rep.praPorts = [];
    for (const pi of tokenPortList(praha, 'road')) {
      const nb = neighborAcross(pi.cell, pi.k); if (!cellExists(nb.cell)) continue;
      if (pre.get(cellKey(nb.cell)) & (1 << nb.k)) { rep.praPorts.push('ok'); continue; }
      if (!okc(nb.cell)) { rep.praPorts.push('blok'); continue; }
      const route = hwxRoute({ starts: [{ cell: nb.cell, inE: nb.k, g: 0 }], step: rstep, mult: c => { const ex = pre.get(cellKey(c)); return okc(c) ? (ex ? 0.35 : 1) : Infinity; }, goal: rgoal });
      if (!route) { rep.praPorts.push('bez trasy'); continue; }
      for (const e of route) { if (tokenCells.has(cellKey(e.cell))) continue; const bits = (e.inE >= 0 ? 1 << e.inE : 0) | (e.out >= 0 ? 1 << e.out : 0); pre.set(cellKey(e.cell), (pre.get(cellKey(e.cell)) || 0) | bits); }
      rep.praPorts.push('napojeno ' + route.length);
    }
  }

  // ---------- hotové rovné úseky (vodorovně / svisle) = pole s mostem a napojením ----------
  for (const [k, h] of map.hwx) {
    const cell = cellFromKey(k);
    if (cell.t !== 'o' || h.ids.length !== 1 || h.taper !== undefined) continue;
    const DIRS = { 17: 'h', 68: 'v', 34: 'a', 136: 'b' };
    if (DIRS[h.mask]) map.hw.set(cell.c + ',' + cell.r, { dir: DIRS[h.mask], st: h.st });
    else if (h.st === 'built' && hwxCount(h.mask) === 2 && !h.joins) { const ar = hwxArms(h.mask); if (angleBetween(cell, ar[0], ar[1]) < 180) map.hw.set(cell.c + ',' + cell.r, { dir: 'c', arms: ar, st: h.st }); }
  }
  // pás kolem dálnice bez stromů
  if (map.trees) {
    const block = new Set([...map.hwx.keys(), ...pre.keys()]);
    map.trees = map.trees.filter(t => { const c = hitTest(t.x, t.y); return !c || !block.has(cellKey(c)); });
  }
  return rep;
}

// Kontrola výsledku podle pravidel stavby. Vrací seznam problémů (prázdný = v pořádku).
// ---------- dostavba podle herního času (deterministicky z sim.t, server i klient dojdou ke stejnému stavu) ----------
// Rozestavěné úseky se dokončují postupně od hotových konců (HWT.CONS_STEP s na pole), plánované začnou později a stavba trvá HWT.PLAN_LEN.
const HWT = { CONS_BASE: 120, CONS_STEP: 25, PLAN_BASE: 600, PLAN_STEP: 40, PLAN_LEN: 600 };
function hwxSchedule(map) {
  const dist = new Map(), q = [];
  for (const [k, h] of map.hwx) { h.st0 = h.st; if (h.st === 'built') { dist.set(k, 0); q.push(k); } }
  for (let i = 0; i < q.length; i++) {
    const k = q[i], h = map.hwx.get(k), cell = cellFromKey(k);
    for (const e of hwxArms(h.mask)) {
      if (e >= edgeCount(cell)) continue;
      const nk = cellKey(neighborAcross(cell, e).cell);
      if (map.hwx.has(nk) && !dist.has(nk)) { dist.set(nk, dist.get(k) + 1); q.push(nk); }
    }
  }
  for (const [k, h] of map.hwx) {
    if (h.st0 === 'built') continue;
    const d = Math.max(1, dist.get(k) || 1);
    if (h.st0 === 'cons') { h.t0 = 0; h.t1 = HWT.CONS_BASE + d * HWT.CONS_STEP; }
    else { h.t0 = HWT.PLAN_BASE + d * HWT.PLAN_STEP; h.t1 = h.t0 + HWT.PLAN_LEN; }
  }
}
function hwxApplyTime(map, t) {
  if (!map || !map.hwx) return false;
  let changed = false;
  for (const [k, h] of map.hwx) {
    if (h.st0 === undefined || h.st0 === 'built') continue;
    const st = t >= h.t1 ? 'built' : t >= h.t0 ? 'cons' : 'plan';
    if (st === h.st) continue;
    h.st = st; changed = true;
    if (map.hw) { const cc = cellFromKey(k), o = map.hw.get(cc.c + ',' + cc.r); if (o) o.st = st; }
  }
  // křižovatka s více dálnicemi: stav = nejlepší z nich (put() to dělá při stavbě); tady stačí vlastní stav pole
  return changed;
}
function hwxProgress(map, t) {            // přehled po dálnicích: počty polí a čas dokončení
  const by = {};
  for (const [k, h] of map.hwx) for (const id of h.ids) {
    const r = by[id] || (by[id] = { built: 0, cons: 0, plan: 0, done: 0 });
    r[h.st]++; if (h.st0 !== 'built') r.done = Math.max(r.done, h.t1);
  }
  return by;
}

function hwxValidate(map) {
  const bad = [];
  const checkCell = (cell, mask, what) => {
    const arms = hwxArms(mask), n = arms.length;
    if (n > CFG.MAX_ARMS) bad.push(what + ' ' + cellKey(cell) + ': víc než ' + CFG.MAX_ARMS + ' ramena');
    if (cell.t === 's') { if (n !== 2 || oppositeEdge(cell, arms[0]) !== arms[1]) if (n) bad.push(what + ' ' + cellKey(cell) + ': čtvereček jen rovně'); }
    else if (n === 2 && angleBetween(cell, arms[0], arms[1]) < 90) bad.push(what + ' ' + cellKey(cell) + ': zatáčka ostřejší než 90°');
  };
  for (const [k, h] of map.hwx) checkCell(cellFromKey(k), h.mask, 'dálnice');
  for (const [k, m] of map.preRoads) checkCell(cellFromKey(k), m, 'silnice');
  return bad;
}


// Chráněné pole: dálnice a státní silnice u Prahy hráč nesmí stavět ani bourat.
function hwxProtected(map, cell) { return !!map && ((!!hwxAt(map, cell) && !hwAt(map, cell)) || (!!map.preRoads && map.preRoads.has(cellKey(cell)))); }

// ---------- kreslení (světové souřadnice po applyTransformOff) ----------
function hwxPolys(cell, h) {
  const arms = hwxArms(h.mask).filter(k => k < edgeCount(cell)), ctr = cellCenter(cell);
  if (arms.length === 2) return [roadPoly(cell, arms[0], arms[1])];
  return arms.map(k => [edgePos(cell, k), { x: ctr.x, y: ctr.y }]);
}
function drawHwxCell(ctx, cell, h) {
  const S = CFG.S, polys = hwxPolys(cell, h), C = HWC.COLOR;
  const stroke = (pts, w, col, dash) => {
    ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y));
    ctx.lineWidth = w * S; ctx.strokeStyle = col; ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    ctx.setLineDash(dash ? [dash[0] * S, dash[1] * S] : []); ctx.stroke(); ctx.setLineDash([]);
  };
  const smooth = pts => pts.length > 2 ? pts : resamplePoly(pts, PATHN * 2);
  if (h.st === 'plan') {                                       // plánovaná: jen čárkovaný obrys trasy
    for (const p of polys) { stroke(p, 1.0, 'rgba(255,255,255,0.10)'); stroke(p, 0.05, 'rgba(255,214,120,0.75)', [0.22, 0.2]); }
    return;
  }
  const ctr = cellCenter(cell);
  if (h.taper !== undefined && h.st === 'built' && hwxArms(h.mask).length === 2) {
    const ar = hwxArms(h.mask), hwA = ar.find(a => a !== h.taper), hp = [edgePos(cell, hwA), { x: ctr.x, y: ctr.y }], rp = [{ x: ctr.x, y: ctr.y }, edgePos(cell, h.taper)];
    stroke(hp, 1.0, C.shoulder); stroke(hp, 1.0 - 2 * HWC.SHOULDER, C.asphalt);
    { const r = resamplePoly(hp, PATHN); stroke(r, HWC.MEDIAN, C.barrier); for (const sg of [-1, 1]) stroke(offsetRight(r, sg * (HWC.MEDIAN / 2 + HWC.LANEW) * S), 0.014, C.mark, [0.18, 0.14]); }
    stroke(rp, 0.46, C.asphalt); stroke(smooth(rp), 0.012, '#e9c44c', [0.14, 0.12]);
    return;
  }
  for (const p of polys) stroke(p, 1.0, C.shoulder);
  for (const p of polys) stroke(p, 1.0 - 2 * HWC.SHOULDER, h.st === 'cons' ? '#6b5f4a' : C.asphalt);
  if (polys.length > 1) { ctx.beginPath(); ctx.arc(ctr.x, ctr.y, 0.5 * S - HWC.SHOULDER * S, 0, Math.PI * 2); ctx.fillStyle = h.st === 'cons' ? '#6b5f4a' : C.asphalt; ctx.fill(); }
  if (h.st === 'cons') { for (const p of polys) stroke(p, 0.07, '#ffb43a', [0.16, 0.16]); return; }
  for (const p of polys) {
    const rp = resamplePoly(p, PATHN);
    stroke(rp, HWC.MEDIAN, C.barrier);
    for (const sg of [-1, 1]) stroke(offsetRight(rp, sg * (HWC.MEDIAN / 2 + HWC.LANEW) * S), 0.014, C.mark, [0.18, 0.14]);
    for (const sg of [-1, 1]) stroke(offsetRight(rp, sg * (0.5 - HWC.SHOULDER) * S), 0.016, C.mark);
  }
}

// ---------- graf tras: hotové úseky dálnice. Uzly 'H…' se nespojí s hráčovými silnicemi, kromě napojení u Prahy
// (hrana taper = společný uzel se státní silnicí) a nájezdů v rovných polích. ----------
function hwxLinkGraph(map, net, getNode, enode, link) {
  for (const [k, h] of map.hwx) {
    if (h.st !== 'built') continue;
    const cell = cellFromKey(k), arms = hwxArms(h.mask).filter(a => a < edgeCount(cell)), ctr = cellCenter(cell);
    const hn = e => { if (h.taper === e || (h.joins && h.joins.includes(e))) return enode(cell, e); const p = edgePos(cell, e); return getNode('H' + edgeNodeId(cell, e), p.x, p.y); };
    if (hwAt(map, cell) && arms.length === 2 && hwAt(map, cell).dir !== 'c') {
      const C = getNode('HC' + k, ctr.x, ctr.y), na = hn(arms[0]), nb = hn(arms[1]);
      link(na, C, [{ x: na.x, y: na.y }, { x: ctr.x, y: ctr.y }]); link(C, nb, [{ x: ctr.x, y: ctr.y }, { x: nb.x, y: nb.y }]);
      const rec = net.get(cell);                                         // nájezd: jediné rameno silnice do středu
      if (rec && rec.road && !rec.rail.length) { const ra = armsOf(rec.road); if (ra.length === 1) { const e = enode(cell, ra[0]); link(e, C, [{ x: e.x, y: e.y }, { x: ctr.x, y: ctr.y }]); } }
    } else if (arms.length === 2) { const na = hn(arms[0]), nb = hn(arms[1]); link(na, nb, roadPoly(cell, arms[0], arms[1])); }
    else if (arms.length > 2) { const C = getNode('HC' + k, ctr.x, ctr.y); for (const e of arms) { const n = hn(e); link(n, C, [{ x: n.x, y: n.y }, { x: ctr.x, y: ctr.y }]); } }
  }
}
