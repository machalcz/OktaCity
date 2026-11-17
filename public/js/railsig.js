// Železniční provoz po blocích (ALFA 0.4): jednokolejná trať, výhybny a semafory.
//
// PRAVIDLA
//   • Na jedné koleji nikdy nejedou dva vlaky proti sobě. Trať se dělí na BLOKY (úseky mezi odbočkami a konci tratí);
//     v bloku je vždy nejvýš jeden vlak. Vlak smí do bloku jen s volným semaforem (= má blok rezervovaný).
//   • VÝHYBNA (objížděcí místo) vznikne tak, že hráč u koleje udělá odbočku na druhou kolej, která se o kus dál
//     zase napojí. Mezi oběma odbočkami jsou tak dvě koleje vedle sebe. Vlak, který musí počkat, se odstaví na
//     jednu z nich, druhý vlak projede. Výhybna musí být delší než vlak.
//   • Vlak si předem rezervuje trasu až na místo, kde může bezpečně stát (kolej ve výhybně nebo konec tratě),
//     takže se nikdy nezasekne uprostřed jednokolejného úseku a výhybna se nemůže zaplnit vlaky z jedné strany.
//   • NALOŽENÝ VLAK MÁ PŘEDNOST: když se o volný blok ucházejí dva vlaky, dostane ho naložený (pak ten, kdo čeká déle).
//     Prázdný vlak si při výběru koleje ve výhybně bere raději odstavnou (delší) kolej a hlavní nechává naloženým.
//   • Semafor stojí před každou odbočkou na konci bloku: červená = vlak čeká, zelená = má volno.

const RS_BRK = 2.4, RS_ACC = 1.5;                // zrychlení a brzdění v násobcích S/s²
function rsKey(seg, dir) { return seg.id * 2 + (dir > 0 ? 0 : 1); }
function rsExit(seg, dir) { return dir > 0 ? seg.b : seg.a; }
function rsEntry(seg, dir) { return dir > 0 ? seg.a : seg.b; }

// Rozdělí kolejový graf hry na bloky (úseky mezi uzly s odbočkou / konci tratě / stanicemi).
function rsBuild(net) {
  const g = buildGraph(net, 'rail');
  const isKey = n => n.adj.length !== 2 || String(n.id)[0] === 'T';
  const segs = [], seen = new Set();
  for (const n of g.list) {
    if (!isKey(n)) continue;
    for (const e0 of n.adj) {
      if (seen.has(e0)) continue;
      let pts = e0.poly.slice(), e = e0, ok = true, guard = 0;
      while (!isKey(e.to) && guard++ < 800) {
        const nx = e.to.adj.find(x => x !== e.rev);
        if (!nx) { ok = false; break; }
        pts = pts.concat(nx.poly.slice(1)); e = nx;
      }
      if (!ok || !isKey(e.to)) continue;
      seen.add(e0); seen.add(e.rev);
      const path = makePath(smoothPts(resamplePoly(pts, PATHN), 2, 2));
      segs.push({ id: segs.length, a: n, b: e.to, path, len: path.len, holder: null, group: 0, park: false });
    }
  }
  const at = new Map();
  const add = (n, o) => { if (!at.has(n)) at.set(n, []); at.get(n).push(o); };
  for (const s of segs) { add(s.a, { seg: s, dir: 1 }); add(s.b, { seg: s, dir: -1 }); }
  const grp = new Map();
  for (const s of segs) {
    const k = [s.a.id, s.b.id].sort().join('|');
    if (!grp.has(k)) grp.set(k, []);
    grp.get(k).push(s);
  }
  let gid = 0;
  for (const list of grp.values()) if (list.length >= 2) { gid++; for (const s of list) { s.group = gid; s.park = true; } }
  const terminals = [];
  for (const [n, list] of at) if (list.length === 1) terminals.push(n);       // konce tratí a stanice; samy o sobě odstavná kolej nejsou
  terminals.sort((p, q) => p.x - q.x || p.y - q.y);
  const S = CFG.S, signals = [];
  for (const s of segs) for (const d of [1, -1]) {
    if ((at.get(rsExit(s, d)) || []).length < 3) continue;
    const sd = d > 0 ? s.len - 0.45 * S : 0.45 * S, p = s.path.pose(sd, 0.2 * S), ang = d > 0 ? p.ang : p.ang + Math.PI;
    signals.push({ seg: s, dir: d, x: p.x - Math.sin(ang) * 0.36 * S, y: p.y + Math.cos(ang) * 0.36 * S, key: rsKey(s, d) });
  }
  return { segs, at, terminals, signals, cc: new Map() };
}

function rsNext(M, seg, dir) {
  const m = rsExit(seg, dir), n0 = rsEntry(seg, dir), out = [];
  for (const o of (M.at.get(m) || [])) {
    if (o.seg === seg) continue;
    if (seg.group && o.seg.group === seg.group && rsExit(o.seg, o.dir) === n0) continue;     // žádné otočení ve výhybně
    out.push(o);
  }
  return out;
}
// Zbývající vzdálenost k cílovému uzlu pro každý směrový blok.
function rsCost(M, dest) {
  let c = M.cc.get(dest.id); if (c) return c;
  c = new Map();
  for (let it = 0; it < M.segs.length + 3; it++) {
    let ch = false;
    for (const s of M.segs) for (const d of [1, -1]) {
      let v = Infinity;
      if (rsExit(s, d) === dest) v = s.len;
      else for (const o of rsNext(M, s, d)) { const w = c.get(rsKey(o.seg, o.dir)); if (w !== undefined && w + s.len < v) v = w + s.len; }
      const k = rsKey(s, d);
      if (v < (c.has(k) ? c.get(k) : Infinity) - 1e-6) { c.set(k, v); ch = true; }
    }
    if (!ch) break;
  }
  M.cc.set(dest.id, c);
  return c;
}

class RailSim {
  constructor(net) {
    this.M = rsBuild(net); this.ver = net.ver; this.trains = []; this.t = 0; this.tick = 0; this.seq = 0;
    this.stats = { prio: 0, waits: 0, trips: 0, minGap: 1e9, conflicts: 0 };
  }
  trainLen(items) { const S = CFG.S; return items.reduce((s, it, i) => s + modelFor(it).len * CFG.VSCALE * S + (i ? GAP_TRAIN * S : 0), 0); }
  nodeNear(x, y) { let b = null, bd = 1e18; for (const n of this.M.terminals) { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; b = n; } } return b; }
  addTrain(o) {
    const from = o.from, dest = o.to; if (!from || !dest || from === dest) return null;
    const t = { id: ++this.seq, items: o.items, Lt: this.trainLen(o.items), vmax: (o.speed || 1.0) * CFG.S, node: from, dest, state: 'dwell', timer: o.delay || 0, legs: [],
      s: 0, v: 0, loaded: o.loaded !== undefined ? o.loaded : Math.random() < 0.5, waitT: 0, trips: 0, status: 'Ve stanici', pid: o.pid || 2, resTick: -1, pwFlag: false, wFlag: false };
    this.trains.push(t); return t;
  }
  lastLeg(t) { return t.legs.length ? t.legs[t.legs.length - 1] : null; }
  limit(t) {
    const S = CFG.S, last = this.lastLeg(t), end = last.off + last.len;
    return rsExit(last.seg, last.dir) === t.dest ? end - 0.9 * S + t.Lt + 0.1 * S : end - 0.45 * S;
  }
  needsReq(t) {
    if (t.state === 'ready') return true;
    if (t.state !== 'run') return false;
    const last = this.lastLeg(t); if (!last || rsExit(last.seg, last.dir) === t.dest) return false;
    return last.off + last.len - t.s < 1.6 * A;
  }
  tryExtend(t) {
    const M = this.M, S = CFG.S, cost = rsCost(M, t.dest), last = this.lastLeg(t);
    const taken = new Set(), chain = [];
    let blocker = null;
    const cands = st => st ? rsNext(M, st.seg, st.dir) : (M.at.get(t.node) || []);
    const dfs = (st, depth) => {
      const all = cands(st).map(o => ({ o, c: cost.get(rsKey(o.seg, o.dir)) })).filter(x => x.c !== undefined);
      if (!all.length) return false;
      const best = Math.min(...all.map(x => x.c));
      const list = all.filter(x => x.c <= best + 6 * A);
      list.sort((p, q) => t.loaded ? p.c - q.c : q.c - p.c);        // naložený bere kratší (hlavní) kolej, prázdný odstavnou
      for (const x of list) {
        const sg = x.o.seg;
        if (sg.holder && sg.holder !== t) { blocker = sg.holder; continue; }
        if (taken.has(sg.id)) continue;
        taken.add(sg.id); chain.push(x.o);
        const done = rsExit(sg, x.o.dir) === t.dest || (sg.park && sg.len >= t.Lt + 0.6 * S);
        if (done || (depth < 5 && dfs(x.o, depth + 1))) return true;
        chain.pop(); taken.delete(sg.id);
      }
      return false;
    };
    if (dfs(last, 0)) {
      let off = last ? last.off + last.len : 0;
      for (const o of chain) { o.seg.holder = t; t.legs.push({ seg: o.seg, dir: o.dir, off, len: o.seg.len }); off += o.seg.len; }
      t.resTick = this.tick; t.waitT = 0; t.pwFlag = false;
      if (t.state === 'ready') { t.state = 'run'; t.s = 0; t.v = 0; t.status = 'Jede'; }
      return true;
    }
    if (blocker && blocker.resTick === this.tick && blocker.loaded && !t.loaded && !t.pwFlag) { this.stats.prio++; t.pwFlag = true; }
    return false;
  }
  step(dt) {
    const S = CFG.S;
    this.t += dt; this.tick++;
    // žádosti o rezervaci tratě v pořadí: naložený, kdo čeká déle
    const req = this.trains.filter(t => this.needsReq(t)).sort((p, q) => (q.loaded - p.loaded) || (q.waitT - p.waitT) || (p.id - q.id));
    for (const t of req) if (!this.tryExtend(t)) t.waitT += dt;
    for (const t of this.trains) this.advance(t, dt);
    this.gaps();
  }
  advance(t, dt) {
    const S = CFG.S;
    if (t.state === 'dwell') { t.timer -= dt; if (t.timer <= 0) { t.state = 'ready'; t.status = 'Čeká na volnou trať'; } return; }
    if (t.state !== 'run') return;
    const last = this.lastLeg(t), lim = this.limit(t), toDest = rsExit(last.seg, last.dir) === t.dest;
    const vt = Math.min(t.vmax, Math.sqrt(2 * RS_BRK * S * Math.max(0, lim - t.s)) + 0.04 * S);
    t.v += Math.max(-RS_BRK * S * dt, Math.min(RS_ACC * S * dt, vt - t.v));
    t.s = Math.min(lim, t.s + t.v * dt);
    const waiting = !toDest && t.v < 0.05 * S && t.s >= lim - 0.05 * S;
    if (waiting) { t.status = last.seg.group ? 'Odstaven ve výhybně, čeká na semafor' : 'Čeká na semafor'; if (!t.wFlag) { t.wFlag = true; this.stats.waits++; } }
    else { t.status = 'Jede'; if (t.v > 0.2 * S) t.wFlag = false; }
    while (t.legs.length > 1 && t.s - t.Lt > t.legs[0].off + t.legs[0].len + 0.1 * S) { const l = t.legs.shift(); if (l.seg.holder === t) l.seg.holder = null; }
    if (toDest && t.s >= lim - 0.02 * S) {
      for (const l of t.legs) if (l.seg.holder === t) l.seg.holder = null;
      t.legs = []; t.state = 'dwell'; t.timer = 3 + Math.random() * 3; t.trips++; this.stats.trips++;
      const from = t.node; t.node = t.dest; t.dest = from; t.loaded = Math.random() < 0.5; t.s = 0; t.v = 0; t.status = 'Ve stanici';
    }
  }
  poses(t) {
    if (t.state !== 'run' || !t.legs.length) return [];
    const S = CFG.S, out = [], last = this.lastLeg(t), end = last.off + last.len, toDest = rsExit(last.seg, last.dir) === t.dest;
    let off = 0;
    t.items.forEach((item, i) => {
      const l = modelFor(item).len * CFG.VSCALE * S, sc = t.s - off - l / 2; off += l + GAP_TRAIN * S;
      if (sc < 0.9 * S || (toDest && sc > end - 0.9 * S)) return;        // mimo okraje tokenů se vagony nekreslí
      const leg = t.legs.find(g => sc >= g.off - 1e-6 && sc <= g.off + g.len + 1e-6) || last;
      const local = sc - leg.off, sd = leg.dir > 0 ? local : leg.seg.len - local, p = leg.seg.path.pose(Math.max(0, Math.min(leg.seg.len, sd)), 0.25 * S);
      out.push({ x: p.x, y: p.y, ang: leg.dir > 0 ? p.ang : p.ang + Math.PI, item, i });
    });
    return out;
  }
  gaps() {
    const P = this.trains.map(t => ({ t, p: this.poses(t) })).filter(o => o.p.length);
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++)
      for (const a of P[i].p) for (const b of P[j].p) this.stats.minGap = Math.min(this.stats.minGap, Math.hypot(a.x - b.x, a.y - b.y));
    const cnt = new Map();                                                    // kontrola: blok drží nejvýš jeden vlak
    for (const t of this.trains) for (const l of t.legs) { cnt.set(l.seg.id, (cnt.get(l.seg.id) || 0) + 1); if (cnt.get(l.seg.id) > 1) this.stats.conflicts++; }
  }
  units() {
    return this.trains.filter(t => t.state === 'run').map(t => ({ kind: 'rail', tid: t.id, pid: t.pid, items: t.items, poses: this.poses(t), loaded: t.loaded, goods: 'coal', owner: true }));
  }
}

// Semafory: zelená, když vlak, který blok drží, má rezervovaný i další úsek.
function rsCollectSignals(list, rs) {
  if (!rs) return;
  const green = new Set();
  for (const t of rs.trains) t.legs.forEach((l, i) => { if (i < t.legs.length - 1) green.add(rsKey(l.seg, l.dir)); });
  for (const sg of rs.M.signals) {
    const on = green.has(sg.key);
    addDrawable(list, sg.x, sg.y, ctx => {
      const S = CFG.S, z = state.cam.zoom, k = viewK(), px = v => v * S * z, P = w2s(sg.x, sg.y, true);
      ctx.save(); ctx.lineCap = 'round';
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(P.x + px(0.06), P.y + px(0.03), px(0.09), px(0.045) * Math.max(VIEW.tilt, 0.5), 0, 0, Math.PI * 2); ctx.fill();
      const top = { x: P.x, y: P.y - px(0.62) * k };
      ctx.strokeStyle = '#1d1f23'; ctx.lineWidth = Math.max(2, px(0.05)); ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(top.x, top.y); ctx.stroke();
      const bw = px(0.15), bh = px(0.30);
      ctx.fillStyle = '#17191c'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(top.x - bw / 2, top.y - bh, bw, bh, bw * 0.3); ctx.fill(); ctx.stroke();
      for (let i = 0; i < 2; i++) {
        const lit = i === 0 ? !on : on, cx = top.x, cy = top.y - bh * (i === 0 ? 0.72 : 0.28), r = bw * 0.32;
        if (lit) { ctx.fillStyle = i === 0 ? 'rgba(255,60,50,0.30)' : 'rgba(80,255,110,0.30)'; ctx.beginPath(); ctx.arc(cx, cy, r * 2.3, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = lit ? (i === 0 ? '#ff4a3d' : '#5cff7a') : (i === 0 ? '#4a1717' : '#14381c');
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    });
  }
}
