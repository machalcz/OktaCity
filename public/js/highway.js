// Dálnice (ALFA 0.4). Dálnici hráč nestaví: je dána mapou a postupně se dostavuje.
//
// Data:    map.hw = Map('c,r' -> { dir: 'h' | 'v' })  – osmiúhelník, kterým dálnice vede rovně
//          'h' = hrany 0–4 (východ–západ), 'v' = hrany 2–6 (sever–jih). Šířka dálnice = 1 hrana (S).
// Průřez dálnice (násobky S, od osy):  svodidlo 0,06 | 2 pruhy po 0,20 v každém směru | krajnice 0,07
//          středy pruhů 0,13 (vnitřní) a 0,33 (vnější). Silnice má 1 pruh v každém směru (0,5 = půlka dálnice).
//
// PŘEMOSTĚNÍ (silnice nebo kolej přes dálnici):
//   • samotný MOST je jedno pole s dálnicí (rovná mostovka z hrany na protilehlou hranu, kolmo nebo šikmo o 45°);
//   • na mostě je vždy jen jedna stavba (silnice NEBO kolej), žádné násobné mosty;
//   • RAMPA vede přes sousední pole (u šikmého mostu přes čtvereček a další osmiúhelník). Rampa smí být i do
//     oblouku, ale je to jediná trasa: žádná odbočka, křižovatka ani křížení. Dokud je rampa potřeba, pole je
//     rezervované pro ni. Výška rampy se plynule zvedá z terénu na mostovku (S-křivka), vozidla se naklánějí.
// NAPOJENÍ (jen silnice): jedno rameno od boční hrany ke STŘEDU pole s dálnicí, dělí se na nájezd a sjezd.

const HWC = {
  W: 1.0, MEDIAN: 0.06, SHOULDER: 0.07, LANEW: 0.20,
  LANES: [0.13, 0.33],
  H: 0.42,            // výška mostovky nad terénem (násobek S); pod ní projede nákladní auto
  DECK: 0.07,         // tloušťka desky
  COLOR: { asphalt: '#383b40', shoulder: '#9aa0a7', barrier: '#7d838a', mark: '#f1f1ee', wall: '#8a7f66', slab: '#b4ada1', slabSide: '#6f695f', shadow: 'rgba(0,0,0,0.28)' }
};
const RAIL_HB = 0.11;     // výška štěrkového lože

function hwAt(map, cell) {
  if (!map || !map.hw || !cell || cell.t !== 'o') return null;
  return map.hw.get(cell.c + ',' + cell.r) || null;
}
function hwSet(map, list) {                // list = [[c, r, 'h'|'v'], ...]
  map.hw = new Map();
  for (const [c, r, dir] of list) map.hw.set(c + ',' + r, { dir });
  if (map.trees) map.trees = map.trees.filter(t => {      // pás kolem dálnice bez stromů
    for (const [c, r] of list) if (Math.abs(t.x - c * A) <= AP + 0.3 * CFG.S && Math.abs(t.y - r * A) <= 1.3 * CFG.S) return false;
    return true;
  });
}
// dir: 'h' východ–západ (hrany 0–4) | 'v' sever–jih (2–6) | 'a' šikmo (1–5) | 'b' šikmo (3–7) | 'c' zatáčka (hw.arms = dvě hrany)
const HW_PAR = { h: [0, 4], v: [2, 6], a: [1, 5], b: [3, 7] }, HW_SIDE = { h: [2, 6], v: [0, 4], a: [3, 7], b: [1, 5] };
function hwParallel(hw, k) { return hw.dir === 'c' ? hw.arms.includes(k) : HW_PAR[hw.dir].includes(k); }
function hwSideEdge(hw, k) { return hw.dir !== 'c' && HW_SIDE[hw.dir].includes(k); }
function hwDirVec(hw) { const a = { h: 0, v: Math.PI / 2, a: Math.PI / 4, b: 3 * Math.PI / 4 }[hw.dir] || 0; return { x: Math.cos(a), y: -Math.sin(a) }; }
// Kříží osa mostu (úsečka z hrany a na hranu b) dálnici v poli? Rovné dílky: vždy. Zatáčka: jen když úsečka protne její oblouk.
function hwCrosses(hw, cell, a, b) {
  if (hw.dir !== 'c') return true;
  const p = edgePos(cell, a), q = edgePos(cell, b), poly = roadPoly(cell, hw.arms[0], hw.arms[1]);
  const cr = (o, u, v) => (u.x - o.x) * (v.y - o.y) - (u.y - o.y) * (v.x - o.x);
  for (let i = 0; i < poly.length - 1; i++) {
    const r = poly[i], t = poly[i + 1];
    if (cr(p, q, r) * cr(p, q, t) <= 0 && cr(r, t, p) * cr(r, t, q) <= 0) return true;
  }
  return false;
}
function hwRecKind(rec) { return rec.road ? 'road' : 'rail'; }
function hwRecMask(rec) { return (rec.road | 0) | railMaskOf(rec.rail || []); }

// Co stojí v poli s dálnicí: 'bridge' (přemostění) | 'junction' (napojení) | null
function hwStructure(map, cell, rec) {
  if (!hwAt(map, cell) || !rec) return null;
  if (rec.rail && rec.rail.length) return 'bridge';
  if (!rec.road) return null;
  return countBits(rec.road) === 1 ? 'junction' : 'bridge';
}
function hwIsBridge(map, cell, rec) { return !!rec && !!hwAt(map, cell) && hwStructure(map, cell, rec) === 'bridge'; }

// ---------- rampy: které dlaždice patří k mostu ----------
// Rampa vede za ramenem e mostu B přes sousední pole, dokud její délka nedosáhne RAMP_MIN (kolmý most: 2 osmiúhelníky,
// šikmý most: čtvereček + osmiúhelník + čtvereček). Na tomhle úseku je jediná trasa (smí být i oblouk).
const RAMP_MIN = 1.6 * A;
function hwChain(B, e) {
  const out = [];
  let cur = neighborAcross(B, e), len = 0;
  for (let n = 0; n < 4; n++) {
    out.push({ cell: cur.cell, k: cur.k, depth: n + 1 });
    len += cur.cell.t === 's' ? CFG.S : A;
    if (len >= RAMP_MIN || !cellExists(cur.cell)) break;
    cur = neighborAcross(cur.cell, oppositeEdge(cur.cell, cur.k));
  }
  return out;
}
// Je dlaždice `cell` rampou existujícího mostu? Vrací { B, rec, e (hrana dlaždice směrem k mostu), depth } nebo null.
function hwZoneOf(map, net, cell) {
  if (!map.hw || !map.hw.size) return null;
  for (let k = 0; k < edgeCount(cell); k++) {
    let cur = neighborAcross(cell, k);
    for (let n = 0; n < 4 && cellExists(cur.cell); n++) {
      if (hwAt(map, cur.cell)) {
        const rec = net.get(cur.cell);
        if (hwIsBridge(map, cur.cell, rec) && ((hwRecMask(rec) >> cur.k) & 1)) {
          const ch = hwChain(cur.cell, cur.k);
          const hit = ch.find(t => sameCell(t.cell, cell));
          if (hit) return { B: cur.cell, rec, e: hit.k, depth: hit.depth, n: ch.length };
        }
        break;
      }
      if (cur.cell.t === 'o' && tokenAt(map, cur.cell)) break;
      cur = neighborAcross(cur.cell, oppositeEdge(cur.cell, cur.k));
    }
  }
  return null;
}
// Kontrola pole rampy při stavbě (volá checkPair). Vrací fail(...) nebo null.
function hwZoneCheck(map, net, cell, kind, a, b, zone) {
  const bk = hwRecKind(zone.rec);
  if (kind !== bk) return fail(bk === 'road' ? 'Tady je rampa silničního mostu přes dálnici – koleje sem nepatří' : 'Tady je rampa železničního mostu přes dálnici – silnice sem nepatří');
  if (a === CENTER || b === CENTER) return fail('Rampa mostu nesmí mít odbočku ani křižovatku');
  if (a !== zone.e && b !== zone.e) return fail('Pole u mostu přes dálnici je rampa – musí na most navazovat');
  if (zone.depth < zone.n && !isOpposite(cell, a, b)) return fail('Rampa je rovná; zatáčet smí až její poslední pole');
  const rec = net.get(cell);
  if (rec && (rec.road || rec.rail.length)) return fail('Rampa mostu je jediná trasa – bez křižovatky a křížení');
  return null;
}
// Je za ramenem e mostu B (vedoucího přes pole `B`) místo na rampu? Vrací text důvodu nebo null.
function hwChainCheck(map, net, B, e, kind) {
  for (const t of hwChain(B, e)) {
    if (!cellExists(t.cell)) return 'rampa by vedla mimo mapu';
    if (!isLandCell(map, t.cell)) return 'rampa potřebuje souš';
    if (tokenAt(map, t.cell)) return 'rampě stojí v cestě město nebo průmysl';
    if (hwAt(map, t.cell) || (typeof hwxAt === 'function' && hwxAt(map, t.cell))) return 'rampa nemůže vést po dálnici';
    const z = hwZoneOf(map, net, t.cell);
    if (z && !sameCell(z.B, B)) return 'rampy dvou mostů se překrývají';
    const rec = net.get(t.cell);
    if (rec) {
      const arms = armsOf(hwRecMask(rec));
      const k2 = rec.road ? 'road' : 'rail';
      if (k2 !== kind || (rec.road && rec.rail.length) || arms.length !== 2 || !arms.includes(t.k)) return 'pole pro rampu musí být volné (bez křižovatky a cizí trasy)';
      if (t.depth < hwChain(B, e).length && oppositeEdge(t.cell, t.k) !== arms.find(x => x !== t.k)) return 'rampa je rovná, zatáčet smí až její poslední pole';
    }
  }
  return null;
}

// ---------- pravidla stavby v poli s dálnicí ----------
function hwCheckPair(map, net, cell, kind, a, b, hw) {
  const hx = typeof hwxAt === 'function' ? hwxAt(map, cell) : null, hst = hx ? hx.st : hw.st;
  if (hst && hst !== 'built') return fail(hst === 'cons' ? 'Dálnice je ve výstavbě – napojit ani přemostit ji půjde až po dokončení' : 'Dálnice je teprve plánovaná – napojit ani přemostit ji půjde až po dokončení stavby');
  const rec = net.get(cell) || emptyRec();
  if (rec.road || rec.rail.length) return fail('V poli s dálnicí už stavba je – nejdřív ji zbourej');
  for (const id of [a, b]) {
    if (id !== CENTER && edgeBlocked(map, net, cell, id, kind)) return fail('Tahle hrana navazuje na jiný druh dopravy (silnice × koleje)');
    if (id !== CENTER && hwParallel(hw, id)) return fail('Tady vede dálnice – silnice ani koleje po ní vést nemohou');
  }
  if (a === CENTER || b === CENTER) {
    if (hw.dir === 'c') return fail('Na zatáčku dálnice se napojit nedá – jde ji jen přemostit');
    if (kind !== 'road') return fail('Na dálnici se napojit koleje nesmějí – železnice ji může jen přejet mostem');
    const x = a === CENTER ? b : a;
    if (!hwSideEdge(hw, x)) return fail('Silnice se na dálnici napojuje jen z boku, kolmo (rovná hrana)');
    return { ok: true, next: { road: 1 << x, rail: [] } };
  }
  if (!isOpposite(cell, a, b)) return fail(hw.dir === 'c' ? 'Přes zatáčku dálnice jen rovný most: spoj protilehlé hrany' : 'Přes dálnici jen rovný most: spoj protilehlé hrany (nebo napoj silnici na střed)');
  if (!hwCrosses(hw, cell, a, b)) return fail('Most musí dálnici přejet – tahle dvojice hran vede vedle zatáčky');
  for (const e of [a, b]) {
    const why = hwChainCheck(map, net, cell, e, kind);
    if (why) return fail('Na přemostění dálnice je potřeba prostor: ' + why);
  }
  if (kind === 'road') return { ok: true, next: { road: (1 << a) | (1 << b), rail: [] } };
  return { ok: true, next: { road: 0, rail: [[a, b]] } };
}

function hwValidRec(hw, cell, rec) {
  const road = rec.road | 0, rail = rec.rail || [];
  if (road && rail.length) return null;
  const arms = armsOf(road || railMaskOf(rail));
  if (arms.some(k => hwParallel(hw, k))) return null;
  if (road) {
    if (arms.length === 1) return hwSideEdge(hw, arms[0]) ? { road, rail: [] } : null;
    if (arms.length === 2 && oppositeEdge(cell, arms[0]) === arms[1]) return { road, rail: [] };
    return null;
  }
  if (rail.length === 1 && rail[0][1] !== C8 && oppositeEdge(cell, rail[0][0]) === rail[0][1]) return { road: 0, rail };
  return null;
}

// ---------- dálnice na zemi (kreslí se ve světových souřadnicích, po applyTransformOff) ----------
function drawHwBase(ctx, cell, hw) {
  if (hw.dir === 'c') { drawHwxCell(ctx, cell, { mask: (1 << hw.arms[0]) | (1 << hw.arms[1]), st: hw.st || 'built' }); return; }
  if (hw.st && hw.st !== 'built') { const hh = hwxAt(state.map, cell); if (hh) { drawHwxCell(ctx, cell, hh); return; } }
  const S = CFG.S, C = HWC.COLOR, ctr = cellCenter(cell);
  const d = hwDirVec(hw), n = { x: -d.y, y: d.x }, ext = AP + 0.03 * S;
  const band = (o0, o1, col) => {
    ctx.beginPath();
    ctx.moveTo(ctr.x - d.x * ext + n.x * o0 * S, ctr.y - d.y * ext + n.y * o0 * S);
    ctx.lineTo(ctr.x + d.x * ext + n.x * o0 * S, ctr.y + d.y * ext + n.y * o0 * S);
    ctx.lineTo(ctr.x + d.x * ext + n.x * o1 * S, ctr.y + d.y * ext + n.y * o1 * S);
    ctx.lineTo(ctr.x - d.x * ext + n.x * o1 * S, ctr.y - d.y * ext + n.y * o1 * S);
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  };
  const line = (o, w, col, dash) => {
    ctx.beginPath();
    ctx.moveTo(ctr.x - d.x * ext + n.x * o * S, ctr.y - d.y * ext + n.y * o * S);
    ctx.lineTo(ctr.x + d.x * ext + n.x * o * S, ctr.y + d.y * ext + n.y * o * S);
    ctx.lineWidth = w * S; ctx.strokeStyle = col; ctx.setLineDash(dash ? [dash[0] * S, dash[1] * S] : []); ctx.lineCap = 'butt'; ctx.stroke(); ctx.setLineDash([]);
  };
  band(-0.5, 0.5, C.shoulder);
  band(-0.5 + HWC.SHOULDER, 0.5 - HWC.SHOULDER, C.asphalt);
  band(-HWC.MEDIAN / 2, HWC.MEDIAN / 2, C.barrier);
  for (const sg of [-1, 1]) {
    line(sg * (0.5 - HWC.SHOULDER), 0.016, C.mark);
    line(sg * (HWC.MEDIAN / 2 + HWC.LANEW), 0.014, C.mark, [0.18, 0.14]);
  }
}

// ---------- napojení silnice na dálnici ----------
function hwJunctionGeom(cell, hw, rec) {
  const S = CFG.S, ctr = cellCenter(cell), arm = armsOf(rec.road)[0];
  const ang = edgeAngle(cell, arm), w = { x: Math.cos(ang), y: -Math.sin(ang) };
  const tw = { x: w.y, y: -w.x };
  const P = (a, b) => ({ x: ctr.x + (w.x * a + tw.x * b) * S, y: ctr.y + (w.y * a + tw.y * b) * S });
  const aJ = 0.95, aL = HWC.LANES[1], lane = 0.10;
  const aA = 0.66;              // přidávací pruh: vedle krajnice dálnice
  const b1 = 0.60, b2 = 1.9, b3 = 3.4;   // konec oblouku od silnice | konec rovného přidávacího pruhu | konec zaústění do vnějšího pruhu
  const bez = (p0, p1, p2, p3, n) => { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; o.push({ x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x, y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y }); } return o; };
  const lin = (p0, p1, n) => { const o = []; for (let i = 0; i <= n; i++) o.push({ x: p0.x + (p1.x - p0.x) * i / n, y: p0.y + (p1.y - p0.y) * i / n }); return o; };
  const A1 = bez(P(aJ, lane), P(aJ - 0.30, lane), P(aA, b1 - 0.40), P(aA, b1), 14);    // silnice -> přidávací pruh
  const A2 = lin(P(aA, b1), P(aA, b2), 10);                                              // rovný přidávací pruh
  const A3 = bez(P(aA, b2), P(aA, b2 + 0.70), P(aL, b3 - 0.70), P(aL, b3), 18);           // zaústění do vnějšího pruhu dálnice
  const entry = A1.concat(A2.slice(1), A3.slice(1));
  // sjezd = zrcadlově: z vnějšího pruhu postupně do odbočovacího pruhu, pak oblouk k silnici (směr jízdy +tw)
  const mir = pts => pts.slice().reverse().map(q => { const a = ((q.x - ctr.x) * w.x + (q.y - ctr.y) * w.y) / S, b = ((q.x - ctr.x) * tw.x + (q.y - ctr.y) * tw.y) / S; return P(a, -b); });
  const exit = mir(entry);
  return { ctr, w, tw, P, entry, exit, D: P(aJ, 0), edge: P(AP / S, 0), aJ, aL, aA, bR: b3, bTaper0: b2, bTaper1: b3, lane };
}

function drawHwJunction(ctx, cell, hw, rec) {
  const S = CFG.S, G = hwJunctionGeom(cell, hw, rec);
  const tn = OWN_TINT.road.length ? OWN_TINT.road[0] : CFG.COLOR.kerb;
  const stroke = (pts, wd, col, dash) => {
    ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y));
    ctx.lineWidth = wd * S; ctx.strokeStyle = col; ctx.lineCap = 'butt'; ctx.lineJoin = 'round'; ctx.setLineDash(dash ? [dash[0] * S, dash[1] * S] : []); ctx.stroke(); ctx.setLineDash([]);
  };
  const outside = pts => pts.filter(q => ((q.x - G.ctr.x) * G.w.x + (q.y - G.ctr.y) * G.w.y) / S >= 0.52);
  const stem = [G.edge, G.D];
  stroke(stem, CFG.KERB, tn);
  stroke(outside(G.entry), 0.30, tn); stroke(outside(G.exit), 0.30, tn);
  stroke(stem, CFG.ASPHALT, CFG.COLOR.asphalt);
  stroke(G.entry, 0.22, CFG.COLOR.asphalt); stroke(G.exit, 0.22, CFG.COLOR.asphalt);
  stroke(stem, 0.03, CFG.COLOR.line, [0.2, 0.15]);
  ctx.beginPath(); ctx.arc(G.D.x, G.D.y, 0.045 * S, 0, Math.PI * 2); ctx.fillStyle = CFG.COLOR.line; ctx.fill();
  return G;
}

// ====================== MOST A RAMPY ======================
function hwEase(f) { f = Math.max(0, Math.min(1, f)); return f * f * (3 - 2 * f); }
function hwVZ() { return CFG.S * state.cam.zoom * viewK(); }
function hwPt(x, y, h) { const p = w2s(x, y, true); return { x: p.x, y: p.y - (h || 0) * hwVZ() }; }
function hwPoly(ctx, pts, fill, stroke, lw) {
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lw || 1; ctx.strokeStyle = stroke; ctx.stroke(); }
}

// Mostovka v poli s dálnicí: osa z hrany na protilehlou hranu.
function hwBridgeGeom(cell, hw, rec) {
  const ctr = cellCenter(cell), isRoad = rec.road !== 0;
  const arms = armsOf(hwRecMask(rec)), a = edgeAngle(cell, arms[0]);
  const c = { x: Math.cos(a), y: -Math.sin(a) };
  return { ctr, c, n: { x: -c.y, y: c.x }, isRoad, wideE: (isRoad ? CFG.KERB : CFG.RAIL.BALLAST) / 2 + 0.04, H: HWC.H };
}

// Trasa v dlaždici rampy: od hrany e (u mostu) k druhému ramenu. Vrací { pts, nor, cum, L } nebo null.
function hwTilePath(cell, rec, e) {
  const arms = armsOf(hwRecMask(rec));
  if (arms.length !== 2 || !arms.includes(e)) return null;
  const other = arms[0] === e ? arms[1] : arms[0];
  const tr = sampleTrack(cell, e, other, 14);
  const cum = [0];
  for (let i = 1; i < tr.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(tr.pts[i].x - tr.pts[i - 1].x, tr.pts[i].y - tr.pts[i - 1].y));
  return { pts: tr.pts, nor: tr.nor, cum, L: cum[cum.length - 1], e, other };
}

// Rampy všech mostů (cache podle verze sítě). m: klíč dlaždice -> popis trasy a výšky.
function hwRamps(map, net) {
  const hv = map.hw ? map.hw.size : 0;
  let C = map._hwR;
  if (C && C.ver === net.ver && C.hv === hv) return C;
  C = { ver: net.ver, hv, m: new Map(), bridges: [], chains: new Map() };
  if (map.hw) for (const [k, hw] of map.hw) {
    const cell = mkO(...k.split(',').map(Number)), rec = net.get(cell);
    if (!hwIsBridge(map, cell, rec)) continue;
    C.bridges.push({ cell, hw, rec });
    for (const e of armsOf(hwRecMask(rec))) {
      const chain = hwChain(cell, e);
      const geos = chain.map(t => {
        const r = cellExists(t.cell) ? net.get(t.cell) : null;
        if (!r || hwAt(map, t.cell) || hwRecKind(r) !== hwRecKind(rec)) return null;
        const g = hwTilePath(t.cell, r, t.k); if (g) g.rec = r;
        return g;
      });
      const Ls = chain.map((t, i) => geos[i] ? geos[i].L : (t.cell.t === 's' ? CFG.S : A));
      const D = Ls.reduce((x, y) => x + y, 0);
      let d0 = 0;
      chain.forEach((t, i) => {
        const g = geos[i];
        if (g) {
          g.chain = cellKey(cell) + ':' + e; if (!C.chains.has(g.chain)) C.chains.set(g.chain, []); C.chains.get(g.chain).push(g);
          g.d0 = d0; g.D = D; g.bridge = cell; g.cell = t.cell; g.kind = hwRecKind(rec); g.key = cellKey(t.cell);
          g.hs = g.pts.map((p, j) => HWC.H * hwEase(1 - (d0 + g.cum[j]) / D));
          C.m.set(g.key, g);
        }
        d0 += Ls[i];
      });
    }
  }
  map._hwR = C;
  return C;
}
function hwIsRamp(map, net, cell) { return !!map.hw && map.hw.size > 0 && hwRamps(map, net).m.has(cellKey(cell)); }

function hwNearest(g, x, y) {
  let best = 1e18, s = 0, seg = 0;
  for (let i = 0; i < g.pts.length - 1; i++) {
    const p = g.pts[i], q = g.pts[i + 1], dx = q.x - p.x, dy = q.y - p.y, L2 = dx * dx + dy * dy;
    let t = L2 > 0 ? ((x - p.x) * dx + (y - p.y) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
    const d = (x - p.x - dx * t) ** 2 + (y - p.y - dy * t) ** 2;
    if (d < best) { best = d; s = g.cum[i] + t * Math.sqrt(L2); seg = i; }
  }
  return { s, seg, d: Math.sqrt(best) };
}

// Výška terénu pro vozidla (násobek S): rampa se plynule zvedá, na mostovce je HWC.H. Dálniční vozidla ji nepoužívají.
function hwZAt(map, net, x, y) {
  if (!map.hw || !map.hw.size) return 0;
  const R = hwRamps(map, net); if (!R.bridges.length) return 0;
  const c = hitTest(x, y); if (!c) return 0;
  if (hwAt(map, c)) {
    const rec = net.get(c); if (!hwIsBridge(map, c, rec)) return 0;
    const G = hwBridgeGeom(c, hwAt(map, c), rec);
    const s = (x - G.ctr.x) * G.n.x + (y - G.ctr.y) * G.n.y;
    return Math.abs(s) <= (G.wideE + 0.1) * CFG.S ? HWC.H : 0;
  }
  const g = R.m.get(cellKey(c)); if (!g) return 0;
  const q = hwNearest(g, x, y);
  return HWC.H * hwEase(1 - (g.d0 + q.s) / g.D);
}
function hwGroundZ(map, net, x, y) { return hwZAt(map, net, x, y); }
function hwPitchAt(map, net, x, y, ang) {
  const e = 0.3 * CFG.S, cx = Math.cos(ang), sy = Math.sin(ang);
  return Math.atan((hwZAt(map, net, x + cx * e, y + sy * e) - hwZAt(map, net, x - cx * e, y - sy * e)) / 0.6);
}
// Nastaví výšku a sklon vozidla podle terénu (rampy, most). fr = { x, y, c, s, zb, vs }.
function hwVehFrame(fr, x, y, ang) {
  const map = state.map;
  if (!map.hw || !map.hw.size) return fr;
  const R = hwRamps(map, state.net); if (!R.bridges.length) return fr;
  const c = hitTest(x, y); if (!c) return fr;
  if (!hwAt(map, c) && !R.m.has(cellKey(c))) {
    // těsně před rampou: sklon už může být nenulový, jinak nic
    const p0 = hwPitchAt(map, state.net, x, y, ang); if (Math.abs(p0) < 1e-4) return fr;
  }
  fr.zr = hwZAt(map, state.net, x, y);
  const p = hwPitchAt(map, state.net, x, y, ang);
  fr.cp = Math.cos(p); fr.sp = Math.sin(p);
  return fr;
}

// ---------- kreslení pásu (mostovka nebo rampa) po kouscích ----------
// st = { kind, pts[], nor[], hs[], cum[], slab, rec, cap, deckKey, deckMid }
function hwBuildPieces(st) {
  const S = CFG.S, C = HWC.COLOR, isRoad = st.kind === 'road', off = isRoad ? 0 : RAIL_HB;
  const wideE = (isRoad ? CFG.KERB : CFG.RAIL.BALLAST) / 2 + 0.04;
  const { pts, nor, hs, cum } = st, n = pts.length;
  const top = hs.map(h => h + off);
  const Wa = (i, o, hh) => hwPt(pts[i].x + nor[i].x * o * S, pts[i].y + nor[i].y * o * S, hh);
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const j = i + 1, mx = (pts[i].x + pts[j].x) / 2, my = (pts[i].y + pts[j].y) / 2, gy = hwPt(mx, my, 0).y;
    const yk = st.slab ? st.deckKey + (gy - st.deckMid) * 1e-3 : gy;
    out.push({ y: yk, i, fn: ctx => {
      ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'butt'; setTint(st.rec);
      const poly = (a, b, c, d, col) => hwPoly(ctx, [a, b, c, d], col);
      const Q = (o0, o1, hi, hj, col) => poly(Wa(i, o0, hi), Wa(j, o0, hj), Wa(j, o1, hj), Wa(i, o1, hi), col);
      const lit = sd => { const pn = projDelta(nor[i].x * sd, nor[i].y * sd), L = Math.hypot(pn.x, pn.y) || 1; return 0.72 + 0.20 * (-pn.x / L) + 0.07 * (pn.y / L); };
      // čelo opěry u mostu (jen rampa, první kousek)
      if (st.cap && i === 0) {
        const tx = pts[1].x - pts[0].x, ty = pts[1].y - pts[0].y, pn = projDelta(-tx, -ty);
        if (pn.y > 0.001) poly(Wa(0, -wideE, 0), Wa(0, wideE, 0), Wa(0, wideE, top[0]), Wa(0, -wideE, top[0]), shade('#7d7360', 0.85));
      }
      // boky: nejdřív vzdálenější
      const sides = [-1, 1].map(sd => ({ sd, y: Wa(i, sd * wideE, 0).y + Wa(j, sd * wideE, 0).y })).sort((p, q) => p.y - q.y);
      for (const s of sides) {
        const w = s.sd * wideE;
        if (st.slab) poly(Wa(i, w, hs[i] - HWC.DECK + off), Wa(j, w, hs[j] - HWC.DECK + off), Wa(j, w, top[j]), Wa(i, w, top[i]), shade(C.slabSide, lit(s.sd) * 1.1));
        else poly(Wa(i, w, 0), Wa(j, w, 0), Wa(j, w, top[j]), Wa(i, w, top[i]), shade(C.wall, lit(s.sd)));
      }
      Q(-wideE, wideE, top[i], top[j], st.slab ? C.slab : shade(C.wall, 1.05));
      const lerp = s => {
        const t = (s - cum[i]) / ((cum[j] - cum[i]) || 1);
        let nx = nor[i].x + (nor[j].x - nor[i].x) * t, ny = nor[i].y + (nor[j].y - nor[i].y) * t; const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
        return { x: pts[i].x + (pts[j].x - pts[i].x) * t, y: pts[i].y + (pts[j].y - pts[i].y) * t, nx, ny, h: top[i] + (top[j] - top[i]) * t };
      };
      const strip = (s0, s1, o0, o1, dh, col) => {
        const a = lerp(s0), b = lerp(s1), P = (q, o) => hwPt(q.x + q.nx * o * S, q.y + q.ny * o * S, q.h + dh);
        hwPoly(ctx, [P(a, o0), P(b, o0), P(b, o1), P(a, o1)], col);
      };
      if (isRoad) {
        const tn = OWN_TINT.road.length ? OWN_TINT.road[0] : CFG.COLOR.kerb;
        Q(-CFG.KERB / 2, CFG.KERB / 2, top[i], top[j], tn);
        Q(-CFG.ASPHALT / 2, CFG.ASPHALT / 2, top[i], top[j], CFG.COLOR.asphalt);
        const per = 0.35 * S, k0 = Math.floor(cum[i] / per), k1 = Math.floor(cum[j] / per);
        for (let k = k0; k <= k1; k++) { const sa = Math.max(cum[i], k * per), sb = Math.min(cum[j], k * per + 0.2 * S); if (sb > sa) strip(sa, sb, -0.015, 0.015, 0.004, CFG.COLOR.line); }
        if (Math.max(top[i], top[j]) > 0.05) for (const sd of [-1, 1]) {
          const o = sd * (CFG.KERB / 2 - 0.01);
          poly(Wa(i, o, top[i]), Wa(j, o, top[j]), Wa(j, o, top[j] + 0.07), Wa(i, o, top[i] + 0.07), '#4a4036');
        }
      } else {
        const R = CFG.RAIL;
        Q(-R.BALLAST / 2, R.BALLAST / 2, top[i], top[j], OWN_TINT.rail || CFG.COLOR.ballastEdge);
        Q(-R.BALLAST / 2 + 0.03, R.BALLAST / 2 - 0.03, top[i], top[j], CFG.COLOR.ballast);
        const step = R.SLEEPER_STEP * S, k0 = Math.floor(cum[i] / step), k1 = Math.floor(cum[j] / step);
        for (let k = k0; k <= k1; k++) { const sa = (k + 0.5) * step - 0.025 * S, sb = sa + 0.05 * S; if (sa >= cum[i] && sb <= cum[j]) strip(sa, sb, -(R.BALLAST / 2 - 0.05), R.BALLAST / 2 - 0.05, 0.012, CFG.COLOR.sleeper); }
        for (const sd of [-1, 1]) Q(sd * R.GAUGE / 2 - 0.015, sd * R.GAUGE / 2 + 0.015, top[i] + 0.035, top[j] + 0.035, CFG.COLOR.railSteel);
      }
      clearTint(); ctx.restore();
    } });
  }
  return out;
}

// Mostovka (pole s dálnicí): rovný pás s konstantní výškou + stín na dálnici.
function hwDeckPieces(cell, hw, rec) {
  const S = CFG.S, G = hwBridgeGeom(cell, hw, rec), N = 8, pts = [], nor = [], hs = [], cum = [];
  for (let i = 0; i <= N; i++) { const t = -AP + 2 * AP * i / N; pts.push({ x: G.ctr.x + G.c.x * t, y: G.ctr.y + G.c.y * t }); nor.push(G.n); hs.push(HWC.H); cum.push(2 * AP * i / N); }
  let deckKey = -1e9;
  for (const t of [-AP, AP]) for (const sd of [-G.wideE, G.wideE]) deckKey = Math.max(deckKey, hwPt(G.ctr.x + G.c.x * t + G.n.x * sd * S, G.ctr.y + G.c.y * t + G.n.y * sd * S, 0).y);
  const deckMid = hwPt(G.ctr.x, G.ctr.y, 0).y;
  const pieces = hwBuildPieces({ kind: G.isRoad ? 'road' : 'rail', pts, nor, hs, cum, slab: true, rec, deckKey, deckMid });
  pieces.push({ y: -1e9, fn: ctx => {
    const q = (t, s) => hwPt(G.ctr.x + G.c.x * t + G.n.x * s * S + S * 0.12, G.ctr.y + G.c.y * t + G.n.y * s * S + S * 0.14, 0);
    hwPoly(ctx, [q(-AP, -G.wideE), q(AP, -G.wideE), q(AP, G.wideE), q(-AP, G.wideE)], HWC.COLOR.shadow);
  } });
  return { pieces, deckKey, G };
}
function hwRampPieces(g) {
  return { pieces: hwBuildPieces({ kind: g.kind, pts: g.pts, nor: g.nor, hs: g.hs, cum: g.cum, slab: false, rec: g.rec, cap: true }), g };
}
// Zachová starý název pro náhled stavby v render.js (jen mostovka).
function hwBridgePieces(cell, hw, rec) { return hwDeckPieces(cell, hw, rec); }

// Kousky všech mostů a ramp pro jeden snímek (cache se maže na začátku drawEntities).
function hwCached(key, make) {
  const m = window.__hwBr || (window.__hwBr = new Map());
  let v = m.get(key); if (!v) { v = make(); m.set(key, v); }
  return v;
}
function hwDeckCached(cell, hw, rec) { return hwCached('d' + cellKey(cell), () => hwDeckPieces(cell, hw, rec)); }
function hwRampCached(g) { return hwCached('r' + g.key, () => hwRampPieces(g)); }
function hwBridgeCached(cell, hw, rec) { return hwDeckCached(cell, hw, rec); }
function hwCollect(list, vr) {
  const map = state.map, R = hwRamps(map, state.net);
  const inV = c => { const q = cellCenter(c); return q.x >= vr.x0 && q.x <= vr.x1 && q.y >= vr.y0 && q.y <= vr.y1; };
  for (const B of R.bridges) if (inV(B.cell)) for (const pc of hwDeckCached(B.cell, B.hw, B.rec).pieces) list.push({ d: pc.y, fn: pc.fn });
  for (const g of R.m.values()) if (inV(g.cell)) for (const pc of hwRampCached(g).pieces) list.push({ d: pc.y, fn: pc.fn });
}

// Je bod (x, y) pod mostovkou (a tedy je tam vozidlo na dálnici skryté)?
function hwDeckCovers(cell, hw, rec, x, y) {
  const S = CFG.S, G = hwBridgeGeom(cell, hw, rec);
  const dx = x - G.ctr.x, dy = y - G.ctr.y;
  return Math.abs(dx * G.c.x + dy * G.c.y) <= AP + 0.2 * S && Math.abs(dx * G.n.x + dy * G.n.y) <= (G.wideE + 0.2) * S;
}
function hwCoveredAnywhere(map, net, x, y) {
  const c = hitTest(x, y); if (!c || !hwAt(map, c)) return false;
  const rec = net.get(c); if (!hwIsBridge(map, c, rec)) return false;
  return hwDeckCovers(c, hwAt(map, c), rec, x, y);
}
// Úprava právě přidaného vozidla v seznamu kreslení (řazení kolem mostů a ramp).
//  • vozidlo na dálnici (under): kus vozidla, který leží pod mostovkou, se kreslí PŘED mostovkou (ta ho překryje),
//    zbytek na svém místě. Rozdělení dělá ořez podle půdorysu mostovky (vytaženého do výšky vozidla), takže
//    auto, které je pod mostem jen zpola, se nikdy nevykreslí "na" mostě.
//  • vozidlo na rampě / mostě: kreslí se až za všechny kusy své rampy (resp. celého mostu), protože jede po jejich
//    povrchu – sousední (kamerou bližší) kus rampy ho tak nepřekryje. Mostovka z dálky ho překrývá dál správně.
function hwHull(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y), cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x), h = [];
  for (const q of p) { while (h.length >= 2 && cr(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop(); h.push(q); }
  const lo = h.length + 1;
  for (let i = p.length - 2; i >= 0; i--) { const q = p[i]; while (h.length >= lo && cr(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop(); h.push(q); }
  h.pop(); return h;
}
function hwPiecesMax(pcs) { let m = -1e18; for (const p of pcs) if (p.y > -1e8 && p.y > m) m = p.y; return m; }
function hwChainKey(R, chainId) {
  return hwCached('k' + chainId, () => { let m = -1e18; for (const g of (R.chains.get(chainId) || [])) m = Math.max(m, hwPiecesMax(hwRampCached(g).pieces)); return m; });
}
function hwDrawableFix(list, n0, x, y, under, ang, hl) {
  if (list.length <= n0 || !state.map || !state.map.hw || !state.map.hw.size) return;
  const map = state.map, net = state.net, R = hwRamps(map, net); if (!R.bridges.length) return;
  const it = list[list.length - 1];
  if (under) {
    const S = CFG.S, r = (hl || 0.4 * S);
    for (const B of R.bridges) {
      const G = hwBridgeGeom(B.cell, B.hw, B.rec), dx = x - G.ctr.x, dy = y - G.ctr.y;
      if (Math.abs(dx * G.c.x + dy * G.c.y) > AP + r || Math.abs(dx * G.n.x + dy * G.n.y) > G.wideE * S + r) continue;
      const pts = [], hgt = 0.5 * S / S;
      for (const t of [-AP, AP]) for (const sd of [-G.wideE - 0.03, G.wideE + 0.03]) for (const h of [0, hgt])
        pts.push(hwPt(G.ctr.x + G.c.x * t + G.n.x * sd * S, G.ctr.y + G.c.y * t + G.n.y * sd * S, h));
      const hull = hwHull(pts), orig = it.fn;
      const path = ctx => { ctx.beginPath(); hull.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); };
      list.push({ d: -5e8, fn: ctx => { ctx.save(); path(ctx); ctx.clip(); orig(ctx); ctx.restore(); } });
      it.fn = ctx => { ctx.save(); ctx.beginPath(); ctx.rect(-1e5, -1e5, 2e5, 2e5); hull.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); ctx.clip('evenodd'); orig(ctx); ctx.restore(); };
      return;
    }
    return;
  }
  const c = hitTest(x, y); if (!c) return;
  if (hwAt(map, c)) {
    const rec = net.get(c); if (!hwIsBridge(map, c, rec)) return;
    let m = hwPiecesMax(hwDeckCached(c, hwAt(map, c), rec).pieces);
    for (const e of armsOf(hwRecMask(rec))) m = Math.max(m, hwChainKey(R, cellKey(c) + ':' + e));
    it.d = m + 2 + it.d / 1e4;          // nad mostem i rampami; mezi sebou podle polohy na obrazovce (vzdálenější dřív)
    return;
  }
  const g = R.m.get(cellKey(c)); if (!g) return;
  const m = hwChainKey(R, g.chain);
  it.d = m + 2 + it.d / 1e4;
}


// ====================== PROVOZ NA DÁLNICI ======================
// Okolní provoz na dálnici má pevné TRASY (map.hwRoutes): vždy z jednoho města (tokenu) do druhého. Vozidlo se objeví
// jen uvnitř výchozího tokenu (plynule se zprůhledňuje na prvních 0,5 S trasy) a zmizí jen v cílovém tokenu.
// Nemůže vzniknout ani zaniknout uprostřed cesty. Pruhy dálnice: 2 v každém směru, jízda vpravo.
//   route = { pts: [...středy pruhu...], from: tokenId, to: tokenId, speed: [min, max] (S/s), w: váha, under: true }
const HW_MODELS = ['car', 'car', 'van', 'kamion', 'dump', 'tanker', 'kamionDump'];
function hwAddRoute(map, r) { (map.hwRoutes || (map.hwRoutes = [])).push(Object.assign({ w: 1, speed: [2.3, 2.9], under: true }, r)); }
function hwRoutePath(r) {
  if (!r.path) r.path = makePath(smoothPts(resamplePoly(trimPoly(r.pts, TRIM, TRIM), PATHN), 2, 2));
  return r.path;
}
// Čtyři pruhy rovné dálnice mezi městy a, b (tokeny na stejném řádku): dva po proudu, dva proti proudu.
function hwLaneRoutes(map, a, b, speeds) {
  const S = CFG.S, ca = tokenCenter(a), cb = tokenCenter(b), west = ca.x <= cb.x ? ca : cb, east = ca.x <= cb.x ? cb : ca;
  const tw = ca.x <= cb.x ? a : b, te = ca.x <= cb.x ? b : a;
  HWC.LANES.forEach((off, i) => {
    const sp = speeds ? speeds[i] : (i === 0 ? [2.9, 3.4] : [2.3, 2.8]);
    hwAddRoute(map, { pts: [{ x: west.x, y: west.y + off * S }, { x: east.x, y: east.y + off * S }], from: tw.id, to: te.id, speed: sp });
    hwAddRoute(map, { pts: [{ x: east.x, y: east.y - off * S }, { x: west.x, y: west.y - off * S }], from: te.id, to: tw.id, speed: sp });
  });
}
function hwAmbientStep(sim, dt) {
  const map = state.map, R = map && map.hwRoutes; if (!R || !R.length) return;
  sim.hwT = (sim.hwT || 0) - dt; if (sim.hwT > 0) return;
  sim.hwT = 0.3;
  let alive = 0; for (const u of sim.units) if (u.hwAmb) alive++;
  if (alive >= (map.hwTarget || 36)) return;
  let sum = 0; for (const r of R) sum += r.w;
  let x = Math.random() * sum, r = R[0]; for (const q of R) { x -= q.w; if (x <= 0) { r = q; break; } }
  const path = hwRoutePath(r), p0 = path.pts[0], S = CFG.S;
  if (path.len < 1.2 * S) return;
  for (const w of sim.units) if (w.kind === 'road' && w.x !== undefined && !w.hidden && Math.hypot(w.x - p0.x, w.y - p0.y) < 1.5 * S) return;
  const u = {
    owner: false, hwAmb: true, under: r.under !== false, latLimit: 0.17, kind: 'road',
    model: HW_MODELS[Math.floor(Math.random() * HW_MODELS.length)], color: AMB_COLORS[Math.floor(Math.random() * AMB_COLORS.length)],
    speed: r.speed[0] + Math.random() * (r.speed[1] - r.speed[0]), v: 0, fade: 0, dir: 1, idx: 0, s: 0, bx: 0, by: 0, ba: 0, stuck: 0, freeT: 0, ok: true,
    paths: [path], crossings: [[]], from: r.from, to: r.to
  };
  if (r.mergeInfo) {                                  // zařazení do dálnice: kde začíná a končí zaústění
    const near = q => { let b = 0, bd = 1e18; path.pts.forEach((p, i) => { const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < bd) { bd = d; b = path.cum[i]; } }); return b; };
    u.mergeZ = { s0: near(r.mergeInfo.p0), s1: near(r.mergeInfo.p1), p: r.mergeInfo.p1, d: r.mergeInfo.dir };
  }
  applyPose(u, path, 0);
  sim.units.push(u);
}
