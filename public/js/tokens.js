// Tokeny: města, průmysl a ložiska. Každý token je kulatá podložka položená přes jeden osmiúhelník.
// Typy, zboží a receptury jsou v goods.js. Uvnitř tokenu vozidla zmizí (odbavení) a po čase vyjedou.
//
// Přípojky: jen na 4 rovných hranách osmiúhelníku (0=V, 2=S, 4=Z, 6=J), tedy jen směrem k dalšímu osmiúhelníku.
// Přípojky určuje hra (náhodně na volných hranách podle úrovně). Hráč je nemění; při povýšení přibude další.
//   město:   1 vesnice 1 silnice · 2 malé město 2 silnice · 3 město 2 silnice + 1 kolej ·
//            4 velkoměsto 3 silnice + 1 kolej, nebo 2 silnice + 2 koleje
//   průmysl: 1 → 1 silnice · 2 → 1 silnice + 1 kolej · 3 → 2 silnice + 2 koleje
// Obsazenost: město bez omezení; průmysl pojme na každou připojenou silnici 2 vozidla, na každou kolej 2 vlaky.

function hash2(a, b, s) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, s), b = hash2(x0 + 1, y0, s), c = hash2(x0, y0 + 1, s), d = hash2(x0 + 1, y0 + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const PORT_EDGES = [0, 2, 4, 6];
const DISC_H = 0.14;                       // výška podložky (násobek S)
const DISC_R = 1.12;                       // poloměr podložky (násobek S)
const DWELL_CITY = 3.2, DWELL_IND = 5.5;   // doba odbavení jednoho vozidla / jednoho vagonu (s) na úrovni 1

// ---------- dotazy ----------
function tokenAt(map, cell) {
  if (!map || !map.tokenIdx || !cell) return null;
  return map.tokenIdx.get((cell.t === 's' ? 's' : '') + cell.c + ',' + cell.r) || null;
}
// Víceokenová města (velkoměsto = 2 pole, Praha = 2×2): tk.cells = osmiúhelníky, tk.sq = vnitřní čtverečky.
// Kód přípojky = hrana (0–7) + 8 × pořadí pole v tk.cells; u jednopolových tokenů je to prostě číslo hrany.
function tokenCellList(tk) { return tk.cells || [{ c: tk.c, r: tk.r }]; }
function portInfo(tk, code) { const q = tokenCellList(tk)[code >> 3] || tokenCellList(tk)[0]; return { cell: mkO(q.c, q.r), k: code & 7 }; }
function tokenPortList(tk, kind) { return tk[kind].map(code => portInfo(tk, code)); }
function tokenMaskAt(tk, cell, kind) {
  let m = 0; if (!cell || cell.t !== 'o') return 0;
  const cl = tokenCellList(tk);
  for (const code of tk[kind]) { const q = cl[code >> 3]; if (q && q.c === cell.c && q.r === cell.r) m |= 1 << (code & 7); }
  return m;
}
function tokenById(id) {
  const m = state.map;
  return m && m.tokens ? (m.tokens.find(t => t.id === id) || null) : null;
}
function tokenMask(tk, kind) { let m = 0; for (const k of tk[kind]) m |= 1 << k; return m; }
function tokenDef(tk) { return TOKEN_TYPES[tk.type]; }
function isCity(tk) { return !!TOKEN_TYPES[tk.type].city; }
function isDeposit(tk) { return !!TOKEN_TYPES[tk.type].dep; }
function tokenMaxLevel(tk) { return TOKEN_TYPES[tk.type].levels; }
function tokenLevelName(tk) { return isCity(tk) ? CITY_LEVELS[tk.level - 1] : 'Úroveň ' + tk.level; }
function tokenTitle(tk) { return isCity(tk) ? tokenLevelName(tk) : TOKEN_TYPES[tk.type].name; }

// Povolené počty přípojek pro úroveň: { road, rail, alt? }
function tokenRules(tk) {
  if (TOKEN_TYPES[tk.type].port) return { road: 2, rail: 0 };
  if (isDeposit(tk)) return { road: 0, rail: 0 };
  if (tk.special === 'praha') return { road: 6, rail: 2 };       // Praha 2×2: 8 přípojek, z toho koleje na jih a na východ
  if (isCity(tk)) return [{ road: 1, rail: 0 }, { road: 2, rail: 0 }, { road: 2, rail: 1 }, { road: 3, rail: 1, alt: { road: 3, rail: 2 } }][tk.level - 1];
  return [{ road: 1, rail: 0 }, { road: 1, rail: 1 }, { road: 2, rail: 2 }][tk.level - 1];
}
function rulesText(tk) {
  const r = tokenRules(tk), w = (n, a, b) => n + ' ' + (n === 1 ? a : b);
  const base = w(r.road, 'silnice', 'silnice') + (r.rail ? ' + ' + w(r.rail, 'kolej', 'koleje') : '');
  return r.alt ? base + ' nebo ' + w(r.alt.road, 'silnice', 'silnice') + ' + ' + w(r.alt.rail, 'kolej', 'koleje') : base;
}
function tokenCap(tk, kind) { if (kind === 'ship') return TOKEN_TYPES[tk.type].port ? 3 : 0; return isCity(tk) ? Infinity : tk[kind].length * 2; }
function tokenDwell(tk) { return (isCity(tk) ? DWELL_CITY : DWELL_IND) * (1 - 0.1 * (tk.level - 1)); }
function tokenFree(tk, kind) { return tk.occ[kind].length < tokenCap(tk, kind); }
function occEnter(tk, kind, u) { if (!tk.occ[kind].includes(u)) tk.occ[kind].push(u); }
function occLeave(tk, kind, u) { const i = tk.occ[kind].indexOf(u); if (i >= 0) tk.occ[kind].splice(i, 1); }
function tokenCenter(tk) {
  if (!tk.cells || tk.cells.length < 2) return { x: tk.c * A, y: tk.r * A };
  let x = 0, y = 0; for (const q of tk.cells) { x += q.c * A; y += q.r * A; }
  return { x: x / tk.cells.length, y: y / tk.cells.length };
}

// Kódy přípojek, které smí token mít (soused je pevnina a není token).
function validPortEdges(map, tk) {
  const out = [];
  tokenCellList(tk).forEach((q, i) => {
    const cell = mkO(q.c, q.r);
    for (const k of PORT_EDGES) {
      const nb = neighborAcross(cell, k);
      if (cellExists(nb.cell) && isLandCell(map, nb.cell) && !tokenAt(map, nb.cell)) out.push(k + 8 * i);
    }
  });
  return out;
}

// Doplní přípojky do počtu, který povoluje úroveň. Hra je rozloží náhodně na volné hrany.
// Praha: koleje pevně na jih (dolní pravé pole) a na východ (horní pravé pole), zbytek jsou silnice.
function assignPorts(map, tk) {
  const r = tokenRules(tk);
  if (!r.road && !r.rail) return;
  const valid = validPortEdges(map, tk).filter(k => !tk.road.includes(k) && !tk.rail.includes(k));
  if (tk.special === 'praha') {
    for (const code of [3 * 8 + 6, 1 * 8 + 0]) { const i = valid.indexOf(code); if (i >= 0) { tk.rail.push(code); valid.splice(i, 1); } }
    for (const code of valid) if (tk.road.length < r.road) tk.road.push(code);
    return;
  }
  const rng = mulberry32((tk.id * 7919 + tk.level * 104729 + (state.seedNum | 0)) >>> 0);
  let target = r;
  if (r.alt && rng() < 0.5) target = r.alt;
  const free = valid;
  for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
  let needRoad = target.road - tk.road.length, needRail = target.rail - tk.rail.length;
  while (needRoad > 0 && free.length) { tk.road.push(free.pop()); needRoad--; }
  while (needRail > 0 && free.length) { tk.rail.push(free.pop()); needRail--; }
}

// Konektory vybraného pole tokenu: jen rovné hrany. Přípojky jsou pevné, takže se klikem nemění.
function tokenConnectors(map, net, tk, sel) {
  const out = [], cl = tokenCellList(tk);
  const idx = cl.findIndex(q => sel && sel.t === 'o' && q.c === sel.c && q.r === sel.r);
  if (idx < 0) return out;
  const cell = mkO(cl[idx].c, cl[idx].r), ctr = cellCenter(cell);
  for (const k of PORT_EDGES) {
    const nb = neighborAcross(cell, k);
    if (!cellExists(nb.cell) || !isLandCell(map, nb.cell) || tokenAt(map, nb.cell)) continue;
    const code = k + 8 * idx, v = edgeVec(cell, k), own = tk.road.includes(code) || tk.rail.includes(code);
    out.push({ id: k, x: ctr.x + v.x, y: ctr.y + v.y, diag: false, own, used: own, port: own ? (tk.road.includes(code) ? 'road' : 'rail') : null });
  }
  return out;
}

// ---------- scény uvnitř tokenů ----------
const WALL_H = ['#e3d9c4', '#d9c9ab', '#cfd6d9', '#e0b9a0', '#f0e8d2', '#d8c4a0'];
const ROOF_H = ['#a24b3b', '#8a4a3a', '#6b6f78', '#7a5a46', '#9a5b45'];
const WALL_C = ['#b9bfc6', '#a4acb5', '#c8c2b4', '#9aa6b2', '#d0cdc6', '#8f9aa6'];
const pickc = (arr, v) => arr[Math.floor(v * arr.length) % arr.length];

function buildTokenScene(tk) {
  const S = CFG.S, parts = [];
  let cx = tk.c * A, cy = tk.r * A, sdo = 0;
  let hmax = 0.5;
  const rnd = i => hash2(tk.id + sdo, i, 77);
  const P = (ox, oy) => ({ x: cx + ox * S, y: cy + oy * S });
  const up = h => { hmax = Math.max(hmax, h); };
  const bld = (ox, oy, w, d, h, k, col, roof, extra) => { parts.push(Object.assign({ t: 'bld', w, d, h, k, col, roof, idx: tk.id * 100 + parts.length, z: DISC_H }, extra || {}, P(ox, oy))); up(DISC_H + h + (k === 'house' ? 0.1 : 0) + (extra && extra.chim ? 1.1 : 0)); };
  const box = (ox, oy, w, d, h, col, top, z) => { parts.push(Object.assign({ t: 'box', w, d, h, col, top, z0: DISC_H + (z || 0) }, P(ox, oy))); up(DISC_H + (z || 0) + h); };
  const cyl = (ox, oy, r, h, col, extra, z) => { parts.push(Object.assign({ t: 'cyl', r, h, col, z0: DISC_H + (z || 0) }, extra || {}, P(ox, oy))); up(DISC_H + (z || 0) + h + (extra && extra.steam ? 0.7 : 0)); };
  const pile = (ox, oy, w, d, h, c1, c2) => { parts.push(Object.assign({ t: 'pile', w, d, h, z0: DISC_H, c1, c2 }, P(ox, oy))); up(DISC_H + h); };
  const tree = (ox, oy, s, k) => { parts.push(Object.assign({ t: 'tree', s, k, g: rnd(parts.length), z: DISC_H }, P(ox, oy))); up(DISC_H + 0.7 * s); };
  const house = (ox, oy, i, sc) => bld(ox, oy, (0.5 + rnd(i) * 0.12) * (sc || 1), (0.42 + rnd(i + 20) * 0.1) * (sc || 1), 0.42 + rnd(i + 40) * 0.2, 'house', pickc(WALL_H, rnd(i + 60)), pickc(ROOF_H, rnd(i + 80)));
  const crops = (x0, y0, nx, ny, col, top) => { for (let i = 0; i < nx; i++) box(x0 + i * 0.2, y0, 0.14, ny * 0.17, 0.06, col, top); };
  const L = tk.level;

  const sceneCells = [[tk.c * A, tk.r * A, 0]];
  if (tk.cells && tk.cells.length > 1) { sceneCells.length = 0; tk.cells.forEach((q, i) => sceneCells.push([q.c * A, q.r * A, i * 17])); (tk.sq || []).forEach((q, i) => { const p = cellCenter(mkS(q.c, q.r)); sceneCells.push([p.x, p.y, 90 + i]); }); }
  for (const sc of sceneCells) {
  cx = sc[0]; cy = sc[1]; sdo = sc[2];
  switch (tk.type) {
    case 'city':
      if (L === 1) { house(0.02, 0.02, 1, 1.1); tree(-0.5, -0.34, 0.85, 0); tree(0.5, 0.42, 0.7, 1); tree(-0.45, 0.46, 0.6, 0); }
      else if (L === 2) { [[-0.46, -0.4], [0.08, -0.52], [0.52, -0.22], [-0.52, 0.18], [0.04, 0.08], [0.5, 0.42]].forEach((p, i) => house(p[0], p[1], i + 1, 0.9)); tree(-0.2, -0.2, 0.6, 1); tree(0.28, 0.24, 0.6, 0); }
      else if (L === 3) {
        bld(-0.2, -0.12, 0.62, 0.5, 0.95, 'block', pickc(WALL_C, rnd(1)), '#707880'); bld(0.4, -0.3, 0.42, 0.4, 0.7, 'block', pickc(WALL_C, rnd(2)), '#707880');
        [[-0.56, 0.4], [0.06, 0.55], [0.56, 0.2], [-0.52, -0.52]].forEach((p, i) => house(p[0], p[1], i + 5, 0.82)); tree(0.3, 0.42, 0.6, 1);
      } else {
        [[0, -0.05, 0.38, 2.5], [-0.46, -0.28, 0.34, 1.8], [0.44, -0.34, 0.34, 2.1], [-0.3, 0.4, 0.34, 1.45], [0.36, 0.34, 0.36, 1.7]].forEach((p, i) => bld(p[0], p[1], p[2], p[2], p[3], 'tower', pickc(WALL_C, rnd(i + 1)), '#707880'));
        bld(-0.64, 0.08, 0.28, 0.3, 0.6, 'block', pickc(WALL_C, rnd(9)), '#707880'); bld(0.64, 0.02, 0.26, 0.3, 0.55, 'block', pickc(WALL_C, rnd(10)), '#707880');
      }
      break;
    case 'dep_coal':
      pile(-0.2, -0.1, 0.8, 0.5, 0.36); pile(0.35, 0.3, 0.55, 0.4, 0.26); pile(-0.35, 0.42, 0.45, 0.3, 0.2); box(0.42, -0.35, 0.3, 0.18, 0.12, '#59616b', '#7a828c');
      break;
    case 'dep_limestone':
      pile(-0.15, -0.1, 0.8, 0.55, 0.4, '#d9d6cb', '#efece2'); pile(0.4, 0.3, 0.55, 0.4, 0.28, '#c7c3b6', '#e3dfd3'); box(-0.4, 0.42, 0.26, 0.22, 0.2, '#e6e3d8', '#f2efe6');
      break;
    case 'dep_field':
      crops(-0.55, -0.5, 6, 3, '#b9a84a', '#d8c85c'); crops(-0.55, 0.12, 6, 3, '#9fb352', '#bccc66'); tree(0.62, -0.5, 0.8, 0); tree(-0.62, 0.62, 0.7, 0);
      break;
    case 'coalmine':
      box(-0.42, -0.22, 0.17, 0.17, 1.15, '#3b4048', '#5a626c'); box(-0.42, -0.22, 0.36, 0.14, 0.12, '#59616b', '#7a828c', 1.15);
      bld(0.14, -0.06, 0.62, 0.46, 0.34, 'ware', '#8b8f94', '#5a3b30'); pile(0.3, 0.52, 0.7, 0.4, 0.22); pile(-0.1, 0.52, 0.55, 0.38, 0.2);
      if (L >= 2) { cyl(0.55, -0.46, 0.16, 0.72, '#9aa0a6', { top: '#69707a' }); box(0.16, 0.26, 0.8, 0.1, 0.1, '#5f656c', '#7c828a', 0.24); }
      if (L >= 3) { box(-0.62, 0.22, 0.17, 0.17, 0.9, '#3b4048', '#5a626c'); bld(-0.5, 0.58, 0.34, 0.28, 0.3, 'house', '#c9bfa8', '#7a4a3a'); pile(0.66, 0.26, 0.4, 0.3, 0.3); }
      break;
    case 'quarry':
      pile(-0.3, 0.1, 0.9, 0.6, 0.34, '#d9d6cb', '#efece2'); pile(0.35, 0.35, 0.5, 0.36, 0.22, '#c7c3b6', '#e3dfd3');
      box(0.4, -0.3, 0.5, 0.3, 0.3, '#8a8f95', '#aab0b6'); box(-0.5, -0.4, 0.14, 0.14, 0.7, '#c8a13c', '#e0bb55');
      if (L >= 2) { cyl(0.62, 0.05, 0.14, 0.6, '#b9bcc0', { top: '#8c9096' }); box(0.1, -0.42, 0.7, 0.08, 0.08, '#c8a13c', '#e0bb55', 0.62); }
      if (L >= 3) { bld(-0.56, 0.5, 0.34, 0.28, 0.28, 'ware', '#b9b5aa', '#5a3b30'); pile(0.1, 0.6, 0.4, 0.3, 0.2, '#d9d6cb', '#efece2'); }
      break;
    case 'lumber':
      bld(0.3, -0.25, 0.5, 0.4, 0.32, 'house', '#9a7a52', '#5a3b30');
      for (let i = 0; i < 3; i++) box(-0.45, -0.1 + i * 0.22, 0.8, 0.14, 0.12, '#8a5a32', '#b4824f');
      box(-0.45, 0.1, 0.8, 0.14, 0.12, '#8a5a32', '#b4824f', 0.12);
      tree(0.55, 0.5, 0.9, 1); tree(-0.5, 0.58, 0.8, 1); tree(0.1, 0.62, 0.7, 1);
      if (L >= 2) { box(0.45, 0.1, 0.34, 0.24, 0.26, '#7a6a55', '#9b8970'); box(-0.1, -0.5, 0.6, 0.12, 0.2, '#8a5a32', '#b4824f'); }
      if (L >= 3) { box(0.62, -0.5, 0.12, 0.12, 0.8, '#6a4a2a', '#8b6a44'); box(0.2, 0.42, 0.5, 0.12, 0.24, '#8a5a32', '#b4824f'); }
      break;
    case 'pump':
      cyl(-0.26, -0.14, 0.3, 0.5, '#b7c6d0', { top: '#8aa0ae' }); bld(0.4, 0.3, 0.46, 0.38, 0.3, 'ware', '#c9c1a8', '#3f6f9a'); box(0.0, 0.5, 0.6, 0.09, 0.07, '#6d8798', '#8fa7b6', 0.0);
      if (L >= 2) { cyl(0.36, -0.4, 0.22, 0.46, '#b7c6d0', { top: '#8aa0ae' }); cyl(-0.56, 0.38, 0.05, 0.8, '#8a9097'); cyl(-0.56, 0.38, 0.17, 0.2, '#b7c6d0', { top: '#8aa0ae' }, 0.8); }
      if (L >= 3) { cyl(-0.05, 0.12, 0.2, 0.42, '#b7c6d0', { top: '#8aa0ae' }); bld(0.6, -0.05, 0.3, 0.46, 0.4, 'ware', '#b9b5aa', '#4d6877'); }
      break;
    case 'cornfarm':
      bld(0.35, -0.3, 0.5, 0.4, 0.45, 'ware', '#b8473a', '#6b6f78'); cyl(-0.05, -0.4, 0.15, 0.78, '#c9ccd0', { top: '#8f949a' });
      crops(-0.6, 0.0, 4, 3, '#c9b73c', '#e5d556'); crops(0.2, 0.15, 3, 3, '#b2c24a', '#cddb62'); tree(0.62, 0.55, 0.8, 0);
      if (L >= 2) { cyl(-0.4, -0.45, 0.14, 0.7, '#c9ccd0', { top: '#8f949a' }); crops(-0.2, 0.62, 4, 1, '#c9b73c', '#e5d556'); }
      if (L >= 3) { bld(0.62, 0.0, 0.3, 0.3, 0.3, 'house', '#e3d9c4', '#8a4a3a'); box(-0.6, -0.1, 0.5, 0.1, 0.18, '#8a8f95', '#aab0b6'); }
      break;
    case 'animalfarm':
      bld(0.25, -0.3, 0.6, 0.45, 0.5, 'ware', '#b8473a', '#5a4a40'); box(-0.3, 0.2, 0.9, 0.7, 0.07, '#8a9a5a', '#a6b672');
      for (let i = 0; i < 4; i++) box(-0.6 + (i % 2) * 0.42 + 0.2, 0.0 + Math.floor(i / 2) * 0.34 + 0.1, 0.17, 0.1, 0.12, i % 2 ? '#f0ece4' : '#5a4636', i % 2 ? '#fffdf8' : '#7a6046', 0.07);
      cyl(0.58, 0.1, 0.13, 0.6, '#c9ccd0', { top: '#8f949a' });
      if (L >= 2) { bld(0.55, 0.52, 0.4, 0.3, 0.3, 'ware', '#c9c1a8', '#6b6f78'); for (let i = 0; i < 3; i++) box(-0.4 + i * 0.3, 0.55, 0.15, 0.1, 0.11, '#f0ece4', '#fffdf8', 0.07); }
      if (L >= 3) { cyl(0.2, 0.15, 0.13, 0.6, '#c9ccd0', { top: '#8f949a' }); bld(-0.5, -0.42, 0.34, 0.3, 0.3, 'house', '#e3d9c4', '#8a4a3a'); }
      break;
    case 'slaughter':
      bld(0.05, -0.12, 0.8, 0.55, 0.45, 'factory', '#d8c9c4', '#7a5a55', { chim: true });
      box(-0.45, 0.5, 0.5, 0.34, 0.07, '#9a8a80', '#b4a49a'); for (let i = 0; i < 2; i++) box(-0.6 + i * 0.28, 0.5, 0.14, 0.1, 0.11, '#e8b0b0', '#f6c8c8', 0.07);
      bld(0.5, 0.5, 0.36, 0.3, 0.26, 'ware', '#c9c1a8', '#4d6877');
      if (L >= 2) { box(-0.6, -0.4, 0.3, 0.3, 0.3, '#b9b5aa', '#d0ccc2'); cyl(0.62, -0.46, 0.12, 0.6, '#c9ccd0', { top: '#8f949a' }); }
      if (L >= 3) bld(-0.05, 0.55, 0.5, 0.3, 0.3, 'ware', '#d8c9c4', '#7a5a55');
      break;
    case 'sawmill':
      bld(0.15, -0.2, 0.9, 0.5, 0.4, 'ware', '#b09a72', '#5a3b30'); for (let i = 0; i < 3; i++) box(-0.55, 0.28 + i * 0.12, 0.5, 0.1, 0.1, '#8a5a32', '#b4824f');
      for (let i = 0; i < 2; i++) box(0.2, 0.35 + i * 0.14, 0.5, 0.12, 0.08, '#d9b878', '#ead29a');
      tree(0.65, 0.55, 0.8, 1); cyl(-0.55, -0.45, 0.1, 0.8, '#9a9288', { top: '#6b665e' });
      if (L >= 2) { box(0.55, 0.0, 0.3, 0.5, 0.22, '#d9b878', '#ead29a'); bld(-0.6, 0.0, 0.26, 0.3, 0.26, 'house', '#c9bfa8', '#7a4a3a'); }
      if (L >= 3) { cyl(0.5, -0.5, 0.1, 0.9, '#9a9288', { top: '#6b665e' }); box(-0.1, 0.62, 0.7, 0.1, 0.2, '#8a5a32', '#b4824f'); }
      break;
    case 'furniture':
      bld(0.0, -0.2, 0.9, 0.55, 0.5, 'factory', '#c7b7a6', '#6f5f4f', { chim: L >= 2 });
      for (let i = 0; i < 3; i++) box(-0.55 + i * 0.3, 0.42, 0.22, 0.18, 0.13 + i * 0.03, '#a67c52', '#c49a6c');
      box(0.55, 0.4, 0.3, 0.3, 0.12, '#d9b878', '#ead29a');
      if (L >= 2) bld(0.55, -0.45, 0.34, 0.3, 0.3, 'ware', '#b9b5aa', '#5a3b30');
      if (L >= 3) { bld(-0.58, -0.45, 0.34, 0.3, 0.34, 'ware', '#d0c4b4', '#6f5f4f'); box(-0.1, 0.62, 0.6, 0.1, 0.14, '#a67c52', '#c49a6c'); }
      break;
    case 'cement':
      cyl(-0.35, -0.3, 0.17, 0.95, '#c9ccd0', { top: '#8f949a' }); cyl(-0.0, -0.4, 0.17, 0.95, '#c9ccd0', { top: '#8f949a' });
      bld(0.3, 0.0, 0.7, 0.5, 0.42, 'factory', '#b7b9bc', '#5d6166', { chim: L >= 2 }); pile(-0.35, 0.45, 0.6, 0.4, 0.22, '#d9d6cb', '#efece2');
      if (L >= 2) { box(-0.1, 0.1, 0.9, 0.12, 0.12, '#7a8087', '#9aa0a6', 0.3); cyl(0.6, -0.5, 0.16, 0.9, '#c9ccd0', { top: '#8f949a' }); }
      if (L >= 3) { cyl(0.2, 0.6, 0.17, 0.85, '#c9ccd0', { top: '#8f949a' }); pile(0.6, 0.45, 0.4, 0.3, 0.2, '#b9bcc0', '#d6d9dd'); }
      break;
    case 'dep_iron':
      pile(-0.2, -0.1, 0.8, 0.5, 0.34, '#7a4a38', '#9a6450'); pile(0.36, 0.3, 0.55, 0.4, 0.26, '#6a3f30', '#8a5a48'); box(0.42, -0.35, 0.3, 0.18, 0.12, '#59616b', '#7a828c');
      break;
    case 'dep_sand':
      pile(-0.2, -0.05, 0.85, 0.55, 0.3, '#d6c58a', '#ecdca4'); pile(0.38, 0.32, 0.55, 0.4, 0.22, '#c9b777', '#e2d296'); box(-0.45, 0.42, 0.26, 0.2, 0.14, '#8a8f95', '#aab0b6');
      break;
    case 'ironmine':
      box(-0.42, -0.22, 0.17, 0.17, 1.15, '#4a3a32', '#6a564a'); box(-0.42, -0.22, 0.36, 0.14, 0.12, '#6a564a', '#8a7466', 1.15);
      bld(0.14, -0.06, 0.62, 0.46, 0.34, 'ware', '#8b7268', '#5a3b30'); pile(0.3, 0.52, 0.7, 0.4, 0.22, '#7a4a38', '#9a6450'); pile(-0.1, 0.52, 0.55, 0.38, 0.2, '#6a3f30', '#8a5a48');
      if (L >= 2) { cyl(0.55, -0.46, 0.16, 0.72, '#9aa0a6', { top: '#69707a' }); box(0.16, 0.26, 0.8, 0.1, 0.1, '#5f656c', '#7c828a', 0.24); }
      if (L >= 3) { box(-0.62, 0.22, 0.17, 0.17, 0.9, '#4a3a32', '#6a564a'); pile(0.66, 0.26, 0.4, 0.3, 0.3, '#7a4a38', '#9a6450'); }
      break;
    case 'sandpit':
      pile(-0.3, 0.1, 0.95, 0.6, 0.3, '#d6c58a', '#ecdca4'); pile(0.35, 0.35, 0.5, 0.36, 0.22, '#c9b777', '#e2d296');
      box(0.4, -0.3, 0.5, 0.3, 0.3, '#8a8f95', '#aab0b6'); box(-0.5, -0.4, 0.14, 0.14, 0.6, '#c8a13c', '#e0bb55');
      if (L >= 2) box(0.1, -0.42, 0.7, 0.08, 0.08, '#c8a13c', '#e0bb55', 0.55);
      if (L >= 3) { bld(-0.56, 0.5, 0.34, 0.28, 0.28, 'ware', '#b9b5aa', '#5a3b30'); pile(0.1, 0.6, 0.4, 0.3, 0.2, '#d6c58a', '#ecdca4'); }
      break;
    case 'grainfarm':
      bld(0.35, -0.3, 0.5, 0.4, 0.4, 'ware', '#c9b273', '#6b5a38'); cyl(-0.05, -0.4, 0.15, 0.78, '#d4d0c0', { top: '#9a9684' }); cyl(-0.4, -0.38, 0.14, 0.7, '#d4d0c0', { top: '#9a9684' });
      crops(-0.6, 0.1, 5, 3, '#d9b94a', '#f0d46a'); crops(0.1, 0.25, 3, 2, '#cbb040', '#e6cb5e'); tree(0.62, 0.55, 0.8, 0);
      if (L >= 2) { cyl(-0.2, -0.45, 0.13, 0.65, '#d4d0c0', { top: '#9a9684' }); crops(-0.3, 0.62, 5, 1, '#d9b94a', '#f0d46a'); }
      if (L >= 3) bld(0.62, 0.05, 0.3, 0.3, 0.3, 'house', '#e3d9c4', '#8a4a3a');
      break;
    case 'mill':
      bld(0.0, -0.1, 0.7, 0.5, 0.55, 'ware', '#e0d8c4', '#7a6a50'); cyl(-0.48, -0.3, 0.17, 0.9, '#e8e2d0', { taper: 0.7, top: '#9a8a70' });
      box(0.45, 0.4, 0.4, 0.3, 0.16, '#cfc7b4', '#efe6cc'); box(-0.3, 0.5, 0.3, 0.2, 0.12, '#f0ece0', '#fffdf6');
      if (L >= 2) { cyl(0.55, -0.45, 0.12, 0.7, '#c9ccd0', { top: '#8f949a' }); box(-0.62, 0.1, 0.2, 0.5, 0.2, '#cfc7b4', '#efe6cc'); }
      if (L >= 3) { bld(0.1, 0.62, 0.5, 0.26, 0.3, 'ware', '#d6ceba', '#6b5f48'); }
      break;
    case 'bakery':
      bld(0.0, -0.15, 0.8, 0.55, 0.42, 'factory', '#e4cfae', '#8a6446', { chim: true });
      for (let i = 0; i < 3; i++) box(-0.5 + i * 0.28, 0.48, 0.2, 0.16, 0.12, '#c98a4a', '#e0a866');
      bld(0.52, 0.45, 0.34, 0.3, 0.26, 'ware', '#c9c1a8', '#8a4a3a');
      if (L >= 2) box(-0.6, -0.4, 0.3, 0.3, 0.3, '#d9c5a4', '#eedcbc');
      if (L >= 3) bld(0.55, -0.45, 0.34, 0.3, 0.3, 'ware', '#e4cfae', '#8a6446');
      break;
    case 'brewery':
      bld(0.1, -0.2, 0.8, 0.5, 0.45, 'factory', '#c9906a', '#6a3f2a', { chim: true });
      cyl(-0.5, -0.25, 0.15, 0.8, '#d6a548', { top: '#8f6a22' }); cyl(-0.5, 0.15, 0.15, 0.7, '#d6a548', { top: '#8f6a22' });
      for (let i = 0; i < 3; i++) box(-0.2 + i * 0.28, 0.5, 0.2, 0.16, 0.12, '#d9a032', '#f0c24e');
      if (L >= 2) { cyl(0.58, 0.3, 0.14, 0.7, '#d6a548', { top: '#8f6a22' }); bld(0.55, -0.5, 0.34, 0.3, 0.3, 'ware', '#c9c1a8', '#6a3f2a'); }
      if (L >= 3) cyl(0.2, 0.62, 0.14, 0.65, '#d6a548', { top: '#8f6a22' });
      break;
    case 'dairy':
      bld(0.05, -0.15, 0.8, 0.55, 0.42, 'factory', '#ecebe4', '#5d7f9a', { chim: false });
      cyl(-0.5, -0.3, 0.15, 0.8, '#e6eaee', { top: '#a9b4be' }); cyl(-0.5, 0.1, 0.15, 0.7, '#e6eaee', { top: '#a9b4be' });
      for (let i = 0; i < 3; i++) box(-0.15 + i * 0.28, 0.5, 0.2, 0.16, 0.12, '#fffbe6', '#f2ecd0');
      if (L >= 2) bld(0.55, 0.42, 0.34, 0.3, 0.26, 'ware', '#d0d6dc', '#5d7f9a');
      if (L >= 3) cyl(0.55, -0.45, 0.12, 0.65, '#e6eaee', { top: '#a9b4be' });
      break;
    case 'glass':
      bld(0.0, -0.1, 0.85, 0.55, 0.45, 'factory', '#b9c6cc', '#5c7480', { chim: true });
      for (let i = 0; i < 3; i++) box(-0.55 + i * 0.28, 0.5, 0.2, 0.16, 0.14, '#8fc9d8', '#b8e4ee');
      pile(0.5, 0.45, 0.5, 0.36, 0.2, '#d6c58a', '#ecdca4');
      if (L >= 2) cyl(0.6, -0.45, 0.14, 0.9, '#c9ccd0', { top: '#8f949a' });
      if (L >= 3) bld(-0.58, -0.45, 0.34, 0.3, 0.32, 'ware', '#b9c6cc', '#5c7480');
      break;
    case 'steel':
      bld(0.1, -0.15, 0.9, 0.6, 0.5, 'factory', '#8f949a', '#4d5158', { chim: true });
      cyl(-0.5, -0.35, 0.17, 1.05, '#7a7f86', { top: '#4d5158' }); cyl(-0.2, -0.5, 0.14, 1.2, '#7a7f86', { band: '#c0392b' });
      for (let i = 0; i < 3; i++) box(-0.55 + i * 0.3, 0.5, 0.24, 0.16, 0.12, '#6c7380', '#8d95a3');
      pile(0.55, 0.45, 0.5, 0.36, 0.22, '#7a4a38', '#9a6450');
      if (L >= 2) { cyl(0.6, -0.5, 0.17, 1.0, '#7a7f86', { top: '#4d5158' }); box(-0.1, 0.1, 0.8, 0.12, 0.12, '#7a8087', '#9aa0a6', 0.3); }
      if (L >= 3) bld(-0.6, 0.1, 0.3, 0.5, 0.4, 'ware', '#8f949a', '#4d5158');
      break;
    case 'machines':
      bld(0.0, -0.2, 0.9, 0.55, 0.45, 'factory', '#b6bbc2', '#575d66', { chim: L >= 2 });
      for (let i = 0; i < 3; i++) box(-0.55 + i * 0.3, 0.42, 0.22, 0.2, 0.18 + i * 0.03, '#4a6fa5', '#6c91c7');
      box(0.55, 0.4, 0.3, 0.3, 0.14, '#6c7380', '#8d95a3');
      if (L >= 2) bld(0.55, -0.45, 0.34, 0.3, 0.3, 'ware', '#b9b5aa', '#575d66');
      if (L >= 3) { bld(-0.58, -0.45, 0.34, 0.3, 0.34, 'ware', '#c9ced4', '#575d66'); box(-0.1, 0.62, 0.6, 0.1, 0.16, '#4a6fa5', '#6c91c7'); }
      break;
    case 'port':
      box(-0.05, 0.5, 1.6, 0.26, 0.09, '#9aa3ad', '#b9c1c9'); bld(-0.3, -0.22, 0.7, 0.45, 0.36, 'ware', '#b9b5aa', '#4d6877');
      cyl(0.55, -0.15, 0.06, 0.95, '#c0392b', {}); box(0.2, -0.15, 0.7, 0.07, 0.07, '#c0392b', '#d9554a', 0.95);
      for (let i = 0; i < 3; i++) box(-0.6 + i * 0.3, 0.1, 0.22, 0.16, 0.14, ['#c0392b', '#2f6fb3', '#d9a032'][i], ['#d9554a', '#4f8fd3', '#f0c24e'][i]);
      break;
    case 'power':
      box(-0.04, 0.2, 0.92, 0.5, 0.52, '#aab1b9', '#6f767e'); box(-0.34, -0.22, 0.5, 0.34, 0.9, '#bcc1c7', '#7d838a');
      cyl(-0.58, -0.46, 0.09, 1.5, '#d8d8d8', { band: '#c0392b' }); pile(-0.5, 0.6, 0.5, 0.3, 0.2);
      if (L >= 2) cyl(0.48, -0.1, 0.27, 1.0, '#d3d6da', { taper: 0.72, steam: true });
      if (L >= 3) { cyl(0.4, 0.52, 0.24, 0.9, '#d3d6da', { taper: 0.72, steam: true }); cyl(-0.24, -0.58, 0.08, 1.2, '#d8d8d8', { band: '#c0392b' }); box(0.0, 0.62, 0.3, 0.2, 0.2, '#59606a', '#7d838a'); }
      break;
  }
  }
  tk.parts = parts; tk.hmax = hmax;
}

// ---------- názvy: podnik dostane jméno nejbližšího města / vesnice ----------
function nearestCityName(map, tk) {
  let best = null;
  for (const t of map.tokens) { if (!isCity(t) || t === tk) continue; const d = Math.hypot(t.c - tk.c, t.r - tk.r); if (!best || d < best.d) best = { d, t }; }
  return best ? best.t.name : '';
}
function autoName(map, tk) { const base = TOKEN_TYPES[tk.type].name, n = nearestCityName(map, tk); return n ? base + ' · ' + n : base; }

// ---------- vytváření tokenů ----------
function makeToken(map, id, type, c, r, level, name, opt) {
  const tk = {
    id, type, c, r, level: level || 1, name, road: [], rail: [], occ: { road: [], rail: [], ship: [] }, parts: [], hmax: 1,
    owner: 0, access: { mode: 'open', fee: 0 }, share: {}, infl: {}, stock: {}, prosp: 0, cementIn: 0, sat: 1,
    visits: 0, merch: 0, merchT: [], earnedFees: 0, camp: 0, lastElect: 0, produced: 0
  };
  const T = TOKEN_TYPES[type];
  if (T.lines) { for (const ln of T.lines) tk.share[ln.id] = 1 / T.lines.length; }
  if (opt && opt.cells && opt.cells.length > 1) { tk.cells = opt.cells.map(q => ({ c: q.c, r: q.r })); tk.sq = (opt.sq || []).map(q => ({ c: q.c, r: q.r })); tk.special = opt.special || null; }
  map.tokens.push(tk); map.tokenIdx.set(c + ',' + r, tk);
  if (tk.cells) { for (const q of tk.cells) map.tokenIdx.set(q.c + ',' + q.r, tk); for (const q of tk.sq) map.tokenIdx.set('s' + q.c + ',' + q.r, tk); }
  tk.name = isCity(tk) ? name : autoName(map, tk);
  assignPorts(map, tk);
  buildTokenScene(tk);
  return tk;
}

// Postavení podniku hráčem / hrou na ložisku nebo u lesa / jezera. Vrací token.
function convertDeposit(tk, map) {
  map = map || state.map;
  const nt = DEPOSIT_BUILD[tk.type];
  tk.type = nt; tk.level = 1; tk.name = autoName(map, Object.assign({}, tk, { type: nt }));
  tk.share = {}; for (const ln of TOKEN_TYPES[nt].lines) tk.share[ln.id] = 1 / TOKEN_TYPES[nt].lines.length;
  assignPorts(map, tk); buildTokenScene(tk);
}

// Je pole vhodné pro podnik vázaný na les / jezero? Vrací 'forest' | 'lake' | null
function siteKindAt(map, cell) {
  if (cell.t !== 'o' || !isLandCell(map, cell) || tokenAt(map, cell)) return [];
  const out = [];
  const near = (set, d) => { for (let dc = -d; dc <= d; dc++) for (let dr = -d; dr <= d; dr++) if (set.has((cell.c + dc) + ',' + (cell.r + dr)) && Math.abs(dc) + Math.abs(dr) <= d) return true; return false; };
  if (near(map.forest, 1)) out.push('forest');
  for (const L of map.lakes) if (Math.hypot(cell.c - L.c, cell.r - L.r) <= L.rad + 1.3) { out.push('lake'); break; }
  if (map.nav && !map.nav.has(cell.c + ',' + cell.r)) for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { if (map.nav.has((cell.c + dc) + ',' + (cell.r + dr))) { out.push('river'); break; } }
  return out;
}
function farFromTokens(map, c, r, d) {
  for (const t of map.tokens) if (Math.hypot(t.c - c, t.r - r) < d) return false;
  return true;
}
function portsOkAt(map, c, r) {
  for (const k of PORT_EDGES) {
    const nb = neighborAcross(mkO(c, r), k);
    if (!cellExists(nb.cell) || !isLandCell(map, nb.cell) || tokenAt(map, nb.cell)) return false;
  }
  return true;
}

// ---------- svět ----------
const CITY_NAMES = ['Octburg', 'Lipová', 'Nový Hrad', 'Dubnice', 'Rudná', 'Borová', 'Zálesí', 'Hradec', 'Vltavín', 'Kamenec'];

function makeWorld(seed) {
  if (CFG.MAP === 'cr' && typeof makeWorldCR === 'function') return makeWorldCR(seed);
  const sd = seed === 'test' ? 7 : ((Number(seed) | 0) || 7);
  state.seedNum = sd;
  const rng = mulberry32((sd ^ 0x7f4a7c15) >>> 0);
  const { COLS, ROWS } = CFG, mid = (COLS - 1) / 2;

  const lakes = [];
  for (let i = 0; i < 3; i++) {
    const a = rng() * 6.283 + i * 2.1, d = 5 + rng() * 10;
    lakes.push({ c: mid + Math.cos(a) * d, r: mid + Math.sin(a) * d, rad: 1.5 + rng() * 1.3 });
  }
  const map = { land: islandLand(sd, lakes), seed, tokens: [], tokenIdx: new Map(), poles: [], trees: [], buildings: [], structs: [], urban: new Uint8Array(COLS * ROWS), lakes, forest: new Set() };
  const L = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS && map.land[r * COLS + c] === 1;

  // lesy
  for (let i = 0; i < 3; i++) {
    for (let tries = 0; tries < 60; tries++) {
      const fc = 7 + Math.floor(rng() * (COLS - 14)), fr = 7 + Math.floor(rng() * (ROWS - 14)), rad = 2.0 + rng() * 1.6;
      if (!L(fc, fr) || lakes.some(l => Math.hypot(fc - l.c, fr - l.r) < l.rad + rad + 1)) continue;
      let n = 0;
      for (let r = fr - 5; r <= fr + 5; r++) for (let c = fc - 5; c <= fc + 5; c++) if (L(c, r) && Math.hypot(c - fc, r - fr) <= rad && !lakes.some(l => Math.hypot(c - l.c, r - l.r) <= l.rad + 0.5)) { map.forest.add(c + ',' + r); n++; }
      if (n >= 5) break;
    }
  }

  // místa pro tokeny: všechny čtyři sousední osmiúhelníky jsou pevnina, mimo les a mimo břeh jezera
  const okCell = (c, r, d) => L(c, r) && L(c + 1, r) && L(c - 1, r) && L(c, r + 1) && L(c, r - 1) && !map.forest.has(c + ',' + r) && farFromTokens(map, c, r, d)
    && !lakes.some(l => Math.hypot(c - l.c, r - l.r) < l.rad + 1.6) && c > 2 && r > 2 && c < COLS - 3 && r < ROWS - 3;
  let nextId = 0;
  const place = (type, level, name, d) => {
    for (let t = 0; t < 400; t++) {
      const c = 4 + Math.floor(rng() * (COLS - 8)), r = 4 + Math.floor(rng() * (ROWS - 8));
      if (okCell(c, r, d || 5)) return makeToken(map, ++nextId, type, c, r, level, name);
    }
    return null;
  };
  const placeSite = (type, kind, name) => {
    for (let t = 0; t < 600; t++) {
      const c = 4 + Math.floor(rng() * (COLS - 8)), r = 4 + Math.floor(rng() * (ROWS - 8));
      if (!L(c, r) || !portsOkAt(map, c, r) || !farFromTokens(map, c, r, 4)) continue;
      if (!siteKindAt(map, mkO(c, r)).includes(kind) || map.forest.has(c + ',' + r)) continue;
      return makeToken(map, ++nextId, type, c, r, 1, name);
    }
    return null;
  };

  // Prázdný svět: pár vesnic a města, několik základních podniků bez majitele a surovinová místa k rozvoji.
  const cityLv = [1, 1, 1, 2, 3];
  const names = CITY_NAMES.slice();
  for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = names[i]; names[i] = names[j]; names[j] = t; }
  cityLv.forEach((lv, i) => place('city', lv, names[i], 6));
  const cities = map.tokens.slice();
  const ind = {};
  ind.power1 = place('power', 1);
  ind.sawmill = place('sawmill', 1);
  ind.mine = place('dep_coal', 1, 'Uhelné ložisko'); if (ind.mine) convertDeposit(ind.mine, map);
  place('dep_coal', 1, 'Uhelné ložisko');
  place('dep_limestone', 1, 'Ložisko vápence'); place('dep_limestone', 1, 'Ložisko vápence');
  place('dep_field', 1, 'Úrodné pole'); place('dep_field', 1, 'Úrodné pole');
  ind.lumber = placeSite('lumber', 'forest', 'Těžba dřeva');
  ind.pump = placeSite('pump', 'lake', 'Čerpací stanice');
  ind.need = !!(ind.power1 && ind.sawmill && ind.mine && ind.lumber && ind.pump && cities.length === cityLv.length && map.tokens.filter(t => t.type === 'dep_limestone').length && map.tokens.filter(t => t.type === 'dep_field').length);

  // nikdo nic nevlastní: majitele a vliv získají až hráči
  for (const c of cities) { c.owner = 0; c.access = { mode: 'fee', fee: 4 }; c.infl = {}; }
  for (const t of map.tokens) { if (!isCity(t)) { t.infl = {}; t.owner = 0; } }
  for (const t of map.tokens) { t.stock = {}; for (const g of tokenOutputs(t)) t.stock[g] = isDeposit(t) ? 0 : 24; }

  // vedení vysokého napětí: elektrárna → nejbližší město
  const poles = map.poles; map.links = [];
  const addLine = (p, c) => {
    const g0 = { x: p.c * A - 0.62 * A, y: p.r * A - 0.66 * A }, g1 = { x: c.c * A + 0.62 * A, y: c.r * A - 0.66 * A };
    const start = poles.length; map.links.push({ p: p.id, c: c.id });
    poles.push({ x: g0.x, y: g0.y, h: 1.3, type: 'gantry' });
    const dist = Math.hypot(g1.x - g0.x, g1.y - g0.y), n = Math.max(2, Math.round(dist / (2.6 * A)));
    const dx = (g1.x - g0.x) / dist, dy = (g1.y - g0.y) / dist;
    for (let i = 1; i < n; i++) poles.push({ x: g0.x + dx * dist * i / n, y: g0.y + dy * dist * i / n, h: 2.3, type: 'tower' });
    poles.push({ x: g1.x, y: g1.y, h: 1.3, type: 'gantry' });
    for (let i = start; i < poles.length; i++) { const a = poles[Math.max(start, i - 1)], b = poles[Math.min(poles.length - 1, i + 1)]; poles[i].ang = Math.atan2(b.y - a.y, b.x - a.x); poles[i].line = start; }
    poles[poles.length - 1].end = true;
  };
  for (const p of [ind.power1]) {
    if (!p) continue;
    let best = null; for (const c of cities) { const d = Math.hypot(c.c - p.c, c.r - p.r); if (!best || d < best.d) best = { c, d }; }
    if (best && best.d < 22) addLine(p, best.c);
  }

  // stromy (v lese hustě)
  const trees = map.trees;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!map.land[r * COLS + c] || map.tokenIdx.has(c + ',' + r)) continue;
    let nearTk = false;
    for (const t of map.tokens) if (Math.abs(t.c - c) <= 1 && Math.abs(t.r - r) <= 1) { nearTk = true; break; }
    if (nearTk) continue;
    const inForest = map.forest.has(c + ',' + r);
    const f = inForest ? 1 : vnoise(c / 5.5, r / 5.5, 3) * 0.7 + vnoise(c / 2.6, r / 2.6, 4) * 0.3;
    const cnt = inForest ? 5 : f > 0.66 ? 3 : f > 0.56 ? 2 : f > 0.5 ? 1 : 0;
    for (let i = 0; i < cnt; i++) {
      const ox = (hash2(c, r, 200 + i) - 0.5) * 1.7, oy = (hash2(c, r, 210 + i) - 0.5) * 1.7;
      if (Math.abs(ox) + Math.abs(oy) > 1.45) continue;
      trees.push({ x: c * A + ox * CFG.S, y: r * A + oy * CFG.S, s: 0.75 + hash2(c, r, 220 + i) * 0.7, k: inForest ? (hash2(c, r, 230 + i) < 0.85 ? 1 : 0) : (hash2(c, r, 230 + i) < 0.4 ? 1 : 0), g: hash2(c, r, 240 + i), idx: r * COLS + c });
    }
  }

  prepareMap(map);
  map.worldSeed = sd;
  return { map, R: new Map(), ind };
}


// Místa, kde lze postavit daný typ podniku (ložisko / les / jezero / volné místo).
function computeSites(type) {
  const T = TOKEN_TYPES[type], map = state.map, out = [];
  if (!T) return out;
  if (T.site === 'deposit') {
    const want = Object.keys(DEPOSIT_BUILD).find(k => DEPOSIT_BUILD[k] === type);
    for (const t of map.tokens) if (t.type === want) out.push({ c: t.c, r: t.r, kind: 'deposit', tk: t.id });
    return out;
  }
  for (let r = 3; r < CFG.ROWS - 3; r++) for (let c = 3; c < CFG.COLS - 3; c++) {
    if (!isLandCell(map, mkO(c, r)) || map.forest.has(c + ',' + r) || !portsOkAt(map, c, r) || !farFromTokens(map, c, r, T.site === 'free' ? 4 : 3.2)) continue;
    const kinds = siteKindAt(map, mkO(c, r));
    if (T.site === 'free') { if (!kinds.length) out.push({ c, r, kind: 'free' }); }
    else if (kinds.includes(T.site)) out.push({ c, r, kind: T.site });
  }
  return out;
}
