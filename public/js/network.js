// Kolej/rameno jako kvadratická křivka: od hrany a k hraně b (nebo ke středu, b = 8).
function sampleTrack(cell, a, b, n) {
  n = n || 24;
  const ctr = cellCenter(cell);
  const va = edgeVec(cell, a);
  const p0 = { x: ctr.x + va.x, y: ctr.y + va.y };
  let p2, c;
  if (b === C8) { p2 = { x: ctr.x, y: ctr.y }; c = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 }; }
  else { const vb = edgeVec(cell, b); p2 = { x: ctr.x + vb.x, y: ctr.y + vb.y }; c = ctr; }
  const pts = [], nor = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push({ x: u * u * p0.x + 2 * u * t * c.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p2.y });
    const tx = 2 * u * (c.x - p0.x) + 2 * t * (p2.x - c.x), ty = 2 * u * (c.y - p0.y) + 2 * t * (p2.y - c.y);
    const L = Math.hypot(tx, ty) || 1;
    nor.push({ x: -ty / L, y: tx / L });
  }
  return { pts, nor };
}

// Dopravní síť pro simulaci: graf silnic a kolejí, hledání tras, hladké dráhy vozidel.
//
// Uzly: střed hrany pole (sdílený se sousedním polem) a střed pole (jen při odbočkách).
// Hrany: úsek uvnitř jednoho pole, s lomenou čarou (světové souřadnice).
// Silnice a koleje mají každé svůj graf, takže se přes přejezd nikdy "nepropojí".

const PATHN = 0.12 * CFG.S;           // vzdálenost vzorků na dráze

function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
}

function resamplePoly(pts, step) {
  const out = [{ x: pts[0].x, y: pts[0].y }];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i];
    const seg = Math.hypot(q.x - p.x, q.y - p.y);
    if (seg < 1e-9) continue;
    let d = step - acc;
    while (d <= seg) {
      const f = d / seg;
      out.push({ x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f });
      d += step;
    }
    acc = seg - (d - step);
  }
  const last = pts[pts.length - 1], lo = out[out.length - 1];
  if (Math.hypot(last.x - lo.x, last.y - lo.y) > step * 0.3) out.push({ x: last.x, y: last.y });
  else out[out.length - 1] = { x: last.x, y: last.y };
  return out;
}

// Klouzavý průměr: zaoblí ostré rohy (odbočky), rovné úseky nechá. Konce zůstanou pevné.
function smoothPts(pts, win, iters) {
  let cur = pts;
  for (let it = 0; it < iters; it++) {
    const n = cur.length, out = new Array(n);
    for (let i = 0; i < n; i++) {
      const w = Math.min(win, i, n - 1 - i);
      if (w <= 0) { out[i] = cur[i]; continue; }
      let sx = 0, sy = 0;
      for (let j = -w; j <= w; j++) { sx += cur[i + j].x; sy += cur[i + j].y; }
      out[i] = { x: sx / (2 * w + 1), y: sy / (2 * w + 1) };
    }
    cur = out;
  }
  return cur;
}

// Posun dráhy doprava ve směru jízdy (osa y míří dolů, vpravo = (−ty, tx)).
function offsetRight(pts, off) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b.x - a.x, ty = b.y - a.y;
    const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
    out.push({ x: pts[i].x - ty * off, y: pts[i].y + tx * off });
  }
  return out;
}

function makePath(pts, loop) {
  const n = pts.length, cum = [0], segs = loop ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    cum.push(cum[i] + Math.hypot(q.x - p.x, q.y - p.y));
  }
  const len = cum[segs];
  const path = { pts, cum, len, loop, n, segs };
  path.at = function (s) {
    if (loop) { s %= len; if (s < 0) s += len; } else s = Math.max(0, Math.min(len, s));
    let lo = 0, hi = segs - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid - 1; }
    const p = pts[lo], q = pts[(lo + 1) % n];
    const sl = (cum[lo + 1] - cum[lo]) || 1, f = (s - cum[lo]) / sl;
    return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f };
  };
  path.pose = function (s, d) {            // poloha a směr (průměr přes ±d)
    d = d || 0.16 * CFG.S;
    const a = path.at(s - d), b = path.at(s + d), m = path.at(s);
    return { x: m.x, y: m.y, ang: Math.atan2(b.y - a.y, b.x - a.x) };
  };
  return path;
}

// Kde dráha projíždí přejezdy (středy polí s přejezdem). Vrací [{ key, s }].
function pathCrossings(path, crossings, tol) {
  const out = [];
  for (const c of crossings) {
    const ctr = cellCenter(c.cell);
    let run = false, best = 0, bd = 1e9;
    for (let i = 0; i < path.n; i++) {
      const d = Math.hypot(path.pts[i].x - ctr.x, path.pts[i].y - ctr.y);
      if (d < tol) {
        if (!run) { run = true; bd = 1e9; }
        if (d < bd) { bd = d; best = i; }
      } else if (run) { out.push({ key: c.key, s: path.cum[best] }); run = false; }
    }
    if (run) out.push({ key: c.key, s: path.cum[best] });
  }
  return out;
}

// ---------- graf ----------
function edgeNodeId(cell, k) {
  const nb = neighborAcross(cell, k);
  const a = cellKey(cell) + ':' + k, b = cellKey(nb.cell) + ':' + nb.k;
  return a < b ? a : b;
}
function edgePos(cell, k) { const c = cellCenter(cell), v = edgeVec(cell, k); return { x: c.x + v.x, y: c.y + v.y }; }

function roadPoly(cell, a, b) {
  const ctr = cellCenter(cell), p0 = edgePos(cell, a), p2 = edgePos(cell, b);
  if (oppositeEdge(cell, a) === b) return [p0, p2];
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, u = 1 - t;
    pts.push({ x: u * u * p0.x + 2 * u * t * ctr.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * ctr.y + t * t * p2.y });
  }
  return pts;
}

function buildGraph(net, kind) {
  const nodes = new Map();
  const getNode = (id, x, y) => {
    let n = nodes.get(id);
    if (!n) { n = { id, x, y, adj: [] }; nodes.set(id, n); }
    return n;
  };
  const enode = (cell, k) => { const p = edgePos(cell, k); return getNode(edgeNodeId(cell, k), p.x, p.y); };
  const cnode = cell => { const c = cellCenter(cell); return getNode('C' + cellKey(cell), c.x, c.y); };
  const link = (n1, n2, poly) => {
    const len = polyLength(poly);
    const e1 = { from: n1, to: n2, len, poly }, e2 = { from: n2, to: n1, len, poly: poly.slice().reverse() };
    e1.rev = e2; e2.rev = e1;
    n1.adj.push(e1); n2.adj.push(e2);
  };
  for (const { cell, rec } of net.entries()) {
    if (kind === 'road') {
      if (!rec.road) continue;
      const arms = armsOf(rec.road).filter(k => k < edgeCount(cell));
      if (arms.length === 2) link(enode(cell, arms[0]), enode(cell, arms[1]), roadPoly(cell, arms[0], arms[1]));
      else if (arms.length > 2) {
        const cn = cnode(cell);
        for (const k of arms) { const e = enode(cell, k); link(e, cn, [{ x: e.x, y: e.y }, { x: cn.x, y: cn.y }]); }
      }
    } else {
      if (!rec.rail.length) continue;
      const hasC = rec.rail.some(t => t[1] === C8);
      for (const t of rec.rail) {
        const a = t[0], b = t[1];
        if (b === C8) {
          const cn = cnode(cell), e = enode(cell, a);
          link(e, cn, sampleTrack(cell, a, C8, 8).pts);
        } else if (hasC && oppositeEdge(cell, a) === b) {
          const cn = cnode(cell), ea = enode(cell, a), eb = enode(cell, b);
          link(ea, cn, [{ x: ea.x, y: ea.y }, { x: cn.x, y: cn.y }]);
          link(cn, eb, [{ x: cn.x, y: cn.y }, { x: eb.x, y: eb.y }]);
        } else link(enode(cell, a), enode(cell, b), sampleTrack(cell, a, b, 14).pts);
      }
    }
  }
  if (kind === 'road' && state.map && state.map.hwx && typeof hwxLinkGraph === 'function') hwxLinkGraph(state.map, net, getNode, enode, link);
  // tokeny (města, průmysl): přípojka na hraně → uzel 'T<id>' uprostřed tokenu
  if (state.map && state.map.tokens) for (const tk of state.map.tokens) {
    const ports = kind === 'road' ? tk.road : tk.rail;
    if (!ports.length) continue;
    const c0 = tokenCenter(tk), multi = tokenCellList(tk).length > 1;
    const tn = getNode('T' + tk.id, c0.x, c0.y);
    for (const code of ports) {
      const pi = portInfo(tk, code), e = enode(pi.cell, pi.k);
      if (multi) { const cc = cellCenter(pi.cell); link(e, tn, [{ x: e.x, y: e.y }, { x: cc.x, y: cc.y }, { x: c0.x, y: c0.y }]); }
      else link(e, tn, [{ x: e.x, y: e.y }, { x: c0.x, y: c0.y }]);
    }
  }
  return { kind, nodes, list: [...nodes.values()] };
}

// Prodloužení lomené čáry rovně za oba konce (pro vlaky, které stojí napůl za středem stanice).
function extendPoly(pts, back, fwd) {
  const n = pts.length;
  const dirOf = (p, q) => { let dx = p.x - q.x, dy = p.y - q.y; const L = Math.hypot(dx, dy) || 1; return { x: dx / L, y: dy / L }; };
  const d0 = dirOf(pts[0], pts[Math.min(n - 1, 4)]), d1 = dirOf(pts[n - 1], pts[Math.max(0, n - 5)]);
  const a = { x: pts[0].x + d0.x * back, y: pts[0].y + d0.y * back };
  const b = { x: pts[n - 1].x + d1.x * fwd, y: pts[n - 1].y + d1.y * fwd };
  return [a].concat(pts, [b]);
}

class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(k, v) {
    const a = this.a; a.push([k, v]);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

function dijkstra(sources) {
  const dist = new Map(), prev = new Map(), done = new Set(), h = new MinHeap();
  for (const s of sources) {
    if (!dist.has(s.node) || s.cost < dist.get(s.node)) { dist.set(s.node, s.cost); prev.set(s.node, { from: null, poly: s.poly }); h.push(s.cost, s.node); }
  }
  while (h.size) {
    const [d, n] = h.pop();
    if (done.has(n)) continue;
    done.add(n);
    for (const e of n.adj) {
      const nd = d + e.len;
      if (nd < (dist.has(e.to) ? dist.get(e.to) : Infinity)) { dist.set(e.to, nd); prev.set(e.to, { from: n, poly: e.poly }); h.push(nd, e.to); }
    }
  }
  return { dist, prev };
}

function assemblePoly(prev, endNode, endPoly) {
  const chain = [];
  for (let n = endNode; n;) { const p = prev.get(n); chain.push(p.poly); n = p.from; }
  chain.reverse();
  let pts = [];
  for (const poly of chain) pts = pts.concat(pts.length ? poly.slice(1) : poly);
  return pts.concat(endPoly.slice(1));
}

// ---------- stanice ----------
// Stanice stojí na poli s jedním rovným/obloukovým úsekem (dva konce na hranách). Zastavuje se uprostřed úseku.
function stationPiece(cell, rec, kind) {
  if (cell.t !== 'o') return null;
  let a, b, poly;
  if (kind === 'road') {
    if (!rec || !rec.road || rec.rail.length) return null;
    const arms = armsOf(rec.road).filter(k => k < edgeCount(cell));
    if (arms.length !== 2 || oppositeEdge(cell, arms[0]) !== arms[1]) return null;
    a = arms[0]; b = arms[1]; poly = roadPoly(cell, a, b);
  } else {
    if (!rec || rec.road || rec.rail.length !== 1 || rec.rail[0][1] === C8) return null;
    a = rec.rail[0][0]; b = rec.rail[0][1];
    if (oppositeEdge(cell, a) !== b) return null;
    poly = sampleTrack(cell, a, b, 16).pts;
  }
  const L = polyLength(poly), h = L / 2;
  let acc = 0;
  for (let i = 1; i < poly.length; i++) {
    const seg = Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y);
    if (acc + seg >= h && seg > 0) {
      const f = (h - acc) / seg, p = poly[i - 1], q = poly[i];
      const mid = { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f };
      const first = poly.slice(0, i).concat([mid]), second = [mid].concat(poly.slice(i));
      return {
        kind, cell, a, b, mid, half: h,
        ang: Math.atan2(q.y - p.y, q.x - p.x),
        na: edgeNodeId(cell, a), nb: edgeNodeId(cell, b),
        toA: first.slice().reverse(), toB: second
      };
    }
    acc += seg;
  }
  return null;
}

// Trasa od středu stanice A do středu stanice B po grafu. Vrací body (lomená čára) nebo null.
function routeStations(graph, A, B) {
  const nA = graph.nodes.get(A.na), nB = graph.nodes.get(A.nb);
  const tA = graph.nodes.get(B.na), tB = graph.nodes.get(B.nb);
  if (!nA || !nB || !tA || !tB) return null;
  const { dist, prev } = dijkstra([
    { node: nA, cost: A.half, poly: A.toA },
    { node: nB, cost: A.half, poly: A.toB }
  ]);
  const c1 = dist.has(tA) ? dist.get(tA) + B.half : Infinity;
  const c2 = dist.has(tB) ? dist.get(tB) + B.half : Infinity;
  if (c1 === Infinity && c2 === Infinity) return null;
  return c1 <= c2 ? assemblePoly(prev, tA, B.toA.slice().reverse()) : assemblePoly(prev, tB, B.toB.slice().reverse());
}

// Náhodná trasa mezi uzly (pro okolní provoz): vrací body nebo null.
function routeNodes(graph, startNode, endNode) {
  const { prev, dist } = dijkstra([{ node: startNode, cost: 0, poly: [{ x: startNode.x, y: startNode.y }] }]);
  if (!dist.has(endNode)) return null;
  return assemblePoly(prev, endNode, [{ x: endNode.x, y: endNode.y }]);
}


// ---------- trasy bez otáčení (silniční vozidla) ----------
// Stav hledání je směrová hrana grafu; ze stavu nelze jet zpět po téže hraně (žádné couvání ani otáčení na místě).
function stationEdges(graph, pc) {
  const na = graph.nodes.get(pc.na), nb = graph.nodes.get(pc.nb);
  if (!na || !nb) return null;
  const ab = na.adj.find(e => e.to === nb), ba = nb.adj.find(e => e.to === na);
  return ab && ba ? { ab, ba } : null;
}

function dirDijkstra(startEdge, startCost) {
  const dist = new Map(), prev = new Map(), done = new Set(), h = new MinHeap();
  dist.set(startEdge, startCost); prev.set(startEdge, null); h.push(startCost, startEdge);
  while (h.size) {
    const [d, e] = h.pop();
    if (done.has(e)) continue;
    done.add(e);
    for (const f of e.to.adj) {
      if (f === e.rev) continue;
      const nd = d + f.len;
      if (nd < (dist.has(f) ? dist.get(f) : Infinity)) { dist.set(f, nd); prev.set(f, e); h.push(nd, f); }
    }
  }
  return { dist, prev };
}

// Nejlevnější příjezd do poloviny směrové hrany G (stanice). Vrací { cost, last } (last = předchozí stav) nebo null.
function dirReach(res, G) {
  let best = null;
  for (const [e, d] of res.dist) {
    if (e.to !== G.from || e === G.rev) continue;
    const c = d + G.len / 2;
    if (!best || c < best.cost) best = { cost: c, last: e };
  }
  return best;
}

function dirChain(res, last) {
  const chain = [];
  for (let e = last; e; e = res.prev.get(e)) chain.push(e);
  return chain.reverse();
}

// Polyline od středu stanice ve směru hrany S: půlka hrany; do středu stanice po hraně G: druhá půlka.
function halfOut(pc, S, edges) { return S === edges.ab ? pc.toB : pc.toA; }
function halfIn(pc, G, edges) { return (G === edges.ab ? pc.toA : pc.toB).slice().reverse(); }

function legPoints(pcFrom, S, edgesFrom, res, reach, pcTo, G, edgesTo) {
  let pts = halfOut(pcFrom, S, edgesFrom).slice();
  const chain = dirChain(res, reach.last);
  for (let i = 1; i < chain.length; i++) pts = pts.concat(chain[i].poly.slice(1));
  return pts.concat(halfIn(pcTo, G, edgesTo).slice(1));
}

// Okružní trasa A → B → A bez otáčení. Vrací { pts, legLen } nebo null.
function routeLoop(graph, pa, pb) {
  const eA = stationEdges(graph, pa), eB = stationEdges(graph, pb);
  if (!eA || !eB) return null;
  let best = null;
  for (const S of [eA.ab, eA.ba]) {
    const r1 = dirDijkstra(S, S.len / 2);
    for (const G of [eB.ab, eB.ba]) {
      const reach1 = dirReach(r1, G);
      if (!reach1) continue;
      const r2 = dirDijkstra(G, G.len / 2);
      const reach2 = dirReach(r2, S);
      if (!reach2) continue;
      const total = reach1.cost + reach2.cost;
      if (!best || total < best.total) best = { total, S, G, r1, r2, reach1, reach2 };
    }
  }
  if (!best) return null;
  const leg1 = legPoints(pa, best.S, eA, best.r1, best.reach1, pb, best.G, eB);
  const leg2 = legPoints(pb, best.G, eB, best.r2, best.reach2, pa, best.S, eA);
  return { pts: leg1.concat(leg2.slice(1)), legLen: polyLength(leg1) };
}
