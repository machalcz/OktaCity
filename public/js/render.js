// Vykreslování. Vše ve světových souřadnicích, kameru řeší transformace plátna.

// ---------- pomocné funkce pro křivky ----------
// Barvy vlastníků právě kresleného záznamu (nastavuje drawRecord): silnice = lemování, koleje = okraj štěrkového lože.
const OWN_TINT = { road: [], rail: null };
function setTint(rec) {
  const o = rec && rec.own;
  OWN_TINT.road = o && o.road ? o.road.map(p => playerColor(p)) : [];
  OWN_TINT.rail = o && o.rail ? playerColor(o.rail) : null;
}
function clearTint() { OWN_TINT.road = []; OWN_TINT.rail = null; }

function strokePoly(ctx, pts) {
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.stroke();
}

function offsetPts(tr, off) { return tr.pts.map((p, i) => ({ x: p.x + tr.nor[i].x * off, y: p.y + tr.nor[i].y * off })); }

function sleeperSpots(tr, step) {
  const out = [];
  let acc = step / 2;
  for (let i = 1; i < tr.pts.length; i++) {
    const p = tr.pts[i - 1], q = tr.pts[i];
    const seg = Math.hypot(q.x - p.x, q.y - p.y);
    let d = acc;
    while (d <= seg) {
      const f = d / seg;
      out.push({ x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, nx: tr.nor[i].x, ny: tr.nor[i].y });
      d += step;
    }
    acc = d - seg;
  }
  return out;
}

// ---------- silnice ----------
function drawRoadLayer(ctx, cell, mask) {
  const S = CFG.S;
  const ctr = cellCenter(cell);
  const arms = armsOf(mask).filter(k => k < edgeCount(cell));
  if (!arms.length) return;
  const pts = arms.map(k => { const v = edgeVec(cell, k); return { x: ctr.x + v.x, y: ctr.y + v.y }; });
  const curve = arms.length === 2 && oppositeEdge(cell, arms[0]) !== arms[1];

  const fullPath = () => {
    ctx.beginPath();
    if (arms.length === 2) {
      ctx.moveTo(pts[0].x, pts[0].y);
      if (curve) ctx.quadraticCurveTo(ctr.x, ctr.y, pts[1].x, pts[1].y);   // rovně ke středu a uprostřed zatáčka
      else ctx.lineTo(pts[1].x, pts[1].y);
    } else {
      for (const p of pts) { ctx.moveTo(p.x, p.y); ctx.lineTo(ctr.x, ctr.y); }
    }
  };
  ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
  const tn = OWN_TINT.road;
  fullPath(); ctx.strokeStyle = tn.length ? tn[0] : CFG.COLOR.kerb; ctx.lineWidth = S * CFG.KERB; ctx.stroke();
  if (tn.length > 1) { fullPath(); ctx.strokeStyle = tn[1]; ctx.setLineDash([S * 0.2, S * 0.2]); ctx.lineWidth = S * CFG.KERB; ctx.stroke(); ctx.setLineDash([]); }
  fullPath(); ctx.strokeStyle = CFG.COLOR.asphalt; ctx.lineWidth = S * CFG.ASPHALT; ctx.stroke();

  ctx.strokeStyle = CFG.COLOR.line;
  ctx.lineWidth = S * 0.03;
  ctx.setLineDash([S * 0.2, S * 0.15]);
  if (arms.length === 2) fullPath(), ctx.stroke();
  else {
    ctx.beginPath();
    for (const p of pts) { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + (ctr.x - p.x) * 0.62, p.y + (ctr.y - p.y) * 0.62); }
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

// ---------- koleje (3D: násyp, pražce a kolejnice mají výšku) ----------
function viewK() { return VIEW.lift > 0 ? 1 : 0; }       // v pohledu shora se výška neprojeví
function railLevels() {
  const S = CFG.S, z = state.cam.zoom, k = viewK();
  return { hB: S * z * 0.11 * k, hS: S * z * 0.022 * k, hR: S * z * 0.05 * k };
}

// tracks – seznam kolejí; noBallast – jen pražce a kolejnice (přejezd); baseOff – úroveň (px nad hladinou)
function drawRailLayer(ctx, cell, tracks, noBallast, baseOff) {
  const S = CFG.S, R = CFG.RAIL;
  const base = baseOff === undefined ? liftPx() : baseOff;
  const { hB, hS, hR } = railLevels();
  const trs = tracks.map(t => sampleTrack(cell, t[0], t[1]));
  ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
  const at = off => applyTransformOff(ctx, off);

  let top = base;
  if (!noBallast) {
    // násyp: lichoběžník – spodek širší, vršek užší
    const steps = hB > 0 ? 4 : 1;
    at(base); ctx.strokeStyle = CFG.COLOR.ballastFoot; ctx.lineWidth = S * (R.BALLAST + 0.08);
    trs.forEach(t => strokePoly(ctx, t.pts));
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      at(base + hB * f);
      ctx.strokeStyle = i === steps ? CFG.COLOR.ballast : mixColor(CFG.COLOR.ballastSideLo, CFG.COLOR.ballastSideHi, f);
      ctx.lineWidth = S * (R.BALLAST + 0.08 - 0.08 * f);
      trs.forEach(t => strokePoly(ctx, t.pts));
    }
    top = base + hB;
    if (OWN_TINT.rail) {                       // okraje štěrkového lože v barvě majitele
      at(top); ctx.strokeStyle = OWN_TINT.rail; ctx.lineWidth = S * 0.05;
      const hb = S * R.BALLAST / 2;
      trs.forEach(t => { strokePoly(ctx, offsetPts(t, hb)); strokePoly(ctx, offsetPts(t, -hb)); });
    }
  }

  // pražce: tmavá boční stěna a světlejší vršek
  const half = S * (R.BALLAST / 2 - 0.03);
  const sleeperPass = (off, color, w) => {
    at(off); ctx.strokeStyle = color; ctx.lineWidth = w;
    trs.forEach(t => {
      ctx.beginPath();
      for (const sp of sleeperSpots(t, S * R.SLEEPER_STEP)) {
        ctx.moveTo(sp.x - sp.nx * half, sp.y - sp.ny * half);
        ctx.lineTo(sp.x + sp.nx * half, sp.y + sp.ny * half);
      }
      ctx.stroke();
    });
  };
  sleeperPass(top, CFG.COLOR.sleeperDark, S * 0.06);
  sleeperPass(top + hS, CFG.COLOR.sleeper, S * 0.05);
  top += hS;

  // kolejnice: stín na pražcích, boční stěna, lesklý vršek
  const g = S * R.GAUGE / 2;
  for (const off of [-g, g]) {
    at(top); ctx.strokeStyle = 'rgba(20,14,8,0.55)'; ctx.lineWidth = S * 0.075;
    trs.forEach(t => strokePoly(ctx, offsetPts(t, off + S * 0.008)));
    const n = hR > 0 ? 3 : 1;
    for (let i = 1; i <= n; i++) {
      at(top + hR * i / n);
      ctx.strokeStyle = i === n ? CFG.COLOR.railSteel : CFG.COLOR.railSide;
      ctx.lineWidth = i === n ? S * 0.03 : S * 0.05;
      trs.forEach(t => strokePoly(ctx, offsetPts(t, off)));
    }
  }
  at(liftPx());
}

// ---------- most (vodní osmiúhelník, rovně přes celé pole) ----------
function drawBridge(ctx, cell, rec) {
  const S = CFG.S;
  const ctr = cellCenter(cell);
  const isRoad = rec.road !== 0;
  const horiz = ((isRoad ? rec.road : railMaskOf(rec.rail)) & 1) === 1;
  const d = horiz ? { x: 1, y: 0 } : { x: 0, y: -1 };
  const n = horiz ? { x: 0, y: 1 } : { x: 1, y: 0 };
  const p0 = { x: ctr.x - d.x * AP, y: ctr.y - d.y * AP };
  const p1 = { x: ctr.x + d.x * AP, y: ctr.y + d.y * AP };
  const line = (off, w, color, dash) => {
    ctx.beginPath();
    ctx.moveTo(p0.x + n.x * off, p0.y + n.y * off);
    ctx.lineTo(p1.x + n.x * off, p1.y + n.y * off);
    ctx.strokeStyle = color; ctx.lineWidth = w;
    ctx.setLineDash(dash || []);
    ctx.stroke();
  };
  ctx.lineCap = 'butt';
  // paluba
  line(0, S * 0.55, isRoad && OWN_TINT.road.length ? OWN_TINT.road[0] : CFG.COLOR.deck);
  if (isRoad) {
    line(0, S * 0.44, CFG.COLOR.asphalt);
    line(0, S * 0.03, CFG.COLOR.line, [S * 0.2, S * 0.15]);
  } else {
    line(0, S * 0.44, CFG.COLOR.deckRail);
    drawRailLayer(ctx, cell, rec.rail);
  }
  // zábradlí
  for (const off of [-S * 0.26, S * 0.26]) {
    line(off, S * 0.04, CFG.COLOR.railing);
    line(off, S * 0.10, CFG.COLOR.railing, [S * 0.04, S * 0.14]);
  }
  ctx.setLineDash([]);
}

// Železniční přejezd: silnice pod, přes ni násyp s kolejemi a zvýšená asfaltová podložka mezi kolejnicemi.
// Závory a semafory se kreslí zvlášť (drawCrossingGear) kvůli správnému překrývání.
function drawCrossing(ctx, cell, rec) {
  const S = CFG.S, ctr = cellCenter(cell), base = liftPx(), { hB } = railLevels();

  ctx.save(); cellPath(ctx, cell); ctx.clip();
  drawRoadLayer(ctx, cell, rec.road);
  ctx.restore();
  drawRailLayer(ctx, cell, rec.rail);

  const roadArm = armsOf(rec.road)[0], ang = edgeAngle(cell, roadArm);
  const d = { x: Math.cos(ang), y: -Math.sin(ang) }, n = { x: -d.y, y: d.x };
  const th = angleBetween(cell, roadArm, rec.rail[0][0]) * Math.PI / 180;
  const L = Math.max(0.28 * S, 0.22 * S / Math.max(0.35, Math.abs(Math.sin(th))));
  const W2 = S * 0.27;
  const pad = () => {
    ctx.beginPath();
    ctx.moveTo(ctr.x - d.x * L - n.x * W2, ctr.y - d.y * L - n.y * W2);
    ctx.lineTo(ctr.x + d.x * L - n.x * W2, ctr.y + d.y * L - n.y * W2);
    ctx.lineTo(ctr.x + d.x * L + n.x * W2, ctr.y + d.y * L + n.y * W2);
    ctx.lineTo(ctr.x - d.x * L + n.x * W2, ctr.y - d.y * L + n.y * W2);
    ctx.closePath();
  };
  const steps = hB > 0 ? 3 : 1;
  for (let i = 0; i <= steps; i++) {
    applyTransformOff(ctx, base + hB * i / steps);
    pad(); ctx.fillStyle = mixColor(CFG.COLOR.padLo, CFG.COLOR.padHi, i / steps); ctx.fill();
  }
  applyTransformOff(ctx, base + hB);
  ctx.save(); pad(); ctx.clip();
  drawRailLayer(ctx, cell, rec.rail, true, base + hB);
  ctx.restore();
  applyTransformOff(ctx, base);
}

function drawRecord(ctx, cell, rec, alpha, water) {
  setTint(rec);
  ctx.save();
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  if (water) drawBridge(ctx, cell, rec);
  else if (rec.road && rec.rail.length) drawCrossing(ctx, cell, rec);
  else if (rec.rail.length) drawRailLayer(ctx, cell, rec.rail);
  else { cellPath(ctx, cell); ctx.clip(); drawRoadLayer(ctx, cell, rec.road); }
  ctx.restore();
  clearTint();
}

// ---------- závory a semafory na přejezdech (3D, kreslí se v pixelech obrazovky) ----------
function collectGearDrawables(state, list) {
  const S = CFG.S;
  for (const c of state.sim.crossList) {
    const rec = state.net.get(c.cell);
    const cs = state.sim.cross[c.key];
    if (!rec || !cs || !(rec.road && rec.rail.length)) continue;
    const ctr = cellCenter(c.cell), ang = edgeAngle(c.cell, armsOf(rec.road)[0]);
    const d = { x: Math.cos(ang), y: -Math.sin(ang) }, n = { x: -d.y, y: d.x };
    for (const sgn of [-1, 1]) {
      const wx = ctr.x + d.x * c.off * sgn - sgn * n.x * S * 0.4;
      const wy = ctr.y + d.y * c.off * sgn - sgn * n.y * S * 0.4;
      addDrawable(list, wx, wy, ctx => drawGearItem(ctx, state, { wx, wy, inx: sgn * n.x, iny: sgn * n.y }, cs));
    }
  }
}

function drawGearItem(ctx, state, it, cs) {
  const S = CFG.S, z = state.cam.zoom, k = viewK();
  const px = v => v * S * z;
  const lineW = Math.max(1.5, px(0.075));
  const P = w2s(it.wx, it.wy, true);
  const phase = cs.eff ? ((performance.now() / 420) | 0) % 2 : -1;
  const up = h => ({ x: 0, y: -px(h) * k });
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.beginPath(); ctx.ellipse(P.x + px(0.1), P.y + px(0.04), px(0.15), px(0.07) * Math.max(VIEW.tilt, 0.5), 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4b4f55';
  ctx.beginPath(); ctx.ellipse(P.x, P.y, px(0.1), px(0.055) * Math.max(VIEW.tilt, 0.5), 0, 0, Math.PI * 2); ctx.fill();

  const poleH = 0.78, boomH = 0.30;
  ctx.strokeStyle = '#1d1f23'; ctx.lineWidth = lineW + 2;
  ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(P.x, P.y + up(poleH).y); ctx.stroke();
  ctx.strokeStyle = '#e9ebee'; ctx.lineWidth = lineW;
  ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(P.x, P.y + up(poleH).y); ctx.stroke();

  const phi = (1 - cs.gate) * 75 * Math.PI / 180 * k;
  const Lb = 0.62;
  const hx = it.inx * Lb * S * Math.cos(phi), hy = it.iny * Lb * S * Math.cos(phi), hh = boomH + Lb * Math.sin(phi);
  const piv = { x: P.x, y: P.y - px(boomH) * k };
  const q = w2s(it.wx + hx, it.wy + hy, true);
  const end = { x: q.x, y: q.y - px(hh) * k };
  const bx = piv.x - (end.x - piv.x) * 0.18, by = piv.y - (end.y - piv.y) * 0.18;
  ctx.strokeStyle = '#1d1f23'; ctx.lineWidth = lineW + 2.5;
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(end.x, end.y); ctx.stroke();
  const seg = 6;
  for (let i = 0; i < seg; i++) {
    const a0 = i / seg, a1 = (i + 1) / seg;
    ctx.strokeStyle = i % 2 ? '#ffffff' : '#d8312f'; ctx.lineWidth = lineW + 0.5;
    ctx.beginPath(); ctx.moveTo(piv.x + (end.x - piv.x) * a0, piv.y + (end.y - piv.y) * a0);
    ctx.lineTo(piv.x + (end.x - piv.x) * a1, piv.y + (end.y - piv.y) * a1); ctx.stroke();
  }
  ctx.fillStyle = '#2a2c30';
  ctx.beginPath(); ctx.arc(bx, by, lineW * 0.9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#9aa0a8';
  ctx.beginPath(); ctx.arc(piv.x, piv.y, lineW * 0.75, 0, Math.PI * 2); ctx.fill();

  const T = { x: P.x, y: P.y + up(poleH).y };
  const bw = px(0.36), bh = px(0.15);
  ctx.fillStyle = '#17191c'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(T.x - bw / 2, T.y - bh * 0.85, bw, bh, bh * 0.35); ctx.fill(); ctx.stroke();
  for (let i = 0; i < 2; i++) {
    const lx = T.x + (i ? 1 : -1) * bw * 0.25, ly = T.y - bh * 0.35, r = bh * 0.34;
    const on = phase === i;
    if (on) { ctx.fillStyle = 'rgba(255,60,50,0.28)'; ctx.beginPath(); ctx.arc(lx, ly, r * 2.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = on ? '#ff4a3d' : '#5a1b1b';
    ctx.beginPath(); ctx.arc(lx, ly, r, 0, Math.PI * 2); ctx.fill();
    if (on) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(lx - r * 0.25, ly - r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.strokeStyle = '#f4f4f4'; ctx.lineWidth = Math.max(1.5, px(0.035));
  const cx = T.x, cy = T.y + px(0.09), cr = px(0.075);
  ctx.beginPath(); ctx.moveTo(cx - cr, cy - cr); ctx.lineTo(cx + cr, cy + cr); ctx.moveTo(cx + cr, cy - cr); ctx.lineTo(cx - cr, cy + cr); ctx.stroke();
}
function collectGearDrawablesOnly() {}

// ---------- konektory (kreslí se v pixelech obrazovky) ----------
function connectorPx(zoom) { return Math.min(CFG.S * 0.34 * zoom, Math.max(CFG.S * 0.2 * zoom, 7)); }
function connectorHitPx(zoom) { return Math.min(CFG.S * 0.45 * zoom, Math.max(CFG.S * 0.3 * zoom, 15)); }

function drawConnector(ctx, sx, sy, cn, zoom, opts) {
  const r = connectorPx(zoom) * (opts.big ? 1.25 : 1);
  ctx.save();
  ctx.globalAlpha = opts.dim ? 0.3 : 1;
  if (opts.picked) {
    ctx.beginPath(); ctx.arc(sx, sy, r * 1.75, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,138,31,0.35)'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = CFG.COLOR.pick; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fillStyle = cn.center ? CFG.COLOR.cyan : (cn.diag ? CFG.COLOR.yellow : CFG.COLOR.white);
  ctx.fill();
  ctx.lineWidth = 1.6; ctx.strokeStyle = '#000'; ctx.stroke();
  if (cn.used) {
    ctx.beginPath(); ctx.arc(sx, sy, r * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = cn.own ? '#2a2d31' : '#7a7f86'; ctx.fill();
  }
  ctx.restore();
}

// ---------- svět ----------
function hex2rgb(h) { return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); }
function mixColor(a, b, t) {
  const A_ = hex2rgb(a), B_ = hex2rgb(b);
  return 'rgb(' + A_.map((v, i) => Math.round(v + (B_[i] - v) * t)).join(',') + ')';
}

// Světový obdélník, který je právě vidět (s okrajem pad).
function visWorldRect(pad) {
  const pts = [s2w(0, 0, false), s2w(W, 0, false), s2w(W, H, false), s2w(0, H, false),
               s2w(0, 0, true), s2w(W, 0, true), s2w(W, H, true), s2w(0, H, true)];
  let x0 = 1e12, y0 = 1e12, x1 = -1e12, y1 = -1e12;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}

const OCT_R = AP / Math.cos(Math.PI / 8), SQ_R = CFG.S / SQ2;
const OCT_V = []; for (let i = 0; i < 8; i++) OCT_V.push([OCT_R * Math.cos(Math.PI / 8 + i * Math.PI / 4), OCT_R * Math.sin(Math.PI / 8 + i * Math.PI / 4)]);
function addOct(path, x, y) { for (let i = 0; i < 8; i++) { const v = OCT_V[i]; if (i) path.lineTo(x + v[0], y + v[1]); else path.moveTo(x + v[0], y + v[1]); } path.closePath(); }
function addSq(path, x, y) { path.moveTo(x + SQ_R, y); path.lineTo(x, y + SQ_R); path.lineTo(x - SQ_R, y); path.lineTo(x, y - SQ_R); path.closePath(); }

// Boční stěna a stín mostu (most je ve výšce pevniny, pod ním je voda).
function drawBridgeSide(ctx, cell, rec, lift) {
  const S = CFG.S, ctr = cellCenter(cell);
  const horiz = (((rec.road ? rec.road : railMaskOf(rec.rail))) & 1) === 1;
  const d = horiz ? { x: 1, y: 0 } : { x: 0, y: -1 }, n = horiz ? { x: 0, y: 1 } : { x: 1, y: 0 };
  const w = S * 0.30;
  const poly = () => {
    ctx.beginPath();
    ctx.moveTo(ctr.x - d.x * AP - n.x * w, ctr.y - d.y * AP - n.y * w);
    ctx.lineTo(ctr.x + d.x * AP - n.x * w, ctr.y + d.y * AP - n.y * w);
    ctx.lineTo(ctr.x + d.x * AP + n.x * w, ctr.y + d.y * AP + n.y * w);
    ctx.lineTo(ctr.x - d.x * AP + n.x * w, ctr.y - d.y * AP + n.y * w);
    ctx.closePath();
  };
  applyTransformOff(ctx, 0);
  ctx.save(); ctx.translate(S * 0.1, S * 0.12); poly(); ctx.fillStyle = 'rgba(0,25,55,0.32)'; ctx.fill(); ctx.restore();
  for (let off = lift; off >= 1; off -= 2) {
    applyTransformOff(ctx, off);
    poly(); ctx.fillStyle = mixColor(CFG.COLOR.bridgeTop, CFG.COLOR.bridgeBot, off / lift); ctx.fill();
  }
}

// Terén se mění jen při nové mapě, proto se tvary staví po dílech 10×10 polí jednou a pak se jen kreslí.
const CHUNK = 10;
function getChunk(map, cx, cy) {
  if (!map._chunks) map._chunks = new Map();
  const key = cx + ',' + cy;
  let ch = map._chunks.get(key);
  if (ch) return ch;
  const COLS = CFG.COLS, ROWS = CFG.ROWS, SC = COLS - 1, L = map.land;
  ch = { wA: new Path2D(), wB: new Path2D(), wg: new Path2D(), g1: new Path2D(), g2: new Path2D(), u1: new Path2D(), u2: new Path2D(), lg: new Path2D(), coast: new Path2D(), bd: new Path2D(), bk: new Path2D() };
  const c0 = cx * CHUNK, r0 = cy * CHUNK, c1 = Math.min(COLS - 1, c0 + CHUNK - 1), r1 = Math.min(ROWS - 1, r0 + CHUNK - 1);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const i = r * COLS + c, alt = ((c * 7 + r * 13) % 3) === 0, x = c * A, y = r * A;
    if (!L[i]) { addOct(alt ? ch.wB : ch.wA, x, y); addOct(ch.wg, x, y); }
    else { addOct(map.urban[i] ? (alt ? ch.u2 : ch.u1) : (alt ? ch.g2 : ch.g1), x, y); addOct(ch.lg, x, y); }
    if (c < COLS - 1 && r < ROWS - 1) {
      const si = r * SC + c, sx = (c + 0.5) * A, sy = (r + 0.5) * A;
      if (!map.sland[si]) { addSq(ch.wB, sx, sy); addSq(ch.wg, sx, sy); }
      else { addSq(map.surban[si] ? ch.u2 : ch.g2, sx, sy); addSq(ch.lg, sx, sy); }
    }
  }
  if (map.dOf) {                                              // hranice okresů (tenká) a krajů (silná): po hranách osmiúhelníků a čtverečků
    const dAt = (cc, rr) => (cc < 0 || rr < 0 || cc >= COLS || rr >= ROWS || !L[rr * COLS + cc]) ? -2 : map.dOf[rr * COLS + cc];
    const kAt = (cc, rr) => (cc < 0 || rr < 0 || cc >= COLS || rr >= ROWS || !L[rr * COLS + cc]) ? -2 : map.kOf[rr * COLS + cc];
    const seg = (path, x, y, i) => { const a = OCT_V[i], b = OCT_V[(i + 1) % 8]; path.moveTo(x + a[0], y + a[1]); path.lineTo(x + b[0], y + b[1]); };
    // hrana k osmiúhelníku: OCT_V[i]→OCT_V[i+1] leží na straně směru (i*45°+22.5°+22.5°); sousedé po sudých stranách přímo, po šikmých přes čtvereček
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (!L[r * COLS + c]) continue;
      const x = c * A, y = r * A, d0 = map.dOf[r * COLS + c], k0 = map.kOf[r * COLS + c];
      // vrcholy i=0..7 jdou po směru hodin (y dolů): hrana 0 = jih-východ… viz OCT_V; níže se mapují 4 přímí sousedé
      const nb = [[c + 1, r, 7, 1], [c, r + 1, 1, 1], [c - 1, r, 3, 1], [c, r - 1, 5, 1], [c + 1, r + 1, 0, 0], [c - 1, r + 1, 2, 0], [c - 1, r - 1, 4, 0], [c + 1, r - 1, 6, 0]];
      for (const [nc, nr, ei, straight] of nb) {
        const dn = dAt(nc, nr); if (dn === -2 || dn === d0) continue;
        if (!straight && dn < d0) continue;                          // přes čtvereček kreslí hranu jen jedno z polí
        seg(kAt(nc, nr) !== k0 ? ch.bk : ch.bd, x, y, ei);
      }
    }
  }
  for (const cell of map.coast) {
    if (cell.t === 'o' ? (cell.c < c0 || cell.c > c1 || cell.r < r0 || cell.r > r1) : (cell.c < c0 || cell.c > c1 || cell.r < r0 || cell.r > r1)) continue;
    const q = cellCenter(cell);
    if (cell.t === 'o') addOct(ch.coast, q.x, q.y); else addSq(ch.coast, q.x, q.y);
  }
  map._chunks.set(key, ch);
  return ch;
}

function drawWorld(ctx, state) {
  const { map, net, sel, pick, hoverConn, cam, kind } = state;
  const zoom = cam.zoom, lift = liftPx();
  const COLS = CFG.COLS, ROWS = CFG.ROWS;
  const vr = visWorldRect(1.5 * A);
  const k0 = Math.max(0, Math.floor(vr.x0 / A / CHUNK)), k1 = Math.min(Math.ceil(COLS / CHUNK) - 1, Math.floor(vr.x1 / A / CHUNK));
  const m0 = Math.max(0, Math.floor(vr.y0 / A / CHUNK)), m1 = Math.min(Math.ceil(ROWS / CHUNK) - 1, Math.floor(vr.y1 / A / CHUNK));
  const chunks = [];
  for (let my = m0; my <= m1; my++) for (let mx = k0; mx <= k1; mx++) chunks.push(getChunk(map, mx, my));
  const showGrid = zoom >= 0.5;

  // 1) voda
  applyTransformOff(ctx, 0);
  ctx.fillStyle = CFG.COLOR.water; for (const ch of chunks) ctx.fill(ch.wA);
  ctx.fillStyle = CFG.COLOR.waterDark; for (const ch of chunks) ctx.fill(ch.wB);
  if (showGrid) { ctx.lineWidth = 1 / zoom; ctx.strokeStyle = CFG.COLOR.grid; for (const ch of chunks) ctx.stroke(ch.wg); }

  // 2) stěny mostů
  const inView = cell => { const q = cellCenter(cell); return q.x >= vr.x0 && q.x <= vr.x1 && q.y >= vr.y0 && q.y <= vr.y1; };
  const entries = net.entries();
  if (lift > 0) for (const e of entries) if (inView(e.cell) && !isLandCell(map, e.cell)) drawBridgeSide(ctx, e.cell, e.rec, lift);

  // 3) útesy pobřeží: vrstvy odspodu nahoru
  if (lift > 0) {
    const step = zoom < 0.3 ? 4 : 2;
    for (let off = lift; off >= 1; off -= step) {
      applyTransformOff(ctx, off);
      ctx.fillStyle = mixColor(CFG.COLOR.cliffTop, CFG.COLOR.cliffBot, off / lift);
      for (const ch of chunks) ctx.fill(ch.coast);
    }
  }

  // 4) horní plocha pevniny
  applyTransformOff(ctx, lift);
  ctx.fillStyle = CFG.COLOR.green; for (const ch of chunks) ctx.fill(ch.g1);
  ctx.fillStyle = CFG.COLOR.greenAlt; for (const ch of chunks) ctx.fill(ch.g2);
  ctx.fillStyle = CFG.COLOR.land; for (const ch of chunks) ctx.fill(ch.u1);
  ctx.fillStyle = CFG.COLOR.urbanAlt; for (const ch of chunks) ctx.fill(ch.u2);
  if (showGrid) { ctx.lineWidth = 1 / zoom; ctx.strokeStyle = 'rgba(0,0,0,0.20)'; for (const ch of chunks) ctx.stroke(ch.lg); }
  if (map.dOf && state.showBorders !== false) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (zoom >= 0.35) { ctx.setLineDash([7 / zoom, 4 / zoom]); ctx.lineWidth = 2.4 / zoom; ctx.strokeStyle = 'rgba(96,30,140,0.95)'; for (const ch of chunks) ctx.stroke(ch.bd); ctx.setLineDash([]); }
    ctx.lineWidth = Math.max(2.2, 3.2 / Math.max(zoom, 0.5)) / (zoom < 0.5 ? zoom : 1); ctx.strokeStyle = 'rgba(166,40,40,0.88)';
    for (const ch of chunks) ctx.stroke(ch.bk);
    ctx.lineCap = 'butt';
  }

  // 4b) řeky (splavné toky)
  if (map.nav && map.nav.size) {
    if (!map._navSegs) { map._navSegs = []; for (const k of map.nav) { const [c, r] = k.split(',').map(Number); map._navSegs.push([c, r]); } }
    const vrN = visWorldRect(2 * A), S0 = CFG.S;
    applyTransformOff(ctx, lift);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass ? CFG.COLOR.water : '#2d6a9f'; ctx.lineWidth = S0 * (pass ? 0.66 : 0.84);
      ctx.beginPath();
      for (const [c, r] of map._navSegs) {
        const x = c * A, y = r * A; if (x < vrN.x0 || x > vrN.x1 || y < vrN.y0 || y > vrN.y1) continue;
        ctx.moveTo(x, y); ctx.lineTo(x + 0.01, y);
        for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
          if (!map.nav.has((c + dc) + ',' + (r + dr))) continue;
          if (dc && dr && (map.nav.has((c + dc) + ',' + r) || map.nav.has(c + ',' + (r + dr)))) continue;     // úhlopříčka přes už propojené pole by dělala trojúhelníky
          ctx.moveTo(x, y); ctx.lineTo((c + dc) * A, (r + dr) * A);
        }
      }
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  // 5) doprava (silnice, koleje, mosty)
  if (map.hwx) {
    const vr3 = visWorldRect(2 * A);
    for (const [k, h] of map.hwx) { const cell = cellFromKey(k); if (hwAt(map, cell)) continue; const q = cellCenter(cell); if (q.x < vr3.x0 || q.x > vr3.x1 || q.y < vr3.y0 || q.y > vr3.y1) continue; applyTransformOff(ctx, lift); drawHwxCell(ctx, cell, h); }
  }
  if (map.hw) {
    const jn = [];
    const vr2 = visWorldRect(4 * A);                                   // nájezdy zasahují až 3,4 S do sousedních polí
    for (const [k, h] of map.hw) { const cell = mkO(...k.split(',').map(Number)); const q = cellCenter(cell); if (q.x < vr2.x0 || q.x > vr2.x1 || q.y < vr2.y0 || q.y > vr2.y1) continue; applyTransformOff(ctx, lift); drawHwBase(ctx, cell, h); const rec = net.get(cell); if (rec && hwStructure(map, cell, rec) === 'junction') jn.push([cell, h, rec]); }
    for (const [cell, h, rec] of jn) { applyTransformOff(ctx, lift); setTint(rec); drawHwJunction(ctx, cell, h, rec); clearTint(); }
  }
  applyTransformOff(ctx, lift);
  for (const e of entries) if (inView(e.cell) && !hwAt(map, e.cell) && !hwIsRamp(map, net, e.cell)) {
    const o = e.rec.own, worn = !!o && ((e.rec.road && !o.road.length) || (e.rec.rail.length && !o.rail)) && !hwxProtected(map, e.cell);   // bez majitele: vybledlé, brzy zmizí
    if (worn) ctx.globalAlpha = 0.5;
    drawRecord(ctx, e.cell, e.rec, 1, !isLandCell(map, e.cell));
    if (worn) ctx.globalAlpha = 1;
  }
  for (const tk of map.tokens) {                       // přípojky tokenů: od hrany ke středu (zbytek zakryje podložka)
    for (const pi of tokenPortList(tk, 'road')) { if (!inView(pi.cell)) continue; applyTransformOff(ctx, lift); ctx.save(); cellPath(ctx, pi.cell); ctx.clip(); drawRoadLayer(ctx, pi.cell, 1 << pi.k); ctx.restore(); }
    for (const pi of tokenPortList(tk, 'rail')) { if (!inView(pi.cell)) continue; applyTransformOff(ctx, lift); ctx.save(); drawRailLayer(ctx, pi.cell, [[pi.k, C8]]); ctx.restore(); }
  }
  drawEntities(ctx, state);

  if (!sel) return;

  applyTransformOff(ctx, lift);
  // 6) výběr pole
  const water = !isLandCell(map, sel);
  applyTransformOff(ctx, water ? 0 : lift);
  cellPath(ctx, sel);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
  ctx.lineWidth = 3 / zoom; ctx.strokeStyle = '#fff'; ctx.stroke();

  applyTransformOff(ctx, lift);
  const conns = connectorsOf(map, net, sel);
  if (pick !== null && hoverConn !== null && hoverConn !== pick) {
    const res = checkPair(map, net, sel, kind, pick, hoverConn);
    if (res.ok) {
      res.next.own = { road: [state.me], rail: state.me };
      const hwS = hwAt(map, sel);
      if (hwS) {
        ctx.save(); ctx.globalAlpha = 0.6; setTint(res.next);
        if (hwStructure(map, sel, res.next) === 'junction') { applyTransformOff(ctx, lift); drawHwJunction(ctx, sel, hwS, res.next); }
        else { applyScreen(ctx); for (const pc of hwBridgePieces(sel, hwS, res.next).pieces) pc.fn(ctx); }
        clearTint(); ctx.restore(); applyTransformOff(ctx, lift);
      } else drawRecord(ctx, sel, res.next, 0.6, water);
    }
  }

  // 7) konektory v pixelech obrazovky
  applyScreen(ctx);
  for (const cn of conns) {
    let dim = false;
    if (pick !== null && cn.id !== pick) dim = !checkPair(map, net, sel, kind, pick, cn.id).ok;
    const p = w2s(cn.x, cn.y, true);
    drawConnector(ctx, p.x, p.y, cn, zoom, { picked: pick === cn.id, big: hoverConn === cn.id, dim });
  }
}
