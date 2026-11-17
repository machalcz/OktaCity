// Generátor světa: ostrov 100×100, velké město (centrum, průmyslová zóna, okraj, obchvat), železniční tah
// s nádražím na vedlejší koleji, uhelný důl, elektrárna a vedení vysokého napětí do města.
//
// Souřadnice (sloupec, řádek) jsou indexy osmiúhelníků. Střed ostrova je kolem (50, 50).
// Silnice se malují po osách: H(řádek, c0, c1) a V(sloupec, r0, r1). Rameno vzniká vždy ke sousednímu poli,
// takže se křižovatky (T, 4 ramena) a zatáčky vytvoří samy.

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

const CITYX = { c: 50, r: 50 };

// Silnice (kostičky bez dopravy ve městě) jsou součástí světa, hráč je smí bourat a stavět.
function makeWorld(seed) {
  const fixed = (seed === 'test');
  const sd = fixed ? 7 : ((Number(seed) | 0) || 7);
  const rng = mulberry32((sd ^ 0x7f4a7c15) >>> 0);
  const { COLS, ROWS } = CFG;

  // jezera: pevná na testovací mapě, jinak mimo oblast infrastruktury
  let lakes = [];
  if (fixed) lakes = [{ c: 58, r: 77, rad: 3.5 }, { c: 28, r: 30, rad: 3 }];
  else {
    for (let i = 0; i < 12 && lakes.length < 3; i++) {
      const a = rng() * 6.283, d = 30 + rng() * 10;
      const c = 50 + Math.cos(a) * d, r = 50 + Math.sin(a) * d;
      if (r > 72 || r < 22 || c < 14 || c > 86) lakes.push({ c, r, rad: 2 + rng() * 3 });
    }
  }
  const map = {
    land: islandLand(sd, lakes), seed, city: { c: CITYX.c, r: CITYX.r }, structs: [], poles: [],
    buildings: [], trees: [], urban: new Uint8Array(COLS * ROWS), lakes
  };

  const R = new Map();
  const key = (c, r) => 'o' + c + ',' + r;
  const rec = (c, r, sq) => { const k = (sq ? 's' : 'o') + c + ',' + r; let x = R.get(k); if (!x) { x = { road: 0, rail: [] }; R.set(k, x); } return x; };
  const arm = (c, r, b) => { rec(c, r).road |= 1 << b; };
  const H = (r, c0, c1) => { for (let c = c0; c <= c1; c++) { if (c < c1) arm(c, r, 0); if (c > c0) arm(c, r, 4); } };
  const V = (c, r0, r1) => { for (let r = r0; r <= r1; r++) { if (r > r0) arm(c, r, 2); if (r < r1) arm(c, r, 6); } };
  const ring = (c0, r0, c1, r1) => { H(r0, c0, c1); H(r1, c0, c1); V(c0, r0, r1); V(c1, r0, r1); };
  const rail = (c, r, a, b) => { rec(c, r).rail.push([a, b]); };

  // ---------- silnice ----------
  ring(34, 32, 66, 68);                                  // obchvat
  H(50, 24, 69); V(50, 32, 68);                          // hlavní třídy (západní výjezd až k uhelné silnici)
  [43, 47, 53, 56].forEach(c => V(c, 35, 56));
  [41, 59].forEach(c => V(c, 38, 56));
  [38, 62].forEach(c => V(c, 35, 56));
  [35, 38, 41, 44, 47].forEach(r => H(r, 38, 62));
  H(56, 38, 43); H(56, 48, 62);
  // průmyslová zóna jižně od trati
  H(62, 50, 66); V(54, 62, 68); V(62, 62, 68);
  V(56, 62, 63); ring(56, 63, 58, 64);                   // depo průmyslu (okruh pro otáčení)
  // západní sklad s okruhem
  V(27, 50, 51); ring(26, 51, 28, 52);
  // uhelná silnice: důl ↔ elektrárna
  V(69, 36, 63);
  H(36, 69, 71); ring(71, 36, 73, 37);                   // okruh u elektrárny
  H(63, 69, 71); ring(71, 62, 73, 63);                   // okruh u dolu

  // ---------- koleje ----------
  for (let c = 21; c <= 79; c++) rail(c, 58, 4, 0);      // hlavní trať
  rail(44, 58, 1, C8);                                   // výhybka na vedlejší kolej (úhel 45°)
  rec(44, 57, true).rail.push([0, 2]);
  rail(45, 57, 5, 2);
  for (let r = 52; r <= 56; r++) rail(45, r, 6, 2);      // vedlejší kolej s nádražím (a slepým koncem)

  // validace záznamů stejně jako při načtení
  for (const [k, v] of [...R]) {
    const cell = cellFromKey(k);
    const fixedRec = validateRec(map, cell, v);
    if (fixedRec) R.set(k, fixedRec); else R.delete(k);
  }

  // ---------- zóny ----------
  const zoneOf = (c, r) => {
    if (r >= 59 && r <= 67 && c >= 51 && c <= 65) return 'ind';
    const dx = Math.abs(c - 50), dy = Math.abs(r - 50);
    if (dx <= 6 && dy <= 6) return 'center';
    if (dx <= 11 && dy <= 10) return 'inner';
    return 'edge';
  };
  const inCity = (c, r) => c >= 35 && c <= 65 && r >= 33 && r <= 67;

  // zastavěné území (šedá dlažba)
  for (let r = 33; r <= 67; r++) for (let c = 35; c <= 65; c++) {
    const z = zoneOf(c, r);
    if (z !== 'edge') map.urban[r * COLS + c] = 1;
  }

  // ---------- plochy, kde se nestaví domy ----------
  const blocked = new Set();
  const blockRect = (c0, r0, c1, r1) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { blocked.add(key(c, r)); map.urban[r * COLS + c] = 1; } };
  blockRect(75, 61, 78, 65);                             // důl
  blockRect(70, 29, 74, 34);                             // elektrárna
  blockRect(63, 34, 65, 36);                             // rozvodna
  const parks = [[51, 45, 52, 46], [39, 42, 40, 43], [57, 38, 58, 39], [36, 52, 37, 53]];
  const parkCells = new Set();
  for (const [c0, r0, c1, r1] of parks) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { parkCells.add(key(c, r)); map.urban[r * COLS + c] = 0; }

  const hasBuilding = new Set();
  const A_ = A, S_ = CFG.S;
  const B = map.buildings;
  const pick = (arr, v) => arr[Math.floor(v * arr.length) % arr.length];
  const WALL_C = ['#b9bfc6', '#a4acb5', '#c8c2b4', '#9aa6b2', '#d0cdc6', '#8f9aa6'];
  const WALL_I = ['#cdbfa8', '#c2b399', '#b7c0c6', '#c9a88c', '#d6cdb8', '#b89a84'];
  const WALL_H = ['#e3d9c4', '#d9c9ab', '#cfd6d9', '#e0b9a0', '#f0e8d2', '#d8c4a0'];
  const ROOF_H = ['#a24b3b', '#8a4a3a', '#6b6f78', '#7a5a46', '#9a5b45'];
  const WALL_F = ['#b6b9bd', '#a8aeb4', '#c3c0b6', '#9aa3ab'];
  const add = (c, r, ox, oy, w, d, h, kind, col, roof, extra) => {
    const x = c * A_ + ox * S_, y = r * A_ + oy * S_;
    B.push(Object.assign({ x, y, w, d, h, k: kind, col, roof, idx: r * COLS + c }, extra || {}));
    hasBuilding.add(key(c, r));
  };

  for (let r = 33; r <= 67; r++) for (let c = 35; c <= 65; c++) {
    const k = key(c, r);
    if (!map.land[r * COLS + c] || blocked.has(k) || parkCells.has(k)) continue;
    const zone = zoneOf(c, r), rc = R.get(k), v = hash2(c, r, 11), v2 = hash2(c, r, 12), v3 = hash2(c, r, 13);
    if (!rc) {
      // blok mezi ulicemi
      if (zone === 'center') {
        const h = 1.5 + 1.9 * Math.pow(1 - Math.min(1, Math.hypot(c - 50, r - 50) / 8.5), 1.3) + v * 1.0;
        add(c, r, (v2 - 0.5) * 0.15, (v3 - 0.5) * 0.15, 1.35 + v2 * 0.2, 1.35 + v3 * 0.2, h, 'tower', pick(WALL_C, v), '#707880');
      } else if (zone === 'inner') {
        if (v < 0.5) add(c, r, 0, 0, 1.3 + v2 * 0.2, 1.25 + v3 * 0.2, 0.85 + v2 * 0.7, 'block', pick(WALL_I, v3), pick(ROOF_H, v2));
        else for (let i = 0; i < 3; i++) {
          const q = [[-0.5, -0.5], [0.5, -0.45], [-0.45, 0.5], [0.5, 0.5]][(i + Math.floor(v2 * 4)) % 4];
          add(c, r, q[0], q[1], 0.62 + hash2(c, r, 20 + i) * 0.14, 0.62 + hash2(c, r, 30 + i) * 0.14, 0.5 + hash2(c, r, 40 + i) * 0.3, 'house', pick(WALL_H, hash2(c, r, 50 + i)), pick(ROOF_H, hash2(c, r, 60 + i)));
        }
      } else if (zone === 'ind') {
        const big = v < 0.6;
        if (big) add(c, r, 0, (v2 - 0.5) * 0.2, 1.65, 1.2 + v3 * 0.25, 0.8 + v2 * 0.5, 'factory', pick(WALL_F, v3), '#7d838a', { chim: v2 > 0.55 });
        else add(c, r, 0, 0, 1.5, 1.0, 0.5, 'ware', pick(WALL_F, v2), '#8b9299');
      } else {
        if (v < 0.78) {
          const n = 1 + Math.floor(v2 * 3);
          for (let i = 0; i < n; i++) {
            const q = [[-0.5, -0.5], [0.5, -0.45], [-0.45, 0.5], [0.5, 0.5]][(i * 2 + Math.floor(v3 * 4)) % 4];
            add(c, r, q[0], q[1], 0.52 + hash2(c, r, 70 + i) * 0.14, 0.52 + hash2(c, r, 80 + i) * 0.14, 0.42 + hash2(c, r, 90 + i) * 0.2, 'house', pick(WALL_H, hash2(c, r, 100 + i)), pick(ROOF_H, hash2(c, r, 110 + i)));
          }
        }
      }
    } else if (!rc.rail.length && (rc.road === 17 || rc.road === 68)) {
      // domy podél rovné ulice (jen tenký pás vedle vozovky)
      const horiz = rc.road === 17;
      for (const side of [-1, 1]) {
        const vv = hash2(c, r, 120 + side);
        const chance = zone === 'center' ? 0.55 : zone === 'inner' ? 0.5 : zone === 'ind' ? 0.35 : 0.4;
        if (vv > chance) continue;
        const dep = 0.52, off = 0.62 + dep / 2, wd = 0.8 + hash2(c, r, 130 + side) * 0.25;
        const h = zone === 'center' ? 0.7 + hash2(c, r, 140 + side) * 0.9 : zone === 'ind' ? 0.45 : 0.4 + hash2(c, r, 150 + side) * 0.35;
        const kind = zone === 'center' ? 'block' : zone === 'ind' ? 'ware' : 'house';
        const col = zone === 'center' ? pick(WALL_C, vv) : zone === 'ind' ? pick(WALL_F, vv) : pick(WALL_H, vv * 7.3);
        const roof = zone === 'center' ? '#707880' : zone === 'ind' ? '#8b9299' : pick(ROOF_H, vv * 5.7);
        if (horiz) add(c, r, 0, side * off, wd, dep, h, kind, col, roof); else add(c, r, side * off, 0, dep, wd, h, kind, col, roof);
      }
    }
  }

  // ---------- stavby mimo město: důl, elektrárna, rozvodna ----------
  const st = map.structs;
  const P = (cx, cy, ox, oy) => ({ x: cx * A_ + ox * S_, y: cy * A_ + oy * S_ });
  const part = (cx, cy, o) => st.push(Object.assign(P(cx, cy, o.x, o.y), o, { x: cx * A_ + o.x * S_, y: cy * A_ + o.y * S_ }));
  // důl (střed 76.5, 63)
  const MX = 76.5, MY = 63;
  part(MX, MY, { t: 'box', x: -2.3, y: -3.0, w: 0.55, d: 0.55, h: 2.6, col: '#3c424a', top: '#59616b' });
  part(MX, MY, { t: 'box', x: -2.3, y: -3.0, w: 1.0, d: 0.5, h: 0.3, z0: 2.6, col: '#59616b', top: '#7a828c' });
  part(MX, MY, { t: 'box', x: -0.9, y: -3.0, w: 1.7, d: 1.0, h: 0.85, col: '#8b8f94', top: '#5a3b30' });
  part(MX, MY, { t: 'box', x: 1.9, y: -2.4, w: 2.6, d: 1.3, h: 1.4, col: '#9aa0a6', top: '#69707a' });
  part(MX, MY, { t: 'box', x: 1.9, y: -2.4, w: 0.8, d: 0.8, h: 0.55, z0: 1.4, col: '#8a9097', top: '#69707a' });
  part(MX, MY, { t: 'box', x: 0.4, y: -0.8, w: 3.4, d: 0.24, h: 0.14, z0: 0.55, col: '#5f656c', top: '#7c828a' });
  part(MX, MY, { t: 'box', x: -1.6, y: 1.6, w: 1.0, d: 0.9, h: 0.55, col: '#c9bfa8', top: '#7a4a3a' });
  part(MX, MY, { t: 'cyl', x: 3.3, y: -0.6, r: 0.5, h: 1.9, col: '#8f969d', top: '#a8afb6' });
  part(MX, MY, { t: 'pile', x: 0.5, y: 1.4, w: 1.8, d: 1.3, h: 0.8 });
  part(MX, MY, { t: 'pile', x: 2.5, y: 1.9, w: 1.5, d: 1.1, h: 0.6 });
  part(MX, MY, { t: 'pile', x: 3.4, y: 0.3, w: 1.0, d: 0.9, h: 0.45 });

  // elektrárna (střed 72, 31.5)
  const PX = 72, PY = 31.5;
  part(PX, PY, { t: 'box', x: -2.4, y: -3.6, w: 5.2, d: 3.2, h: 2.8, col: '#aab1b9', top: '#6f767e' });
  part(PX, PY, { t: 'box', x: -2.4, y: 0.4, w: 5.2, d: 2.0, h: 1.6, col: '#bcc1c7', top: '#7d838a' });
  part(PX, PY, { t: 'box', x: -2.4, y: -3.6, w: 1.3, d: 1.0, h: 0.7, z0: 2.8, col: '#8d949c', top: '#6a7078' });
  part(PX, PY, { t: 'cyl', x: -0.3, y: -5.4, r: 0.32, h: 5.6, col: '#d8d8d8', band: '#c0392b' });
  part(PX, PY, { t: 'cyl', x: 3.4, y: -3.0, r: 1.65, h: 4.6, col: '#d3d6da', taper: 0.72, steam: true });
  part(PX, PY, { t: 'cyl', x: 3.6, y: 1.6, r: 1.65, h: 4.6, col: '#d3d6da', taper: 0.72, steam: true });
  part(PX, PY, { t: 'pile', x: -3.0, y: 4.8, w: 3.4, d: 2.0, h: 1.0 });
  part(PX, PY, { t: 'box', x: -2.9, y: 3.0, w: 0.34, d: 1.5, h: 0.14, z0: 0.35, col: '#5f656c', top: '#7c828a' });
  part(PX, PY, { t: 'box', x: -5.6, y: -1.4, w: 0.9, d: 0.9, h: 0.9, col: '#6d737b', top: '#8d949c' });
  part(PX, PY, { t: 'box', x: -5.6, y: 0.9, w: 0.9, d: 0.9, h: 0.9, col: '#6d737b', top: '#8d949c' });
  part(PX, PY, { t: 'box', x: -6.0, y: 4.2, w: 1.5, d: 1.1, h: 0.6, col: '#c9bfa8', top: '#7a4a3a' });

  // rozvodna ve městě (střed 64.2, 35)
  const SX = 64.2, SY = 35;
  part(SX, SY, { t: 'box', x: 0, y: 0, w: 4.2, d: 3.6, h: 0.06, col: '#767b82', top: '#8a9098' });
  for (let i = 0; i < 3; i++) part(SX, SY, { t: 'box', x: -1.0 + i * 1.0, y: -0.7, w: 0.7, d: 0.8, h: 0.75, z0: 0.06, col: '#59606a', top: '#7d838a' });
  for (let i = 0; i < 3; i++) part(SX, SY, { t: 'box', x: -1.0 + i * 1.0, y: -0.7, w: 0.16, d: 0.16, h: 0.3, z0: 0.81, col: '#e8e4d8', top: '#f4f1e8' });
  part(SX, SY, { t: 'box', x: 1.0, y: 0.9, w: 1.4, d: 1.0, h: 0.7, z0: 0.06, col: '#c9c2b0', top: '#6a6f78' });

  // ---------- vedení vysokého napětí: elektrárna → rozvodna ----------
  const g0 = P(PX, PY, -6.6, 0.1), g1 = P(SX, SY, -1.9, 0.3);
  const poles = map.poles;
  poles.push({ x: g0.x, y: g0.y, h: 1.3, type: 'gantry' });
  const dist = Math.hypot(g1.x - g0.x, g1.y - g0.y), n = Math.max(2, Math.round(dist / (2.4 * A_)));
  const free = (x, y) => {
    const cell = hitTest(x, y);
    if (!cell || cell.t !== 'o' || !map.land[cell.r * COLS + cell.c]) return false;
    const k = key(cell.c, cell.r);
    return !R.has(k) && !blocked.has(k);
  };
  const dx = (g1.x - g0.x) / dist, dy = (g1.y - g0.y) / dist;
  for (let i = 1; i < n; i++) {
    const bx = g0.x + dx * dist * i / n, by = g0.y + dy * dist * i / n;
    let placed = false;
    for (const off of [0, 1.3, -1.3, 2.6, -2.6, 3.9, -3.9]) {
      const x = bx - dy * off * S_, y = by + dx * off * S_;
      if (free(x, y)) { poles.push({ x, y, h: 2.3, type: 'tower' }); placed = true; break; }
    }
    if (!placed) poles.push({ x: bx, y: by, h: 2.3, type: 'tower' });
  }
  poles.push({ x: g1.x, y: g1.y, h: 1.3, type: 'gantry' });
  for (let i = 0; i < poles.length; i++) {
    const a = poles[Math.max(0, i - 1)], b = poles[Math.min(poles.length - 1, i + 1)];
    poles[i].ang = Math.atan2(b.y - a.y, b.x - a.x);
  }
  map.substation = { x: SX * A_, y: SY * A_ };

  // ---------- stromy ----------
  const trees = map.trees;
  const treeOK = (c, r) => {
    const k = key(c, r);
    return map.land[r * COLS + c] && !R.has(k) && !blocked.has(k) && !hasBuilding.has(k) && !map.urban[r * COLS + c];
  };
  const addTree = (c, r, i, dens) => {
    const ox = (hash2(c, r, 200 + i) - 0.5) * 1.7, oy = (hash2(c, r, 210 + i) - 0.5) * 1.7;
    if (Math.abs(ox) + Math.abs(oy) > 1.45) return;
    trees.push({ x: c * A_ + ox * S_, y: r * A_ + oy * S_, s: 0.75 + hash2(c, r, 220 + i) * 0.7, k: hash2(c, r, 230 + i) < 0.4 ? 1 : 0, g: hash2(c, r, 240 + i), idx: r * COLS + c });
  };
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!treeOK(c, r)) {
      if (parkCells.has(key(c, r))) for (let i = 0; i < 3; i++) addTree(c, r, i);
      continue;
    }
    if (inCity(c, r)) { if (hash2(c, r, 5) < 0.12) addTree(c, r, 0); continue; }
    const f = vnoise(c / 7.0, r / 7.0, 3) * 0.7 + vnoise(c / 3.0, r / 3.0, 4) * 0.3;
    const n = f > 0.62 ? 3 : f > 0.5 ? 2 : f > 0.42 ? 1 : 0;
    for (let i = 0; i < n; i++) addTree(c, r, i);
  }

  prepareMap(map);

  // ---------- stanice a vozidla ----------
  const stations = [
    { kind: 'road', c: 72, r: 62, name: 'Důl – nakládka' },
    { kind: 'road', c: 72, r: 36, name: 'Elektrárna – vykládka' },
    { kind: 'road', c: 57, r: 63, name: 'Průmysl – sklad' },
    { kind: 'road', c: 27, r: 52, name: 'Západní sklad' },
    { kind: 'rail', c: 45, r: 54, name: 'Nádraží Centrum' },
    { kind: 'rail', c: 24, r: 58, name: 'Nákladiště západ' }
  ];
  return { map, R, stations };
}
