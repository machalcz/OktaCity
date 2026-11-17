// Generátor mapy: ostrov uprostřed moře, jezera. Mapa je CFG.COLS × CFG.ROWS osmiúhelníků.
// Voda/pevnina je určená pro osmiúhelníky. Čtverec je pevnina, pokud k němu přiléhají aspoň 3 pevninské osmiúhelníky.

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inGrid(c, r) { return c >= 0 && r >= 0 && c < CFG.COLS && r < CFG.ROWS; }

// Ostrov s členitým pobřežím a jezery (lakes = [{c, r, rad}]).
function islandLand(seed, lakes) {
  const rng = mulberry32(seed), { COLS, ROWS } = CFG;
  const land = new Uint8Array(COLS * ROWS);
  const p1 = rng() * 6.28, p2 = rng() * 6.28, p3 = rng() * 6.28, p4 = rng() * 6.28;
  const cx = (COLS - 1) / 2, cy = (ROWS - 1) / 2, R = COLS * 0.46;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const dx = c - cx, dy = r - cy, ang = Math.atan2(dy, dx), rr = Math.hypot(dx, dy) / R;
    const n = 0.09 * Math.sin(3 * ang + p1) + 0.06 * Math.sin(5 * ang + p2) + 0.04 * Math.sin(8 * ang + p3) + 0.03 * Math.sin(13 * ang + p4);
    if (rr < 0.97 + n) land[r * COLS + c] = 1;
  }
  for (const L of lakes) {
    for (let r = Math.floor(L.r - L.rad - 1); r <= L.r + L.rad + 1; r++) for (let c = Math.floor(L.c - L.rad - 1); c <= L.c + L.rad + 1; c++) {
      if (inGrid(c, r) && Math.hypot(c - L.c, r - L.r) <= L.rad) land[r * COLS + c] = 0;
    }
  }
  return land;
}

// Předpočítané údaje pro rychlé kreslení: čtverce, zástavba a pobřeží (kde je vidět útes).
function prepareMap(map) {
  const { COLS, ROWS } = CFG, SC = COLS - 1, SR = ROWS - 1;
  if (!map.urban) map.urban = new Uint8Array(COLS * ROWS);
  map.sland = new Uint8Array(SC * SR);
  map.surban = new Uint8Array(SC * SR);
  const L = map.land, U = map.urban;
  for (let r = 0; r < SR; r++) for (let c = 0; c < SC; c++) {
    const a = r * COLS + c;
    const l = L[a] + L[a + 1] + L[a + COLS] + L[a + COLS + 1];
    map.sland[r * SC + c] = l >= 3 ? 1 : 0;
    map.surban[r * SC + c] = (l >= 3 && (U[a] + U[a + 1] + U[a + COLS] + U[a + COLS + 1]) >= 2) ? 1 : 0;
  }
  if (map.keepSq) for (const k of map.keepSq) { const [c, r] = k.split(',').map(Number); if (c >= 0 && r >= 0 && c < SC && r < SR) map.sland[r * SC + c] = 1; }
  let count = 0;
  for (let i = 0; i < L.length; i++) count += L[i];
  map.landCount = count;
  const isL = cell => cellExists(cell) && (cell.t === 'o' ? L[cell.r * COLS + cell.c] === 1 : map.sland[cell.r * SC + cell.c] === 1);
  map.coast = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!L[r * COLS + c]) continue;
    const cell = mkO(c, r);
    for (let k = 0; k < 8; k++) if (!isL(neighborAcross(cell, k).cell)) { map.coast.push(cell); break; }
  }
  for (let r = 0; r < SR; r++) for (let c = 0; c < SC; c++) {
    if (!map.sland[r * SC + c]) continue;
    const cell = mkS(c, r);
    for (let k = 0; k < 4; k++) if (!isL(neighborAcross(cell, k).cell)) { map.coast.push(cell); break; }
  }
}

function isLandCell(map, cell) {
  if (!cellExists(cell)) return false;
  const L = (c, r) => map.land[r * CFG.COLS + c];
  if (cell.t === 'o') return L(cell.c, cell.r) === 1;
  return (L(cell.c, cell.r) + L(cell.c + 1, cell.r) + L(cell.c, cell.r + 1) + L(cell.c + 1, cell.r + 1)) >= 3;
}
