// Svět podle mapy ČR (data: mapcr.js, vygenerováno tools/export-mapcr.py z mapa_cr/index.html).
// Mřížka 182 × 114 osmiúhelníků po 3 km; města a podniky na místech skutečných sídel a závodů.
// makeWorld() (tokens.js) na tuhle funkci přepne, když je CFG.MAP === 'cr'.

function makeWorldCR(seed) {
  const D = CR_DATA, { COLS, ROWS } = CFG;
  if (D.COLS !== COLS || D.ROWS !== ROWS) throw new Error('CFG.COLS/ROWS neodpovídá datům mapy ČR (' + D.COLS + '×' + D.ROWS + ')');
  const sd = Number(seed) | 0 || 7;
  state.seedNum = sd;
  const land = new Uint8Array(COLS * ROWS), elev = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < COLS * ROWS; i++) { land[i] = D.land.charCodeAt(i) === 49 ? 1 : 0; elev[i] = D.elev.charCodeAt(i) - 48; }
  const lakes = D.lakes.map(([c, r]) => ({ c, r, rad: 0.55 }));
  for (const L of lakes) land[L.r * COLS + L.c] = 0;                    // jezero = jeden osmiúhelník vody
  const map = { land, elev, seed: sd, tokens: [], tokenIdx: new Map(), poles: [], trees: [], buildings: [], structs: [], urban: new Uint8Array(COLS * ROWS), lakes, forest: new Set(), cr: true };
  const L = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS && land[r * COLS + c] === 1;

  // lesy: hory a okolí těžby dřeva
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (L(c, r) && elev[r * COLS + c] >= 4) map.forest.add(c + ',' + r);
  for (const s of D.sites) if (s.type === 'lumber') for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if (Math.hypot(dc, dr) <= 2.2 && L(s.c + dc, s.r + dr) && !(dc === 0 && dr === 0)) map.forest.add((s.c + dc) + ',' + (s.r + dr));

  // tokeny: sídla podle úrovně (1 vesnice … 4 velkoměsto), pak podniky a ložiska
  let nextId = 0; const ind = { need: true }, cities = [];
  const sorted = D.settlements.slice().sort((a, b) => b.lvl - a.lvl || a.name.localeCompare(b.name, 'cs'));
  // Velikost města: vesnice, malé město i město = 1 pole; velkoměsto 2 pole; Praha 4 pole (2×2 s čtverečkem uprostřed)
  const free1 = (c, r) => L(c, r) && !map.tokenIdx.has(c + ',' + r);
  const footOK = (cells, sq) => cells.every(q => free1(q.c, q.r)) && sq.every(q => !map.tokenIdx.has('s' + q.c + ',' + q.r));
  const footOf = (s, c, r) => {
    if (s.name === 'Praha') return { cells: [{ c, r }, { c: c + 1, r }, { c, r: r + 1 }, { c: c + 1, r: r + 1 }], sq: [{ c, r }], special: 'praha' };
    if (s.lvl >= 4) return { cells: [{ c, r }, { c: c + 1, r }], sq: [], special: null };
    return { cells: [{ c, r }], sq: [], special: null };
  };
  const place = s => {                                   // nejbližší volné místo k poloze z mapy
    for (let d = 0; d <= 5; d++) for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) {
      if (Math.max(Math.abs(dc), Math.abs(dr)) !== d) continue;
      const f = footOf(s, s.c + dc, s.r + dr);
      if (footOK(f.cells, f.sq)) return { c: s.c + dc, r: s.r + dr, f };
    }
    return null;
  };
  for (const s of sorted) {
    const p = place(s); if (!p) continue;
    const tk = makeToken(map, ++nextId, 'city', p.c, p.r, Math.max(1, Math.min(4, s.lvl)), s.name, p.f.cells.length > 1 ? p.f : null); tk.d = s.d; cities.push(tk);
  }
  const powers = [];
  for (const s of D.sites) {
    if (!TOKEN_TYPES[s.type]) continue;
    let sc = s.c, sr = s.r;
    if (!free1(sc, sr)) { let f = null; for (let d = 1; d <= 3 && !f; d++) for (let dr = -d; dr <= d && !f; dr++) for (let dc = -d; dc <= d; dc++) if (Math.max(Math.abs(dc), Math.abs(dr)) === d && free1(sc + dc, sr + dr)) { f = [sc + dc, sr + dr]; break; } if (!f) continue; sc = f[0]; sr = f[1]; }
    const tk = makeToken(map, ++nextId, s.type, sc, sr, 1, null); tk.d = s.d;
    if (s.type === 'power') powers.push(tk);
  }
  // doplňkový průmysl (hutě, potraviny, sklo, stroje): podle blízkých skutečných měst; [typ, město, úroveň]
  const EXTRA = [
    ['dep_iron', 'Třinec', 1], ['dep_iron', 'Kladno', 1], ['dep_sand', 'Česká Lípa', 1], ['dep_sand', 'Hodonín', 1],
    ['ironmine', 'Frýdek-Místek', 2], ['sandpit', 'Mělník', 1],
    ['steel', 'Ostrava', 2], ['steel', 'Kladno', 1], ['machines', 'Brno', 2], ['machines', 'Plzeň', 1], ['machines', 'Mladá Boleslav', 1],
    ['glass', 'Jablonec nad Nisou', 2], ['glass', 'Teplice', 1], ['brewery', 'Plzeň', 2], ['brewery', 'České Budějovice', 1], ['brewery', 'Pardubice', 1],
    ['grainfarm', 'Prostějov', 1], ['grainfarm', 'Kolín', 1], ['grainfarm', 'Znojmo', 1], ['grainfarm', 'Tábor', 1],
    ['mill', 'Přerov', 1], ['mill', 'Poděbrady', 1], ['bakery', 'Olomouc', 1], ['bakery', 'Jihlava', 1], ['bakery', 'Hradec Králové', 1],
    ['dairy', 'Havlíčkův Brod', 1], ['dairy', 'Strakonice', 1], ['dairy', 'Vsetín', 1]
  ];
  const byName = {}; for (const t of cities) byName[t.name] = t;
  const nearFree = (c0, r0, minD) => {
    for (let d = 2; d <= 7; d++) for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) {
      if (Math.max(Math.abs(dc), Math.abs(dr)) !== d) continue;
      const c = c0 + dc, r = r0 + dr;
      if (!free1(c, r) || elev[r * COLS + c] >= 5) continue;
      let ok = true; for (const t of map.tokens) if (Math.hypot(t.c - c, t.r - r) < minD) { ok = false; break; }
      if (ok) return [c, r];
    }
    return null;
  };
  for (const [type, town, lvl] of EXTRA) {
    const base = byName[town]; if (!base || !TOKEN_TYPES[type]) continue;
    const p = nearFree(base.c, base.r, 3.2); if (!p) continue;
    const tk = makeToken(map, ++nextId, type, p[0], p[1], Math.min(lvl, TOKEN_TYPES[type].levels), null); tk.d = base.d;
  }
  // řeky (splavné toky po souši) a přístavy: waypointy [sloupec, řádek] podle skutečných toků
  const RIVERS = [
    [[61, 15], [59, 19], [57, 23], [57, 26], [58, 30], [62, 33], [67, 36], [70, 38], [75, 40], [80, 43], [83, 47], [87, 49], [92, 49], [96, 48], [98, 45]],
    [[67, 87], [65, 80], [61, 72], [60, 67], [60, 66], [60, 60], [63, 54], [64, 49], [64, 44], [66, 40], [67, 37]],
    [[130, 92], [131, 85], [134, 79], [135, 73], [136, 68], [134, 65]]
  ];
  map.nav = new Set();
  const rasterLine = (p, q) => {
    let x = p[0], y = p[1]; map.nav.add(x + ',' + y);
    while (x !== q[0] || y !== q[1]) {
      const dx = q[0] - x, dy = q[1] - y;
      if (Math.abs(dx) >= Math.abs(dy)) x += Math.sign(dx); else y += Math.sign(dy);
      map.nav.add(x + ',' + y);
    }
  };
  for (const rv of RIVERS) for (let i = 0; i + 1 < rv.length; i++) rasterLine(rv[i], rv[i + 1]);
  for (const k of [...map.nav]) {                                       // pole zabrané podnikem: řeka ho obteče (souseda nahoře/dole/vedle)
    const [c, r] = k.split(',').map(Number); if (L(c, r) && !map.tokenIdx.has(k)) continue;
    if (!L(c, r) && map.lakes.some(l => l.c === c && l.r === r)) continue;        // jezero je splavná voda
    map.nav.delete(k);
    for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) { const q = (c + dc) + ',' + (r + dr); if (L(c + dc, r + dr) && !map.tokenIdx.has(q)) { map.nav.add(q); break; } }
  }
  for (const k of [...map.nav]) { const [c, r] = k.split(',').map(Number); if ((!L(c, r) && !map.lakes.some(l => l.c === c && l.r === r)) || map.tokenIdx.has(k)) map.nav.delete(k); }
  for (const k of [...map.nav]) { const [c, r] = k.split(',').map(Number); if (![[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].some(([dc, dr]) => map.nav.has((c + dc) + ',' + (r + dr)))) map.nav.delete(k); }
  const PORTS = ['Děčín', 'Ústí nad Labem', 'Litoměřice', 'Mělník', 'Praha', 'Beroun', 'České Budějovice', 'Poděbrady', 'Kolín', 'Pardubice', 'Hodonín', 'Kroměříž', 'Přerov', 'Olomouc'];
  const navNb = (c, r) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => map.nav.has((c + dc) + ',' + (r + dr)));
  for (const town of PORTS) {
    const base = byName[town]; if (!base) continue;
    let best = null;
    for (let dr = -6; dr <= 6; dr++) for (let dc = -6; dc <= 6; dc++) {
      const c = base.c + dc, r = base.r + dr;
      if (!free1(c, r) || map.nav.has(c + ',' + r) || !navNb(c, r) || !portsOkAt(map, c, r)) continue;
      let ok = true; for (const t of map.tokens) if (Math.hypot(t.c - c, t.r - r) < 1.9) { ok = false; break; }
      const d = Math.hypot(dc, dr); if (ok && (!best || d < best.d)) best = { c, r, d };
    }
    if (!best) continue;
    const tk = makeToken(map, ++nextId, 'port', best.c, best.r, 1, null); tk.d = base.d;
  }
  // okresy a úrovně popisků na mapě: 3 = krajské město, 2 = okresní město, 1 = ostatní sídla, 0 = průmysl
  map.districts = D.districts; map.kraje = D.kraje;
  if (D.distr) {
    map.dOf = new Int16Array(COLS * ROWS).fill(-1); map.kOf = new Int8Array(COLS * ROWS).fill(-1);
    const kidx = {}; (D.krajKeys || []).forEach((k, i) => { kidx[k] = i; });
    for (let i = 0; i < COLS * ROWS; i++) { const ch = D.distr.charCodeAt(i); if (ch !== 126) { map.dOf[i] = ch - 48; map.kOf[i] = D.krajMap.charCodeAt(i) - 48; } }
    map.krajKeys = D.krajKeys || [];
  }
  const KRAJ_SEAT = { PHA: 'Praha', JHC: 'České Budějovice', PLK: 'Plzeň', KVK: 'Karlovy Vary', ULK: 'Ústí nad Labem', LBK: 'Liberec', HKK: 'Hradec Králové', PAK: 'Pardubice', VYS: 'Jihlava', JMK: 'Brno', OLK: 'Olomouc', ZLK: 'Zlín', MSK: 'Ostrava' };
  for (const t of map.tokens) t.lblTier = isCity(t) ? 1 : 0;
  D.districts.forEach((dd, i) => {
    const inD = cities.filter(t => t.d === i);
    const seat = inD.find(t => t.name === dd.name) || inD.slice().sort((a, b) => b.level - a.level)[0];
    if (seat && seat.level >= 2) seat.lblTier = Math.max(seat.lblTier, 2);
  });
  for (const k in KRAJ_SEAT) { const t = cities.find(x => x.name === KRAJ_SEAT[k]); if (t) t.lblTier = 3; }
  for (const c of cities) { c.owner = 0; c.access = { mode: 'fee', fee: 4 }; c.infl = {}; }
  for (const t of map.tokens) { if (!isCity(t)) { t.infl = {}; t.owner = 0; } }
  for (const t of map.tokens) { t.stock = {}; for (const g of tokenOutputs(t)) t.stock[g] = (isDeposit(t) || TOKEN_TYPES[t.type].port) ? 0 : 24; }

  // vedení vysokého napětí: elektrárna → nejbližší město
  map.links = [];
  for (const p of powers) {
    let best = null; for (const c of cities) { const d = Math.hypot(c.c - p.c, c.r - p.r); if (!best || d < best.d) best = { c, d }; }
    if (best && best.d < 40) addPowerLine(map, p, best.c);
  }

  // stromy
  const trees = map.trees;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!land[r * COLS + c] || map.tokenIdx.has(c + ',' + r)) continue;
    let nearTk = false;
    for (let dr = -1; dr <= 1 && !nearTk; dr++) for (let dc = -1; dc <= 1; dc++) if (map.tokenIdx.has((c + dc) + ',' + (r + dr))) { nearTk = true; break; }
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
  map.hwNames = {}; for (const h of (D.highways || [])) map.hwNames[h.id] = h.name;
  map.hwReport = typeof hwxBuild === 'function' ? hwxBuild(map, D) : null;      // dálnice z mapy (hwcr.js)
  prepareMap(map);
  map.worldSeed = sd;
  return { map, R: new Map(), ind };
}

function addPowerLine(map, p, c) {
  const poles = map.poles, g0 = { x: p.c * A - 0.62 * A, y: p.r * A - 0.66 * A }, g1 = { x: c.c * A + 0.62 * A, y: c.r * A - 0.66 * A };
  const start = poles.length; map.links.push({ p: p.id, c: c.id });
  poles.push({ x: g0.x, y: g0.y, h: 1.3, type: 'gantry' });
  const dist = Math.hypot(g1.x - g0.x, g1.y - g0.y), n = Math.max(2, Math.round(dist / (2.6 * A)));
  const dx = (g1.x - g0.x) / dist, dy = (g1.y - g0.y) / dist;
  for (let i = 1; i < n; i++) poles.push({ x: g0.x + dx * dist * i / n, y: g0.y + dy * dist * i / n, h: 2.3, type: 'tower' });
  poles.push({ x: g1.x, y: g1.y, h: 1.3, type: 'gantry' });
  for (let i = start; i < poles.length; i++) { const a = poles[Math.max(start, i - 1)], b = poles[Math.min(poles.length - 1, i + 1)]; poles[i].ang = Math.atan2(b.y - a.y, b.x - a.x); poles[i].line = start; }
  poles[poles.length - 1].end = true;
}
