'use strict';
// TENTO SOUBOR JE VYGENEROVÁN (node tools/build-game.js). Needituj ho, uprav zdroje v public/js a server/logic.js.
function createGame() {

// ===== public/js/config.js =====
// Základní nastavení.
const CFG = {
  VERSION: 'ALFA 0.9',
  S: 36,               // délka hrany osmiúhelníku (= hrana čtverce mezi nimi)
  WORLD_VER: 'cr-2026-11-19b',   // změň při každé změně mapy / světa: starý uložený stav se pak sám zahodí (reset)
  MAP: 'cr',           // 'cr' = mapa České republiky (data mapcr.js), jinak náhodný ostrov
  COLS: 182,            // počet osmiúhelníků na šířku (včetně moře); pro mapu ČR musí sedět s daty
  ROWS: 114,
  LAND_MIN: 6,         // pevnina leží v oblasti 10×10 uprostřed (indexy 2..11)
  LAND_MAX: 93,

  KERB: 0.5,           // šířka krajnice silnice (0.5 = polovina dálnice; dálnice je široká 1.0 = jako hrana)
  ASPHALT: 0.39,       // šířka asfaltu

  VSCALE: 0.55,        // měřítko vozidel vůči starým rozměrům (kvůli užším silnicím)
  MAX_ARMS: 4,         // do středu pole smí vést nejvýš 4 vozovky / koleje

  RAIL: {
    BALLAST: 0.40,     // šířka štěrkového lože (násobek hrany)
    GAUGE: 0.19,       // rozchod kolejnic (násobek hrany)
    SLEEPER_STEP: 0.13 // rozestup pražců
  },

  COLOR: {
    water: '#3b7fc4',
    waterDark: '#336fae',
    land: '#8c9196',
    green: '#86a863',
    greenAlt: '#7d9f5c',
    urbanAlt: '#82878c',
    landDark: '#82878c',
    grid: 'rgba(0,0,0,0.25)',
    kerb: '#d9d3c1',
    asphalt: '#383b40',
    line: '#e9c44c',
    ballastEdge: '#5b5248',
    ballast: '#a39682',
    sleeper: '#6b4a2f',
    ballastFoot: '#473f35',
    ballastSideLo: '#5b5248',
    ballastSideHi: '#8d806c',
    sleeperDark: '#3a2818',
    railDark: '#2b2d31',
    railSide: '#5c6068',
    padLo: '#23252a',
    padHi: '#3a3d43',
    railSteel: '#d3d8de',
    deck: '#7a6a55',
    deckRail: '#8d9096',
    railing: '#3b3229',
    cliffTop: '#8a7f66',
    cliffBot: '#463e30',
    bridgeTop: '#7a6a55',
    bridgeBot: '#3a2f23',
    white: '#ffffff',
    yellow: '#f0c63c',
    cyan: '#5fd4f4',
    pick: '#ff8a1f'
  },

  STORAGE_KEY: 'hextycoon_session_v1'
};


// ===== public/js/grid.js =====
// Mřížka 4.8.8: osmiúhelníky ('o') a mezi nimi čtverce ('s') otočené o 45°.
//
// Osmiúhelník (c,r) má střed (c·A, r·A). A = S·(1+√2) je rozteč středů.
// Jeho 8 hran značíme k = 0..7 od východu proti směru hodinových ručiček (po 45°):
//   0=V  1=SV  2=S  3=SZ  4=Z  5=JZ  6=J  7=JV    (sudé = rovné, liché = úhlopříčné)
// Čtverec (c,r) leží mezi osmiúhelníky, střed ((c+½)·A, (r+½)·A). Má 4 hrany j = 0..3:
//   0=SV  1=SZ  2=JZ  3=JV    (všechny úhlopříčné, leží na úhlopříčných hranách osmiúhelníků)

const SQ2 = Math.SQRT2;
const A = CFG.S * (1 + SQ2);
const AP = A / 2;                       // apotéma osmiúhelníku (střed → střed hrany)

function mkO(c, r) { return { t: 'o', c, r }; }
function mkS(c, r) { return { t: 's', c, r }; }
function cellKey(cell) { return cell.t + cell.c + ',' + cell.r; }
function cellFromKey(k) {
  const [c, r] = k.slice(1).split(',').map(Number);
  return { t: k[0], c, r };
}
function sameCell(a, b) { return !!a && !!b && a.t === b.t && a.c === b.c && a.r === b.r; }

function cellExists(cell) {
  if (cell.t === 'o') return cell.c >= 0 && cell.r >= 0 && cell.c < CFG.COLS && cell.r < CFG.ROWS;
  return cell.c >= 0 && cell.r >= 0 && cell.c < CFG.COLS - 1 && cell.r < CFG.ROWS - 1;
}
function cellCenter(cell) {
  return cell.t === 'o' ? { x: cell.c * A, y: cell.r * A }
                        : { x: (cell.c + 0.5) * A, y: (cell.r + 0.5) * A };
}
function edgeCount(cell) { return cell.t === 'o' ? 8 : 4; }
function edgeAngle(cell, k) { return cell.t === 'o' ? k * Math.PI / 4 : Math.PI / 4 + k * Math.PI / 2; }
function edgeDist(cell) { return cell.t === 'o' ? AP : CFG.S / 2; }
function edgeVec(cell, k) {             // střed hrany vůči středu pole (osa y míří dolů)
  const a = edgeAngle(cell, k), d = edgeDist(cell);
  return { x: Math.cos(a) * d, y: -Math.sin(a) * d };
}
function isDiagEdge(cell, k) { return cell.t === 's' || (k & 1) === 1; }
function oppositeEdge(cell, k) { return cell.t === 'o' ? (k + 4) % 8 : (k + 2) % 4; }

// Co leží za hranou k: { cell, k } (sousední pole a jeho hrana, která na nás navazuje).
function neighborAcross(cell, k) {
  const { c, r } = cell;
  if (cell.t === 'o') {
    if ((k & 1) === 0) {
      const T = [[1, 0, 4], [0, -1, 6], [-1, 0, 0], [0, 1, 2]][k / 2];
      return { cell: mkO(c + T[0], r + T[1]), k: T[2] };
    }
    const T = { 1: [0, -1, 2], 3: [-1, -1, 3], 5: [-1, 0, 0], 7: [0, 0, 1] }[k];
    return { cell: mkS(c + T[0], r + T[1]), k: T[2] };
  }
  const T = [[1, 0, 5], [0, 0, 7], [0, 1, 1], [1, 1, 3]][k];
  return { cell: mkO(c + T[0], r + T[1]), k: T[2] };
}

function cellPath(ctx, cell) {
  const { x, y } = cellCenter(cell);
  ctx.beginPath();
  if (cell.t === 'o') {
    const R = AP / Math.cos(Math.PI / 8);
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + i * Math.PI / 4;
      const px = x + R * Math.cos(a), py = y + R * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  } else {
    const R = CFG.S / SQ2;
    ctx.moveTo(x + R, y); ctx.lineTo(x, y + R); ctx.lineTo(x - R, y); ctx.lineTo(x, y - R);
  }
  ctx.closePath();
}

// Světové souřadnice -> pole (osmiúhelník nebo čtverec) nebo null mimo mapu.
function hitTest(wx, wy) {
  const c = Math.round(wx / A), r = Math.round(wy / A);
  const dx = wx - c * A, dy = wy - r * A;
  if (Math.abs(dx) <= AP && Math.abs(dy) <= AP && Math.abs(dx) + Math.abs(dy) <= AP * SQ2) {
    const cell = mkO(c, r);
    return cellExists(cell) ? cell : null;
  }
  const sc = Math.floor(wx / A), sr = Math.floor(wy / A);
  const cx = (sc + 0.5) * A, cy = (sr + 0.5) * A;
  if (Math.abs(wx - cx) + Math.abs(wy - cy) <= CFG.S / SQ2) {
    const cell = mkS(sc, sr);
    return cellExists(cell) ? cell : null;
  }
  return null;
}

// Jako cellPath, ale bez beginPath – pro hromadné kreslení mnoha polí jedním tahem.
function cellSub(ctx, cell) {
  const { x, y } = cellCenter(cell);
  if (cell.t === 'o') {
    const R = AP / Math.cos(Math.PI / 8);
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + i * Math.PI / 4;
      const px = x + R * Math.cos(a), py = y + R * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  } else {
    const R = CFG.S / SQ2;
    ctx.moveTo(x + R, y); ctx.lineTo(x, y + R); ctx.lineTo(x - R, y); ctx.lineTo(x, y - R);
  }
  ctx.closePath();
}


// ===== public/js/view.js =====
// Pohled na mapu. Herní logika zůstává 2D, mění se jen promítnutí na obrazovku:
//   obrazovka = střed + zoom · Sklon(tilt) · Otočení(rot) · (svět − kamera)
// Pevnina je "zvednutá" nad hladinu o lift (v násobcích hrany), takže má boční stěny (útesy).
// Otáčení: viewStep × 45° (0..7).
//   top   – pohled shora (původní)
//   tilt  – mírný nadhled: bez otočení, svislý rozměr zkrácený, vodorovné hrany zůstávají vodorovné
//   (izometrie je zrušená: byla jen nadhled otočený o 45°, což dá tlačítko Otočit)

const VIEWS = {
  top:  { name: 'Shora',          rot: 0,           tilt: 1.00, lift: 0 },
  tilt: { name: 'Nadhled',        rot: 0,           tilt: 0.62, lift: 0.40 }
};
let VIEW = VIEWS.tilt;

function updateView() {
  const b = VIEWS[state.view] || VIEWS.tilt;
  VIEW = { rot: b.rot + state.viewStep * Math.PI / 4, tilt: b.tilt, lift: b.lift };
}
function liftPx() { return VIEW.lift * CFG.S * state.cam.zoom; }

// Posun ve světě -> posun na obrazovce (při zoomu 1) a zpět.
function projDelta(x, y) {
  const c = Math.cos(VIEW.rot), s = Math.sin(VIEW.rot);
  return { x: x * c - y * s, y: VIEW.tilt * (x * s + y * c) };
}
function unprojDelta(u, v) {
  const c = Math.cos(VIEW.rot), s = Math.sin(VIEW.rot), vv = v / VIEW.tilt;
  return { x: u * c + vv * s, y: -u * s + vv * c };
}

// Svět -> obrazovka (CSS pixely). lifted = bod leží na úrovni pevniny, ne hladiny.
function w2s(wx, wy, lifted) {
  const z = state.cam.zoom;
  const p = projDelta(wx - state.cam.x, wy - state.cam.y);
  return { x: W / 2 + p.x * z, y: H / 2 + p.y * z - (lifted ? liftPx() : 0) };
}
function s2w(sx, sy, lifted) {
  const z = state.cam.zoom;
  const d = unprojDelta((sx - W / 2) / z, (sy - H / 2 + (lifted ? liftPx() : 0)) / z);
  return { x: state.cam.x + d.x, y: state.cam.y + d.y };
}

// Nastaví plátno tak, aby se do něj kreslilo ve světových souřadnicích; off = posun nahoru v pixelech.
function applyTransformOff(ctx, off) {
  const z = state.cam.zoom, c = Math.cos(VIEW.rot), s = Math.sin(VIEW.rot), t = VIEW.tilt;
  const a = z * c, b = z * t * s, cc = -z * s, d = z * t * c;
  const e = W / 2 - (a * state.cam.x + cc * state.cam.y);
  const f = H / 2 - (b * state.cam.x + d * state.cam.y) - off;
  ctx.setTransform(DPR * a, DPR * b, DPR * cc, DPR * d, DPR * e, DPR * f);
}
// Kreslení v pixelech obrazovky (konektory, zvýraznění).
function applyScreen(ctx) { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }


// ===== public/js/mapgen.js =====
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


// ===== public/js/roads.js =====
// Doprava: silnice a koleje. Záznam pole: { road, rail }
//   road  bitová maska silničních ramen (bit k = rameno od středu hrany k-té ke středu pole)
//   rail  seznam kolejí [a, b]; b = 8 (C8) znamená odbočku ke středu
// V jednom poli smí být buď jen silnice, jen koleje, nebo (železniční přejezd) obojí.
//
// Pravidla:
//   silnice  – do středu max. 4 ramena, zatáčka o 45° ne, kolmé křížení a T smí
//   koleje   – max. 4 ramena, žádná dvě ramena nesmí být kolmá, jedna kolej se v poli stočí nejvýš o 45°
//   kostička – (malý čtverec) jen jeden rovný úsek silnice nebo kolejí, žádný střed, odbočka ani křížení
//   most     – jen na vodním osmiúhelníku, jen rovně přes celé pole (V–Z nebo S–J)
//   přejezd  – samostatná rovná silnice (bez napojení v poli) a rovná kolej skrz celý osmiúhelník
//              v jiném směru; výsledné pole je pak uzavřené (nic dalšího se nepřidá)

const CENTER = 'C';
const C8 = 8;   // označení středu v seznamu kolejí

class RoadNet {
  constructor() { this.m = new Map(); this.ver = 0; }
  get(cell) { return this.m.get(cellKey(cell)); }
  roadMask(cell) { const r = this.get(cell); return r ? r.road : 0; }
  railMask(cell) { const r = this.get(cell); return r ? railMaskOf(r.rail) : 0; }
  mask(cell) { return this.roadMask(cell) | this.railMask(cell); }
  set(cell, rec) {
    this.ver++;
    const k = cellKey(cell);
    if (rec && (rec.road || rec.rail.length)) {
      const prev = this.m.get(k), src = rec.own || (prev && prev.own) || { road: [], rail: 0 };
      const own = { road: rec.road ? src.road.slice() : [], rail: rec.rail.length ? src.rail : 0 };
      this.m.set(k, { road: rec.road, rail: rec.rail.map(t => [t[0], t[1]]), own });
    } else this.m.delete(k);
  }
  clearCell(cell) { this.ver++; this.m.delete(cellKey(cell)); }
  // Smaže rameno na hraně k. V přejezdu se smaže celá ta linie (je to vždy rovná trasa).
  removeArm(cell, k) {
    const rec = this.get(cell);
    if (!rec) return;
    const crossing = rec.road !== 0 && rec.rail.length > 0;
    let road = rec.road, rail = rec.rail;
    if ((road >> k) & 1) road = crossing ? 0 : (road & ~(1 << k));
    else if ((railMaskOf(rail) >> k) & 1) rail = crossing ? [] : rail.filter(t => t[0] !== k && t[1] !== k);
    this.set(cell, { road, rail });
  }
  clear() { this.ver++; this.m.clear(); }
  get size() { return this.m.size; }
  entries() {
    if (this._ec && this._ev === this.ver) return this._ec;
    this._ev = this.ver;
    this._ec = [...this.m].map(([k, rec]) => ({ cell: cellFromKey(k), rec }));
    return this._ec;
  }
  toJSON() { return [...this.m]; }
  load(arr) {
    this.clear();
    for (const [k, v] of arr) {
      let rec = null;
      if (typeof v === 'number') rec = { road: v, rail: [] };                                   // nejstarší uložení
      else if (v && v.kind === 'road') rec = { road: v.mask || 0, rail: [] };                    // předchozí verze
      else if (v && v.kind === 'rail') rec = { road: 0, rail: v.tracks || [] };
      else if (v && typeof v.road === 'number') rec = { road: v.road, rail: v.rail || [], own: v.own };
      if (rec && (rec.road || rec.rail.length)) { if (!rec.own) rec.own = { road: rec.road ? [1] : [], rail: rec.rail.length ? 1 : 0 }; this.m.set(k, rec); }
    }
    this.ver++;
  }
}

function railMaskOf(tracks) {
  let m = 0;
  for (const [a, b] of tracks) { m |= 1 << a; if (b !== C8) m |= 1 << b; }
  return m;
}
function countBits(m) { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; }
function armsOf(mask) { const o = []; for (let k = 0; k < 8; k++) if ((mask >> k) & 1) o.push(k); return o; }
function emptyRec() { return { road: 0, rail: [] }; }

// Úhel mezi dvěma rameny pole ve stupních (0..180).
function angleBetween(cell, a, b) {
  let d = Math.abs(edgeAngle(cell, a) - edgeAngle(cell, b)) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return Math.round(d * 180 / Math.PI);
}

// Rovné masky (protilehlé hrany): osmiúhelník 4 směry, čtverec 2 směry.
function isStraightMask(cell, m) {
  return cell.t === 'o' ? (m === 17 || m === 34 || m === 68 || m === 136) : (m === 5 || m === 10);
}
function isOpposite(cell, a, b) {
  return a !== CENTER && b !== CENTER && b === oppositeEdge(cell, a);
}
function isLoneStraightRail(cell, rec) {
  return rec.rail.length === 1 && rec.rail[0][1] !== C8 && isStraightMask(cell, railMaskOf(rec.rail));
}

// Vyčistí záznam načtený z uložení: vrátí platný záznam nebo null.
function validateRec(map, cell, rec) {
  const r = validateRec0(map, cell, rec);
  if (r && rec.own) r.own = rec.own;
  return r;
}
function validateRec0(map, cell, rec) {
  if (!rec || tokenAt(map, cell)) return null;
  const road = rec.road | 0, rail = rec.rail || [];
  if (!road && !rail.length) return null;
  const rm = railMaskOf(rail);
  const land = isLandCell(map, cell);
  const lone = rail.length === 1 && rail[0][1] !== C8;
  if (!land) {
    if (cell.t !== 'o') return null;
    if (road && !rail.length && (road === 17 || road === 68)) return { road, rail: [] };
    if (!road && lone && (rm === 17 || rm === 68)) return { road: 0, rail };
    return null;
  }
  if (typeof hwxProtected === 'function' && map.preRoads && map.preRoads.has(cellKey(cell)) && rail.length === 0) return { road, rail: [] };
  const hwV = hwAt(map, cell);
  if (hwV) return hwValidRec(hwV, cell, { road, rail });
  if (cell.t === 's') {
    if (road && !rail.length && isStraightMask(cell, road)) return { road, rail: [] };
    if (!road && lone && isStraightMask(cell, rm)) return { road: 0, rail };
    return null;
  }
  if (road && rail.length) {
    const ok = isStraightMask(cell, road) && lone && isStraightMask(cell, rm) && !(road & rm);
    return ok ? { road, rail } : { road, rail: [] };
  }
  return { road, rail };
}

// Je na hraně k pole na sousedním poli opačný druh dopravy? (počítá i přípojky tokenů)
function edgeBlocked(map, net, cell, k, kind) {
  const nb = neighborAcross(cell, k);
  const bit = 1 << nb.k;
  const tk = tokenAt(map, nb.cell);
  if (tk) return kind === 'road' ? (tokenMaskAt(tk, nb.cell, 'rail') & bit) !== 0 : (tokenMaskAt(tk, nb.cell, 'road') & bit) !== 0;
  return kind === 'road' ? (net.railMask(nb.cell) & bit) !== 0 : (net.roadMask(nb.cell) & bit) !== 0;
}

// Konektory vybraného pole. Na vodě (osmiúhelník) jen 4 rovné hrany – stavět lze jen most.
function connectorsOf(map, net, cell) {
  const out = [];
  const tkHere = tokenAt(map, cell);
  if (tkHere) return tokenConnectors(map, net, tkHere, cell);
  if (typeof hwxAt === 'function' && hwxAt(map, cell) && !hwAt(map, cell)) return out;
  const land = isLandCell(map, cell);
  if (!land && cell.t !== 'o') return out;
  const rec = net.get(cell);
  const mask = net.mask(cell);
  const crossing = !!rec && rec.road !== 0 && rec.rail.length > 0;
  const ctr = cellCenter(cell);
  const hwC = hwAt(map, cell);
  for (let k = 0; k < edgeCount(cell); k++) {
    if (!land && (k & 1)) continue;
    if (hwC && hwParallel(hwC, k)) continue;                   // po dálnici se nestaví
    const nb = neighborAcross(cell, k);
    if (!cellExists(nb.cell)) continue;
    if (cell.t === 's' && tokenAt(map, nb.cell)) continue;      // ze čtverečku se město ani průmysl napojit nedá
    if (land && !isLandCell(map, nb.cell)) {
      if (!(cell.t === 'o' && (k & 1) === 0)) continue;     // z pevniny do vody jen rovně (začátek mostu)
    }
    const v = edgeVec(cell, k);
    const own = ((mask >> k) & 1) === 1;
    if (crossing && !own) continue;                    // přejezd je uzavřený – zůstanou jen konektory existujících tras
    const ntk = tokenAt(map, nb.cell);
    const nmask = ntk ? (tokenMaskAt(ntk, nb.cell, 'road') | tokenMaskAt(ntk, nb.cell, 'rail')) : net.mask(nb.cell);
    const fromNeighbor = ((nmask >> nb.k) & 1) === 1;
    if (ntk && !fromNeighbor) continue;                      // token má přípojky jen tam, kde je určila hra
    out.push({ id: k, x: ctr.x + v.x, y: ctr.y + v.y, diag: isDiagEdge(cell, k), own, used: own || fromNeighbor });
  }
  // střed jen v osmiúhelníku na pevnině, který není uzavřený přejezdem
  if (hwC) { if (!mask && hwC.dir !== 'c') out.push({ id: CENTER, x: ctr.x, y: ctr.y, center: true, own: false, used: false }); }
  else if (land && cell.t === 'o' && mask && !crossing) out.push({ id: CENTER, x: ctr.x, y: ctr.y, center: true, own: true, used: true });
  return out;
}

function fail(reason) { return { ok: false, reason: reason || '' }; }

// Ověří spojení konektorů a, b (číslo hrany nebo CENTER) pro druh dopravy `kind`.
// Vrací { ok, reason, next } – next je nový záznam pole.
function checkPair(map, net, cell, kind, a, b) {
  if (tokenAt(map, cell)) return fail('Na tomto poli stojí město nebo průmysl – přípojka se dělá kliknutím na hranu');
  if (typeof hwxAt === 'function' && hwxAt(map, cell) && !hwAt(map, cell)) return fail('Tady vede dálnice – stavět ani bourat se zde nedá');
  if (a === b) return fail('');
  if (a === CENTER && b === CENTER) return fail('');
  const land = isLandCell(map, cell);
  const rec = net.get(cell) || emptyRec();
  const hasRoad = rec.road !== 0, hasRail = rec.rail.length > 0;
  const hasCenter = a === CENTER || b === CENTER;
  const mask = rec.road | railMaskOf(rec.rail);

  for (const id of [a, b]) {
    if (id !== CENTER && edgeBlocked(map, net, cell, id, kind)) return fail('Tahle hrana navazuje na jiný druh dopravy (silnice × koleje)');
  }
  const make = (bits, track) => kind === 'road'
    ? { road: bits, rail: [] }
    : { road: 0, rail: [track] };

  // --- dálnice (dána mapou): přejezd mostem nebo napojení silnice ---
  const hwHere = hwAt(map, cell);
  if (hwHere) return hwCheckPair(map, net, cell, kind, a, b, hwHere);
  const hwZone = hwZoneOf(map, net, cell);                   // pole u mostu přes dálnici = rampa
  if (hwZone) { const zf = hwZoneCheck(map, net, cell, kind, a, b, hwZone); if (zf) return zf; }

  // --- most přes vodu ---
  if (!land) {
    if (cell.t !== 'o') return fail('Most lze postavit jen přes celý osmiúhelník');
    if (hasCenter) return fail('Most nemá střed – vede jen rovně přes celé pole');
    if ((a & 1) || (b & 1) || !isOpposite(cell, a, b)) return fail('Přes vodu jen rovný most: vodorovně nebo svisle přes celé pole');
    if (mask) return fail('V tomto poli už most je');
    return { ok: true, next: make((1 << a) | (1 << b), [a, b]) };
  }

  // --- malá kostička (čtverec) ---
  if (cell.t === 's') {
    if (hasCenter) return fail('V malé kostičce lze postavit jen rovný úsek – bez středu a odbočky');
    if (!isOpposite(cell, a, b)) return fail('V malé kostičce jen rovně: spoj protilehlé konektory');
    if (mask) return fail('V malé kostičce je místo jen pro jednu rovnou trasu – bez křížení a bez přejezdu');
    return { ok: true, next: make((1 << a) | (1 << b), [a, b]) };
  }

  // --- osmiúhelník na pevnině ---
  if (hasRoad && hasRail) return fail('Přejezd je hotový – do tohoto pole už nelze nic přidat (nejdřív zbourej)');

  const other = kind === 'road' ? hasRail : hasRoad;     // v poli je opačný druh dopravy
  if (other) {
    // pokus o železniční přejezd
    const what = kind === 'road' ? 'Silnice přes koleje' : 'Koleje přes silnici';
    if (hasCenter) return fail(what + ' jen rovně skrz celé pole (přejezd) – bez odbočky do středu');
    if (!isOpposite(cell, a, b)) return fail(what + ' jen rovně skrz celé pole (přejezd)');
    const existingOk = kind === 'road' ? isLoneStraightRail(cell, rec) : isStraightMask(cell, rec.road);
    if (!existingOk) {
      return fail(kind === 'road'
        ? 'Přejezd lze udělat jen přes samostatnou rovnou kolej (bez napojení v poli)'
        : 'Přejezd lze udělat jen přes samostatnou rovnou silnici (bez napojení jiné silnice)');
    }
    const bits = (1 << a) | (1 << b);
    if (bits & mask) return fail('Přejezd musí křížit pod jiným směrem – ne po stejné trase');
    const next = kind === 'road' ? { road: bits, rail: rec.rail } : { road: rec.road, rail: [[a, b]] };
    return { ok: true, next };
  }

  // --- stejný druh (nebo prázdné pole) ---
  const sameMask = kind === 'road' ? rec.road : railMaskOf(rec.rail);
  if (hasCenter && !sameMask) return fail('Střed vznikne až po první silnici v poli');

  let track, bits;
  if (hasCenter) {
    const x = a === CENTER ? b : a;
    track = [x, C8]; bits = 1 << x;
  } else {
    track = [a, b]; bits = (1 << a) | (1 << b);
    const ang = angleBetween(cell, a, b);
    if (kind === 'road' && ang <= 45) return fail('Příliš ostrá zatáčka (45°) – vyber jiný konektor');
    if (kind === 'rail' && ang < 135) return fail('Koleje: jedna kolej se v poli smí stočit nejvýš o 45° (úhel ramen 135°–180°)');
  }

  if (kind === 'road') {
    if ((bits & ~sameMask) === 0) return fail('Tahle silnice už v poli je');
  } else if (rec.rail.some(t => (t[0] === track[0] && t[1] === track[1]) || (t[0] === track[1] && t[1] === track[0]))) {
    return fail('Tahle kolej už v poli je');
  }

  const newMask = sameMask | bits;
  if (countBits(newMask) > CFG.MAX_ARMS) {
    return fail(`Do středu smí vést nejvýš ${CFG.MAX_ARMS} ${kind === 'road' ? 'vozovky' : 'koleje'}`);
  }
  if (kind === 'rail') {
    const arms = armsOf(newMask);
    for (let i = 0; i < arms.length; i++) for (let j = i + 1; j < arms.length; j++) {
      if (angleBetween(cell, arms[i], arms[j]) === 90) return fail('Koleje nelze napojit ani křížit kolmo – jen pod úhlem');
    }
  }
  return { ok: true, next: kind === 'road' ? { road: newMask, rail: [] } : { road: 0, rail: [...rec.rail, track] } };
}


// ===== public/js/highway.js =====
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


// ===== public/js/goods.js =====
// Zboží, typy tokenů a receptury výroby. Čísla jsou první odhad pro ladění hratelnosti.
//
// Řetězce:
//   uhlí (důl) → elektrárna (energie)      vápenec (lom) + uhlí → cement → města (růst)
//   voda (čerpací stanice) → farma kukuřice → farma zvířat (+ voda) → jatka → maso → města
//   dřevo (těžba) → pila → prkna → nábytek → města        pila → pelety (palivo pro elektrárnu)
// Cargo třídy určují vozidla: goods = kryté, bulk = otevřené / sklápěč, liquid = cisterna.

const GOODS = {
  coal:      { name: 'Uhlí',      cls: 'bulk',    value: 1.0, icon: '⚫' },
  stone:     { name: 'Vápenec',   cls: 'bulk',    value: 0.9, icon: '🪨' },
  wood:      { name: 'Dřevo',     cls: 'bulk',    value: 1.0, icon: '🪵' },
  pellets:   { name: 'Pelety',    cls: 'bulk',    value: 1.2, icon: '🟤' },
  corn:      { name: 'Kukuřice',  cls: 'bulk',    value: 0.9, icon: '🌽' },
  water:     { name: 'Voda',      cls: 'liquid',  value: 0.6, icon: '💧' },
  animals:   { name: 'Zvířata',   cls: 'goods',   value: 1.5, icon: '🐄' },
  milk:      { name: 'Mléko',     cls: 'goods',   value: 1.7, icon: '🥛' },
  meat:      { name: 'Maso',      cls: 'goods',   value: 2.2, icon: '🥩' },
  planks:    { name: 'Prkna',     cls: 'goods',   value: 1.5, icon: '📏' },
  furniture: { name: 'Nábytek',   cls: 'goods',   value: 2.6, icon: '🪑' },
  cement:    { name: 'Cement',    cls: 'goods',   value: 1.8, icon: '🧱' },
  ironore:   { name: 'Železná ruda', cls: 'bulk', value: 1.1, icon: '🟫' },
  sand:      { name: 'Písek',     cls: 'bulk',    value: 0.8, icon: '⏳' },
  wheat:     { name: 'Pšenice',   cls: 'bulk',    value: 1.0, icon: '🌾' },
  flour:     { name: 'Mouka',     cls: 'goods',   value: 1.4, icon: '🥡' },
  bread:     { name: 'Pečivo',    cls: 'goods',   value: 2.0, icon: '🥖' },
  beer:      { name: 'Pivo',      cls: 'goods',   value: 2.4, icon: '🍺' },
  glass:     { name: 'Sklo',      cls: 'goods',   value: 2.2, icon: '🔷' },
  steel:     { name: 'Ocel',      cls: 'flat',    value: 2.4, icon: '🔩' },
  machines:  { name: 'Stroje',    cls: 'flat',    value: 3.4, icon: '⚙' },
  dairy:     { name: 'Mléčné výrobky', cls: 'cold', value: 2.3, icon: '🧀' },
  energy:    { name: 'Elektřina', cls: 'virtual', value: 0,   icon: '⚡' }
};
const CLS_NAME = { goods: 'zboží (kryté vozy)', bulk: 'sypký materiál (sklápěče, otevřené vagony)', liquid: 'kapaliny (cisterny)', flat: 'plošina (ocel a stroje – plošinový návěs, zatím jen silnice)', cold: 'chlazené (chladírenský vůz, zatím jen silnice)' };

// Typy tokenů. levels = počet úrovní; lines = receptury (na jednotku práce); site = kde lze postavit;
// cost = cena postavení; dep = ložisko (po postavení se změní na podnik DEPOSIT_BUILD[type]).
const TOKEN_TYPES = {
  city:       { name: 'Město',            icon: '🏘', top: '#d3cfc0', rim: '#6c7177', sign: '#7cc0f4', levels: 4, city: true },
  dep_coal:   { name: 'Uhelné ložisko',   icon: '⚫', top: '#8a8174', rim: '#4a443b', sign: '#d9a441', levels: 1, dep: true, res: 'coal' },
  dep_limestone: { name: 'Ložisko vápence', icon: '🪨', top: '#bdb8aa', rim: '#6a665c', sign: '#e6e0cf', levels: 1, dep: true, res: 'limestone' },
  dep_iron:   { name: 'Ložisko rudy',   icon: '🟫', top: '#8f6a58', rim: '#4d3a30', sign: '#c9805e', levels: 1, dep: true, res: 'iron' },
  dep_sand:   { name: 'Ložisko písku',  icon: '⏳', top: '#d6c690', rim: '#8a7d52', sign: '#f0e2a8', levels: 1, dep: true, res: 'sand' },
  dep_field:  { name: 'Úrodné pole',      icon: '🌾', top: '#a9b86a', rim: '#5d6a33', sign: '#e8d24a', levels: 1, dep: true, res: 'field' },
  coalmine:   { name: 'Uhelný důl',       icon: '⛏', top: '#7a6f61', rim: '#403a32', sign: '#d9a441', levels: 3, site: 'deposit', cost: 12000,
                lines: [{ id: 'coal', label: 'Uhlí', out: { coal: 1 } }] },
  quarry:     { name: 'Lom na vápenec',   icon: '🪨', top: '#a9a59a', rim: '#625f57', sign: '#e6e0cf', levels: 3, site: 'deposit', cost: 10000,
                lines: [{ id: 'stone', label: 'Vápenec', out: { stone: 1 } }] },
  lumber:     { name: 'Těžba dřeva',      icon: '🪓', top: '#9a8a62', rim: '#4a3f2a', sign: '#b98a4a', levels: 3, site: 'forest', cost: 9000,
                lines: [{ id: 'wood', label: 'Dřevo', out: { wood: 1 } }] },
  pump:       { name: 'Čerpací stanice',  icon: '💧', top: '#8fb0c2', rim: '#4d6877', sign: '#5fd4f4', levels: 3, site: 'lake', cost: 8000,
                lines: [{ id: 'water', label: 'Voda', out: { water: 1 } }] },
  cornfarm:   { name: 'Farma – kukuřice', icon: '🌽', top: '#b9b86e', rim: '#6a6a35', sign: '#e8d24a', levels: 3, site: 'deposit', cost: 9000,
                lines: [{ id: 'corn', label: 'Kukuřice', in: { water: 1 }, out: { corn: 1 } }] },
  animalfarm: { site: 'free', cost: 11000, name: 'Farma – zvířata',  icon: '🐄', top: '#a8b784', rim: '#5c6b3f', sign: '#9bd36a', levels: 3,
                lines: [{ id: 'animals', label: 'Chov na maso', in: { corn: 1, water: 0.5 }, out: { animals: 1 } },
                        { id: 'milk', label: 'Mléko', in: { corn: 0.6, water: 0.8 }, out: { milk: 1 } }] },
  slaughter:  { site: 'free', cost: 12000, name: 'Jatka',            icon: '🥩', top: '#c2a9a4', rim: '#6d5551', sign: '#e07a7a', levels: 3,
                lines: [{ id: 'meat', label: 'Maso', in: { animals: 1 }, out: { meat: 1 } }] },
  sawmill:    { site: 'free', cost: 10000, name: 'Pila',             icon: '🪚', top: '#c4b48e', rim: '#6b5d3d', sign: '#d9b36a', levels: 3,
                lines: [{ id: 'planks', label: 'Prkna', in: { wood: 1 }, out: { planks: 0.85 } },
                        { id: 'pellets', label: 'Pelety (palivo)', in: { wood: 1 }, out: { pellets: 1 } }] },
  furniture:  { site: 'free', cost: 12000, name: 'Výroba nábytku',   icon: '🪑', top: '#c7b7a6', rim: '#6f5f4f', sign: '#e0a56a', levels: 3,
                lines: [{ id: 'furniture', label: 'Nábytek', in: { planks: 1 }, out: { furniture: 0.7 } }] },
  cement:     { site: 'free', cost: 14000, name: 'Cementárna',       icon: '🧱', top: '#b7b9bc', rim: '#5d6166', sign: '#cfd3d8', levels: 3,
                lines: [{ id: 'cement', label: 'Cement', in: { stone: 1, coal: 0.4 }, out: { cement: 0.9 } }] },
  power:      { site: 'free', cost: 20000, name: 'Elektrárna',       icon: '⚡', top: '#9aa0a7', rim: '#565c63', sign: '#f0d23c', levels: 3, auto: true,
                lines: [{ id: 'coal', label: 'Uhlí', in: { coal: 1 }, out: { energy: 2.4 } },
                        { id: 'pellets', label: 'Pelety', in: { pellets: 1.3 }, out: { energy: 2.4 } }] },
  ironmine:   { name: 'Důl na rudu',      icon: '⛏', top: '#8a6a58', rim: '#4a382e', sign: '#c9805e', levels: 3, site: 'deposit', cost: 13000,
                lines: [{ id: 'ironore', label: 'Železná ruda', out: { ironore: 1 } }] },
  sandpit:    { name: 'Pískovna',         icon: '⏳', top: '#cdbd88', rim: '#85784f', sign: '#f0e2a8', levels: 3, site: 'deposit', cost: 9000,
                lines: [{ id: 'sand', label: 'Písek', out: { sand: 1 } }] },
  grainfarm:  { site: 'free', cost: 9000, name: 'Farma – obilí',  icon: '🌾', top: '#c4b95e', rim: '#756d33', sign: '#ecd96a', levels: 3,
                lines: [{ id: 'wheat', label: 'Pšenice', in: { water: 0.5 }, out: { wheat: 1 } }] },
  mill:       { site: 'free', cost: 10000, name: 'Mlýn',            icon: '🥡', top: '#cfc7b4', rim: '#7a7261', sign: '#efe6cc', levels: 3,
                lines: [{ id: 'flour', label: 'Mouka', in: { wheat: 1 }, out: { flour: 0.9 } }] },
  bakery:     { site: 'free', cost: 11000, name: 'Pekárna',         icon: '🥖', top: '#d3b894', rim: '#7d6446', sign: '#eec58a', levels: 3,
                lines: [{ id: 'bread', label: 'Pečivo', in: { flour: 1 }, out: { bread: 1 } }] },
  brewery:    { site: 'free', cost: 13000, name: 'Pivovar',         icon: '🍺', top: '#c9a56a', rim: '#6f5530', sign: '#f2c25a', levels: 3,
                lines: [{ id: 'beer', label: 'Pivo', in: { wheat: 0.6, water: 0.8 }, out: { beer: 1 } }] },
  dairy:      { site: 'free', cost: 11000, name: 'Mlékárna',        icon: '🧀', top: '#d8d6cf', rim: '#7f7d75', sign: '#f4efd8', levels: 3,
                lines: [{ id: 'dairy', label: 'Mléčné výrobky', in: { milk: 1 }, out: { dairy: 0.9 } }] },
  glass:      { site: 'free', cost: 13000, name: 'Sklárna',         icon: '🔷', top: '#b9cdd6', rim: '#5c7480', sign: '#9fe0f4', levels: 3,
                lines: [{ id: 'glass', label: 'Sklo', in: { sand: 1, coal: 0.3 }, out: { glass: 0.8 } }] },
  steel:      { site: 'free', cost: 22000, name: 'Ocelárna',        icon: '🔩', top: '#a4a8ae', rim: '#4d5158', sign: '#ff9a4a', levels: 3,
                lines: [{ id: 'steel', label: 'Ocel', in: { ironore: 1, coal: 0.5 }, out: { steel: 0.8 } }] },
  port:       { site: 'river', cost: 15000, name: 'Přístav', icon: '⚓', top: '#8fa6b8', rim: '#4a6074', sign: '#9fd0f0', levels: 1, port: true, lines: [] },
  machines:   { site: 'free', cost: 18000, name: 'Strojírna',       icon: '⚙', top: '#b6bbc2', rim: '#575d66', sign: '#8fc1ff', levels: 3,
                lines: [{ id: 'machines', label: 'Stroje', in: { steel: 1 }, out: { machines: 0.6 } }] }
};
const DEPOSIT_BUILD = { dep_coal: 'coalmine', dep_limestone: 'quarry', dep_field: 'cornfarm', dep_iron: 'ironmine', dep_sand: 'sandpit' };
const CITY_LEVELS = ['Vesnice', 'Malé město', 'Město', 'Velkoměsto'];

// Výroba
const BASE_RATE = 0.32;                      // jednotek práce za sekundu na úrovni 1
const LVL_RATE = [1, 1.6, 2.4];
const STOCK_CAP = 90;                        // kapacita skladu jednoho zboží v průmyslu
const ENERGY_PRICE = 0.9;                    // Kč za jednotku elektřiny (vlastníkovi elektrárny)
const SALE_PER_T = 3.0;                      // Kč za tunu hodnoty 1.0 – vlastník podniku dostane při odvozu jeho zboží

// Města: spotřeba (t/s na úrovni 1), od jaké úrovně, násobek podle úrovně
// extra: nepovinné zboží – chybějící dodávka nesnižuje spokojenost, ale dodané zboží ji zvyšuje
const CITY_NEEDS = { milk: { w: 0.035, from: 1 }, meat: { w: 0.035, from: 1 }, furniture: { w: 0.03, from: 2 }, cement: { w: 0, from: 1 },
  bread: { w: 0.03, from: 1, extra: true }, dairy: { w: 0.025, from: 1, extra: true }, beer: { w: 0.022, from: 2, extra: true }, glass: { w: 0.02, from: 2, extra: true }, machines: { w: 0.014, from: 3, extra: true } };
const CITY_MULT = [1, 1.8, 3, 4.6];
const CITY_UP = { cost: [15000, 40000, 90000], prosp: [25, 40, 60], cement: [30, 60, 120] };
const IND_UP = { cost: [10000, 25000], infl: [150, 300] };

// Vliv, volby, poplatky
const OWN_MIN = 60;                          // vliv potřebný k převzetí nezávislého podniku
const INFL_DECAY = 0.9992;                   // za sekundu (poločas ~ 14 minut)
const INFL_PER_VALUE = 1.5;                  // vliv za tunu × hodnotu zboží (při nakládce i vykládce)
const ELECTION_T = 360;                      // s mezi volbami
const CAMPAIGN_COST = 3000, CAMPAIGN_INFL = 150, CAMPAIGN_CD = 60;
const FEE_MAX = 40;
const FAIR_FEE = 12;                         // nad touto hodnotou město trpí a starosta ztrácí v nových volbách
const HWY_TOLL = 9;                          // Kč za průjezd jedním polem hotové dálnice (platí se státu)
const TOLL = 3;                              // Kč za průjezd jedním polem cizí silnice
const ROAD_UPKEEP = 0.018, RAIL_UPKEEP = 0.050;       // Kč/s za jedno vlastní pole
// Firma zanikne při dluhu BANKRUPT_AT (automaticky, hráč to jen potvrdí). Cesty bez majitele zmizí za ROAD_DECAY_MIN + náhodně až ROAD_DECAY_SPAN s.
const BANKRUPT_AT = -50000, BANKRUPT_WARN = -25000, ROAD_DECAY_MIN = 180, ROAD_DECAY_SPAN = 600;

const TRADE_GOODS = Object.keys(GOODS).filter(g => GOODS[g].cls !== 'virtual');
function tokenAccepts(tk) {
  const T = TOKEN_TYPES[tk.type], out = [];
  if (T.port) return TRADE_GOODS.slice();
  if (T.city) { for (const g in CITY_NEEDS) if (CITY_NEEDS[g].from <= tk.level) out.push(g); return out; }
  if (!T.lines) return out;
  for (const ln of T.lines) for (const g in (ln.in || {})) if (!out.includes(g)) out.push(g);
  return out;
}
function tokenOutputs(tk) {
  const T = TOKEN_TYPES[tk.type], out = [];
  if (T.port) return TRADE_GOODS.slice();
  if (!T.lines) return out;
  for (const ln of T.lines) for (const g in ln.out) if (g !== 'energy' && !out.includes(g)) out.push(g);
  return out;
}


// ===== public/js/tokens.js =====
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


// ===== public/js/mapcr.js =====
// VYGENEROVÁNO: tools/export-mapcr.py (z mapa_cr/index.html) + distr/krajMap doplněno. Needituj ručně.
const CR_DATA = {"COLS":182,"ROWS":114,"CELL_KM":3,"land":"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111000000000011111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111100000000111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111100000011111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111111001111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111111111111111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111111111111111111111111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111111111111100000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111100000000000000001110000000000000000000000000000000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111100000000000000111111000000000000000000000000000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111000000000000001111111100000011000000000000000000000000000000000000000000000000011111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111000000000000111111111110011111000000000000000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111000000000001111111111111111110000000000000000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111110000000000111111111111111111100000000000000000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111110000000001111111111111111111000000000000000000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111000000011111111111111111110000000000000000000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111000001111111111111111111110000000000000000000000000000000000000000000000000011111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000000000000000000011111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111000000000000000000000000000000000000000000000011111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000000000000011111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111100011000000000000000000000000000000000000011111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111101111000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111100000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111000000000000000000000000000000000000011111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000011111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000011111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000011111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000011111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111100000000000000000000000000000000000011111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111100000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111100000000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111100000000000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111100000000000000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111100000000000000000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000000000000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111111111111111000000011111111111111111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111111111111000000000000111111111111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111111111111111111111111111000000000000000001111111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111111111111111111111111100000000000000000000111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111111111111111111111110000000000000000000001111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111111111111111111111100000000000000000000001111111111111111111111111111100011000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111111111111111111110000000000000000000000011111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111000000000000000000000000111111001111111111111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111111111111111000000000000000000000000000100000000001111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111111111110000000000000000000000000000000000000000000001111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111111100000000000000000000000000000000000000000000000000111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111000000000000000000000000000000000000000000000000000000111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111000000000000000000000000000000000000000000000000000000000111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111100000000000000000000000000000000000000000000000000000000000000111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000","elev":"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000111122000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001100000001112234500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111123356600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111234567700000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111112345678800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000011111122345678000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004221000000000000000000011111223445677800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000077543211000000000000000000000111223455677899000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000088876532211100000000000000000000011223455677899999000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008998765432111111111110000000000000011223445678999999986000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000899887654322111111111111100000000000011223445678899999764200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000088888776543322111111111111000000000000111223345667788776432111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008888877665433222111111111000000000000000111223344555655543211122300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000888877766554433221111111100000000000000000011122333444433221111234440000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000887777666655544332110001111000000000000000000001112222222221111122344440000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000888777665555554433221100011110000000000000000000001111111111110001123444400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000988877665544444443332211000111100000000000000000000000111111000000011234440000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000999888766544433333332221110001111000000000000000000000000000000000000112334400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000999998876654433322222222111110011100000000000000000000000000000000000001122334000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009999999887665443322222221111111111110000000000000000000000000000000000000011223300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000089999999988776544332211111111111111111000000000000000000000000000000000000000112233400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000567899999998887665433222111111000011111100000000000000000000000000000000000000001122334400000000000000000300000000000000000000000000000000000000000000000000000000000000000000000000345677889999888776544322211100000000011111000000000000000000000000000000000000000011223345500000000000000004440000000000000000000000000000000000000000000000000000000000000000000001122345667788888887765433221110000000001111110000000000000000000000000000000110000000112233456600000000000000655555000000000000000000000000000000000000000000000000000000000000000000011123345566677788876654322111000000111111111100000000000000000000000000000011110000001122344566000000000000007666655400000021000000000000000000000000000000000000000000000000000000000111223344555667777765443211000000011111111111000000000001110000000000000001111110000011223445667000000000000987776665540032221000000000000000000000000000000000000000000000000000000000111223344455566776654332110000000111111111100000000000011100000000000000011111100001111233456677000000000009988777665544332210000000000000000000000000000000000000000000000000000000001112223334445556655443221100000000111100000000000000000111000000011000000111111000011112334556660000000000999988877665443322100000000000000000000000000000000000000000000000000000000011122233333344455444322110000000000000000000000000000001110000001111100001111111111111122344556660000000009999998877655433221000000000000000000000000000000000000000000000000000000000111223333333334443332211000000000000000000000000000000011100000111111100011111111111111223344555556000000099999998877654332210000000000000000000000000000000000000000000000000000000011122333333333333332221110000000000000000000000000000001111000001111111001111111111111111223344445555000009999999998876543322110000000000000000000000000000000000000000000000000000000111233343333222222222111000000000000000000000000000000011110000011111111111111111111111112223333444445678999999999988765433221110000000000000000000000000000000000000000000000000000011122334443332222222111110000000000000000000000000000000001000001111111111111111111111111112222333334445677888899998877654332211110000000000000000000000000000000000000000000000000011111233444443322222211111100000000000000000000000000000000000000011111111111111111111111111111222233333445667778888887766543322211100000000000000000000000000000000000000000000000000111112334454432222221111111110000000000000000000000000000000000011111111112222222111111111111111122233333445566777777776655433222111000000000000000000000000000000000000000000000000001111123345544322211111111111111000000000000000000000000000000001111111111222222222211111111111111122223334445566677776665544332221110000000000000000000000000000000000000000000000000011111233444443221111111111111110000000000000000000000000000000011111111122222222222221111111111111222223334445556666665554433322111100000000000000000000000000000000000000000000000000011112234444332211111111100001100000000000000000000000000000000111111111222222222222211111111111111222223334445555555555443332221111000000111100010000000000000000000000000000000000000011122333333221111110000000000000000000000000000000000000000011111111122222222222221111111111111112222223334444455555444333222111100000011111100000000000000000000000000000000000000000111122333322211110000000000000011111100000000000000000000001111111112222222222222211111111111111122222233333444444444443322211110001111111111000001000000000000000000000000000000000000111222222222111000000000000001111111111110000000000000000011112222222222333332222111111111111111222222233333333333333332211111000111111111110000111000000000000000000000000000000000000112222222211110000000000000111222221111110000000000000000111222222222333333332222111111111111112222222233333333333333222111100001111111111110001110000000000000000000000000000000000000122222222111110000000000011223333221111100000000000000001112222222223333333332222221111111111122222222223333222222222111110000001111111211111111100000000000000000000000000000000000002222222222111100000000000112334433221111000000000000000011122222222333333333333222221111111111222222222223222222222211110000000011111122222111111000000000000000000000000000000000000022233332222111100000000001123444433211100000000000000000112222222223333333333333332221111111122222222222222222222111110000000000011112222222222211000000000000000000000000000000000000333333333222111100000000012344554432211000000000000000001122222222333344333333333322222222222222222222222222222211111000000000000111122233333322220000000000000000000000000000000000003334443333222111000000000123445544322110000000000000000111222222233334444433344433322222222222222222222222222222111000000000001111112233333333332220000000000000000000000000000000000034444444433221111000000001233455443221100000000000000111112222233333444444444443333222222222222222222222222222111100000000001111111223334444444333210000000000000000000000000000000000044555544433221111000000011234444432211000000000001111111222233333444444444444433333222222222223322222222222111110000000000011111222334445555544433210000000000000000000000000000000000055555554432211111110000112233333322110000000011111111222222333444444444444443333333222211222333332222222111111000000000001111122333444556665554432210000000000000000000000000000000000066665554332111111110000112233333221100000001111111122222223344444444444444433333333222112233333332222221111000000000000011122233444556667666654432100000000000000000000000000000000000066665543321111111100001112222222110000000011111112222222333444444444455544433333332221222333333333222211110000000000000111222344556677777776654322100000000000000000000000000000000000666554433221111111000001111122111100000000111111112222223344455544445555444333333322222223333333333222211110000000000001112234456677888887766543321000000000000000000000000000000000000555544332221111110000001111111110000000000111111122222333444555555555555444433333222222233444333333222211110000000000011122345677889998887765543210000000000000000000000000000000000000544433322221111110000001111110000000000000111111222233344445555555555555444433332222222334444433333222111110000000000011234567899999998877665400000000000000000000000000000000000000004443333322221111111100000000000000000000000011112222334444455555555555554444333322212223344444433332222111100000000000112345789999999988776600000000000000000000000000000000000000000003333233332222211111111000000000000000000000111122233344444555555556555544443333222112233334333333322221111000000000001123567999999999988700000000000000000000000000000000000000000000003322333332222222111111111000000000000000000111222233344455555666655554444333332221122233333333332222111110000000000112245689999999999800000000000000000000000000000000000000000000000003223333333333222222111111000000000000000001111222233444555666666555444433333222211222222332222222211111100000000011123456899999999900000000000000000000000000000000000000000000000000002333333333333333222221111100000000000000011112222333445556666655544433333322222111222222222222222111111000000001112234568999999900000000000000000000000000000000000000000000000000000003333444444444433333222111111111000000000011112222334455566666554443333222222221111111111111222211111110000011111122344678999990000000000000000000000000000000000000000000000000000000000344555666555444333222111111111000000000111122223344455666665544333322222222111111111111111111111111100000111111223345678999000000000000000000000000000000000000000000000000000000000000456677777665554433222111111100000000011111222223344555666655443333222222211111111111111111111111111111111111112223445678800000000000000000000000000000000000000000000000000000000000000667888888766555433222111111000000011111111222233445555665554433322222111111111111111111111111111111111100111112233455660000000000000000000000000000000000000000000000000000000000000000789999998876655433222111100000001111111111222334455555555444433222211111111111111100001111111111111111000111112233455000000000000000000000000000000000000000000000000000000000000000008999999999877655433222111000000011111111111222344455555554443332221111111111111111000001111111111111111011111122333440000000000000000000000000000000000000000000000000000000000000000009999999999877655433221111000000111111111111223344444444444333222111111111111111100000000001111111111111111222222333000000000000000000000000000000000000000000000000000000000000000000009999999999887654432221110000001111111111111223334444444433322211111111111111110000000000000001111111112222222222220000000000000000000000000000000000000000000000000000000000000000000000999999999877654332211110000000000111111111223333333333332221111111111111111100000000000000001111112222333322222000000000000000000000000000000000000000000000000000000000000000000000000099999999876544322211110000000000000001111222233333332222111111111111111100000000000000000001112222333333332220000000000000000000000000000000000000000000000000000000000000000000000000009999999876543322211110000000000000001111122223332222211111111111100000000000000000000000011122233444443322000000000000000000000000000000000000000000000000000000000000000000000000000009999999865543332221111000000000000001111112222222221111001111110000000000000000000000000112223344444443000000000000000000000000000000000000000000000000000000000000000000000000000000009999998766544333322111100000000000001111112222211111111111111000000000000000000000000001122233445544400000000000000000000000000000000000000000000000000000000000000000000000000000000099999998876555444332211111111100000011111111111111111111111110000000000000000000000000111222334455540000000000000000000000000000000000000000000000000000000000000000000000000000000000099999998876666554432221111111100000011000000011001111111111100000000000000000000000001111222334455000000000000000000000000000000000000000000000000000000000000000000000000000000000000099999998877666654432222221111100000000000000000001111111111000000000000000000000000111111222334000000000000000000000000000000000000000000000000000000000000000000000000000000000000000999999998777766654333222222111000000000000000000001111111110000000000000000000000001111111222300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000999999987766665544333333222110000000000000000000000111111100000000000000000000000001111111200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009999998776666554444443333221110000000000000000000001111111000000000000000000000000000011100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009998877665554444444444433221100000000000000000000001111110000000110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008877665554443334445444432210000000000000000000000001111100000001100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000077665554443333344555544332000000000000000000000000001111000000011000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000065554443333333455555443000000000000000000000000000000000000000110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000044443333223334555550000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000043332222223344500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000033222222223000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000022111122000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000","agri":"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011100000000000011111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111000000000000111110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011110000000000011111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000110000000000001111110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011000000000001111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001110000000000011111110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111100000000011111110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111100000000111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111100000000111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111111000000000111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111110000000000111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111100000000000111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111000000000000000011000000000000000000111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111110000000000000000001100000000000000001100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111100000000000000000011110000000000000011000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111000000000000000011111111000000000000110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111100000000000011111111111111000000000001100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111100000000000001111111111110000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111000000000000000011111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111100000000000000001111111111110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111110000000000000000011111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111100000000000000000111111111110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111111000000000000000001111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111111110000000000000000011111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000110000000000000000000000011111111111111100000000000000000111111111110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111100000000000000000000001111111111111111000000000000000001111111111110000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000111111100000000000000000000011111111111111110000000000000000011111111111100000000000000000000000000000000000000000000000000000011000000000000000000000000000000000000000000000000000001111111000000000000000000000111111111111111111110000000000000111111111111111000000000000001000000000000000000000000000000000000110000000000000000000000000000000000000000000000000000111111111000000000000000000000000000011111111111111110000000001111111111111111000000000000110000000000000000000000000000000000001100000000000000000000000000000000000000000000000000001111111110000000000000000000000000000000000111111111110000000011111111111111111000000000001110000000000000000000000000000000000011000000000000000000000000000000000000000000000000000011111111000000000000000000000000000000000001111111111110000000111111111111111111000000000111100000000000000000000000000000000000110000000000000000000000000000000000000000000000000000111111110000000000000000011000000000000000011111111111100000001111111111111111110000000001111000000000000000000000000000000000001110000000000000000000000000000000000000000000000000001111111000000000000000011110000000000000000011111111111000000011111111111111111100000000011111000000000000000000000000000000000011110000000000000000000000000000000000000000000000000011111110000000000001111111100000000000000001111111111110000000011111111111111111000000000111111000000000000000000000000000000000111110000000000000000000000000000000000000000000000000011111100000000001111111111000000000000000011111111111000000000001111111111111100000000000111111100000000000000000000000000000000111100000000000000000000000000000000000000000000000000000110000000000011111111110000000000000000111111111000000000000000000000001000000000000000011111000000000000000000000000000000001111100000000000000000000000000000000000000000000000000000000000000000111111111100000000001111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000011100000000000000000000000000000000000000000000000000000000000000000011111111111000000001111111110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111111000000111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111100011000000000000000000000000000000000000000000000000001111111111111000111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111101111000000000000000000000000000000000000000000000000111111111111111111111111111110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111111000000000000000000000000000000000000000000000001111111111111111111111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000111111111111111000000000000000000000000000000000000000000000111111111111111100111100011110000000000000000000000000000000000000000000000000000000000000000000000000000000001100000000001111111111111110000000000000000000000000000000000000000000001111111111111100000100000001100000000000000000000000000000000000000000000000000000000000000000000000000000000111000000000001111111111111100000000000000000000000000000000000000000000001111111111110000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000001111100000000000000001111111111000000000000000000000000000000000000000000000001111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111000000000000000000000000111000000000000000000000000000000000000000000000001111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111110000000000000000000000000110000000000000000000000000000000000000000000000001111110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111000000000000000000000000000010000000000000000000000000000000000000000000000001111000000000000000000000000000000000000000000000000000000000000000000000111111000000000000000000111111110000000000000000000000000000010000000000000000000000000000000000000000000000011110000000000000000000000000000000000000000000000000000000000000000000000011110000000000000000001111111100000000000000000000000000000010000000000000000000000000000000000000000000000111000000000000000000000000000000000000000000000000000000000000000000000000111100000000000000000011111111000000000000000000000000000000110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111000000000000000011111111110000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011100000000000000111111111111110000000000000000000000000000001100000000000000000000000000000000000000000000000000000111111000000000000000000000000000000000000000000000000000000000000111000000000000000111111111111110000000000000000000000000000011000000000000000000000000000000000000000000000000000011111111110000000000000000000000000000000000000000000000000000000001110000000000000001111111111111110000000000000000000000000000010000000000000000000000000000000000000000000000000000111111111111111000000000000000000000000000000000000000000000000000011100000000000000001111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111111111111111100000000001000000000000000000000000000000000111000000000000000001111111111111111110000000000000000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111100000010000000000000000000000000000000001111000000000000000111111111111111111100000000000000000000000000000000000000000000000000000000000000000000000000000001111111111111111111111111100000100000000000000000000000000000000011110000000000000001111111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111111111111111000001100000000000000000000000000000000111110000000000000111111111111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111111111110000011100000000000000000000000000000011111111100000000011111111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111111111100000111100000000000000000000000000000111111111111111111111111111111111111110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111111111000001111000000000000000000000000000011111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111111111000011110000000000000000000000000001111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111111110000011110000000000000000000000011111111111111111111111111111110001111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111111100000111110000000000000000000001111111111111111111111110000000000000111111110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111111000000111100000000000000000000011111111111111111111110000000000000000111111110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111110000001111100000000000000000001111111111111111111111000000000000000001111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111100000011111100000000000000000111111111111111111111110000000000000000011000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111111100001111111000000000000000011111111111111111111111110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111111111111111111100000000000001111111111111111111111111100000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111111111111111111110000000000111111111111111111111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111000000011111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111111111111111111111111111111111000011111111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111111111111000000011111111110000000011111111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111111000000000000111111100000000111111111111111111110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111000000000000000001110000000001111111111111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111100000000000000000000000000000011111111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001110000000000000000000000000000000111111111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011100000000000000000000000000000000111111111111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000001111111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001110000000000000000000000000000000000000000000000000000000000111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111000000000000000000000000000000000000000000000000000000000111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111100000000000000000000000000000000000000000000000000000000000000111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000","lakes":[[59,67],[97,89],[59,99]],"districts":[{"name":"Praha","kraj":"PHA"},{"name":"Benešov","kraj":"STC"},{"name":"Beroun","kraj":"STC"},{"name":"Kladno","kraj":"STC"},{"name":"Kolín","kraj":"STC"},{"name":"Kutná Hora","kraj":"STC"},{"name":"Mělník","kraj":"STC"},{"name":"Mladá Boleslav","kraj":"STC"},{"name":"Nymburk","kraj":"STC"},{"name":"Praha-východ","kraj":"STC"},{"name":"Praha-západ","kraj":"STC"},{"name":"Příbram","kraj":"STC"},{"name":"Rakovník","kraj":"STC"},{"name":"České Budějovice","kraj":"JHC"},{"name":"Český Krumlov","kraj":"JHC"},{"name":"Jindřichův Hradec","kraj":"JHC"},{"name":"Písek","kraj":"JHC"},{"name":"Prachatice","kraj":"JHC"},{"name":"Strakonice","kraj":"JHC"},{"name":"Tábor","kraj":"JHC"},{"name":"Domažlice","kraj":"PLK"},{"name":"Klatovy","kraj":"PLK"},{"name":"Plzeň-město","kraj":"PLK"},{"name":"Plzeň-jih","kraj":"PLK"},{"name":"Plzeň-sever","kraj":"PLK"},{"name":"Rokycany","kraj":"PLK"},{"name":"Tachov","kraj":"PLK"},{"name":"Cheb","kraj":"KVK"},{"name":"Karlovy Vary","kraj":"KVK"},{"name":"Sokolov","kraj":"KVK"},{"name":"Děčín","kraj":"ULK"},{"name":"Chomutov","kraj":"ULK"},{"name":"Litoměřice","kraj":"ULK"},{"name":"Louny","kraj":"ULK"},{"name":"Most","kraj":"ULK"},{"name":"Teplice","kraj":"ULK"},{"name":"Ústí nad Labem","kraj":"ULK"},{"name":"Česká Lípa","kraj":"LBK"},{"name":"Jablonec nad Nisou","kraj":"LBK"},{"name":"Liberec","kraj":"LBK"},{"name":"Semily","kraj":"LBK"},{"name":"Hradec Králové","kraj":"HKK"},{"name":"Jičín","kraj":"HKK"},{"name":"Náchod","kraj":"HKK"},{"name":"Rychnov nad Kněžnou","kraj":"HKK"},{"name":"Trutnov","kraj":"HKK"},{"name":"Chrudim","kraj":"PAK"},{"name":"Pardubice","kraj":"PAK"},{"name":"Svitavy","kraj":"PAK"},{"name":"Ústí nad Orlicí","kraj":"PAK"},{"name":"Havlíčkův Brod","kraj":"VYS"},{"name":"Jihlava","kraj":"VYS"},{"name":"Pelhřimov","kraj":"VYS"},{"name":"Třebíč","kraj":"VYS"},{"name":"Žďár nad Sázavou","kraj":"VYS"},{"name":"Blansko","kraj":"JMK"},{"name":"Brno-město","kraj":"JMK"},{"name":"Brno-venkov","kraj":"JMK"},{"name":"Břeclav","kraj":"JMK"},{"name":"Hodonín","kraj":"JMK"},{"name":"Vyškov","kraj":"JMK"},{"name":"Znojmo","kraj":"JMK"},{"name":"Jeseník","kraj":"OLK"},{"name":"Olomouc","kraj":"OLK"},{"name":"Prostějov","kraj":"OLK"},{"name":"Přerov","kraj":"OLK"},{"name":"Šumperk","kraj":"OLK"},{"name":"Kroměříž","kraj":"ZLK"},{"name":"Uherské Hradiště","kraj":"ZLK"},{"name":"Vsetín","kraj":"ZLK"},{"name":"Zlín","kraj":"ZLK"},{"name":"Bruntál","kraj":"MSK"},{"name":"Frýdek-Místek","kraj":"MSK"},{"name":"Karviná","kraj":"MSK"},{"name":"Nový Jičín","kraj":"MSK"},{"name":"Opava","kraj":"MSK"},{"name":"Ostrava-město","kraj":"MSK"}],"kraje":{"PHA":"Hlavní město Praha","STC":"Středočeský kraj","JHC":"Jihočeský kraj","PLK":"Plzeňský kraj","KVK":"Karlovarský kraj","ULK":"Ústecký kraj","LBK":"Liberecký kraj","HKK":"Královéhradecký kraj","PAK":"Pardubický kraj","VYS":"Kraj Vysočina","JMK":"Jihomoravský kraj","OLK":"Olomoucký kraj","ZLK":"Zlínský kraj","MSK":"Moravskoslezský kraj"},"settlements":[{"name":"Praha","lvl":4,"c":65,"r":46,"d":0},{"name":"Brno","lvl":4,"c":117,"r":79,"d":56},{"name":"Ostrava","lvl":4,"c":157,"r":55,"d":76},{"name":"Plzeň","lvl":4,"c":40,"r":58,"d":22},{"name":"Olomouc","lvl":3,"c":133,"r":64,"d":63},{"name":"Liberec","lvl":3,"c":80,"r":20,"d":39},{"name":"České Budějovice","lvl":3,"c":66,"r":87,"d":13},{"name":"Hradec Králové","lvl":3,"c":98,"r":41,"d":41},{"name":"Ústí nad Labem","lvl":3,"c":56,"r":24,"d":36},{"name":"Pardubice","lvl":3,"c":97,"r":47,"d":47},{"name":"Zlín","lvl":3,"c":142,"r":77,"d":70},{"name":"Karlovy Vary","lvl":3,"c":28,"r":40,"d":28},{"name":"Jihlava","lvl":3,"c":93,"r":71,"d":51},{"name":"Kladno","lvl":3,"c":57,"r":43,"d":3},{"name":"Most","lvl":2,"c":46,"r":30,"d":34},{"name":"Opava","lvl":2,"c":148,"r":51,"d":75},{"name":"Teplice","lvl":2,"c":50,"r":25,"d":35},{"name":"Děčín","lvl":2,"c":60,"r":20,"d":30},{"name":"Chomutov","lvl":2,"c":41,"r":32,"d":31},{"name":"Mladá Boleslav","lvl":2,"c":76,"r":34,"d":7},{"name":"Prostějov","lvl":2,"c":129,"r":68,"d":64},{"name":"Přerov","lvl":2,"c":137,"r":69,"d":65},{"name":"Cheb","lvl":2,"c":16,"r":46,"d":27},{"name":"Znojmo","lvl":2,"c":104,"r":91,"d":61},{"name":"Tábor","lvl":2,"c":70,"r":71,"d":19},{"name":"Kolín","lvl":2,"c":83,"r":48,"d":4},{"name":"Třebíč","lvl":2,"c":100,"r":78,"d":53},{"name":"Písek","lvl":2,"c":58,"r":74,"d":16},{"name":"Jablonec nad Nisou","lvl":2,"c":83,"r":22,"d":38},{"name":"Havířov","lvl":2,"c":161,"r":57,"d":72},{"name":"Frýdek-Místek","lvl":2,"c":159,"r":60,"d":72},{"name":"Karviná","lvl":2,"c":163,"r":54,"d":73},{"name":"Šumperk","lvl":2,"c":126,"r":50,"d":66},{"name":"Trutnov","lvl":2,"c":100,"r":28,"d":45},{"name":"Náchod","lvl":2,"c":106,"r":33,"d":43},{"name":"Litoměřice","lvl":2,"c":58,"r":29,"d":32},{"name":"Kroměříž","lvl":2,"c":136,"r":75,"d":67},{"name":"Břeclav","lvl":2,"c":124,"r":95,"d":58},{"name":"Hodonín","lvl":2,"c":130,"r":91,"d":59},{"name":"Vsetín","lvl":2,"c":150,"r":73,"d":69},{"name":"Žďár nad Sázavou","lvl":2,"c":101,"r":65,"d":54},{"name":"Havlíčkův Brod","lvl":2,"c":92,"r":63,"d":50},{"name":"Sokolov","lvl":2,"c":22,"r":42,"d":29},{"name":"Domažlice","lvl":2,"c":29,"r":70,"d":20},{"name":"Klatovy","lvl":2,"c":38,"r":71,"d":21},{"name":"Příbram","lvl":2,"c":55,"r":60,"d":11},{"name":"Beroun","lvl":2,"c":56,"r":50,"d":2},{"name":"Mělník","lvl":2,"c":66,"r":36,"d":6},{"name":"Jindřichův Hradec","lvl":2,"c":79,"r":81,"d":15},{"name":"Uherské Hradiště","lvl":2,"c":138,"r":83,"d":68},{"name":"Česká Lípa","lvl":2,"c":68,"r":23,"d":37},{"name":"Strakonice","lvl":2,"c":52,"r":76,"d":18},{"name":"Nový Jičín","lvl":2,"c":151,"r":64,"d":74},{"name":"Třinec","lvl":2,"c":167,"r":61,"d":72},{"name":"Jeseník","lvl":2,"c":131,"r":40,"d":62},{"name":"Krnov","lvl":2,"c":143,"r":45,"d":71},{"name":"Kutná Hora","lvl":2,"c":85,"r":51,"d":5},{"name":"Benešov","lvl":2,"c":71,"r":57,"d":1},{"name":"Vyškov","lvl":2,"c":126,"r":76,"d":60},{"name":"Svitavy","lvl":2,"c":114,"r":58,"d":48},{"name":"Jičín","lvl":2,"c":87,"r":33,"d":42},{"name":"Telč","lvl":1,"c":89,"r":79,"d":51},{"name":"Český Krumlov","lvl":1,"c":62,"r":93,"d":14},{"name":"Špindlerův Mlýn","lvl":1,"c":93,"r":22,"d":40},{"name":"Harrachov","lvl":1,"c":89,"r":20,"d":40},{"name":"Lipno nad Vltavou","lvl":1,"c":60,"r":99,"d":14},{"name":"Vyšší Brod","lvl":1,"c":62,"r":100,"d":14},{"name":"Mikulov","lvl":1,"c":118,"r":93,"d":58},{"name":"Slavonice","lvl":1,"c":87,"r":86,"d":15},{"name":"Železná Ruda","lvl":1,"c":37,"r":80,"d":21},{"name":"Hřensko","lvl":1,"c":60,"r":17,"d":30},{"name":"Jáchymov","lvl":1,"c":29,"r":35,"d":28},{"name":"Kraslice","lvl":1,"c":19,"r":37,"d":29},{"name":"Aš","lvl":1,"c":11,"r":40,"d":27},{"name":"Králíky","lvl":1,"c":121,"r":46,"d":66},{"name":"Javorník","lvl":1,"c":128,"r":35,"d":62},{"name":"Karlštejn","lvl":1,"c":59,"r":51,"d":2},{"name":"Hluboká nad Vltavou","lvl":1,"c":65,"r":84,"d":13},{"name":"Lednice","lvl":1,"c":122,"r":93,"d":58},{"name":"Temelín","lvl":1,"c":63,"r":79,"d":16},{"name":"Dukovany","lvl":1,"c":106,"r":83,"d":57},{"name":"Mokrá","lvl":1,"c":121,"r":77,"d":55},{"name":"Počerady","lvl":1,"c":47,"r":32,"d":34},{"name":"Chvaletice","lvl":1,"c":89,"r":47,"d":5},{"name":"Dětmarovice","lvl":1,"c":164,"r":56,"d":73},{"name":"Rozvadov","lvl":1,"c":20,"r":61,"d":26},{"name":"Vimperk","lvl":1,"c":49,"r":84,"d":17},{"name":"Dolní Dvořiště","lvl":1,"c":65,"r":99,"d":14},{"name":"Frenštát pod Radhoštěm","lvl":1,"c":155,"r":65,"d":74},{"name":"Rožnov pod Radhoštěm","lvl":1,"c":154,"r":69,"d":69},{"name":"Humpolec","lvl":1,"c":87,"r":66,"d":52},{"name":"Velké Meziříčí","lvl":1,"c":103,"r":73,"d":53},{"name":"Pohořelice","lvl":1,"c":115,"r":87,"d":57},{"name":"Poděbrady","lvl":1,"c":81,"r":44,"d":8},{"name":"Slaný","lvl":1,"c":57,"r":40,"d":3},{"name":"Lovosice","lvl":1,"c":56,"r":30,"d":32},{"name":"Šluknov","lvl":1,"c":65,"r":12,"d":30},{"name":"Frýdlant","lvl":1,"c":80,"r":15,"d":39},{"name":"Broumov","lvl":1,"c":110,"r":28,"d":43},{"name":"Horní Planá","lvl":1,"c":55,"r":94,"d":14},{"name":"Nové Hrady","lvl":1,"c":73,"r":94,"d":13},{"name":"Kašperské Hory","lvl":1,"c":45,"r":81,"d":18},{"name":"Pec pod Sněžkou","lvl":1,"c":96,"r":23,"d":45},{"name":"Modrava","lvl":1,"c":44,"r":84,"d":17},{"name":"Boží Dar","lvl":1,"c":29,"r":33,"d":28},{"name":"Bílá","lvl":1,"c":160,"r":67,"d":72},{"name":"Hulín","lvl":1,"c":138,"r":74,"d":67},{"name":"Fryšták","lvl":1,"c":143,"r":75,"d":70},{"name":"Český Těšín","lvl":1,"c":165,"r":58,"d":73},{"name":"Turnov","lvl":1,"c":82,"r":27,"d":40},{"name":"Jaroměř","lvl":1,"c":101,"r":36,"d":41},{"name":"Vysoké Mýto","lvl":1,"c":106,"r":51,"d":49},{"name":"Mohelnice","lvl":1,"c":125,"r":57,"d":66},{"name":"Velké Karlovice","lvl":1,"c":157,"r":73,"d":69}],"sites":[{"type":"power","name":"Elektrárna · Počerady","c":45,"r":32,"d":34},{"type":"power","name":"Elektrárna · Dukovany","c":106,"r":81,"d":57},{"type":"power","name":"Elektrárna · Karviná","c":162,"r":52,"d":73},{"type":"power","name":"Elektrárna · Chvaletice","c":91,"r":47,"d":47},{"type":"coalmine","name":"Uhelný důl · Most","c":44,"r":30,"d":34},{"type":"coalmine","name":"Uhelný důl · Sokolov","c":22,"r":40,"d":29},{"type":"coalmine","name":"Uhelný důl · Karviná","c":161,"r":54,"d":73},{"type":"coalmine","name":"Uhelný důl · Český Těšín","c":163,"r":58,"d":72},{"type":"sawmill","name":"Pila · Vimperk","c":51,"r":84,"d":17},{"type":"sawmill","name":"Pila · Jeseník","c":131,"r":42,"d":62},{"type":"lumber","name":"Těžba dřeva · Modrava","c":42,"r":83,"d":21},{"type":"lumber","name":"Těžba dřeva · Bílá","c":160,"r":69,"d":72},{"type":"lumber","name":"Těžba dřeva · Šumperk","c":129,"r":47,"d":66},{"type":"lumber","name":"Těžba dřeva · Boží Dar","c":32,"r":32,"d":28},{"type":"pump","name":"Čerpací stanice · Lipno nad Vltavou I.","c":58,"r":99,"d":14},{"type":"pump","name":"Čerpací stanice · Lipno nad Vltavou II.","c":59,"r":97,"d":14},{"type":"pump","name":"Čerpací stanice · Příbram","c":59,"r":66,"d":11},{"type":"cement","name":"Cementárna · Mokrá","c":119,"r":77,"d":55},{"type":"quarry","name":"Lom · Frenštát pod Radhoštěm","c":153,"r":65,"d":74},{"type":"dep_coal","name":"Uhelné ložisko · Hodonín","c":129,"r":89,"d":59},{"type":"dep_coal","name":"Uhelné ložisko · Kladno","c":57,"r":45,"d":3},{"type":"dep_limestone","name":"Ložisko vápence · Lovosice","c":55,"r":32,"d":32},{"type":"dep_limestone","name":"Ložisko vápence · Beroun","c":55,"r":52,"d":2},{"type":"dep_limestone","name":"Ložisko vápence · Pardubice","c":93,"r":52,"d":46},{"type":"dep_field","name":"Úrodné pole · Prostějov","c":131,"r":67,"d":64},{"type":"dep_field","name":"Úrodné pole · Poděbrady","c":79,"r":43,"d":8},{"type":"dep_field","name":"Úrodné pole · Lednice","c":124,"r":88,"d":59},{"type":"dep_field","name":"Úrodné pole · Chomutov","c":44,"r":37,"d":33},{"type":"dep_field","name":"Úrodné pole · Znojmo","c":105,"r":89,"d":61}],"highways":[{"id":"D1","name":"Praha – Brno – Ostrava – Polsko","segs":[{"st":"built","cells":[{"t":"o","c":65,"r":46},{"t":"o","c":65,"r":47},{"t":"o","c":66,"r":47},{"t":"o","c":66,"r":48},{"t":"s","c":66,"r":48},{"t":"o","c":67,"r":49},{"t":"o","c":67,"r":50},{"t":"s","c":67,"r":50},{"t":"o","c":68,"r":51},{"t":"o","c":68,"r":52},{"t":"s","c":68,"r":52},{"t":"o","c":69,"r":53},{"t":"o","c":69,"r":54},{"t":"s","c":69,"r":54},{"t":"o","c":70,"r":55},{"t":"o","c":70,"r":56},{"t":"o","c":71,"r":56},{"t":"o","c":71,"r":57},{"t":"s","c":71,"r":57},{"t":"o","c":72,"r":57},{"t":"o","c":72,"r":58},{"t":"o","c":73,"r":58},{"t":"s","c":73,"r":58},{"t":"o","c":74,"r":59},{"t":"o","c":75,"r":59},{"t":"s","c":75,"r":59},{"t":"o","c":76,"r":60},{"t":"o","c":77,"r":60},{"t":"s","c":77,"r":60},{"t":"o","c":78,"r":61},{"t":"o","c":79,"r":61},{"t":"o","c":79,"r":62},{"t":"o","c":80,"r":62},{"t":"s","c":80,"r":62},{"t":"o","c":81,"r":63},{"t":"o","c":82,"r":63},{"t":"s","c":82,"r":63},{"t":"o","c":83,"r":64},{"t":"o","c":84,"r":64},{"t":"s","c":84,"r":64},{"t":"o","c":85,"r":65},{"t":"o","c":86,"r":65},{"t":"o","c":86,"r":66},{"t":"s","c":86,"r":65},{"t":"o","c":87,"r":66},{"t":"s","c":87,"r":66},{"t":"o","c":88,"r":67},{"t":"s","c":88,"r":67},{"t":"o","c":89,"r":68},{"t":"o","c":90,"r":68},{"t":"o","c":90,"r":69},{"t":"o","c":91,"r":69},{"t":"s","c":91,"r":69},{"t":"o","c":92,"r":70},{"t":"s","c":92,"r":70},{"t":"o","c":93,"r":71},{"t":"o","c":94,"r":71},{"t":"s","c":94,"r":71},{"t":"o","c":95,"r":71},{"t":"s","c":95,"r":71},{"t":"o","c":96,"r":72},{"t":"s","c":96,"r":71},{"t":"o","c":97,"r":72},{"t":"o","c":98,"r":72},{"t":"o","c":99,"r":72},{"t":"s","c":99,"r":72},{"t":"o","c":100,"r":72},{"t":"s","c":100,"r":72},{"t":"o","c":101,"r":73},{"t":"s","c":101,"r":72},{"t":"o","c":102,"r":73},{"t":"o","c":103,"r":73},{"t":"o","c":104,"r":73},{"t":"s","c":104,"r":73},{"t":"o","c":105,"r":74},{"t":"o","c":106,"r":74},{"t":"s","c":106,"r":74},{"t":"o","c":107,"r":75},{"t":"o","c":108,"r":75},{"t":"s","c":108,"r":75},{"t":"o","c":109,"r":76},{"t":"o","c":110,"r":76},{"t":"o","c":111,"r":76},{"t":"s","c":111,"r":76},{"t":"o","c":112,"r":77},{"t":"o","c":113,"r":77},{"t":"s","c":113,"r":77},{"t":"o","c":114,"r":78},{"t":"o","c":115,"r":78},{"t":"s","c":115,"r":78},{"t":"o","c":116,"r":79},{"t":"o","c":117,"r":79},{"t":"o","c":118,"r":79},{"t":"s","c":118,"r":78},{"t":"o","c":119,"r":78},{"t":"o","c":120,"r":78},{"t":"o","c":121,"r":78},{"t":"s","c":121,"r":77},{"t":"o","c":122,"r":77},{"t":"o","c":123,"r":77},{"t":"o","c":124,"r":77},{"t":"s","c":124,"r":76},{"t":"o","c":125,"r":76},{"t":"o","c":126,"r":76},{"t":"s","c":126,"r":75},{"t":"o","c":127,"r":75},{"t":"o","c":128,"r":75},{"t":"s","c":128,"r":74},{"t":"o","c":129,"r":74},{"t":"s","c":129,"r":73},{"t":"o","c":130,"r":74},{"t":"o","c":130,"r":73},{"t":"o","c":131,"r":73},{"t":"s","c":131,"r":72},{"t":"o","c":132,"r":72},{"t":"o","c":133,"r":72},{"t":"o","c":133,"r":71},{"t":"s","c":133,"r":71},{"t":"o","c":134,"r":71},{"t":"s","c":134,"r":70},{"t":"o","c":135,"r":70},{"t":"o","c":136,"r":70},{"t":"s","c":136,"r":69},{"t":"o","c":137,"r":69},{"t":"s","c":137,"r":68},{"t":"o","c":138,"r":68},{"t":"o","c":139,"r":68},{"t":"o","c":139,"r":67},{"t":"o","c":140,"r":67},{"t":"s","c":140,"r":66},{"t":"o","c":141,"r":66},{"t":"o","c":142,"r":66},{"t":"s","c":142,"r":65},{"t":"o","c":143,"r":66},{"t":"s","c":143,"r":65},{"t":"o","c":144,"r":65},{"t":"s","c":144,"r":65},{"t":"o","c":145,"r":65},{"t":"o","c":146,"r":65},{"t":"o","c":147,"r":65},{"t":"s","c":147,"r":64},{"t":"o","c":148,"r":65},{"t":"s","c":148,"r":64},{"t":"o","c":149,"r":64},{"t":"s","c":149,"r":64},{"t":"o","c":150,"r":64},{"t":"o","c":151,"r":64},{"t":"s","c":151,"r":63},{"t":"o","c":152,"r":63},{"t":"o","c":153,"r":63},{"t":"s","c":153,"r":62},{"t":"o","c":154,"r":62},{"t":"o","c":154,"r":61},{"t":"s","c":154,"r":60},{"t":"o","c":155,"r":60},{"t":"o","c":155,"r":59},{"t":"s","c":155,"r":58},{"t":"o","c":156,"r":58},{"t":"o","c":156,"r":57},{"t":"s","c":156,"r":56},{"t":"o","c":157,"r":56},{"t":"o","c":157,"r":55},{"t":"s","c":157,"r":54},{"t":"o","c":158,"r":54},{"t":"o","c":158,"r":53},{"t":"s","c":158,"r":52},{"t":"o","c":159,"r":52}]}]},{"id":"D2","name":"Brno – Břeclav – Slovensko","segs":[{"st":"built","cells":[{"t":"o","c":117,"r":79},{"t":"o","c":117,"r":80},{"t":"o","c":118,"r":80},{"t":"s","c":117,"r":80},{"t":"o","c":118,"r":81},{"t":"o","c":118,"r":82},{"t":"s","c":118,"r":82},{"t":"o","c":119,"r":83},{"t":"o","c":119,"r":84},{"t":"s","c":119,"r":84},{"t":"o","c":120,"r":85},{"t":"o","c":120,"r":86},{"t":"s","c":120,"r":86},{"t":"o","c":120,"r":87},{"t":"o","c":121,"r":87},{"t":"s","c":120,"r":87},{"t":"o","c":121,"r":88},{"t":"o","c":121,"r":89},{"t":"s","c":121,"r":89},{"t":"o","c":122,"r":90},{"t":"o","c":122,"r":91},{"t":"s","c":122,"r":91},{"t":"o","c":123,"r":92},{"t":"o","c":123,"r":93},{"t":"s","c":123,"r":93},{"t":"o","c":124,"r":94},{"t":"o","c":124,"r":95},{"t":"s","c":124,"r":95},{"t":"o","c":125,"r":96},{"t":"s","c":125,"r":96},{"t":"o","c":126,"r":97},{"t":"s","c":126,"r":97},{"t":"o","c":127,"r":98}]}]},{"id":"D3","name":"Praha – České Budějovice – Rakousko","segs":[{"st":"cons","cells":[{"t":"o","c":71,"r":57},{"t":"o","c":71,"r":58},{"t":"o","c":71,"r":59},{"t":"o","c":71,"r":60},{"t":"o","c":71,"r":61},{"t":"s","c":70,"r":61},{"t":"o","c":71,"r":62},{"t":"s","c":70,"r":62},{"t":"o","c":71,"r":63},{"t":"s","c":70,"r":63},{"t":"o","c":71,"r":64},{"t":"o","c":70,"r":64},{"t":"s","c":70,"r":64},{"t":"o","c":70,"r":65},{"t":"s","c":70,"r":65},{"t":"o","c":70,"r":66},{"t":"s","c":70,"r":66},{"t":"o","c":70,"r":67},{"t":"o","c":70,"r":68},{"t":"o","c":70,"r":69},{"t":"o","c":70,"r":70},{"t":"o","c":70,"r":71}]},{"st":"built","cells":[{"t":"o","c":70,"r":71},{"t":"o","c":70,"r":72},{"t":"o","c":70,"r":73},{"t":"s","c":70,"r":73},{"t":"o","c":70,"r":74},{"t":"s","c":70,"r":74},{"t":"o","c":71,"r":75},{"t":"s","c":70,"r":75},{"t":"o","c":71,"r":76},{"t":"o","c":71,"r":77},{"t":"o","c":71,"r":78}]},{"st":"cons","cells":[{"t":"o","c":71,"r":78},{"t":"s","c":70,"r":78},{"t":"o","c":71,"r":79},{"t":"o","c":70,"r":79},{"t":"o","c":70,"r":80},{"t":"s","c":69,"r":80},{"t":"o","c":69,"r":81},{"t":"o","c":69,"r":82},{"t":"s","c":68,"r":82},{"t":"o","c":68,"r":83},{"t":"o","c":68,"r":84},{"t":"s","c":67,"r":84},{"t":"o","c":67,"r":85},{"t":"o","c":67,"r":86},{"t":"o","c":66,"r":86},{"t":"s","c":66,"r":86},{"t":"o","c":66,"r":87}]},{"st":"built","cells":[{"t":"o","c":66,"r":87},{"t":"o","c":66,"r":88},{"t":"o","c":66,"r":89},{"t":"o","c":66,"r":90},{"t":"s","c":65,"r":90},{"t":"o","c":66,"r":91},{"t":"s","c":65,"r":91},{"t":"o","c":66,"r":92},{"t":"s","c":65,"r":92},{"t":"o","c":66,"r":93},{"t":"o","c":65,"r":93},{"t":"s","c":65,"r":93},{"t":"o","c":65,"r":94},{"t":"s","c":65,"r":94},{"t":"o","c":65,"r":95},{"t":"s","c":65,"r":95},{"t":"o","c":65,"r":96},{"t":"o","c":65,"r":97},{"t":"o","c":65,"r":98},{"t":"o","c":65,"r":99}]}]},{"id":"D4","name":"Praha – Příbram – Písek","segs":[{"st":"built","cells":[{"t":"o","c":65,"r":46},{"t":"s","c":64,"r":46},{"t":"o","c":64,"r":47},{"t":"o","c":64,"r":48},{"t":"o","c":63,"r":48},{"t":"o","c":63,"r":49},{"t":"s","c":62,"r":49},{"t":"o","c":62,"r":50},{"t":"s","c":61,"r":50},{"t":"o","c":61,"r":51},{"t":"o","c":61,"r":52},{"t":"o","c":60,"r":52},{"t":"o","c":60,"r":53},{"t":"s","c":59,"r":53},{"t":"o","c":59,"r":54},{"t":"s","c":58,"r":54},{"t":"o","c":58,"r":55},{"t":"o","c":58,"r":56},{"t":"s","c":57,"r":56},{"t":"o","c":57,"r":57},{"t":"s","c":56,"r":57},{"t":"o","c":56,"r":58},{"t":"o","c":56,"r":59},{"t":"s","c":55,"r":59},{"t":"o","c":55,"r":60}]},{"st":"cons","cells":[{"t":"o","c":55,"r":60},{"t":"o","c":55,"r":61},{"t":"s","c":55,"r":61},{"t":"o","c":55,"r":62},{"t":"s","c":55,"r":62},{"t":"o","c":56,"r":63},{"t":"o","c":56,"r":64},{"t":"o","c":56,"r":65},{"t":"o","c":56,"r":66},{"t":"s","c":56,"r":66},{"t":"o","c":56,"r":67},{"t":"o","c":57,"r":67},{"t":"s","c":56,"r":67},{"t":"o","c":57,"r":68},{"t":"o","c":57,"r":69},{"t":"o","c":57,"r":70},{"t":"o","c":57,"r":71},{"t":"s","c":57,"r":71},{"t":"o","c":58,"r":72},{"t":"s","c":57,"r":72},{"t":"o","c":58,"r":73},{"t":"o","c":58,"r":74}]}]},{"id":"D5","name":"Praha – Plzeň – Německo","segs":[{"st":"built","cells":[{"t":"o","c":65,"r":46},{"t":"o","c":64,"r":46},{"t":"o","c":64,"r":47},{"t":"s","c":63,"r":46},{"t":"o","c":63,"r":47},{"t":"o","c":62,"r":47},{"t":"s","c":61,"r":47},{"t":"o","c":61,"r":48},{"t":"o","c":60,"r":48},{"t":"s","c":59,"r":48},{"t":"o","c":59,"r":49},{"t":"o","c":58,"r":49},{"t":"s","c":57,"r":49},{"t":"o","c":57,"r":50},{"t":"o","c":56,"r":50},{"t":"s","c":55,"r":50},{"t":"o","c":55,"r":51},{"t":"o","c":54,"r":51},{"t":"o","c":54,"r":52},{"t":"o","c":53,"r":52},{"t":"s","c":52,"r":52},{"t":"o","c":52,"r":53},{"t":"s","c":51,"r":53},{"t":"o","c":51,"r":53},{"t":"o","c":51,"r":54},{"t":"o","c":50,"r":54},{"t":"o","c":50,"r":55},{"t":"s","c":49,"r":54},{"t":"o","c":49,"r":55},{"t":"s","c":48,"r":55},{"t":"o","c":48,"r":56},{"t":"o","c":47,"r":56},{"t":"o","c":47,"r":57},{"t":"o","c":46,"r":57},{"t":"s","c":45,"r":57},{"t":"o","c":45,"r":58},{"t":"o","c":44,"r":58},{"t":"o","c":43,"r":58},{"t":"o","c":42,"r":58},{"t":"o","c":41,"r":58},{"t":"o","c":40,"r":58},{"t":"o","c":39,"r":58},{"t":"o","c":38,"r":58},{"t":"o","c":37,"r":58},{"t":"o","c":36,"r":58},{"t":"o","c":35,"r":58},{"t":"o","c":34,"r":58},{"t":"o","c":33,"r":58},{"t":"o","c":32,"r":58},{"t":"o","c":31,"r":58},{"t":"o","c":30,"r":58},{"t":"s","c":29,"r":58},{"t":"o","c":29,"r":59},{"t":"s","c":28,"r":58},{"t":"o","c":28,"r":59},{"t":"o","c":27,"r":59},{"t":"o","c":26,"r":59},{"t":"s","c":25,"r":59},{"t":"o","c":25,"r":60},{"t":"o","c":24,"r":60},{"t":"o","c":23,"r":60},{"t":"s","c":22,"r":60},{"t":"o","c":22,"r":60},{"t":"s","c":21,"r":60},{"t":"o","c":21,"r":61},{"t":"o","c":20,"r":61}]}]},{"id":"D6","name":"Praha – Karlovy Vary – Cheb","segs":[{"st":"built","cells":[{"t":"o","c":65,"r":46},{"t":"o","c":64,"r":46},{"t":"s","c":63,"r":45},{"t":"o","c":63,"r":46},{"t":"s","c":62,"r":45},{"t":"o","c":62,"r":45},{"t":"o","c":61,"r":45},{"t":"o","c":60,"r":45},{"t":"s","c":59,"r":44},{"t":"o","c":59,"r":45},{"t":"s","c":58,"r":44},{"t":"o","c":58,"r":44},{"t":"s","c":57,"r":44},{"t":"o","c":57,"r":44},{"t":"o","c":56,"r":44},{"t":"o","c":55,"r":44},{"t":"s","c":54,"r":43},{"t":"o","c":54,"r":44},{"t":"o","c":54,"r":43},{"t":"s","c":53,"r":43},{"t":"o","c":53,"r":43},{"t":"o","c":52,"r":43}]},{"st":"cons","cells":[{"t":"o","c":52,"r":43},{"t":"o","c":51,"r":43},{"t":"o","c":51,"r":44},{"t":"o","c":50,"r":44},{"t":"o","c":49,"r":44},{"t":"o","c":49,"r":45},{"t":"o","c":48,"r":45},{"t":"o","c":47,"r":45},{"t":"o","c":46,"r":45},{"t":"o","c":45,"r":45},{"t":"o","c":44,"r":45},{"t":"o","c":43,"r":45},{"t":"o","c":42,"r":45},{"t":"o","c":41,"r":45},{"t":"o","c":40,"r":45},{"t":"o","c":39,"r":45},{"t":"o","c":38,"r":45},{"t":"o","c":37,"r":45},{"t":"o","c":36,"r":45},{"t":"o","c":35,"r":45},{"t":"s","c":34,"r":44},{"t":"o","c":34,"r":44},{"t":"o","c":33,"r":44},{"t":"o","c":33,"r":43},{"t":"o","c":32,"r":43},{"t":"s","c":31,"r":42},{"t":"o","c":31,"r":42},{"t":"o","c":30,"r":42},{"t":"o","c":30,"r":41},{"t":"o","c":29,"r":41},{"t":"s","c":28,"r":40},{"t":"o","c":28,"r":40}]},{"st":"built","cells":[{"t":"o","c":28,"r":40},{"t":"o","c":27,"r":40},{"t":"s","c":26,"r":40},{"t":"o","c":26,"r":41},{"t":"o","c":25,"r":41},{"t":"o","c":24,"r":41},{"t":"s","c":23,"r":41},{"t":"o","c":23,"r":42},{"t":"o","c":22,"r":42},{"t":"s","c":21,"r":42},{"t":"o","c":21,"r":43},{"t":"o","c":20,"r":43},{"t":"s","c":19,"r":43},{"t":"o","c":19,"r":44},{"t":"s","c":18,"r":44},{"t":"o","c":18,"r":45},{"t":"o","c":17,"r":45},{"t":"s","c":16,"r":45},{"t":"o","c":16,"r":46},{"t":"o","c":15,"r":46},{"t":"s","c":14,"r":45},{"t":"o","c":14,"r":45},{"t":"o","c":13,"r":45}]}]},{"id":"D7","name":"Praha – Chomutov","segs":[{"st":"built","cells":[{"t":"o","c":65,"r":46},{"t":"s","c":64,"r":45},{"t":"o","c":64,"r":45},{"t":"o","c":63,"r":45},{"t":"o","c":63,"r":44},{"t":"o","c":62,"r":44},{"t":"s","c":61,"r":43},{"t":"o","c":61,"r":43},{"t":"s","c":60,"r":42},{"t":"o","c":60,"r":42},{"t":"o","c":59,"r":42},{"t":"o","c":59,"r":41},{"t":"o","c":58,"r":41},{"t":"s","c":57,"r":40},{"t":"o","c":57,"r":40},{"t":"s","c":56,"r":39},{"t":"o","c":56,"r":40},{"t":"o","c":56,"r":39},{"t":"o","c":55,"r":39},{"t":"s","c":54,"r":38},{"t":"o","c":54,"r":38},{"t":"o","c":53,"r":38},{"t":"s","c":52,"r":37},{"t":"o","c":52,"r":37},{"t":"o","c":51,"r":37},{"t":"o","c":51,"r":36},{"t":"s","c":50,"r":36},{"t":"o","c":50,"r":36},{"t":"o","c":49,"r":36},{"t":"s","c":48,"r":35},{"t":"o","c":48,"r":35},{"t":"o","c":47,"r":35},{"t":"s","c":46,"r":34},{"t":"o","c":46,"r":34},{"t":"o","c":45,"r":34},{"t":"s","c":44,"r":33},{"t":"o","c":44,"r":33},{"t":"o","c":43,"r":33},{"t":"s","c":42,"r":32},{"t":"o","c":42,"r":33},{"t":"o","c":42,"r":32},{"t":"o","c":41,"r":32}]}]},{"id":"D8","name":"Praha – Ústí nad Labem – Německo","segs":[{"st":"built","cells":[{"t":"o","c":65,"r":46},{"t":"o","c":65,"r":45},{"t":"s","c":64,"r":44},{"t":"o","c":65,"r":44},{"t":"o","c":64,"r":44},{"t":"s","c":64,"r":43},{"t":"o","c":64,"r":43},{"t":"o","c":64,"r":42},{"t":"o","c":64,"r":41},{"t":"s","c":63,"r":40},{"t":"o","c":64,"r":40},{"t":"o","c":63,"r":40},{"t":"s","c":63,"r":39},{"t":"o","c":63,"r":39},{"t":"o","c":63,"r":38},{"t":"s","c":62,"r":37},{"t":"o","c":62,"r":37},{"t":"s","c":61,"r":36},{"t":"o","c":61,"r":36},{"t":"o","c":61,"r":35},{"t":"o","c":60,"r":35},{"t":"o","c":60,"r":34},{"t":"o","c":59,"r":34},{"t":"o","c":59,"r":33},{"t":"o","c":58,"r":33},{"t":"o","c":58,"r":32},{"t":"s","c":57,"r":31},{"t":"o","c":57,"r":31},{"t":"s","c":56,"r":30},{"t":"o","c":56,"r":30},{"t":"o","c":56,"r":29},{"t":"o","c":56,"r":28},{"t":"o","c":56,"r":27},{"t":"o","c":56,"r":26},{"t":"o","c":56,"r":25},{"t":"o","c":56,"r":24},{"t":"s","c":55,"r":23},{"t":"o","c":55,"r":23},{"t":"o","c":55,"r":22},{"t":"o","c":54,"r":22},{"t":"o","c":54,"r":21},{"t":"s","c":53,"r":20},{"t":"o","c":53,"r":20}]}]},{"id":"D10","name":"Praha – Mladá Boleslav – Liberec","segs":[{"st":"built","cells":[{"t":"o","c":65,"r":46},{"t":"s","c":65,"r":45},{"t":"o","c":66,"r":45},{"t":"s","c":66,"r":44},{"t":"o","c":67,"r":44},{"t":"s","c":67,"r":43},{"t":"o","c":68,"r":43},{"t":"s","c":68,"r":42},{"t":"o","c":69,"r":42},{"t":"s","c":69,"r":41},{"t":"o","c":70,"r":41},{"t":"s","c":70,"r":40},{"t":"o","c":71,"r":40},{"t":"s","c":71,"r":39},{"t":"o","c":72,"r":39},{"t":"s","c":72,"r":38},{"t":"o","c":73,"r":38},{"t":"o","c":73,"r":37},{"t":"o","c":74,"r":37},{"t":"o","c":74,"r":36},{"t":"s","c":74,"r":35},{"t":"o","c":75,"r":35},{"t":"s","c":75,"r":34},{"t":"o","c":76,"r":34},{"t":"s","c":76,"r":33},{"t":"o","c":77,"r":33},{"t":"s","c":77,"r":32},{"t":"o","c":78,"r":32},{"t":"o","c":78,"r":31},{"t":"o","c":79,"r":31},{"t":"o","c":79,"r":30},{"t":"o","c":80,"r":30},{"t":"o","c":80,"r":29},{"t":"s","c":80,"r":28},{"t":"o","c":81,"r":28},{"t":"s","c":81,"r":27},{"t":"o","c":82,"r":27},{"t":"o","c":82,"r":26},{"t":"s","c":81,"r":25},{"t":"o","c":81,"r":25},{"t":"o","c":81,"r":24},{"t":"o","c":81,"r":23},{"t":"o","c":81,"r":22},{"t":"s","c":80,"r":21},{"t":"o","c":80,"r":21},{"t":"o","c":80,"r":20}]}]},{"id":"D11","name":"Praha – Hradec Králové – Polsko","segs":[{"st":"built","cells":[{"t":"o","c":65,"r":46},{"t":"o","c":66,"r":46},{"t":"o","c":67,"r":46},{"t":"o","c":68,"r":46},{"t":"s","c":68,"r":45},{"t":"o","c":69,"r":46},{"t":"s","c":69,"r":45},{"t":"o","c":70,"r":46},{"t":"o","c":70,"r":45},{"t":"s","c":70,"r":45},{"t":"o","c":71,"r":45},{"t":"s","c":71,"r":45},{"t":"o","c":72,"r":45},{"t":"o","c":73,"r":45},{"t":"o","c":74,"r":45},{"t":"o","c":75,"r":45},{"t":"o","c":76,"r":45},{"t":"o","c":77,"r":45},{"t":"s","c":77,"r":44},{"t":"o","c":78,"r":45},{"t":"o","c":78,"r":44},{"t":"s","c":78,"r":44},{"t":"o","c":79,"r":44},{"t":"o","c":80,"r":44},{"t":"o","c":81,"r":44},{"t":"o","c":82,"r":44},{"t":"s","c":82,"r":43},{"t":"o","c":83,"r":43},{"t":"s","c":83,"r":43},{"t":"o","c":84,"r":43},{"t":"o","c":85,"r":43},{"t":"o","c":86,"r":43},{"t":"s","c":86,"r":42},{"t":"o","c":87,"r":42},{"t":"o","c":88,"r":42},{"t":"o","c":89,"r":42},{"t":"s","c":89,"r":41},{"t":"o","c":90,"r":42},{"t":"s","c":90,"r":41},{"t":"o","c":91,"r":41},{"t":"o","c":92,"r":41},{"t":"o","c":93,"r":41},{"t":"o","c":94,"r":41},{"t":"o","c":95,"r":41},{"t":"o","c":96,"r":41},{"t":"o","c":97,"r":41},{"t":"o","c":98,"r":41}]},{"st":"cons","cells":[{"t":"o","c":98,"r":41},{"t":"s","c":98,"r":40},{"t":"o","c":99,"r":40},{"t":"o","c":99,"r":39},{"t":"s","c":99,"r":38},{"t":"o","c":100,"r":38},{"t":"o","c":100,"r":37},{"t":"o","c":101,"r":37},{"t":"s","c":100,"r":36},{"t":"o","c":101,"r":36}]},{"st":"plan","cells":[{"t":"o","c":101,"r":36},{"t":"o","c":101,"r":35},{"t":"o","c":101,"r":34},{"t":"s","c":100,"r":33},{"t":"o","c":101,"r":33},{"t":"s","c":100,"r":32},{"t":"o","c":101,"r":32},{"t":"o","c":100,"r":32},{"t":"s","c":100,"r":31},{"t":"o","c":100,"r":31},{"t":"s","c":100,"r":30},{"t":"o","c":100,"r":30},{"t":"o","c":100,"r":29},{"t":"o","c":100,"r":28},{"t":"o","c":100,"r":27},{"t":"o","c":101,"r":27},{"t":"o","c":101,"r":26},{"t":"o","c":101,"r":25},{"t":"o","c":102,"r":25},{"t":"o","c":102,"r":24}]}]},{"id":"D35","name":"Lipník – Olomouc – Hradec Králové","segs":[{"st":"built","cells":[{"t":"o","c":141,"r":66},{"t":"o","c":140,"r":66},{"t":"s","c":139,"r":65},{"t":"o","c":139,"r":66},{"t":"o","c":139,"r":65},{"t":"s","c":138,"r":65},{"t":"o","c":138,"r":65},{"t":"o","c":137,"r":65},{"t":"o","c":136,"r":65},{"t":"s","c":135,"r":64},{"t":"o","c":135,"r":65},{"t":"o","c":135,"r":64},{"t":"s","c":134,"r":64},{"t":"o","c":134,"r":64},{"t":"o","c":133,"r":64},{"t":"s","c":132,"r":63},{"t":"o","c":132,"r":63},{"t":"s","c":131,"r":62},{"t":"o","c":131,"r":62},{"t":"o","c":130,"r":62},{"t":"o","c":130,"r":61},{"t":"o","c":129,"r":61},{"t":"o","c":129,"r":60},{"t":"o","c":128,"r":60},{"t":"o","c":128,"r":59},{"t":"o","c":127,"r":59},{"t":"s","c":126,"r":58},{"t":"o","c":126,"r":58},{"t":"s","c":125,"r":57},{"t":"o","c":125,"r":57}]},{"st":"cons","cells":[{"t":"o","c":125,"r":57},{"t":"o","c":124,"r":57},{"t":"s","c":123,"r":57},{"t":"o","c":123,"r":57},{"t":"s","c":122,"r":57},{"t":"o","c":122,"r":58},{"t":"s","c":121,"r":57},{"t":"o","c":121,"r":58},{"t":"o","c":120,"r":58},{"t":"o","c":119,"r":58},{"t":"s","c":118,"r":58},{"t":"o","c":118,"r":58},{"t":"s","c":117,"r":58},{"t":"o","c":117,"r":59},{"t":"s","c":116,"r":58},{"t":"o","c":116,"r":59},{"t":"o","c":115,"r":59}]},{"st":"plan","cells":[{"t":"o","c":115,"r":59},{"t":"s","c":114,"r":58},{"t":"o","c":114,"r":58},{"t":"s","c":113,"r":57},{"t":"o","c":113,"r":57},{"t":"s","c":112,"r":56},{"t":"o","c":112,"r":57},{"t":"o","c":112,"r":56},{"t":"o","c":111,"r":56},{"t":"o","c":111,"r":55},{"t":"o","c":110,"r":55},{"t":"o","c":110,"r":54},{"t":"o","c":109,"r":54},{"t":"o","c":109,"r":53},{"t":"s","c":108,"r":53},{"t":"o","c":108,"r":53},{"t":"s","c":107,"r":52},{"t":"o","c":107,"r":52},{"t":"s","c":106,"r":51},{"t":"o","c":106,"r":51},{"t":"s","c":105,"r":50},{"t":"o","c":105,"r":50},{"t":"o","c":105,"r":49},{"t":"o","c":104,"r":49},{"t":"o","c":104,"r":48},{"t":"o","c":103,"r":48},{"t":"o","c":103,"r":47},{"t":"s","c":102,"r":46},{"t":"o","c":102,"r":46},{"t":"s","c":101,"r":45},{"t":"o","c":101,"r":45},{"t":"o","c":101,"r":44},{"t":"o","c":100,"r":44},{"t":"o","c":100,"r":43},{"t":"o","c":99,"r":43},{"t":"o","c":99,"r":42},{"t":"s","c":98,"r":41},{"t":"o","c":98,"r":41}]}]},{"id":"D43","name":"Brno – Svitavy","segs":[{"st":"built","cells":[{"t":"o","c":117,"r":79},{"t":"o","c":117,"r":78},{"t":"o","c":116,"r":78},{"t":"o","c":116,"r":77},{"t":"o","c":116,"r":76},{"t":"o","c":115,"r":76},{"t":"o","c":115,"r":75}]},{"st":"cons","cells":[{"t":"o","c":115,"r":75},{"t":"o","c":115,"r":74},{"t":"s","c":115,"r":73},{"t":"o","c":116,"r":73},{"t":"o","c":116,"r":72},{"t":"s","c":116,"r":71},{"t":"o","c":117,"r":71},{"t":"o","c":117,"r":70},{"t":"s","c":117,"r":69},{"t":"o","c":118,"r":69},{"t":"o","c":118,"r":68}]},{"st":"plan","cells":[{"t":"o","c":118,"r":68},{"t":"o","c":118,"r":67},{"t":"s","c":117,"r":66},{"t":"o","c":117,"r":66},{"t":"o","c":117,"r":65},{"t":"o","c":117,"r":64},{"t":"s","c":116,"r":63},{"t":"o","c":116,"r":63},{"t":"o","c":116,"r":62},{"t":"o","c":116,"r":61},{"t":"o","c":115,"r":61},{"t":"o","c":115,"r":60},{"t":"o","c":115,"r":59},{"t":"o","c":114,"r":59},{"t":"o","c":114,"r":58}]}]},{"id":"D46","name":"Vyškov – Prostějov – Olomouc","segs":[{"st":"built","cells":[{"t":"o","c":126,"r":76},{"t":"o","c":126,"r":75},{"t":"s","c":126,"r":74},{"t":"o","c":127,"r":74},{"t":"o","c":127,"r":73},{"t":"s","c":127,"r":72},{"t":"o","c":127,"r":72},{"t":"o","c":128,"r":72},{"t":"s","c":127,"r":71},{"t":"o","c":128,"r":71},{"t":"o","c":128,"r":70},{"t":"s","c":128,"r":69},{"t":"o","c":129,"r":69},{"t":"o","c":129,"r":68}]},{"st":"plan","cells":[{"t":"o","c":129,"r":68},{"t":"s","c":129,"r":67},{"t":"o","c":130,"r":67},{"t":"s","c":130,"r":66},{"t":"o","c":131,"r":66},{"t":"s","c":131,"r":65},{"t":"o","c":132,"r":65},{"t":"s","c":132,"r":64},{"t":"o","c":133,"r":64}]}]},{"id":"D48","name":"Nový Jičín – Frýdek-Místek – Český Těšín","segs":[{"st":"built","cells":[{"t":"o","c":151,"r":64},{"t":"o","c":152,"r":64},{"t":"o","c":153,"r":64},{"t":"o","c":154,"r":64},{"t":"o","c":155,"r":64},{"t":"o","c":156,"r":64},{"t":"o","c":157,"r":64},{"t":"o","c":158,"r":64},{"t":"o","c":158,"r":63},{"t":"s","c":158,"r":62},{"t":"o","c":158,"r":62},{"t":"o","c":159,"r":62},{"t":"s","c":158,"r":61},{"t":"o","c":159,"r":61},{"t":"o","c":159,"r":60}]},{"st":"plan","cells":[{"t":"o","c":159,"r":60},{"t":"o","c":160,"r":60},{"t":"s","c":160,"r":59},{"t":"o","c":161,"r":59},{"t":"o","c":162,"r":59},{"t":"o","c":163,"r":59},{"t":"s","c":163,"r":58},{"t":"o","c":164,"r":58},{"t":"o","c":165,"r":58}]}]},{"id":"D49","name":"Hulín – Zlín – Slovensko","segs":[{"st":"built","cells":[{"t":"o","c":138,"r":74},{"t":"o","c":139,"r":74},{"t":"s","c":139,"r":74},{"t":"o","c":140,"r":74},{"t":"s","c":140,"r":74},{"t":"o","c":141,"r":75},{"t":"s","c":141,"r":74},{"t":"o","c":142,"r":75},{"t":"o","c":143,"r":75}]},{"st":"plan","cells":[{"t":"o","c":143,"r":75},{"t":"s","c":143,"r":75},{"t":"o","c":144,"r":76},{"t":"o","c":145,"r":76},{"t":"o","c":145,"r":77},{"t":"o","c":146,"r":77},{"t":"s","c":146,"r":77},{"t":"o","c":147,"r":78},{"t":"s","c":147,"r":78},{"t":"o","c":148,"r":79},{"t":"o","c":148,"r":80},{"t":"s","c":148,"r":80},{"t":"o","c":149,"r":81},{"t":"o","c":149,"r":82},{"t":"o","c":150,"r":82},{"t":"s","c":149,"r":82},{"t":"o","c":150,"r":83}]}]},{"id":"D52","name":"Brno – Mikulov – Rakousko","segs":[{"st":"built","cells":[{"t":"o","c":117,"r":79},{"t":"o","c":117,"r":80},{"t":"s","c":116,"r":80},{"t":"o","c":117,"r":81},{"t":"o","c":116,"r":81},{"t":"s","c":116,"r":81},{"t":"o","c":116,"r":82},{"t":"o","c":116,"r":83},{"t":"o","c":116,"r":84},{"t":"s","c":115,"r":84},{"t":"o","c":116,"r":85},{"t":"o","c":115,"r":85},{"t":"s","c":115,"r":85},{"t":"o","c":115,"r":86},{"t":"o","c":115,"r":87},{"t":"o","c":115,"r":88},{"t":"o","c":116,"r":88},{"t":"o","c":116,"r":89},{"t":"o","c":116,"r":90},{"t":"o","c":117,"r":90},{"t":"o","c":117,"r":91},{"t":"o","c":117,"r":92},{"t":"o","c":118,"r":92},{"t":"o","c":118,"r":93},{"t":"o","c":118,"r":94},{"t":"o","c":118,"r":95}]}]},{"id":"D55","name":"Přerov – Hulín – Uh. Hradiště – Břeclav","segs":[{"st":"built","cells":[{"t":"o","c":137,"r":69},{"t":"o","c":137,"r":70},{"t":"s","c":137,"r":70},{"t":"o","c":137,"r":71},{"t":"s","c":137,"r":71},{"t":"o","c":138,"r":72},{"t":"s","c":137,"r":72},{"t":"o","c":138,"r":73},{"t":"o","c":138,"r":74},{"t":"o","c":138,"r":75},{"t":"s","c":138,"r":75},{"t":"o","c":138,"r":76},{"t":"o","c":139,"r":76},{"t":"s","c":138,"r":76},{"t":"o","c":139,"r":77},{"t":"o","c":139,"r":78},{"t":"o","c":139,"r":79},{"t":"s","c":138,"r":79},{"t":"o","c":139,"r":80},{"t":"s","c":138,"r":80},{"t":"o","c":138,"r":81},{"t":"s","c":138,"r":81},{"t":"o","c":138,"r":82},{"t":"o","c":138,"r":83},{"t":"s","c":137,"r":83},{"t":"o","c":137,"r":84},{"t":"s","c":136,"r":84},{"t":"o","c":136,"r":85},{"t":"s","c":135,"r":85},{"t":"o","c":135,"r":86},{"t":"s","c":134,"r":86},{"t":"o","c":134,"r":87},{"t":"s","c":133,"r":87},{"t":"o","c":133,"r":88},{"t":"s","c":132,"r":88},{"t":"o","c":132,"r":89},{"t":"s","c":131,"r":89},{"t":"o","c":131,"r":90},{"t":"s","c":130,"r":90},{"t":"o","c":130,"r":91},{"t":"s","c":129,"r":91},{"t":"o","c":129,"r":92},{"t":"o","c":128,"r":92},{"t":"s","c":127,"r":92},{"t":"o","c":127,"r":93},{"t":"s","c":126,"r":93},{"t":"o","c":126,"r":94},{"t":"o","c":125,"r":94},{"t":"s","c":124,"r":94},{"t":"o","c":124,"r":95}]}]},{"id":"D56","name":"Ostrava – Frýdek-Místek","segs":[{"st":"built","cells":[{"t":"o","c":157,"r":55},{"t":"o","c":157,"r":56},{"t":"s","c":157,"r":56},{"t":"o","c":158,"r":57},{"t":"o","c":158,"r":58},{"t":"s","c":158,"r":58},{"t":"o","c":159,"r":59},{"t":"o","c":159,"r":60}]}]}],"distr":"~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~NN~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~NNNN~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~NNNNN~~~~~~~~~~WWWWW~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~NNNNNNUU~~~~~~~~WWWWWW~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~NNNNNNUUU~~~~~~WWWWWWWWW~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~NNNNNUUUUUUU~~WWWWWWWWWWW~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~NNNNNNUUUUUUUUWWWWWWWWWWWWW~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~NNNNNNNUUUUUUUUWWWWWWWWWWWVVV~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~NNNNNNNNNNUUUUUUUUUWWWWWWWWWWVVVV~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~STNNNNNNNNNNNUUUUUUUUUWWWWWWWWWVVVVVVX~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~SSSSTTTNNNNNNNNUUUUUUUUUUWWWWWWWWVVVVVVXXXXX~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~SSSSSSTTTTNNNNNNNUUUUUUUUUUUWWWWWWVVVVVVXXXXXXX]]]~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~SSSSSSSTTTTTTNNNNUUUUUUUUUUUUWWWWWWVVVVVXXXXXXXX]]]]]]]~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~SSSSSSSSTTTTTTNNNNUUUUUUUUUUUUWWWWWVVVVVXXXXXXXXX]]]]]]]]]~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~RSSSSSSSSTTTTTTTNNNUUUUUUUUUUUUUWWWWVVVVXXXXXXXXXX]]]]]]]]]]]]~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~RRRRSSSSSSSTTTTPPPPPUUUUUUUUUUUU77WWWVVVXXXXXXXXXXX]]]]]]]]]]]]]]~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ORRRRRSSSSSSTTPPPPPPPUUUUUUUUUUU777777VXXXXXXXXXXXXX]]]]]]]]]]]]]][[~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~OOORRRRRRSSSSSPPPPPPPPPPUUUUUUUUU77777777XXXXXXXXXXXX]]]]]]]]]]]]]][[[[~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~OOOOOORRRRRRSSSPPPPPPPPPPPUUUUUUUU7777777777XXXXXXXXZZZZ]]]]]]]]]]]][[[[[~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~OOOOOOOORRRRRRRSPPPPPPPPPPPP666666677777777777ZZZZZZZZZZZZ]]]]]]]]]]][[[[[~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~OOOOOOOOOORRRRRRQQQPPPPPPPPPP6666666677777777777ZZZZZZZZZZZZ]]]]]]]]]][[[[[[~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~LOOOOOOOOOOORRRRRQQQQQPPPPPPPP66666666677777777777ZZZZZZZZZZZZZ]]]]]]]][[[[[[[~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~LLLLOOOOOOOOOOOORRRQQQQQQQPPPPPPP66666666677777777777ZZZZZZZZZZZZZ]]]]]]][[[[[[[~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~LLLLLLLLOOOOOOOOOOORQQQQQQQQQQPPPPP666666666677777777777ZZZZZZZZZZZZZ]]]]]]][[[[[[[[~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~LLLLLLLLLLLOOOOOOOOOOOQQQQQQQQQQQQPPP6666666666667777777777ZZZZZZZZZZZZZYYYYYY[[[[[[[[[[~~~~~~~~~~~~~~~~~n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~MMLLLLLLLLLLLLOOOOOOOOOOQQQQQQQQQQQQQP666666666666677777777777ZZZZZZZZZZZYYYYYYYY[[[[[[[[[[~~~~~~~~~~~~~~~~nnn~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~KKKKMMMMMMMLLLLLLLLLLLLLOOOOOOOOQQQQQQQQQQQQQ33366666666666999777777788ZZZZZZZZZZYYYYYYYYYY[[[[[[[[\\\\~~~~~~~~~~~~~~nnnnnn~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~KKKKKKMMMMMMMLLLLLLLLLLLLOOOOOOOOQQQQQQQQQQQ33333666666666699999977888888ZZZZZZZZZYYYYYYYYYYY[[[[\\\\\\\\\\~~~~~~~~~~~~~~nnnnnnnn~~~~~~nn~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~KKKKKKKMMMMMMMLLLLLLLLLLLLLOOOOOOQQQQQQQQQQQ33333336666666669999999888888888ZZZZZZYYYYYYYYYYYY\\\\\\\\\\\\\\\\\\\\~~~~~~~~~~~~nnnnnnnnnnn~~nnnnn~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~KKKKKKKKMMMMMMMLLLLLLLLLLLLLOOO<<<<<<<QQQQQ3333333336666666999999998888888888ZZZZYYYYYYYYYYYYY\\\\\\\\\\\\\\\\\\\\\\~~~~~~~~~~~nnnnnnnnnnnnnnnnww~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~KKKKKKKKMMMMMMMLLLLLLLLLLLLLHH<<<<<<<<<<<<<3333333333666669999999998888888884444ZYYYYYYYYYYYYY\\\\\\\\\\\\\\\\\\\\\\~~~~~~~~~~nnnnnnnnnnnnnnnnwww~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~KKKKKKKMMMMMMMLLLLLLLLLLLLHHHH<<<<<<<<<<<<33333333333666699999999888888888444444YYYYYYYYYYYYY\\\\\\\\\\\\\\\\\\\\\\\\~~~~~~~~~nnnnnnnnnnnnnnwwwww~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~KKKKKKKMMMMMMMLLLLLLLLLLHHHHH<<<<<<<<<<<<33333333333000999999999888888884444444_YYYYYYYYYYYY\\\\\\\\\\\\\\\\\\\\\\\\\\\\~~~~~~~rnnnnnnnnnnnnwwwwww~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~KKKKKKKMMMMMMLLLLLLLLLLHHHHHH<<<<<<<<<<<33333333330000099999999888888844444444_______YYYYYY\\\\\\\\\\\\\\\\\\\\\\\\\\aa~~~~~rrrnnnnnnnnnwwwwwwwww~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~KKKKKKKMMMMMMLLLLLLLLLHHHHHHHH<<<<<<<<<<33333333330000009999999888884444444444____________\\\\\\\\\\\\\\\\\\\\\\\\aaaarrrrrrrrrrnnnnnnwwwwwwwwww{~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~KKKKKKKMMMMMLLLLLLLLHHHHHHHHH<<<<<<<<<<<3333333330000009999999888444444444445_____________\\\\\\\\\\\\\\\\aaaaaaarrrrrrrrrrrrnnwwwwwwwwwww{{{~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~KKKKKKKMMMMMLLLLLLLHHHHHHHHHHH<<<<<<<<<22222222::0000009999999844444444444455_____________\\\\\\\\\\aaaaaaaaaarrrrrrrrrrrrrwwwwwwwwwwww{{{~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~KKKKKKKMMMMLLLLLLHHHHHHHHHHHHH<<<<<<<<22222222:::0000009999994444444444455555_________^^^^\\\\aaaaaaaaaaaarrrrrrrrrrrrrwwwwwwwwwwww{{{{{~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~KKKKKKKKJJJJLLLLHHHHHHHHHHHHHH<<<<<<<222222222::::::::11111144444444445555555^^___^^^^^^^^aaaaaaaaaaaaaarrrrrrrrrrrrrwwwwwwwwwwww{{{{{{{~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~KKKKKKJJJJJJJJJLHHHHHHHHHHHHHHH<<<<<222222222:::::::::11111114444444555555555^^^^^^^^^^^^^aaaaaaaaaaaaaarrrrrrrrrrrrrwwwwwwwwwwww{{{{{{{{{{~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~KKKJJJJJJJJJJJJHHHHHHHHHHHHHHHH<<<<222222222::::::::111111111444455555555555^^^^^^^^^^^^^aaaaaaaaaaaaaarrrrrrrrrrrrrwwwwwwwwwww{{{{{{{{{{{{{|~~~yy~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~KJJJJJJJJJJJJJHHHHHHHHHHHHHHHHH<<2222222222::::::::111111111144555555555555^^^^^^^^^^^^^aaaaaaaaaaaaaarrrrrrrrrrrrrwwwwwwwwwww{{{{{{{{{{{{{||~yyyy~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~JJJJJJJJJJJJJJHHHHHHHHHHHHHHHHHI22222222222:::::::1111111111155555555555555^^^^^^^^^^^^^aaaaaaaaaaaa```rrrrrrrrrrrrwwwwwwwwwww{{{{{{{{{{{{|||||yyyy~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~JJJJJJJJJJJJJJHHHHHHHHHHHHHIIIII;222222222:::::::1111111111115555555555555^^^^^^^^^^^^^^aaaaaaa```````rrrrrrrrrrrrwwwwwwwwwww{{{{{{{{{{{||||||yyyyy~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~JJJJJJJJJJJJJHHHHHHHHHHHIIIIIII;;;;;;2222::::::11111111111115555555555555^^^^^^^^^^^^^^aa`````````````rrrrrrrrrrrrwwwwwwwwww{{{{{{{{{{{||||||yyyyy~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~JJJJJJJJJJJJHHHHHHHFFHIIIIIIII;;;;;;;;;;;::::1111111111111115555555555bbbb^^^^^^^^^^^`````````````````rrrrrrrrrroowwwwwwwww{{{{{{{{{{{||||||xyyyy~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~JJJJJJJJJJJJJHHHHFFFFFIIIIIIII;;;;;;;;;;;;::111111111111111155555555bbbbbbbbb^^^^^ffff````````````````rrrrrrrrooooooowwwwww{{{{{{{{{zxxx||xxxxyyy~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~JJJJJJJJJJJJJHHHFFFFFFIIIIIIII;;;;;;;;;;;;;;11111111111111111555555bbbbbbbbbbbbfffffff`````````````````rrrrooooooooooooowww{{{{zzzzzzxxxxxxxxxxxyy~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~JJJJJJJJJJJJJHHHFFFFFFIIIIIIII;;;;;;;;;;;;;;111111111111111115555bbbbbbbbbbbbbfffffffff`````````````````roooooooooooooooooozzzzzzzzzzzxxxxxxxxxxxx~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~JJJJJJJJJJJJDDEGGFFFFFIIIIIII;;;;;;;;;;;;;;;1111111111111111155bbbbbbbbbbbbbbbffffffffff````````````````ooooooooooooooooooozzzzzzzzzzzxxxxxxxxxxxxx~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~JJJJJJJJJJDDDDEEGGGGGGGGGIIII;;;;;;;;;;;;;;;1111111111111111dddbbbbbbbbbbbbbbbffffffffff````````````````ooooooooooooooooooozzzzzzzzzzzzxxxxxxxxxxxxx~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~JJJJJJJDDDDDDEEGGGGGGGGGGGGG;;;;;;;;;;;;;;;;11111111111111dddddbbbbbbbbbbbbbbfffffffffff``````````````oooooooooooooooooooqzzzzzzzzzzzzxxxxxxxxxxxxxx~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~JJJJDDDDDDDDEEEGGGGGGGGGGGGG;;;;;;;;;;;;;;;1111111111111dddddddbbbbbbbbbbbbbfffffffffff``````````````ppoooooooooooooooqqqzzzzzzzzzzzzzxxxxxxxxxxxxxx~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~JDDDDDDDDDDEEEEGGGGGGGGGGGG;;;;;;;;;;;;;;;CCCCCCCCCC11dddddddddbbbbbbbbbbbfffffffffffff``````````ggppppppoooooooooooqqqqqzzzzzzzzzzzzxxxxxxxxxxxxxx~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~DDDDDDDDDDEEEEEGGGGGGGGGGG;;;;;;;;;;;;;;CCCCCCCCCCCCCddddddddddbbbbbbbbbbffffffffffffff``````ggggggppppppoooooooooqqqqqqzzzzzzzzzzzzzxxxxxxxxxxxxxx~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~DDDDDDDDDDEEEEEEGGGGGGGGGGG;;;;;;;;;;;;CCCCCCCCCCCCCCdddddddddddbbbbbbbbbffffffffffffff``ggggggggggppppppppoooooqqqqqqqqzzzzzzzzzzzzzxxxxxxxxxxxxxx~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~DDDDDDDDDEEEEEEEGGGGGGGGGG;;;;;;;;;@@@CCCCCCCCCCCCCCddddddddddddbbbbbbbbffffffffffffffggggggggggggpppppppppoooqqqqqqqqqqzzzzzzzzzzzzzxxxxxxxxxxxxx~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~DDDDDDDDEEEEEEEEGGGGGGGGG;;;;;@@@@@@@CCCCCCCCCCCCCCCdddddddddddccccccccffffffffffffffgggggggggggggpppppppppoqqqqqqqqqqquuzzzzzzzzzzzxxxxxxxxxx~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~DDDDDDDDEEEEEEEEEGGGGGGGBBBB@@@@@@@@@@CCCCCCCCCCCCCCdddddddddddcccccccccffffffffffffggggggggggggggppppppppppqqqqqqqqqqquuuuuuuuuuuuuuxxxxxxx~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~DDDDDDDEEEEEEEEEEGGGGGBBBBB@@@@@@@@@@CCCCCCCCCCCCCCdddddddddddccccccccccfffffffffffggggggggggggggppppppppppqqqqqqqqqquuuuuuuuuuuuuuuuuxxx~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~DDDDDEEEEEEEEEEEEEGGBBBBBB@@@@@@@@@@CCCCCCCCCCCCCCddddddddddcccccccccccfffffffffffggggggggggggggllppppppppqqqqqqqqqquuuuuuuuuuuuuuuuuu~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~DDDDEEEEEEEEEEEEEBBBBBBBBB@@@@@@@@@@CCCCCCCCCCCCCddddddddddcccccccccccceefffffffggggggggggggggglllllppppssssqqqqqqvuuuuuuuuuuuuuuuu~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~DDDEEEEEEEEEEEEEBBBBBBBBB@@@@@@@@@@CCCCCCCCCCCCCddddddddddccccccccccceeeeeeeeeiiggggggggggggglllllllllsssssssssvvvvuuuuuuuuuuuuu~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~DDEEEEEEEEEEEEEBBBBBBBBB@@@@@@@@@@CCCCCCCCCCCC???ddddddddcccccccccceeeeeeeeeeiiigggggggggggglllllllllsssssssssvvvvvuuuuuuuuuuu~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~EEEEEEEEEEEEBBBBBBBBBBB@@@@@@@@@@CCCCCCCCC???????ddddddccccccccceeeeeeeeeeeiiiiggggggggggllllllllllssssssssvvvvvvuuuuuuuuuu~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~EEEEEEEEEEEBBBBBBBBBBB@@@@@@@@@@CCCCCCCC??????????ddddcccccccceeeeeeeeeeeiiiiiiiggggggggllllllllllssssssssvvvvvvvuuuuuuuu~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~EEEEEEEEEEBBBBBBBBBBB@@@@@@@@@@CCCCCCC?????????????dcccccccceeeeeeeeeeeeiiiiiiiighhhgggllllllllllsssssssvvvvvvvvuuuuuuu~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~EEEEEEEEBBBBBBBBBBBBB@@@@@@@@@CCCCC?????????????????cccccceeeeeeeeeeeeeiiiiiiiihhhhhggllllllllllsssssssvvvvvvvvvuuuuu~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~EEEEEEEEBBBBBBBBBBBBB@@@@@@@@====C??????????????????ccccceeeeeeeeeeeeeiiiiiiiiiihhhhhlllllllllllsssssttvvvvvvvvvuuuuu~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~EEEEEEEBBBBBBBBBBBBB@@@@@@@======???????????????????ccceeeeeeeeeeeeeeiiiiiiiiiihhhhhlllllllllllttttttttvvvvvvvvvuuu~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~EEEEEEBBBBBBBBBAAAAAAA@@=========???????????????????ceeeeeeeeeeeeeeeiiiiiiiiiiiihhiilllllllllttttttttttvvvvvvvvuuu~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~EEEBBBBBBAAAAAAAAAAAA==========???????????????????ceeeeeeeeeeeeeeiiiiiiiiiiiiiiiiilllllllllttttttttttttvvvvvvuu~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~EBBAAAAAAAAAAAAAAAA===========???????????????????eeeeeeeeeeeeeeiiiiiiiiiiiiiiiiiilllllllttttttttttttttvvvvvvu~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~AAAAAAAAAAAAAAAAA===========???????????????????eeeeeeeeeeeemmmiiiiiiiiiiiiiiiiilkkkkkkktttttttttttttttvvvv~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~AAAAAAAAAAAAAAAA============??????????????????eeeeeeeeemmmmmmmiiiiiiiiiiiiiiiikkkkkkkkktttttttttttttttv~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~AAAAAAAAAAAAAAA============??????????????????eeeemmmmmmmmmmmmmiiiiiiiiiiiiiijkkkkkkkkkktttttttttttttt~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~AAAAAAAAAAAAAAA=============?????????????????mmmmmmmmmmmmmmmmmmiiiiiiiiiiiijjjkkkkkkkkkktttttttttttt~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~AAAAAAAAAAAAA>=============???????????~~~~~~~mmmmmmmmmmmmmmmmmmiiiiiiiiijjjjjkkkkkkkkkkktttttttttt~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~AAAAAAAAAAA>>>>============????????~~~~~~~~~~~~mmmmmmmmmmmmmmmmiiiiiiijjjjjjjkkkkkkkkkkkttttttt~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~AAAAAAAAAA>>>>>>>==========??????~~~~~~~~~~~~~~~~~mmmmmmmmmmmmmmiiiiijjjjjjjjkkkkkkkkkkkkttttt~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~AAAAAAAA>>>>>>>>>=========?????~~~~~~~~~~~~~~~~~~~~mmmmmmmmmmmmmiiijjjjjjjjjjkkkkkkkkkkkktt~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~AAAAAAA>>>>>>>>>>>>========???~~~~~~~~~~~~~~~~~~~~~mmmmmmmmmmmmmmijjjjjjjjjjjjkkkkkkkkkkk~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~AAAAA>>>>>>>>>>>>>>>======???~~~~~~~~~~~~~~~~~~~~~~mmmmmmmmmmmmmmjjjjjjjjjjjjkkk~~~kk~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~AAA>>>>>>>>>>>>>>>>>======?~~~~~~~~~~~~~~~~~~~~~~~mmmmmmmmmmmmmjjjjjjjjjjjjjjkk~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~AA>>>>>>>>>>>>>>>>>>>>====~~~~~~~~~~~~~~~~~~~~~~~~mmmmmm~~mmmmmjjjjjjjjjjjjjjk~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~>>>>>>>>>>>>>>>>>>>>>>>~~~~~~~~~~~~~~~~~~~~~~~~~~~m~~~~~~~~~~mjjjjjjjjjjjjjjj~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~>>>>>>>>>>>>>>>>>>>~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~jjjjjjjjjjj~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~>>>>>>>>>>>>>>>~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~jjjjjjjjj~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~>>>>>>>>>>>~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~jjjjjjj~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~>>>>>>>>~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~jjjjjj~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~>>>>~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~jjjj~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~","krajKeys":["PHA","STC","JHC","PLK","KVK","ULK","LBK","HKK","PAK","VYS","JMK","OLK","ZLK","MSK"],"krajMap":"~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~55~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~5555~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~55555~~~~~~~~~~66666~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~55555566~~~~~~~~666666~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~555555666~~~~~~666666666~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~555556666666~~66666666666~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~555555666666666666666666666~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~55555556666666666666666666666~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~555555555566666666666666666666666~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~55555555555556666666666666666666666666~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~55555555555555566666666666666666666666666666~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~55555555555555555666666666666666666666666666666777~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~5555555555555555566666666666666666666666666666667777777~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~5555555555555555556666666666666666666666666666666777777777~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~55555555555555555556666666666666666666666666666666777777777777~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~55555555555555555555666666666666116666666666666666677777777777777~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~55555555555555555555566666666666111111666666666666667777777777777777~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~55555555555555555555555566666666611111111666666666666777777777777777777~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~5555555555555555555555555566666666111111111166666666777777777777777777777~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~55555555555555555555555555551111111111111111117777777777777777777777777777~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~5555555555555555555555555555511111111111111111117777777777777777777777777777~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~455555555555555555555555555555111111111111111111117777777777777777777777777777~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~44445555555555555555555555555555511111111111111111111777777777777777777777777777~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~444444445555555555555555555555555551111111111111111111117777777777777777777777777777~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~4444444444455555555555555555555555555111111111111111111111177777777777777777777777777777~~~~~~~~~~~~~~~~~;~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~4444444444444455555555555555555555555511111111111111111111111177777777777777777777777777777~~~~~~~~~~~~~~~~;;;~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~44444444444444444444444455555555555555555555511111111111111111111111111777777777777777777777777777777~~~~~~~~~~~~~~;;;;;;~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~444444444444444444444444455555555555555555551111111111111111111111111111177777777777777777777777777777~~~~~~~~~~~~~~;;;;;;;;~~~~~~;;~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~44444444444444444444444444455555555555555555111111111111111111111111111111117777777777777777777777777777~~~~~~~~~~~~;;;;;;;;;;;~~;;;;;~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~444444444444444444444444444455511111115555511111111111111111111111111111111117777777777777777777777777777~~~~~~~~~~~;;;;;;;;;;;;;;;;==~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~444444444444444444444444444433111111111111111111111111111111111111111111111111117777777777777777777777777~~~~~~~~~~;;;;;;;;;;;;;;;;===~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~444444444444444444444444443333111111111111111111111111111111111111111111111111117777777777777777777777777~~~~~~~~~;;;;;;;;;;;;;;=====~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~4444444444444444444444443333311111111111111111111111000111111111111111111111111877777777777777777777777777~~~~~~~;;;;;;;;;;;;;======~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~4444444444444444444444433333311111111111111111111100000111111111111111111111118888888777777777777777777788~~~~~;;;;;;;;;;;;=========~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~4444444444444444444444333333331111111111111111111100000011111111111111111111118888888888887777777777778888;;;;;;;;;;;;;;;;===========~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~444444444444444444443333333331111111111111111111100000011111111111111111111118888888888888777777778888888;;;;;;;;;;;;;;==============~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~444444444444444444433333333333111111111111111111100000011111111111111111111118888888888888777778888888888;;;;;;;;;;;;;===============~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~44444444444444444333333333333311111111111111111110000001111111111111111111111888888888888877888888888888;;;;;;;;;;;;;=================~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~44444444333344443333333333333311111111111111111111111111111111111111111111111888888888888888888888888888;;;;;;;;;;;;;===================~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~44444433333333343333333333333331111111111111111111111111111111111111111111111888888888888888888888888888;;;;;;;;;;;;;======================~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~4443333333333333333333333333333111111111111111111111111111111111111111111111888888888888888888888888888;;;;;;;;;;;;;=========================~~~==~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~433333333333333333333333333333311111111111111111111111111111111111111111111888888888888888888888888888;;;;;;;;;;;;;==========================~====~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~3333333333333333333333333333333311111111111111111111111111111111111111111118888888888888888888888888888;;;;;;;;;;;;================================~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~333333333333333333333333333333331111111111111111111111111111111111111111118888888888888888888888888888;;;;;;;;;;;;=================================~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~333333333333333333333333333333311111111111111111111111111111111111111111188888888888888888888888888888;;;;;;;;;;;;================================~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~333333333333333333333333333333111111111111111111111111111111111111111199998888888888888888888888888888;;;;;;;;;;;;===============================~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~333333333333333333333333333333111111111111111111111111111111111111119999999998888899998888888888888888;;;;;;;;;;;;;;;============================~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~3333333333333333333333333333331111111111111111111111111111111111111999999999999999999988888888888888888;;;;;;;;;;;;;;;;;==========================~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~33333333333333333333333333333311111111111111111111111111111111111999999999999999999999988888888888888888;;;;;;;;;;;;;;;;;;;=======================~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~33333333333333333333333333333111111111111111111111111111111111199999999999999999999999998888888888888888;;;;;;;;;;;;;;;;;;;========================~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~33333333333333333333333333333111111111111111111111111111111199999999999999999999999999998888888888888888;;;;;;;;;;;;;;;;;;;=========================~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~333333333333333333333333333311111111111111111111111111111199999999999999999999999999999988888888888888;;;;;;;;;;;;;;;;;;;;==========================~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~33333333333333333333333333331111111111111111111111111111999999999999999999999999999999988888888888888;;;;;;;;;;;;;;;;;;;;===========================~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~3333333333333333333333333331111111111111112222222222119999999999999999999999999999999998888888888::;;;;;;;;;;;;;;;;;;;;;;==========================~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~333333333333333333333333331111111111111122222222222229999999999999999999999999999999999888888::::::;;;;;;;;;;;;;;;;;;;;;===========================~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~33333333333333333333333333311111111111122222222222222999999999999999999999999999999999988::::::::::;;;;;;;;;;;;;;;;;;;;;===========================~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~33333333333333333333333333111111111222222222222222229999999999999999999999999999999999::::::::::::;;;;;;;;;;;;;;;;;;;;;;==========================~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~3333333333333333333333333111112222222222222222222222999999999999999999999999999999999:::::::::::::;;;;;;;;;;;;;;;;;;;;;<<=====================~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~333333333333333333333333222222222222222222222222222299999999999999999999999999999999::::::::::::::;;;;;;;;;;;;;;;;;;;;;<<<<<<<<<<<<<<=======~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~33333333333333333333332222222222222222222222222222299999999999999999999999999999999::::::::::::::;;;;;;;;;;;;;;;;;;;;<<<<<<<<<<<<<<<<<===~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~3333333333333333333322222222222222222222222222222299999999999999999999999999999999::::::::::::::::;;;;;;;;;;;;;;;;;;<<<<<<<<<<<<<<<<<<~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~33333333333333333222222222222222222222222222222229999999999999999999999999999999::::::::::::::::::::;;;;<<<<;;;;;;<<<<<<<<<<<<<<<<<~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~333333333333333322222222222222222222222222222222999999999999999999999999999999::::::::::::::::::::::::<<<<<<<<<<<<<<<<<<<<<<<<<<~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~33333333333333322222222222222222222222222222222229999999999999999999999999999::::::::::::::::::::::::<<<<<<<<<<<<<<<<<<<<<<<<<~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~333333333333222222222222222222222222222222222222299999999999999999999999999::::::::::::::::::::::::<<<<<<<<<<<<<<<<<<<<<<<<~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~3333333333322222222222222222222222222222222222222299999999999999999999999:::::::::::::::::::::::::<<<<<<<<<<<<<<<<<<<<<<<~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~333333333322222222222222222222222222222222222222222999999999999999999999:::::::::::::::::::::::::<<<<<<<<<<<<<<<<<<<<<<~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~33333333222222222222222222222222222222222222222222229999999999999999999:::::::::::::::::::::::::<<<<<<<<<<<<<<<<<<<<<~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~3333333322222222222222222222222222222222222222222222999999999999999999::::::::::::::::::::::::::<<<<<<<<<<<<<<<<<<<<<~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~333333322222222222222222222222222222222222222222222299999999999999999::::::::::::::::::::::::::<<<<<<<<<<<<<<<<<<<<~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~33333322222222222222222222222222222222222222222222229999999999999999:::::::::::::::::::::::::<<<<<<<<<<<<<<<<<<<<<~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~33322222222222222222222222222222222222222222222222999999999999999::::::::::::::::::::::::::<<<<<<<<<<<<<<<<<<<<~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~322222222222222222222222222222222222222222222222299999999999999:::::::::::::::::::::::::<<<<<<<<<<<<<<<<<<<<<~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~22222222222222222222222222222222222222222222222999999999999::::::::::::::::::::::::::::<<<<<<<<<<<<<<<<<<<~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~2222222222222222222222222222222222222222222222999999999::::::::::::::::::::::::::::::::<<<<<<<<<<<<<<<<~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~2222222222222222222222222222222222222222222229999::::::::::::::::::::::::::::::::::::::<<<<<<<<<<<<<<~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~222222222222222222222222222222222222222222222:::::::::::::::::::::::::::::::::::::::::::<<<<<<<<<<<<~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~22222222222222222222222222222222222222~~~~~~~:::::::::::::::::::::::::::::::::::::::::::<<<<<<<<<<~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~22222222222222222222222222222222222~~~~~~~~~~~~:::::::::::::::::::::::::::::::::::::::::<<<<<<<~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~222222222222222222222222222222222~~~~~~~~~~~~~~~~~:::::::::::::::::::::::::::::::::::::::<<<<<~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~2222222222222222222222222222222~~~~~~~~~~~~~~~~~~~~::::::::::::::::::::::::::::::::::::::<<~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~222222222222222222222222222222~~~~~~~~~~~~~~~~~~~~~::::::::::::::::::::::::::::::::::::::~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~22222222222222222222222222222~~~~~~~~~~~~~~~~~~~~~~:::::::::::::::::::::::::::::~~~::~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~222222222222222222222222222~~~~~~~~~~~~~~~~~~~~~~~:::::::::::::::::::::::::::::~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~22222222222222222222222222~~~~~~~~~~~~~~~~~~~~~~~~::::::~~::::::::::::::::::::~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~22222222222222222222222~~~~~~~~~~~~~~~~~~~~~~~~~~~:~~~~~~~~~~::::::::::::::::~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~2222222222222222222~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~:::::::::::~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~222222222222222~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~:::::::::~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~22222222222~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~:::::::~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~22222222~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~::::::~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~2222~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~::::~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"};


// ===== public/js/hwcr.js =====
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


// ===== public/js/worldcr.js =====
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


// ===== public/js/economy.js =====
// Ekonomika: ceny staveb a vozidel, vlastnictví silnic a kolejí, výroba, města, vliv, volby, poplatky.
// Všechna čísla jsou první odhad pro ladění hratelnosti (společné konstanty jsou v goods.js).

const ECON = {
  START: 35000,
  BUILD: {
    roadArm: 60,        // jedno rameno silnice v poli
    roadDiag: 85,       // úhlopříčné rameno
    railTrack: 150,     // jedna kolej v poli (odbočka do středu je poloviční, úhlopříčka +25 %)
    bridgeRoad: 900,    // silniční most přes vodní pole
    bridgeRail: 1800,   // železniční most
    crossing: 400,      // příplatek za železniční přejezd
    refund: 0.5         // kolik se vrací při bourání
  },
  RATE: { road: 3.0, rail: 2.0, ship: 1.5 },     // Kč za tunu nákladu a jedno políčko trasy (× hodnota zboží)

  ITEMS: {
    van:        { kind: 'road', name: 'Malý náklaďák',   sub: 'zboží, plachta',            cap: 6,  price: 2400, model: 'van',        speed: 1.9, cargo: 'goods' },
    dump:       { kind: 'road', name: 'Malý sklápěč',    sub: 'sypký materiál',            cap: 8,  price: 2800, model: 'dump',       speed: 1.8, cargo: 'bulk' },
    kamion:     { kind: 'road', name: 'Kamion',          sub: 'zboží, velká kapacita',     cap: 16, price: 7500, model: 'kamion',     speed: 1.6, cargo: 'goods' },
    kamionDump: { kind: 'road', name: 'Kamion sklápěč',  sub: 'sypký materiál, velký',     cap: 22, price: 8800, model: 'kamionDump', speed: 1.5, cargo: 'bulk' },
    flatbed:    { kind: 'road', name: 'Plošinový návěs', sub: 'ocel a stroje',             cap: 20, price: 8200, model: 'flatbed',    speed: 1.5, cargo: 'flat' },
    reefer:     { kind: 'road', name: 'Chladírenský vůz', sub: 'mléčné výrobky',           cap: 12, price: 7200, model: 'reefer',     speed: 1.7, cargo: 'cold' },
    tanker:     { kind: 'road', name: 'Cisterna',        sub: 'voda a kapaliny',           cap: 14, price: 6800, model: 'tanker',     speed: 1.6, cargo: 'liquid' },
    ship1:      { kind: 'ship', name: 'Malá loď',    sub: '1 druh zboží',  holds: 1, holdCap: 40, cap: 40,  price: 12000, model: 'ship1', speed: 1.3, cargo: 'any' },
    ship2:      { kind: 'ship', name: 'Střední loď', sub: '2 druhy zboží', holds: 2, holdCap: 30, cap: 60,  price: 20000, model: 'ship2', speed: 1.2, cargo: 'any' },
    ship4:      { kind: 'ship', name: 'Velká loď',   sub: '4 druhy zboží', holds: 4, holdCap: 40, cap: 160, price: 44000, model: 'ship4', speed: 1.1, cargo: 'any' },
    loco1: { kind: 'rail', loco: true, tier: 1, name: 'Lokomotiva I',   sub: 'utáhne 2 vagony',  pull: 2,  price: 6000,  speed: 2.9 },
    loco2: { kind: 'rail', loco: true, tier: 2, name: 'Lokomotiva II',  sub: 'utáhne 4 vagony',  pull: 4,  price: 11000, speed: 3.2 },
    loco3: { kind: 'rail', loco: true, tier: 3, name: 'Lokomotiva III', sub: 'utáhne 7 vagonů',  pull: 7,  price: 19000, speed: 3.5 },
    loco4: { kind: 'rail', loco: true, tier: 4, name: 'Lokomotiva IV',  sub: 'utáhne 10 vagonů', pull: 10, price: 32000, speed: 3.8 },
    wagonCovered: { kind: 'rail', wagon: true, name: 'Vagon krytý',     sub: 'zboží',  cap: 10, price: 1500, cargo: 'goods' },
    wagonOpen:    { kind: 'rail', wagon: true, name: 'Vagon otevřený',  sub: 'sypký materiál', cap: 14, price: 1300, cargo: 'bulk' },
    wagonTank:    { kind: 'rail', wagon: true, name: 'Vagon cisterna',  sub: 'voda a kapaliny', cap: 12, price: 1700, cargo: 'liquid' }
  },
  ORDER: ['van', 'dump', 'kamion', 'kamionDump', 'flatbed', 'reefer', 'tanker', 'ship1', 'ship2', 'ship4', 'loco1', 'loco2', 'loco3', 'loco4', 'wagonCovered', 'wagonOpen', 'wagonTank']
};

function fmtMoney(n) { return Math.round(n).toLocaleString('cs-CZ') + ' Kč'; }

// ---------- hráči a účetnictví ----------
function pidList() { return state.players ? Object.keys(state.players).map(Number) : []; }
function playerColor(pid) { const p = state.players && state.players[pid]; return p ? p.color : '#888888'; }
function playerName(pid) { const p = state.players && state.players[pid]; return p ? p.name : 'Nezávislý'; }
function moneyOf(pid) { if (pid === state.me) return state.money; const p = state.players && state.players[pid]; return p && p.money !== undefined ? p.money : 0; }
function notify(pid, text, warn) { if (typeof serverNotify === 'function') serverNotify(pid, text, warn); }

const LEDGER_NAMES = {
  freight: 'Tržby z dopravy', tollIn: 'Mýtné od cizích', tollOut: 'Mýtné za cizí silnice', feeIn: 'Vstupné od cizích', feeOut: 'Vstupné, které platím',
  goodsSale: 'Prodej zboží', goodsBuy: 'Nákup zboží', energy: 'Prodej elektřiny', cityfees: 'Poplatky za vjezd do města', build: 'Stavby silnic, kolejí a objektů',
  refund: 'Vratky při bourání', upkeep: 'Údržba silnic a kolejí', maint: 'Provoz a stárnutí vozidel', repair: 'Opravy a nehody', vehicles: 'Nákup vozidel',
  upgrade: 'Povýšení', campaign: 'Volební kampaně', other: 'Ostatní'
};
function ledgerOf(pid) { return state.ledger[pid] || (state.ledger[pid] = { inc: {}, exp: {}, bk: {} }); }
// Každá změna peněz jde přes addMoney (kategorie = řádek ve výkazu).
function addMoney(pid, amt, cat) {
  cat = cat || 'other';
  const P = state.players && state.players[pid]; if (!P) return;
  P.money += amt; if (amt > 0) P.total = (P.total || 0) + amt;
  const L = ledgerOf(pid), side = amt >= 0 ? 'inc' : 'exp', v = Math.abs(amt);
  L[side][cat] = (L[side][cat] || 0) + v;
  const t = state.sim ? Math.floor(state.sim.t) : 0, b = L.bk[t] || (L.bk[t] = [0, 0]);
  b[amt >= 0 ? 0 : 1] += v;
  if (!L._p || t - L._p > 30) { L._p = t; for (const k in L.bk) if (+k < t - 130) delete L.bk[k]; }
}
// Platba mezi hráči (zapíše se oběma i do přehledu "kolik komu platím").
function transfer(from, to, amt, catOut, catIn, kind) {
  addMoney(from, -amt, catOut); addMoney(to, amt, catIn);
  if (!from || !to || from === to) return;
  const row = state.paid[from] || (state.paid[from] = {}), c = row[to] || (row[to] = { toll: 0, fee: 0, goods: 0 });
  c[kind] = (c[kind] || 0) + amt;
}
function lastMinute(pid) {
  const L = ledgerOf(pid), t = state.sim ? Math.floor(state.sim.t) : 0;
  let inc = 0, exp = 0;
  for (let k = t - 59; k <= t; k++) { const b = L.bk[k]; if (b) { inc += b[0]; exp += b[1]; } }
  const el = Math.max(10, Math.min(60, state.sim ? state.sim.t : 60));
  return { inc, exp, rate: (inc - exp) / el * 60 };
}
function ledgerTotals(pid) {
  const L = ledgerOf(pid); let inc = 0, exp = 0;
  for (const k in L.inc) inc += L.inc[k]; for (const k in L.exp) exp += L.exp[k];
  return { inc, exp };
}
function floatAt(x, y, text, color, pids) { if (state.sim) state.sim.floaters.push({ x, y, text, t: 0, color: color || '#8cf59a', pids: pids || null }); }

// ---------- vlastnictví silnic a kolejí ----------
// rec.own = { road: [id hráčů, kteří v poli mají silnici], rail: id vlastníka kolejí nebo 0 }
function ownRoad(rec) { return rec && rec.own ? rec.own.road : []; }
function ownRail(rec) { return rec && rec.own ? rec.own.rail : 0; }
function railLines(rec) { return JSON.stringify(rec ? rec.rail : []); }

// Cena záznamu pole (silnice + koleje + přejezd, nebo most na vodě).
function recCost(map, cell, rec) {
  if (!rec) return 0;
  const B = ECON.BUILD;
  let c = 0;
  if (!isLandCell(map, cell)) {
    if (rec.road) c += B.bridgeRoad;
    if (rec.rail.length) c += B.bridgeRail;
    return c;
  }
  if (rec.road) for (const k of armsOf(rec.road)) c += isDiagEdge(cell, k) ? B.roadDiag : B.roadArm;
  for (const t of rec.rail) {
    const diag = isDiagEdge(cell, t[0]) || (t[1] !== C8 && isDiagEdge(cell, t[1]));
    c += B.railTrack * (t[1] === C8 ? 0.5 : 1) * (diag ? 1.25 : 1);
  }
  if (rec.road && rec.rail.length) c += B.crossing;
  return Math.round(c);
}

// Změna záznamu pole za peníze. Vrací { ok, reason }.
function changeCell(cell, next, pid) {
  pid = pid || 1;
  const lk = lockedBy(cell, pid);
  if (lk) return { ok: false, reason: `Pole právě upravuje ${playerName(lk)} – zkus to později` };
  const prev = state.net.get(cell);
  const po = prev && prev.own ? prev.own : { road: [], rail: 0 };
  if (prev && prev.rail.length && po.rail && po.rail !== pid && railLines(prev) !== railLines(next)) return { ok: false, reason: 'Koleje patří jinému hráči – můžeš je jen překřížit silnicí' };
  const delta = recCost(state.map, cell, next) - recCost(state.map, cell, prev);
  if (delta > moneyOf(pid)) return { ok: false, reason: `Nemáš dost peněz (potřebuješ ${fmtMoney(delta)})` };
  if (delta > 0) addMoney(pid, -delta, 'build'); else if (delta < 0) addMoney(pid, -delta * ECON.BUILD.refund, 'refund');
  const own = { road: po.road.slice(), rail: po.rail };
  if (next && next.road && (!prev || prev.road !== next.road) && !own.road.includes(pid)) own.road.push(pid);
  if (next && next.rail.length && (!prev || railLines(prev) !== railLines(next))) own.rail = pid;
  if (next && (next.road || next.rail.length)) state.net.set(cell, { road: next.road, rail: next.rail, own }); else state.net.clearCell(cell);
  return { ok: true };
}

// Smí hráč bourat tuto linii (rameno)? Silnici jen tehdy, když ji v poli nemá nikdo jiný; koleje jen vlastní.
function mayRemove(rec, isRoadArm, pid) {
  pid = pid || 1;
  if (!rec) return true;
  if (isRoadArm) { const o = ownRoad(rec); return o.length === 0 || (o.length === 1 && o[0] === pid); }
  const r = ownRail(rec); return !r || r === pid;
}

// Roční (sekundová) údržba silnic a kolejí podle vlastnictví.
function roadUpkeepRates() {
  const net = state.net;
  if (net._upV === net.ver && net._up) return net._up;
  const up = {};
  for (const e of net.entries()) {
    const rec = e.rec, owners = ownRoad(rec);
    if (rec.road && owners.length) { const arms = armsOf(rec.road).length, each = arms * ROAD_UPKEEP / owners.length; for (const p of owners) up[p] = (up[p] || 0) + each; }
    const r = ownRail(rec);
    if (rec.rail.length && r) up[r] = (up[r] || 0) + rec.rail.length * RAIL_UPKEEP;
  }
  net._upV = net.ver; net._up = up;
  return up;
}

// ---------- vozidla: stárnutí ----------
const AGE0 = 1500, AGE1 = 1500;                  // s provozu do prvních problémů / do poloviční účinnosti
function ageEff(u) { return 1 - 0.5 * clamp(((u.age || 0) - AGE0) / AGE1, 0, 1); }
function unitPrice(u) { return u.kind !== 'rail' ? ECON.ITEMS[u.model].price : u.items.reduce((s, k) => s + ECON.ITEMS[k].price, 0); }
function capEff(u) { return u.cap * ageEff(u); }

// ---------- výroba, města, vliv ----------
function inflOf(tk, p) { return tk.infl && tk.infl[p] ? tk.infl[p] : 0; }
function addInfl(tk, p, amt) { if (!p || !tk.infl) return; tk.infl[p] = Math.min(1000, (tk.infl[p] || 0) + amt); }
function cityHappy(tk) { const f = tk.access.fee || 0; return f <= FAIR_FEE ? 1 : Math.max(0.15, 1 - (f - FAIR_FEE) / 30); }
function trafficFactor(tk) { return isCity(tk) ? clamp(1.35 - (tk.access.fee || 0) / 28, 0.08, 1.35) : 0.3; }

function electionScore(tk, p) {
  let s = inflOf(tk, p);
  if (p === tk.owner && (tk.access.fee || 0) > FAIR_FEE) s -= ((tk.access.fee || 0) - FAIR_FEE) * 6;      // drahý starosta ztrácí
  return s;
}
function holdElection(tk) {
  const prev = tk.owner;
  let best = prev, bs = prev ? electionScore(tk, prev) + 8 : OWN_MIN;           // úřadující má náskok
  for (const p of pidList()) { const sc = electionScore(tk, p) + (Math.random() - 0.5) * 16; if (sc > bs) { bs = sc; best = p; } }
  if (best !== prev) {
    tk.owner = best;
    if (best) notify(best, `Volby v ${tk.name}: starostou jsi teď ty!`);
    if (prev) notify(prev, `Volby v ${tk.name}: starostou se stal ${best ? playerName(best) : 'nikdo'}.`, true);
  } else if (prev) notify(prev, `Volby v ${tk.name}: starostou zůstáváš`);
  tk.lastElect = state.sim.t;
}

function econStep(dt) {
  const sim = state.sim, map = state.map;
  const up = roadUpkeepRates();
  for (const p in up) addMoney(+p, -up[p] * dt, 'upkeep');
  for (const u of sim.units) if (u.owner && u.price) addMoney(u.pid, -u.price * 0.0007 * (1 + (u.age || 0) / AGE0) * dt, 'maint');

  for (const tk of map.tokens) {
    const T = TOKEN_TYPES[tk.type];
    const dec = Math.pow(INFL_DECAY, dt);
    for (const p in tk.infl) tk.infl[p] *= dec;
    if (tk.homes && tk.infl) for (const p in tk.homes) tk.infl[p] = Math.max(tk.infl[p] || 0, 90);          // domácí půda: zakladatel má vždy aspoň základní vliv
    if (T.dep) continue;

    if (T.city) {
      let n = 0, ok = 0;
      let xok = 0;
      for (const g in CITY_NEEDS) {
        const nd = CITY_NEEDS[g];
        if (nd.from > tk.level || nd.w <= 0) continue;
        if (!nd.extra) n++;
        const dem = nd.w * CITY_MULT[tk.level - 1] * dt, have = tk.stock[g] || 0;
        tk.stock[g] = Math.max(0, have - dem);
        if (tk.stock[g] > 0.05) { if (nd.extra) xok++; else ok++; }
      }
      tk.sat = Math.min(1.3, (n ? ok / n : 1) + 0.06 * xok);
      let pw = 0.5;
      if (map.links) { let linked = false; pw = 0; for (const l of map.links) if (l.c === tk.id) { linked = true; const pl = tokenById(l.p); if (pl && sim.t - (pl.energyT || -999) < 25) pw = 1; } if (linked && !pw) pw = 0.35; if (!linked) pw = 0.5; }
      tk.power = pw;
      tk.prosp = Math.min(100, tk.prosp + 0.03 * tk.sat * pw * cityHappy(tk) * dt);
      if (sim.t - tk.lastElect > ELECTION_T) holdElection(tk);
      if (tk.campCd > 0) tk.campCd -= dt;
      if (tk.owner) { addMoney(tk.owner, ambientIncome(tk, tk.access.fee || 0) * dt, 'cityfees'); }
      continue;
    }

    // průmysl: výroba podle receptur a nastavených poměrů
    const rate = BASE_RATE * LVL_RATE[tk.level - 1];
    let ran = false;
    for (const ln of T.lines) {
      const sh = T.auto ? 1 : (tk.share[ln.id] !== undefined ? tk.share[ln.id] : 1 / T.lines.length);
      if (sh <= 0) continue;
      let work = rate * sh * dt;
      for (const g in (ln.in || {})) work = Math.min(work, (tk.stock[g] || 0) / ln.in[g]);
      for (const g in ln.out) if (g !== 'energy') work = Math.min(work, (STOCK_CAP - (tk.stock[g] || 0)) / ln.out[g]);
      if (work <= 1e-9) continue;
      for (const g in (ln.in || {})) tk.stock[g] -= work * ln.in[g];
      for (const g in ln.out) {
        if (g === 'energy') { tk.energyT = sim.t; addMoney(tk.owner, work * ln.out.energy * ENERGY_PRICE, 'energy'); }
        else tk.stock[g] = (tk.stock[g] || 0) + work * ln.out[g];
      }
      tk.produced += work; ran = true;
    }
    tk.running = ran;

  }
}

// Odhad příjmu z abstraktního provozu (okolní auta) za minutu při daném poplatku.
function ambientIncome(tk, fee) { return 0.04 * tk.level * fee * clamp(1.35 - fee / 28, 0.08, 1.35); }
function feeEstimate(tk, fee) { return Math.round(60 * ambientIncome(tk, fee)); }

// Povýšení města: starosta + prosperita + cement + peníze.
function cityUpgradeReq(tk) {
  if (!isCity(tk) || tk.level >= 4) return null;
  const i = tk.level - 1;
  return { cost: CITY_UP.cost[i], prosp: CITY_UP.prosp[i], cement: CITY_UP.cement[i] };
}
function industryUpgradeReq(tk) {
  if (isCity(tk) || isDeposit(tk) || tk.level >= tokenMaxLevel(tk)) return null;
  const i = tk.level - 1;
  return { cost: IND_UP.cost[i], infl: IND_UP.infl[i] };
}
function upgradeCheck(tk, pid) {
  pid = pid || 1;
  const out = [];
  if (isCity(tk)) {
    const r = cityUpgradeReq(tk); if (!r) return { ok: false, rows: [], req: null };
    out.push({ ok: tk.owner === pid, t: 'Jsi starosta' });
    out.push({ ok: tk.prosp >= r.prosp, t: `Prosperita ${Math.floor(tk.prosp)} / ${r.prosp}` });
    out.push({ ok: tk.cementIn >= r.cement, t: `Dodaný cement ${Math.floor(tk.cementIn)} / ${r.cement} t` });
    out.push({ ok: moneyOf(pid) >= r.cost, t: `Peníze ${fmtMoney(r.cost)}` });
    return { ok: out.every(x => x.ok), rows: out, req: r };
  }
  const r = industryUpgradeReq(tk); if (!r) return { ok: false, rows: [], req: null };
  out.push({ ok: tk.owner === pid, t: 'Podnik je tvůj' });
  out.push({ ok: inflOf(tk, pid) >= r.infl, t: `Vliv ${Math.floor(inflOf(tk, pid))} / ${r.infl}` });
  out.push({ ok: moneyOf(pid) >= r.cost, t: `Peníze ${fmtMoney(r.cost)}` });
  return { ok: out.every(x => x.ok), rows: out, req: r };
}


// ---------- zámky polí ----------
// Kdo má pole nakliknuté při stavbě, tomu pole nikdo jiný nezmění. Zámek vyprší 10 minut po poslední akci.
const LOCK_MS = 10 * 60 * 1000;
function lockedBy(cell, pid) {
  const k = cellKey(cell), l = state.locks[k];
  if (!l) return 0;
  if (Date.now() - l.t > LOCK_MS) { delete state.locks[k]; return 0; }
  return l.pid !== pid ? l.pid : 0;
}
function unlockCell(pid) {
  const k = state.lockKey[pid];
  if (k && state.locks[k] && state.locks[k].pid === pid) delete state.locks[k];
  delete state.lockKey[pid];
}
function lockCell(cell, pid) {
  unlockCell(pid);
  if (!cell || lockedBy(cell, pid)) return;
  const k = cellKey(cell);
  state.locks[k] = { pid, t: Date.now() }; state.lockKey[pid] = k;
}


// ===== public/js/network.js =====
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


// ===== public/js/vehicles.js =====
// Modely vozidel: jednoduché kvádry s kolečky, okénky a barvou hráče. Kreslí se v 3D stejně jako mapa.
// Rozměry jsou v násobcích hrany S. Osa u míří dopředu, v doprava ve směru jízdy, z nahoru.
// Barevné klíče: 'P' barva hráče/vozu, 'Pd' tmavší, 'Pl' světlejší, 'Pk' velmi tmavá.

const GLASS = '#26323f', CHASSIS = '#2a2d32', WHEELC = '#14161a', COAL = '#1a1b1d', COAL2 = '#2d2e32', STEEL = '#7b828b';

function Gp(layer, box, col, att, top) { return { layer, box, col, att: att || [], top: top || null }; }
function Ab(box, col, top) { return { box, col, top: top || null }; }

function wheelPair(u, r, vOut, vIn, w) {            // dvě kola (levé a pravé) na ose u
  r = r || 0.11; w = w || 0.065; vOut = vOut || 0.19; vIn = vIn || 0.14;
  const a = Gp(0, [u - w, u + w, vIn, vOut, 0, r], WHEELC), b = Gp(0, [u - w, u + w, -vOut, -vIn, 0, r], WHEELC);
  a.wheel = b.wheel = true;
  return [a, b];
}
function headlights(u, vv, z0, z1) {
  return [Ab([u, u + 0.012, -vv - 0.05, -vv + 0.03, z0, z1], '#f3e9b8'), Ab([u, u + 0.012, vv - 0.03, vv + 0.05, z0, z1], '#f3e9b8')];
}
function taillights(u, vv, z0, z1) {
  return [Ab([u - 0.012, u, -vv - 0.05, -vv + 0.03, z0, z1], '#a8201c'), Ab([u - 0.012, u, vv - 0.03, vv + 0.05, z0, z1], '#a8201c')];
}
function rims(u0, u1, v0, v1, z0, z1, col) {         // okraje otevřené korby
  const t = 0.028;
  return [
    Gp(2, [u0, u1, v0, v0 + t, z0, z1], col), Gp(2, [u0, u1, v1 - t, v1, z0, z1], col),
    Gp(2, [u0, u0 + t, v0, v1, z0, z1], col), Gp(2, [u1 - t, u1, v0, v1, z0, z1], col)
  ];
}
function heap(u0, u1, v0, v1, z) {                    // hromada uhlí
  return [
    Gp(3, [u0, u1, v0, v1, z, z + 0.06], COAL, [], COAL2),
    Gp(3, [u0 + 0.10, u1 - 0.10, v0 + 0.05, v1 - 0.05, z + 0.06, z + 0.105], COAL, [], COAL2)
  ];
}

// ---------- modely ----------
function modelCar() {
  return {
    len: 0.62, wid: 0.30, groups: [
      ...wheelPair(0.20, 0.095, 0.16, 0.12, 0.06), ...wheelPair(-0.20, 0.095, 0.16, 0.12, 0.06),
      Gp(0, [-0.31, 0.31, -0.14, 0.14, 0.05, 0.15], 'B', [...headlights(0.31, 0.10, 0.08, 0.12), ...taillights(-0.31, 0.10, 0.08, 0.12)]),
      Gp(1, [-0.16, 0.12, -0.125, 0.125, 0.15, 0.255], 'B', [
        Ab([-0.115, 0.075, -0.131, 0.131, 0.175, 0.235], GLASS),
        Ab([0.09, 0.126, -0.105, 0.105, 0.17, 0.24], GLASS),
        Ab([-0.176, -0.14, -0.10, 0.10, 0.175, 0.235], GLASS)
      ])
    ]
  };
}

function cabParts(u0, u1, z1, wide) {                 // kabina nákladního auta s okénky
  const w = wide || 0.15;
  return Gp(1, [u0, u1, -w, w, 0.10, z1], 'P', [
    Ab([u1 - 0.03, u1 + 0.012, -w + 0.03, w - 0.03, z1 - 0.13, z1 - 0.025], GLASS),
    Ab([u0 + 0.03, u1 - 0.05, -w - 0.006, w + 0.006, z1 - 0.13, z1 - 0.04], GLASS),
    ...headlights(u1, w - 0.06, 0.13, 0.17)
  ]);
}

function tarpBox(u0, u1, w, z0, z1) {                 // zaplachtovaná korba
  const cut = [];
  for (let i = 1; i <= 3; i++) {
    const u = u0 + (u1 - u0) * i / 4;
    cut.push(Ab([u - 0.012, u + 0.012, -w - 0.004, w + 0.004, z0, z1 - 0.01], 'Pk'));
  }
  return Gp(1, [u0, u1, -w, w, z0, z1], 'Pl', [Ab([u0 + 0.03, u1 - 0.03, -w + 0.05, w - 0.05, z1, z1 + 0.03], 'P'), ...cut, ...taillights(u0, w - 0.06, z0 + 0.02, z0 + 0.06)]);
}

function modelVan() {
  return {
    len: 0.94, wid: 0.32, groups: [
      ...wheelPair(0.30, 0.11), ...wheelPair(-0.27, 0.11),
      Gp(0, [-0.47, 0.47, -0.14, 0.14, 0.05, 0.10], CHASSIS),
      cabParts(0.20, 0.47, 0.32),
      tarpBox(-0.47, 0.17, 0.16, 0.10, 0.36)
    ]
  };
}

function bedBox(u0, u1, w, z0, z1) {                   // sklápěcí korba (otevřená, s okraji)
  return [Gp(1, [u0, u1, -w, w, z0, z1], 'P', [], 'Pk'), ...rims(u0, u1, -w, w, z1, z1 + 0.025, 'P')];
}
function modelDump() {
  return {
    len: 0.94, wid: 0.32, groups: [
      ...wheelPair(0.30, 0.11), ...wheelPair(-0.27, 0.11),
      Gp(0, [-0.47, 0.47, -0.14, 0.14, 0.05, 0.10], CHASSIS),
      cabParts(0.20, 0.47, 0.32),
      ...bedBox(-0.47, 0.17, 0.16, 0.10, 0.29)
    ], cargoAt: { u0: -0.41, u1: 0.12, v: 0.13, z: 0.29 }
  };
}

function modelKamion() {
  return {
    len: 1.60, wid: 0.36, groups: [
      ...wheelPair(0.66, 0.12, 0.20, 0.15, 0.07), ...wheelPair(0.42, 0.12, 0.20, 0.15, 0.07),
      ...wheelPair(-0.46, 0.12, 0.20, 0.15, 0.07), ...wheelPair(-0.64, 0.12, 0.20, 0.15, 0.07),
      Gp(0, [-0.80, 0.80, -0.15, 0.15, 0.06, 0.12], CHASSIS),
      cabParts(0.47, 0.80, 0.42, 0.17),
      Gp(1, [0.30, 0.46, -0.10, 0.10, 0.12, 0.22], CHASSIS),
      tarpBox(-0.80, 0.28, 0.18, 0.12, 0.54)
    ]
  };
}
function modelKamionDump() {
  return {
    len: 1.60, wid: 0.36, groups: [
      ...wheelPair(0.66, 0.12, 0.20, 0.15, 0.07), ...wheelPair(0.42, 0.12, 0.20, 0.15, 0.07),
      ...wheelPair(-0.46, 0.12, 0.20, 0.15, 0.07), ...wheelPair(-0.64, 0.12, 0.20, 0.15, 0.07),
      Gp(0, [-0.80, 0.80, -0.15, 0.15, 0.06, 0.12], CHASSIS),
      cabParts(0.47, 0.80, 0.42, 0.17),
      Gp(1, [0.30, 0.46, -0.10, 0.10, 0.12, 0.22], CHASSIS),
      ...bedBox(-0.80, 0.28, 0.18, 0.12, 0.40)
    ], cargoAt: { u0: -0.74, u1: 0.22, v: 0.145, z: 0.40 }
  };
}

function modelLoco(tier) {
  const h = 0.45 + 0.05 * (tier - 1);                  // půl délky: 0.45 .. 0.60
  const stripes = [];
  for (let i = 0; i < tier; i++) {
    const u = -h + 0.16 + i * 0.075;
    if (u < 0.28 * h) stripes.push(Ab([u, u + 0.03, -0.196, 0.196, 0.17, 0.30], 'Pl'));
  }
  const groups = [
    Gp(0, [-h, h, -0.17, 0.17, 0.07, 0.12], CHASSIS),
    Gp(0, [-0.50 * h - 0.17, -0.50 * h + 0.17, -0.15, 0.15, 0.03, 0.09], '#1f2125'),
    Gp(0, [0.50 * h - 0.17, 0.50 * h + 0.17, -0.15, 0.15, 0.03, 0.09], '#1f2125'),
    ...wheelPair(-0.50 * h - 0.09, 0.10, 0.18, 0.15, 0.055), ...wheelPair(-0.50 * h + 0.09, 0.10, 0.18, 0.15, 0.055),
    ...wheelPair(0.50 * h - 0.09, 0.10, 0.18, 0.15, 0.055), ...wheelPair(0.50 * h + 0.09, 0.10, 0.18, 0.15, 0.055),
    Gp(1, [-h, 0.22 * h, -0.19, 0.19, 0.12, 0.34], 'P', [...stripes, Ab([-h + 0.06, 0.22 * h - 0.06, -0.14, 0.14, 0.34, 0.385], 'Pd'), ...taillights(-h, 0.12, 0.17, 0.22)]),
    Gp(1, [0.22 * h, h, -0.19, 0.19, 0.12, 0.45], 'P', [
      Ab([h - 0.035, h + 0.012, -0.15, 0.15, 0.28, 0.41], GLASS),
      Ab([0.22 * h + 0.06, h - 0.07, -0.196, 0.196, 0.28, 0.40], GLASS),
      ...headlights(h, 0.12, 0.15, 0.20)
    ])
  ];
  if (tier >= 3) groups.push(Gp(2, [-0.35 * h, -0.05 * h, -0.10, 0.10, 0.385, 0.43], 'Pl'));
  if (tier >= 4) groups.push(Gp(2, [-0.80 * h, -0.55 * h, -0.10, 0.10, 0.385, 0.43], 'Pl'));
  return { len: 2 * h, wid: 0.38, groups };
}

function modelWagonCovered() {
  return {
    len: 0.84, wid: 0.38, groups: [
      Gp(0, [-0.42, 0.42, -0.16, 0.16, 0.07, 0.12], CHASSIS),
      Gp(0, [-0.27 - 0.15, -0.27 + 0.15, -0.14, 0.14, 0.03, 0.09], '#1f2125'),
      Gp(0, [0.27 - 0.15, 0.27 + 0.15, -0.14, 0.14, 0.03, 0.09], '#1f2125'),
      ...wheelPair(-0.33, 0.10, 0.17, 0.14, 0.055), ...wheelPair(-0.21, 0.10, 0.17, 0.14, 0.055),
      ...wheelPair(0.21, 0.10, 0.17, 0.14, 0.055), ...wheelPair(0.33, 0.10, 0.17, 0.14, 0.055),
      Gp(1, [-0.40, 0.40, -0.19, 0.19, 0.12, 0.44], 'P', [
        Ab([-0.05, 0.05, -0.195, 0.195, 0.14, 0.40], 'Pk'),
        Ab([-0.40, 0.40, -0.15, 0.15, 0.44, 0.485], 'Pl')
      ])
    ]
  };
}
function modelWagonOpen() {
  return {
    len: 0.84, wid: 0.38, groups: [
      Gp(0, [-0.42, 0.42, -0.16, 0.16, 0.07, 0.12], CHASSIS),
      Gp(0, [-0.27 - 0.15, -0.27 + 0.15, -0.14, 0.14, 0.03, 0.09], '#1f2125'),
      Gp(0, [0.27 - 0.15, 0.27 + 0.15, -0.14, 0.14, 0.03, 0.09], '#1f2125'),
      ...wheelPair(-0.33, 0.10, 0.17, 0.14, 0.055), ...wheelPair(-0.21, 0.10, 0.17, 0.14, 0.055),
      ...wheelPair(0.21, 0.10, 0.17, 0.14, 0.055), ...wheelPair(0.33, 0.10, 0.17, 0.14, 0.055),
      ...bedBox(-0.40, 0.40, 0.19, 0.12, 0.31)
    ], cargoAt: { u0: -0.34, u1: 0.34, v: 0.15, z: 0.31 }
  };
}

function modelFlatbed() {                                // plošinový návěs: nízká plošina, náklad = ocelové svitky a bedny
  return {
    len: 1.60, wid: 0.36, groups: [
      ...wheelPair(0.66, 0.12, 0.20, 0.15, 0.07), ...wheelPair(0.42, 0.12, 0.20, 0.15, 0.07),
      ...wheelPair(-0.46, 0.12, 0.20, 0.15, 0.07), ...wheelPair(-0.64, 0.12, 0.20, 0.15, 0.07),
      Gp(0, [-0.80, 0.80, -0.15, 0.15, 0.06, 0.12], CHASSIS),
      cabParts(0.47, 0.80, 0.42, 0.17),
      Gp(1, [0.30, 0.46, -0.10, 0.10, 0.12, 0.22], CHASSIS),
      Gp(1, [-0.80, 0.28, -0.18, 0.18, 0.12, 0.17], 'Pk', [Ab([-0.80, 0.28, -0.18, -0.15, 0.17, 0.205], 'P'), Ab([-0.80, 0.28, 0.15, 0.18, 0.17, 0.205], 'P')])
    ], cargoAt: { u0: -0.74, u1: 0.22, v: 0.15, z: 0.17 }
  };
}
function modelReefer() {                                 // chladírenský vůz: světlá skříň s chladicí jednotkou na čele
  return {
    len: 1.20, wid: 0.34, groups: [
      ...wheelPair(0.50, 0.115, 0.19, 0.145, 0.065), ...wheelPair(-0.34, 0.115, 0.19, 0.145, 0.065), ...wheelPair(-0.50, 0.115, 0.19, 0.145, 0.065),
      Gp(0, [-0.60, 0.60, -0.145, 0.145, 0.06, 0.115], CHASSIS),
      cabParts(0.36, 0.60, 0.38, 0.16),
      Gp(1, [-0.60, 0.32, -0.17, 0.17, 0.115, 0.50], '#e9edf0', [Ab([0.20, 0.30, -0.10, 0.10, 0.40, 0.46], '#7f8d99'), Ab([-0.60, -0.57, -0.14, 0.14, 0.16, 0.44], 'P'), Ab([-0.30, -0.27, -0.176, 0.176, 0.12, 0.49], '#c4ccd2'), Ab([0.0, 0.03, -0.176, 0.176, 0.12, 0.49], '#c4ccd2')])
    ]
  };
}

function modelShip(kind) {
  const L = { 1: 2.2, 2: 3.0, 4: 3.7 }[kind], Wd = { 1: 0.56, 2: 0.64, 4: 0.90 }[kind], h = L / 2, w = Wd / 2;
  const HULL = '#3d4b5c', g = [];
  g.push(Gp(0, [-h, h - 0.36, -w, w, 0.0, 0.17], HULL, [Ab([-h, h - 0.36, -w - 0.004, w + 0.004, 0.02, 0.055], 'Pd')]));
  g.push(Gp(0, [h - 0.36, h - 0.20, -w * 0.82, w * 0.82, 0.0, 0.17], HULL));
  g.push(Gp(0, [h - 0.20, h - 0.08, -w * 0.52, w * 0.52, 0.0, 0.17], HULL));
  g.push(Gp(0, [h - 0.08, h, -w * 0.2, w * 0.2, 0.0, 0.17], HULL));
  g.push(Gp(1, [-h + 0.02, h - 0.36, -w + 0.02, w - 0.02, 0.17, 0.20], '#8a8f95'));
  const dh0 = -h + 0.04, dh1 = dh0 + (kind == 1 ? 0.38 : 0.48), dw = w * 0.8;
  g.push(Gp(2, [dh0, dh1, -dw, dw, 0.20, 0.52], 'P', [Ab([dh1 - 0.02, dh1 + 0.012, -dw + 0.04, dw - 0.04, 0.36, 0.48], GLASS), Ab([dh0 + 0.04, dh1 - 0.06, -dw - 0.006, dw + 0.006, 0.36, 0.48], GLASS)]));
  g.push(Gp(3, [dh0 + 0.05, dh0 + 0.17, -0.07, 0.07, 0.52, 0.70], '#c9ccd0', [Ab([dh0 + 0.05, dh0 + 0.17, -0.071, 0.071, 0.62, 0.66], 'Pd')]));
  const hu0 = dh1 + 0.06, hu1 = h - 0.46; let holds = [];
  if (kind == 1) holds.push([hu0, hu1, -w + 0.07, w - 0.07]);
  if (kind == 2) { const m = (hu0 + hu1) / 2; holds.push([hu0, m - 0.025, -w + 0.07, w - 0.07], [m + 0.025, hu1, -w + 0.07, w - 0.07]); }
  if (kind == 4) { const m = (hu0 + hu1) / 2; holds.push([hu0, m - 0.025, -w + 0.06, -0.02], [hu0, m - 0.025, 0.02, w - 0.06], [m + 0.025, hu1, -w + 0.06, -0.02], [m + 0.025, hu1, 0.02, w - 0.06]); }
  holds.forEach(b => { g.push(Gp(2, [b[0], b[1], b[2], b[3], 0.20, 0.31], 'Pk')); g.push(...rims(b[0], b[1], b[2], b[3], 0.31, 0.335, 'P')); });
  return { len: L, wid: Wd, groups: g, holds: holds.map(b => [b[0] + 0.035, b[1] - 0.035, b[2] + 0.035, b[3] - 0.035, 0.20, 0.325]) };
}

function modelTanker() {
  return {
    len: 1.60, wid: 0.36, groups: [
      ...wheelPair(0.66, 0.12, 0.20, 0.15, 0.07), ...wheelPair(0.42, 0.12, 0.20, 0.15, 0.07),
      ...wheelPair(-0.46, 0.12, 0.20, 0.15, 0.07), ...wheelPair(-0.64, 0.12, 0.20, 0.15, 0.07),
      Gp(0, [-0.80, 0.80, -0.15, 0.15, 0.06, 0.12], CHASSIS),
      cabParts(0.47, 0.80, 0.42, 0.17),
      Gp(1, [0.30, 0.46, -0.10, 0.10, 0.12, 0.22], CHASSIS),
      Gp(1, [-0.80, 0.28, -0.17, 0.17, 0.14, 0.50], '#c9d3da', [Ab([-0.55, -0.49, -0.176, 0.176, 0.14, 0.50], '#8aa0ae'), Ab([-0.15, -0.09, -0.176, 0.176, 0.14, 0.50], '#8aa0ae'), Ab([0.2, 0.26, -0.176, 0.176, 0.14, 0.50], '#8aa0ae'), Ab([-0.70, 0.18, -0.10, 0.10, 0.50, 0.545], '#aab7c0')], '#e6edf1')
    ]
  };
}
function modelWagonTank() {
  return {
    len: 0.84, wid: 0.38, groups: [
      Gp(0, [-0.42, 0.42, -0.16, 0.16, 0.07, 0.12], CHASSIS),
      Gp(0, [-0.27 - 0.15, -0.27 + 0.15, -0.14, 0.14, 0.03, 0.09], '#1f2125'),
      Gp(0, [0.27 - 0.15, 0.27 + 0.15, -0.14, 0.14, 0.03, 0.09], '#1f2125'),
      ...wheelPair(-0.33, 0.10, 0.17, 0.14, 0.055), ...wheelPair(-0.21, 0.10, 0.17, 0.14, 0.055),
      ...wheelPair(0.21, 0.10, 0.17, 0.14, 0.055), ...wheelPair(0.33, 0.10, 0.17, 0.14, 0.055),
      Gp(1, [-0.40, 0.40, -0.17, 0.17, 0.12, 0.40], '#c9d3da', [Ab([-0.3, -0.24, -0.176, 0.176, 0.12, 0.40], '#8aa0ae'), Ab([0.24, 0.30, -0.176, 0.176, 0.12, 0.40], '#8aa0ae'), Ab([-0.3, 0.3, -0.07, 0.07, 0.40, 0.44], '#aab7c0')], '#e6edf1')
    ]
  };
}

const GOODS_COL = { coal: ['#1a1b1d', '#2d2e32'], stone: ['#c9c5b8', '#e3dfd3'], wood: ['#8a5a32', '#b4824f'], pellets: ['#6b4a2f', '#8b6a44'], corn: ['#d3bf3f', '#ebd95e'], water: ['#4a86c4', '#7fb2e0'], animals: ['#8a6a4a', '#b08a66'], milk: ['#e8e6e0', '#ffffff'], meat: ['#b04a4a', '#d06a6a'], planks: ['#d9b878', '#ead29a'], furniture: ['#a67c52', '#c49a6c'], cement: ['#a9acb0', '#cfd2d6'], ironore: ['#7a4a38', '#9a6450'], sand: ['#d6c58a', '#ecdca4'], wheat: ['#d9b94a', '#f0d46a'], flour: ['#ece6d6', '#fbf7ec'], bread: ['#c98a4a', '#e0a866'], beer: ['#d9a032', '#f0c24e'], glass: ['#8fc9d8', '#b8e4ee'], steel: ['#6c7380', '#8d95a3'], machines: ['#4a6fa5', '#6c91c7'], dairy: ['#f2ecd0', '#fffbe6'] };
const MODEL_CACHE = {};
function modelFor(item) {
  const it = ECON.ITEMS[item] || {};
  const key = item || 'car';
  if (MODEL_CACHE[key]) return MODEL_CACHE[key];
  let m;
  switch (item) {
    case 'van': m = modelVan(); break;
    case 'dump': m = modelDump(); break;
    case 'kamion': m = modelKamion(); break;
    case 'kamionDump': m = modelKamionDump(); break;
    case 'ship1': m = modelShip(1); break;
    case 'ship2': m = modelShip(2); break;
    case 'ship4': m = modelShip(4); break;
    case 'flatbed': m = modelFlatbed(); break;
    case 'reefer': m = modelReefer(); break;
    case 'tanker': m = modelTanker(); break;
    case 'wagonTank': m = modelWagonTank(); break;
    case 'loco1': m = modelLoco(1); break;
    case 'loco2': m = modelLoco(2); break;
    case 'loco3': m = modelLoco(3); break;
    case 'loco4': m = modelLoco(4); break;
    case 'wagonCovered': m = modelWagonCovered(); break;
    case 'wagonOpen': m = modelWagonOpen(); break;
    default: m = modelCar();
  }
  MODEL_CACHE[key] = m;
  return m;
}

// ---------- barvy ----------
const _rgbCache = {};
function rgbOf(h) { let c = _rgbCache[h]; if (!c) { c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); _rgbCache[h] = c; } return c; }
const _shadeCache = new Map();
function shade(h, f) {
  const key = h + '|' + Math.round(f * 100);
  let r = _shadeCache.get(key);
  if (!r) { const c = rgbOf(h), k = Math.round(f * 100) / 100; r = 'rgb(' + c.map(v => Math.max(0, Math.min(255, Math.round(v * k)))).join(',') + ')'; _shadeCache.set(key, r); }
  return r;
}
function paletteFor(color) {
  return { P: color, Pd: shadeHex(color, 0.72), Pl: lightenHex(color, 0.22), Pk: shadeHex(color, 0.42), B: color };
}
function shadeHex(h, f) { const c = rgbOf(h).map(v => Math.round(v * f)); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); }
function lightenHex(h, t) { const c = rgbOf(h).map(v => Math.round(v + (255 - v) * t)); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); }

// ---------- kvádr ve 3D ----------
let LOD_LOW = false;
let VZ = 0;                                           // pixelů na jednotku S výšky (podle pohledu a zoomu)

// fr = { x, y, c, s, zb }: poloha a směr jednotky, zb = výška podkladu (násyp apod.) v násobcích S
function drawBox(ctx, fr, box, col, topCol) {
  const S = CFG.S * (fr.vs || 1), u0 = box[0], u1 = box[1], v0 = box[2], v1 = box[3], z0 = box[4], z1 = box[5];
  const fc = fr.c * S, fs = fr.s * S, cp = fr.cp === undefined ? 1 : fr.cp, sp = fr.sp || 0;
  const o = w2s(fr.x, fr.y, true), ex = w2s(fr.x + fc, fr.y + fs, true), ey = w2s(fr.x - fs, fr.y + fc, true);
  const ux = ex.x - o.x, uy = ex.y - o.y, vx = ey.x - o.x, vy = ey.y - o.y;
  const base = (fr.zb + (fr.zr || 0)) * VZ, vz = VZ * (fr.vs || 1);
  // vrchol (u, v, z) -> obrazovka; náklon kolem příčné osy (stoupání rampy)
  const V = (u, v, z) => { const ue = u * cp - z * sp, he = u * sp + z * cp; return { x: o.x + ux * ue + vx * v, y: o.y + uy * ue + vy * v - base - he * vz }; };
  if (VZ > 0) {
    const sides = [
      [[u1, v0], [u1, v1], fr.c, fr.s],            // vpředu
      [[u0, v0], [u0, v1], -fr.c, -fr.s],          // vzadu
      [[u0, v1], [u1, v1], -fr.s, fr.c],           // vpravo
      [[u0, v0], [u1, v0], fr.s, -fr.c]            // vlevo
    ];
    for (const sd of sides) {
      const pn = projDelta(sd[2], sd[3]);
      if (pn.y <= 0.001) continue;
      const L = Math.hypot(pn.x, pn.y) || 1;
      const f = 0.72 + 0.20 * (-pn.x / L) + 0.07 * (pn.y / L);
      const a = V(sd[0][0], sd[0][1], z0), b = V(sd[1][0], sd[1][1], z0), c2 = V(sd[1][0], sd[1][1], z1), d2 = V(sd[0][0], sd[0][1], z1);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(d2.x, d2.y); ctx.closePath();
      ctx.fillStyle = shade(col, f); ctx.fill();
      if (!LOD_LOW) { ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.stroke(); }
    }
  }
  const t0 = V(u0, v0, z1), t1 = V(u1, v0, z1), t2 = V(u1, v1, z1), t3 = V(u0, v1, z1);
  ctx.beginPath(); ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.lineTo(t3.x, t3.y); ctx.closePath();
  ctx.fillStyle = shade(topCol || col, 1.10); ctx.fill();
  if (!LOD_LOW) { ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(0,0,0,0.30)'; ctx.stroke(); }
}

function resolveCol(c, pal) { return c.charAt(0) === '#' ? c : pal[c]; }

// Jedna jednotka (auto, lokomotiva, vagon). fr – poloha, pal – barvy, loaded – naložená.
function drawModelUnit(ctx, fr, model, pal, loaded, gcol, holdCols) {
  const S = CFG.S * (fr.vs || 1);
  // stín na zemi
  const hl = model.len / 2 + 0.03, hw = model.wid / 2 + 0.03;
  const sh = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].map(([u, v]) => {
    const px = fr.x + (fr.c * u - fr.s * v) * S + S * 0.07, py = fr.y + (fr.s * u + fr.c * v) * S + S * 0.09;
    return w2s(px, py, true);
  });
  const shz = (fr.zb * 0.5 + (fr.zr || 0)) * VZ;
  ctx.beginPath(); sh.forEach((p, i) => i ? ctx.lineTo(p.x, p.y - shz) : ctx.moveTo(p.x, p.y - shz));
  ctx.closePath(); ctx.fillStyle = 'rgba(0,0,0,0.26)'; ctx.fill();

  // pořadí: vrstva, pak vzdálenost od kamery
  const nearRight = projDelta(-fr.s, fr.c).y > 0;     // je pravý bok (v > 0) blíž ke kameře?
  const groups = model.groups.map((g, i) => {
    const b = g.box, uc = (b[0] + b[1]) / 2, vc = (b[2] + b[3]) / 2;
    const q = w2s(fr.x + (fr.c * uc - fr.s * vc) * S, fr.y + (fr.s * uc + fr.c * vc) * S, true);
    let layer = g.layer;
    if (g.wheel && (vc > 0) === nearRight) layer = 0.5;       // bližší kola se kreslí až po karoserii
    return { g, d: q.y, i, layer };
  });
  groups.sort((a, b) => a.layer - b.layer || a.d - b.d || a.i - b.i);
  for (const e of groups) {
    const g = e.g;
    drawBox(ctx, fr, g.box, resolveCol(g.col, pal), g.top ? resolveCol(g.top, pal) : null);
    for (const a of g.att) drawBox(ctx, fr, a.box, resolveCol(a.col, pal), a.top ? resolveCol(a.top, pal) : null);
  }
  if (model.holds && holdCols) model.holds.forEach((b, i) => { const c = holdCols[i]; if (c) drawBox(ctx, fr, b, c[0], c[1]); });
  if (loaded && model.cargoAt) {
    const c = model.cargoAt;
    let gi = 0;
    for (const g of heap(c.u0, c.u1, -c.v, c.v, c.z)) { drawBox(ctx, fr, g.box, gcol ? gcol[gi % 2] : g.col, gcol ? gcol[(gi + 1) % 2] : g.top); gi++; }
  }
}

// ---------- sdružené kreslení všech objektů s pořadím podle hloubky ----------
function addDrawable(list, wx, wy, fn) {
  const vr = window.__vr;
  if (vr && (wx < vr.x0 || wx > vr.x1 || wy < vr.y0 || wy > vr.y1)) return;
  list.push({ d: w2s(wx, wy, true).y, fn });
}

function drawEntities(ctx, state) {
  const sim = state.sim;
  VZ = CFG.S * state.cam.zoom * viewK();
  LOD_LOW = state.cam.zoom < 0.5;
  const list = [];
  const S = CFG.S;
  window.__hwBr = new Map();

  // svět, stanice
  window.__vr = visWorldRect(3 * A);
  collectWorldDrawables(state, list, window.__vr);
  // závory a semafory
  collectGearDrawables(state, list);
  // vozidla
  for (const u of sim.units) collectUnitDrawables(state, u, list);
  if (sim.ambList) for (const u of sim.ambList) collectUnitDrawables(state, u, list);
  const vr = window.__vr;

  if (state.map.hw && state.map.hw.size) hwCollect(list, vr);
  if (state.railSim) rsCollectSignals(list, state.railSim);
  list.sort((a, b) => a.d - b.d);
  applyScreen(ctx);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const tk of state.map.tokens) { const c = tokenCenter(tk); if (c.x >= window.__vr.x0 && c.x <= window.__vr.x1 && c.y >= window.__vr.y0 && c.y <= window.__vr.y1) drawTokenDisc(ctx, tk); }
  drawSiteHints(ctx);
  for (const it of list) it.fn(ctx);
  drawFloaters(ctx, state);
}

function collectUnitDrawables(state, u, list) {
  const S = CFG.S;
  if (u.hidden) return;
  if (u.kind === 'road') {
    if (u.x === undefined) return;
    const m = modelFor(u.model);
    const pal = paletteFor(u.owner ? playerColor(u.pid) : u.color);
    let fr = { x: u.x, y: u.y, c: Math.cos(u.ang), s: Math.sin(u.ang), zb: u.zb || 0, vs: CFG.VSCALE };
    if (!u.under) fr = hwVehFrame(fr, u.x, u.y, u.ang);          // vozidla na dálnici (u.under) výšku nemění
    const al = u.fade === undefined ? 1 : Math.max(0, Math.min(1, u.fade));
    const gc = u.loaded && u.goods ? GOODS_COL[u.goods] : null;
    const n0 = list.length;
    addDrawable(list, u.x, u.y, ctx => { if (al < 1) ctx.globalAlpha = al; drawModelUnit(ctx, fr, m, pal, u.loaded, gc); ctx.globalAlpha = 1; });
    hwDrawableFix(list, n0, u.x, u.y, !!u.under, u.ang, m.len * CFG.VSCALE * S / 2);
  } else if (u.kind === 'ship') {
    if (u.x === undefined) return;
    const m = modelFor(u.model), pal = paletteFor(playerColor(u.pid)), al = u.fade === undefined ? 1 : Math.max(0, Math.min(1, u.fade));
    const hc = (u.holds || []).map(h => h.amt > 0.01 ? (GOODS_COL[h.g] || ['#888', '#aaa']) : null);
    addDrawable(list, u.x, u.y, ctx => {
      const fr = { x: u.x, y: u.y, c: Math.cos(u.ang), s: Math.sin(u.ang), zb: -(liftPx() / Math.max(VZ, 1)), vs: CFG.VSCALE };
      if (al < 1) ctx.globalAlpha = al; drawModelUnit(ctx, fr, m, pal, false, null, hc); ctx.globalAlpha = 1;
    });
  } else {
    const poses = u.poses || trainPoses(u);
    const pal = paletteFor(playerColor(u.pid));
    const gc = u.loaded && u.goods ? GOODS_COL[u.goods] : null;
    for (const p of poses) {
      const m = modelFor(p.item);
      const fr = hwVehFrame({ x: p.x, y: p.y, c: Math.cos(p.ang), s: Math.sin(p.ang), zb: 0.15, vs: CFG.VSCALE }, p.x, p.y, p.ang);
      const n0 = list.length;
      addDrawable(list, p.x, p.y, ctx => drawModelUnit(ctx, fr, m, pal, u.loaded && !!ECON.ITEMS[p.item].wagon, gc));
      hwDrawableFix(list, n0, p.x, p.y, false);
    }
  }
}

function drawFloaters(ctx, state) {
  const z = state.cam.zoom;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of state.sim.floaters) {
    const p = w2s(f.x, f.y, true);
    const a = Math.max(0, 1 - f.t / 2.2);
    ctx.globalAlpha = a;
    ctx.font = 'bold 13px sans-serif';
    const y = p.y - 26 - f.t * 22 * Math.max(0.8, Math.min(z, 1.6));
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.strokeText(f.text, p.x, y);
    ctx.fillStyle = f.color || '#8cf59a'; ctx.fillText(f.text, p.x, y);
    ctx.globalAlpha = 1;
  }
}

// ======================= SVĚT: budovy, důl, elektrárna, vedení, stromy =======================
const WIN_DARK = '#3a4a5c', WIN_LIT = '#e8d490';

function drawWindows(ctx, fr, hw, hd, h, kind, idx) {
  if (VZ <= 0 || h < 0.3 || LOD_LOW) return;
  const t = 0.007;
  const rows = Math.max(1, Math.round((h - 0.1) / (kind === 'tower' ? 0.17 : 0.22)));
  const faces = [
    { n: { x: 0, y: 1 },  w: hw, mk: (z0, z1) => [-hw + 0.06, hw - 0.06, hd, hd + t, z0, z1] },
    { n: { x: 0, y: -1 }, w: hw, mk: (z0, z1) => [-hw + 0.06, hw - 0.06, -hd - t, -hd, z0, z1] },
    { n: { x: 1, y: 0 },  w: hd, mk: (z0, z1) => [hw, hw + t, -hd + 0.06, hd - 0.06, z0, z1] },
    { n: { x: -1, y: 0 }, w: hd, mk: (z0, z1) => [-hw - t, -hw, -hd + 0.06, hd - 0.06, z0, z1] }
  ];
  for (const f of faces) {
    if (projDelta(f.n.x, f.n.y).y <= 0.001) continue;
    for (let r = 0; r < rows; r++) {
      const z0 = 0.08 + r * (h - 0.13) / rows;
      const lit = hash2(idx, r + 7, 99) > 0.8;
      drawBox(ctx, fr, f.mk(z0, z0 + (kind === 'tower' ? 0.085 : 0.07)), lit ? WIN_LIT : WIN_DARK);
    }
  }
}

function drawBuilding(ctx, b) {
  const hw = b.w / 2, hd = b.d / 2, fr = { x: b.x, y: b.y, c: 1, s: 0, zb: b.z || 0 };
  ctx.save();
  // stín
  if (!LOD_LOW) {
    const sh = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => w2s(b.x + (u + 0.12 + b.h * 0.1) * CFG.S, b.y + (v + 0.14 + b.h * 0.1) * CFG.S, true));
    ctx.beginPath(); sh.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.20)'; ctx.fill();
  }

  if (b.k === 'house') {
    drawBox(ctx, fr, [-hw, hw, -hd, hd, 0, b.h * 0.62], b.col, '#d0c8b4');
    // sedlová střecha: dva šikmé hranoly aproximované třemi vrstvami
    const rh = Math.max(0.16, b.h * 0.38);
    for (let i = 0; i < 3; i++) {
      const f = i / 3, inset = hd * 0.9 * f;
      drawBox(ctx, fr, [-hw - 0.03, hw + 0.03, -hd - 0.03 + inset, hd + 0.03 - inset, b.h * 0.62 + rh * f, b.h * 0.62 + rh * (f + 1 / 3)], b.roof);
    }
    if (VZ > 0 && b.w > 0.5) drawWindows(ctx, fr, hw, hd, b.h * 0.62, 'house', b.idx);
  } else if (b.k === 'tower') {
    drawBox(ctx, fr, [-hw, hw, -hd, hd, 0, b.h], b.col, b.roof);
    drawWindows(ctx, fr, hw, hd, b.h, 'tower', b.idx);
    drawBox(ctx, fr, [-hw * 0.35, hw * 0.35, -hd * 0.35, hd * 0.35, b.h, b.h + 0.14], '#586069', '#7a828c');
  } else if (b.k === 'factory') {
    drawBox(ctx, fr, [-hw, hw, -hd, hd, 0, b.h], b.col, b.roof);
    for (let i = 0; i < 3; i++) drawBox(ctx, fr, [-hw + 0.1 + i * hw * 0.62, -hw + 0.1 + i * hw * 0.62 + hw * 0.5, -hd, hd, b.h, b.h + 0.18], b.roof, '#98a0a8');
    if (b.chim) drawBox(ctx, fr, [hw * 0.55, hw * 0.55 + 0.16, hd * 0.35, hd * 0.35 + 0.16, b.h, b.h + 1.1], '#7c5a4a', '#5a4034');
    drawBox(ctx, fr, [-hw * 0.25, hw * 0.25, hd, hd + 0.01, 0.0, 0.32], '#4a525c');
  } else if (b.k === 'ware') {
    drawBox(ctx, fr, [-hw, hw, -hd, hd, 0, b.h], b.col, b.roof);
    drawBox(ctx, fr, [-hw * 0.7, -hw * 0.1, hd, hd + 0.01, 0, 0.28], '#4a525c');
  } else {                                     // block
    drawBox(ctx, fr, [-hw, hw, -hd, hd, 0, b.h], b.col, b.roof);
    drawWindows(ctx, fr, hw, hd, b.h, 'block', b.idx);
  }
  ctx.restore();
}

// ---- válec (komín, chladicí věž, silo) ----
function drawCyl(ctx, st) {
  const S = CFG.S, z = state.cam.zoom;
  const base = w2s(st.x, st.y, true), r0 = st.r * S * z;
  base.y -= (st.z0 || 0) * VZ;
  const h = st.h * VZ, tilt = Math.max(VIEW.tilt, 0.35);
  const taper = st.taper || 1;
  const rAt = f => r0 * (1 - (1 - taper) * Math.sin(Math.min(1, f) * Math.PI * 0.5) * 0.92);
  const n = 22;
  // tělo po segmentech
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i <= n; i++) { const f = i / n, y = base.y - h * f, r = (st.taper ? r0 * (1 - (1 - taper) * (1 - Math.abs(2 * f - 1) * 0.0) * 0) : r0) ; }
  const prof = f => st.taper ? r0 * (taper + (1 - taper) * Math.pow(Math.abs(f - 0.62) / 0.62, 1.4) * (f < 0.62 ? 1 : 0.55)) : r0;
  ctx.moveTo(base.x - prof(0), base.y);
  for (let i = 1; i <= n; i++) { const f = i / n; ctx.lineTo(base.x - prof(f), base.y - h * f); }
  for (let i = n; i >= 0; i--) { const f = i / n; ctx.lineTo(base.x + prof(f), base.y - h * f); }
  ctx.closePath();
  const g = ctx.createLinearGradient(base.x - r0, 0, base.x + r0, 0);
  g.addColorStop(0, shade(st.col, 0.78)); g.addColorStop(0.45, shade(st.col, 1.08)); g.addColorStop(1, shade(st.col, 0.62));
  ctx.fillStyle = g; ctx.fill();
  if (st.band) {
    for (const f of [0.25, 0.5, 0.75]) {
      ctx.fillStyle = st.band; ctx.fillRect(base.x - prof(f), base.y - h * (f + 0.07), prof(f) * 2, h * 0.07);
    }
  }
  ctx.restore();
  // horní okraj
  const rt = prof(1), ty = base.y - h;
  ctx.beginPath(); ctx.ellipse(base.x, ty, rt, rt * tilt, 0, 0, Math.PI * 2);
  ctx.fillStyle = st.top || shade(st.col, 0.5); ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke();
  if (st.steam) {
    const t = performance.now() / 1000;
    for (let i = 0; i < 5; i++) {
      const ph = ((t * 0.18 + i / 5 + hash2(st.x | 0, st.y | 0, 3)) % 1);
      const sy = ty - ph * r0 * 3.4, sr = rt * (0.55 + ph * 1.1);
      ctx.globalAlpha = 0.5 * (1 - ph);
      ctx.beginPath(); ctx.arc(base.x + Math.sin(ph * 4 + i) * rt * 0.25 + ph * r0 * 0.6, sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = '#f2f4f6'; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function drawPile(ctx, st) {
  const S = CFG.S;
  const fr = { x: st.x, y: st.y, c: 1, s: 0, zb: st.z0 || 0 };
  const hw = st.w / 2, hd = st.d / 2, n = 4;
  for (let i = 0; i < n; i++) {
    const f = i / n, ins = f * 0.4;
    drawBox(ctx, fr, [-hw * (1 - ins), hw * (1 - ins), -hd * (1 - ins), hd * (1 - ins), st.h * f, st.h * (f + 1 / n)], i % 2 ? (st.c2 || '#222427') : (st.c1 || '#1a1b1d'), st.c1 ? shade(st.c2 || st.c1, 1) : '#34363b');
  }
}

function drawPart(ctx, p) {
  if (p.t === 'bld') drawBuilding(ctx, p);
  else if (p.t === 'box') {
    const fr = { x: p.x, y: p.y, c: 1, s: 0, zb: p.z0 || 0 }, hw = p.w / 2, hd = p.d / 2;
    drawBox(ctx, fr, [-hw, hw, -hd, hd, 0, p.h], p.col, p.top);
  } else if (p.t === 'cyl') drawCyl(ctx, p);
  else if (p.t === 'pile') drawPile(ctx, p);
  else if (p.t === 'tree') drawTree(ctx, p);
}

// Které popisky se kreslí: při oddálení jen okresní a pak jen krajská města, a vždy bez vzájemného překrývání
// (důležitější popisek má přednost). Vybraný token má popisek vždy.
const LBL_ALL = 0.32, LBL_DISTRICT = 0.2;
function tkTier(tk) { return tk.lblTier !== undefined ? tk.lblTier : (isCity(tk) ? 1 : 0); }
function visibleLabels(map, z, vr) {
  const out = new Set(), sel = typeof UI !== 'undefined' ? UI.cardId : null;
  const minT = z >= LBL_ALL ? 0 : z >= LBL_DISTRICT ? 2 : 3, cull = z < 1.0;
  const cand = [];
  for (const tk of map.tokens) {
    const c = tokenCenter(tk);
    if (c.x < vr.x0 || c.x > vr.x1 || c.y < vr.y0 || c.y > vr.y1) continue;
    if (tkTier(tk) < minT && tk.id !== sel) continue;
    cand.push(tk);
  }
  if (!cull) { for (const tk of cand) out.add(tk.id); return out; }
  cand.sort((a, b) => (b.id === sel) - (a.id === sel) || tkTier(b) - tkTier(a) || (isCity(b) ? b.level : 0) - (isCity(a) ? a.level : 0));
  const rects = [];
  for (const tk of cand) {
    const c = tokenCenter(tk), p = w2s(c.x, c.y, true), y = p.y - (tk.hmax + 0.25) * VZ - 6;
    const tw = Math.max(tk.name.length * 7.2, 70) + 16, r = { x0: p.x - tw / 2 - 2, x1: p.x + tw / 2 + 2, y0: y - 34, y1: y + 2 };
    if (tk.id !== sel && rects.some(q => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0)) continue;
    rects.push(r); out.add(tk.id);
  }
  return out;
}

function collectWorldDrawables(state, list, vr) {
  const map = state.map, z = state.cam.zoom, S = CFG.S;
  const lbl = visibleLabels(map, z, vr);
  for (const tk of map.tokens) {
    const c = tokenCenter(tk);
    if (c.x < vr.x0 || c.x > vr.x1 || c.y < vr.y0 || c.y > vr.y1) continue;
    for (const p of tk.parts) list.push({ d: w2s(p.x, p.y + (p.d || p.r || 0.2) * 0.5 * S, true).y, fn: ctx => drawPart(ctx, p) });
    if (lbl.has(tk.id)) list.push({ d: w2s(c.x, c.y, true).y + 2000, fn: ctx => drawTokenLabel(ctx, tk) });      // popisek vždy nahoře
  }
  if (z >= 0.4) {
    const TL = map.trees;
    for (let i = 0; i < TL.length; i++) {
      const t = TL[i];
      if (t.x < vr.x0 || t.x > vr.x1 || t.y < vr.y0 || t.y > vr.y1) continue;
      addDrawable(list, t.x, t.y, ctx => drawTree(ctx, t));
    }
  }
  const P = map.poles;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    if (p.x >= vr.x0 && p.x <= vr.x1 && p.y >= vr.y0 && p.y <= vr.y1) addDrawable(list, p.x, p.y, ctx => drawPole(ctx, p));
    if (i + 1 < P.length && !p.end) {
      const q = P[i + 1], mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      if (mx >= vr.x0 - 6 * A && mx <= vr.x1 + 6 * A && my >= vr.y0 - 6 * A && my <= vr.y1 + 6 * A) {
        list.push({ d: w2s(mx, my, true).y + 1, fn: ctx => drawWires(ctx, p, q) });
      }
    }
  }
}

// Kulatá podložka tokenu (kreslí se pod objekty).
function drawMultiDisc(ctx, tk, def) {
  const S = CFG.S, z = state.cam.zoom, R = DISC_R * S * z, t = VIEW.tilt, h = DISC_H * VZ, Rw = DISC_R * S;
  const cs = tokenCellList(tk).map(q => ({ x: q.c * A, y: q.r * A })).concat((tk.sq || []).map(q => cellCenter(mkS(q.c, q.r))));
  const sel = state.sel && tokenAt(state.map, state.sel) === tk;
  const shapes = [];
  for (const c of cs) shapes.push({ e: c });
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const dx = cs[j].x - cs[i].x, dy = cs[j].y - cs[i].y, d = Math.hypot(dx, dy);
    if (d > A * 1.05) continue;
    const nx = -dy / d * Rw, ny = dx / d * Rw;
    shapes.push({ q: [[cs[i].x + nx, cs[i].y + ny], [cs[i].x - nx, cs[i].y - ny], [cs[j].x - nx, cs[j].y - ny], [cs[j].x + nx, cs[j].y + ny]] });
  }
  const trace = (sh, dx, dy) => {
    ctx.beginPath();
    if (sh.e) { const p = w2s(sh.e.x, sh.e.y, true); ctx.ellipse(p.x + dx, p.y + dy, R, R * t, 0, 0, Math.PI * 2); }
    else sh.q.forEach((w, i) => { const p = w2s(w[0], w[1], true); i ? ctx.lineTo(p.x + dx, p.y + dy) : ctx.moveTo(p.x + dx, p.y + dy); }), ctx.closePath();
  };
  for (const sh of shapes) { trace(sh, R * 0.08, R * 0.1); ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill(); }
  if (h > 0) for (let dy = 0; dy >= -h; dy -= Math.max(1, h / 3)) for (const sh of shapes) { trace(sh, 0, dy); ctx.fillStyle = def.rim; ctx.fill(); }
  ctx.lineJoin = 'round'; ctx.lineWidth = sel ? 6 : 3; ctx.strokeStyle = sel ? '#ffffff' : 'rgba(0,0,0,0.45)';
  for (const sh of shapes) { trace(sh, 0, -h); ctx.stroke(); }
  for (const sh of shapes) { trace(sh, 0, -h); ctx.fillStyle = def.top; ctx.fill(); }
}
function drawTokenDisc(ctx, tk) {
  if (tk.cells && tk.cells.length > 1) { drawMultiDisc(ctx, tk, TOKEN_TYPES[tk.type]); return; }
  const S = CFG.S, z = state.cam.zoom, def = TOKEN_TYPES[tk.type];
  const c = tokenCenter(tk), p = w2s(c.x, c.y, true);
  const R = DISC_R * S * z, t = VIEW.tilt, h = DISC_H * VZ;
  const sel = state.sel && state.sel.t === 'o' && state.sel.c === tk.c && state.sel.r === tk.r;
  ctx.beginPath(); ctx.ellipse(p.x + R * 0.08, p.y + R * 0.1, R * 1.03, R * 1.03 * t, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill();
  if (h > 0) {
    ctx.beginPath(); ctx.ellipse(p.x, p.y, R, R * t, 0, 0, Math.PI);
    ctx.lineTo(p.x - R, p.y - h); ctx.ellipse(p.x, p.y - h, R, R * t, 0, Math.PI, 0, true); ctx.closePath();
    ctx.fillStyle = def.rim; ctx.fill();
  }
  ctx.beginPath(); ctx.ellipse(p.x, p.y - h, R, R * t, 0, 0, Math.PI * 2);
  ctx.fillStyle = def.top; ctx.fill();
  ctx.lineWidth = sel ? 3 : 1.5; ctx.strokeStyle = sel ? '#ffffff' : 'rgba(0,0,0,0.45)'; ctx.stroke();
  if (tk.owner) { ctx.beginPath(); ctx.ellipse(p.x, p.y - h, R * 0.93, R * 0.93 * t, 0, 0, Math.PI * 2); ctx.lineWidth = Math.max(2.5, R * 0.07); ctx.strokeStyle = playerColor(tk.owner); ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(p.x, p.y - h, R * 0.88, R * 0.88 * t, 0, 0, Math.PI * 2);
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.stroke();
}

function drawTokenLabel(ctx, tk) {
  const S = CFG.S, def = TOKEN_TYPES[tk.type], c = tokenCenter(tk), p = w2s(c.x, c.y, true);
  const top = (tk.hmax + 0.25) * VZ;
  const y = p.y - top - 6;
  const title = tk.name, sub = isCity(tk) ? tokenLevelName(tk) + (tk.owner ? ' · ' + playerName(tk.owner) : '') : (isDeposit(tk) ? 'ložisko' : 'úr. ' + tk.level + (tk.owner ? ' · ' + playerName(tk.owner) : ''));
  ctx.font = 'bold 12px sans-serif';
  const w1 = ctx.measureText(title).width;
  ctx.font = '10px sans-serif';
  const w2 = ctx.measureText(sub).width;
  const tw = Math.max(w1, w2) + 16;
  ctx.fillStyle = 'rgba(14,24,34,0.9)'; ctx.strokeStyle = tk.owner ? playerColor(tk.owner) : def.sign; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.roundRect(p.x - tw / 2, y - 32, tw, 32, 7); ctx.fill(); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.fillText(title, p.x, y - 22);
  ctx.fillStyle = def.sign; ctx.font = '10px sans-serif'; ctx.fillText(sub, p.x, y - 9);
  ctx.beginPath(); ctx.moveTo(p.x, y); ctx.lineTo(p.x, p.y - DISC_H * VZ - 2); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.stroke();
}

function drawTree(ctx, t) {
  const S = CFG.S, z = state.cam.zoom, base = w2s(t.x, t.y, true), u = S * z * t.s;
  if (t.z) base.y -= t.z * VZ;
  const tilt = Math.max(VIEW.tilt, 0.5), k = viewK();
  const lift = k ? 1 : 0.6;
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.beginPath(); ctx.ellipse(base.x + u * 0.12, base.y + u * 0.04, u * 0.34, u * 0.34 * tilt * 0.7, 0, 0, Math.PI * 2); ctx.fill();
  if (t.k === 1) {                                   // jehličnan: tři vrstvy kuželů
    ctx.fillStyle = '#5a3d28'; ctx.fillRect(base.x - u * 0.04, base.y - u * 0.18 * lift, u * 0.08, u * 0.18 * lift);
    const cols = ['#2f5a3a', '#376a43', '#3f7a4c'];
    for (let i = 0; i < 3; i++) {
      const y0 = base.y - u * (0.12 + i * 0.26) * lift, w = u * (0.42 - i * 0.1), h = u * 0.36 * lift;
      ctx.beginPath(); ctx.moveTo(base.x - w, y0); ctx.lineTo(base.x + w, y0); ctx.lineTo(base.x, y0 - h); ctx.closePath();
      ctx.fillStyle = cols[i]; ctx.fill();
    }
  } else {                                           // listnáč: kmen a koule
    ctx.fillStyle = '#5a3d28'; ctx.fillRect(base.x - u * 0.045, base.y - u * 0.32 * lift, u * 0.09, u * 0.32 * lift);
    const cy = base.y - u * 0.55 * lift, r = u * 0.34;
    ctx.beginPath(); ctx.arc(base.x, cy, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(base.x - r * 0.35, cy - r * 0.4, r * 0.1, base.x, cy, r);
    const hue = 0.85 + t.g * 0.3;
    g.addColorStop(0, shade('#7fb35a', hue)); g.addColorStop(1, shade('#3f7a3a', hue));
    ctx.fillStyle = g; ctx.fill();
  }
}

function drawPole(ctx, p) {
  const S = CFG.S, z = state.cam.zoom, k = viewK();
  const b = w2s(p.x, p.y, true);
  const px = v => v * S * z;
  const h = px(p.h) * (k ? 1 : 0.45);
  const dx = Math.cos(p.ang), dy = Math.sin(p.ang);                  // směr vedení
  const nx = -dy, ny = dx;                                           // kolmo na vedení (světově)
  const side = w2s(p.x + nx * S * 0.55, p.y + ny * S * 0.55, true);  // vodorovný rozměr příčníku na obrazovce
  const sx = side.x - b.x, sy = side.y - b.y;
  ctx.lineCap = 'round';
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(b.x + px(0.12), b.y + px(0.04), px(0.3), px(0.1), 0, 0, Math.PI * 2); ctx.fill();
  if (p.type === 'tower') {
    const legs = [[-1, 1], [1, 1]];
    ctx.strokeStyle = '#6c737c'; ctx.lineWidth = Math.max(1.2, px(0.05));
    for (const [d] of legs) {
      ctx.beginPath(); ctx.moveTo(b.x + sx * 0.45 * d, b.y + sy * 0.45 * d); ctx.lineTo(b.x + sx * 0.08 * d, b.y - h * 0.9 + sy * 0.08 * d); ctx.stroke();
    }
    ctx.lineWidth = Math.max(1, px(0.025));
    for (let i = 1; i < 5; i++) {
      const f = i / 5, wA = 0.45 - 0.37 * f, wB = 0.45 - 0.37 * (f + 0.2);
      ctx.beginPath(); ctx.moveTo(b.x - sx * wA, b.y - h * 0.9 * f - sy * wA); ctx.lineTo(b.x + sx * Math.max(0.08, wB), b.y - h * 0.9 * Math.min(1, f + 0.2) + sy * Math.max(0.08, wB)); ctx.stroke();
    }
    ctx.lineWidth = Math.max(1.5, px(0.05)); ctx.strokeStyle = '#59606a';
    for (const f of [0.78, 0.95]) {
      const w = f > 0.9 ? 0.62 : 0.85;
      ctx.beginPath(); ctx.moveTo(b.x - sx * w, b.y - h * f - sy * w); ctx.lineTo(b.x + sx * w, b.y - h * f + sy * w); ctx.stroke();
    }
  } else {                                            // portál rozvodny
    ctx.strokeStyle = '#59606a'; ctx.lineWidth = Math.max(1.6, px(0.06));
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(b.x + sx * 0.7 * d, b.y + sy * 0.7 * d); ctx.lineTo(b.x + sx * 0.7 * d, b.y - h + sy * 0.7 * d); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(b.x - sx * 0.7, b.y - h - sy * 0.7); ctx.lineTo(b.x + sx * 0.7, b.y - h + sy * 0.7); ctx.stroke();
    ctx.fillStyle = '#e8e4d8';
    for (const d of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.arc(b.x + sx * 0.7 * d, b.y - h + sy * 0.7 * d + px(0.05), px(0.045), 0, Math.PI * 2); ctx.fill(); }
  }
}

function poleAnchors(p) {
  const S = CFG.S, k = viewK(), z = state.cam.zoom;
  const b = w2s(p.x, p.y, true), h = p.h * S * z * (k ? 1 : 0.45);
  const nx = -Math.sin(p.ang), ny = Math.cos(p.ang);
  const side = w2s(p.x + nx * S * 0.55, p.y + ny * S * 0.55, true);
  const sx = side.x - b.x, sy = side.y - b.y;
  if (p.type === 'tower') return [[-0.85, 0.78], [0.85, 0.78], [0, 0.95]].map(([d, f]) => ({ x: b.x + sx * d * (f > 0.9 ? 0.6 : 1), y: b.y - h * f + sy * d * (f > 0.9 ? 0.6 : 1) }));
  return [-0.5, 0, 0.5].map(d => ({ x: b.x + sx * 0.7 * d, y: b.y - h + sy * 0.7 * d + S * z * 0.05 }));
}
function drawWires(ctx, p, q) {
  const a = poleAnchors(p), b = poleAnchors(q), z = state.cam.zoom;
  const len = Math.hypot(b[0].x - a[0].x, b[0].y - a[0].y);
  const sag = Math.min(len * 0.055, CFG.S * z * 0.5) * (viewK() ? 1 : 0.4);
  ctx.strokeStyle = 'rgba(30,34,40,0.9)'; ctx.lineWidth = Math.max(1, z * 0.9);
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    ctx.beginPath(); ctx.moveTo(a[i].x, a[i].y);
    ctx.quadraticCurveTo((a[i].x + b[i].x) / 2, (a[i].y + b[i].y) / 2 + sag * 2, b[i].x, b[i].y);
    ctx.stroke();
  }
}


// Vhodná místa pro stavbu podniku (režim stavby objektu).
const SITE_COL = { lake: ['rgba(95,212,244,0.28)', '#5fd4f4'], forest: ['rgba(185,138,74,0.30)', '#d9b36a'], deposit: ['rgba(235,200,80,0.30)', '#f0d060'], free: ['rgba(140,220,140,0.22)', '#9be09b'] };
function drawSiteHints(ctx) {
  if (!state.buildMode || !state.sites) return;
  const S = CFG.S, z = state.cam.zoom, t = VIEW.tilt;
  for (const st of state.sites) {
    const p = w2s(st.c * A, st.r * A, true), R = DISC_R * S * z, cl = SITE_COL[st.kind] || SITE_COL.free;
    const on = state.objSite && state.objSite.c === st.c && state.objSite.r === st.r;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, R, R * t, 0, 0, Math.PI * 2);
    ctx.fillStyle = on ? 'rgba(255,255,255,0.35)' : cl[0]; ctx.fill();
    ctx.setLineDash(on ? [] : [6, 5]); ctx.lineWidth = on ? 4 : 2; ctx.strokeStyle = on ? '#ffffff' : cl[1]; ctx.stroke(); ctx.setLineDash([]);
  }
}


// ===== public/js/sim.js =====
// Simulace dopravy: okolní auta (stafáž), nasazená vozidla hráče, vlaky, přejezdy se závorami.
//
// Města a průmysl jsou tokeny (tokens.js). Vozidlo vyjede z okraje tokenu, dojede k okraji cílového tokenu,
// uvnitř "zmizí" (nakládka / vykládka, časový limit) a pak zase vyjede. Tím odpadá otáčení na silnici.
// Kapacita: město neomezená, průmysl 2 vozidla na každou připojenou silnici a 2 vlaky na každou kolej.
// Když je token plný, vozidlo čeká před ním (na okraji).
//
// Vozidla jezdí po drahách (lomených čarách) spočítaných z grafu silnic / kolejí.
// Auta jezdí vpravo (posun dráhy o LANE). Vlak jezdí po ose koleje.
// Přejezd: závory se zavřou, když je čelo vlaku 2 pole (2·A) před přejezdem, a otevřou, až je konec vlaku 2 pole za ním.

const LANE = 0.1 * CFG.S;
const TWO_TILES = 2 * A;
const ACC_ROAD = 2.8, BRK = 7.0, ACC_TRAIN = 1.5, BRK_TRAIN = 2.4;   // v násobcích S/s²
const AMB_COLORS = ['#f2f2ee', '#c3c8cf', '#2c3036', '#3f6fb3', '#3f8f5b', '#c9a43a', '#8e3b3b', '#7d8590', '#5aa0b8', '#b87333'];
const GAP_TRAIN = 0.04;
const TRIM = 0.45 * CFG.S;        // dráha silničního vozidla začíná / končí takto daleko od středu tokenu
const FADE = 0.5 * CFG.S;         // na tak dlouhém úseku se vozidlo objevuje / mizí
const RIM = 0.9 * CFG.S;          // vlak je vidět jen mezi okraji obou tokenů

function newSim() {
  return {
    units: [], cross: {}, crossList: [], floaters: [],
    gRoad: null, gRail: null, amb: { nodes: [], cum: [], sum: 0, target: 0 },
    spawnT: 0, netVer: -1, t: 0
  };
}

function normAng(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function trainLength(items) {
  let L = 0;
  items.forEach((it, i) => { L += modelFor(it).len * CFG.VSCALE * CFG.S + (i ? GAP_TRAIN * CFG.S : 0); });
  return L;
}
function unitPath(u) { return u.paths[u.idx]; }
function unitCross(u) { return u.crossings[u.idx]; }
function unitWagons(u) { return u.kind === 'rail' ? Math.max(1, u.items.filter(k => ECON.ITEMS[k].wagon).length) : u.kind === 'ship' ? Math.max(1, (u.goodsList || []).length) : 1; }
function dwellTimeFor(u, tk) { return tokenDwell(tk) * unitWagons(u); }
function canEnter(u, tk) { return isCity(tk) || !tk.owner || tk.owner === u.pid || !tk.access.closed; }
function curToken(u) { return tokenById(u.at === 'A' ? u.A : u.B); }
function destToken(u) { return tokenById(u.at === 'A' ? u.B : u.A); }
function tokenHasPort(id, kind) { const t = tokenById(id); if (kind === 'ship') return isPort(t); return !!t && (kind === 'road' ? t.road : t.rail).length > 0; }

// Ořízne lomenou čáru: odebere délku a od začátku a b od konce.
function trimPoly(pts, a, b) {
  const total = polyLength(pts), from = a, to = total - b, out = [];
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1], seg = Math.hypot(q.x - p.x, q.y - p.y);
    if (seg < 1e-9) continue;
    const s0 = acc, s1 = acc + seg;
    if (s1 > from && s0 < to) {
      const f0 = Math.max(0, (from - s0) / seg), f1 = Math.min(1, (to - s0) / seg);
      if (!out.length) out.push({ x: p.x + (q.x - p.x) * f0, y: p.y + (q.y - p.y) * f0 });
      out.push({ x: p.x + (q.x - p.x) * f1, y: p.y + (q.y - p.y) * f1 });
    }
    acc = s1;
  }
  return out.length >= 2 ? out : pts;
}

// ---------- přestavba po změně sítě ----------
function rebuildSim() {
  const sim = state.sim, S = CFG.S;
  sim.netVer = state.net.ver;
  sim.gRoad = buildGraph(state.net, 'road');
  sim.gRail = buildGraph(state.net, 'rail');
  sim.gShip = buildShipGraph(state.map);
  for (const tk of state.map.tokens) {
    tk.occ = { road: [], rail: [], ship: [] };
    if (!tk.outletT) tk.outletT = { road: 0, rail: 0, ship: 0 };
    if (tk.visits === undefined) tk.visits = 0;
  }

  // přejezdy
  sim.crossList = [];
  const seen = new Set();
  for (const e of state.net.entries()) {
    const rec = e.rec;
    if (!(rec.road && rec.rail.length) || !isLandCell(state.map, e.cell)) continue;
    const key = cellKey(e.cell);
    const roadArm = armsOf(rec.road)[0];
    const th = angleBetween(e.cell, roadArm, rec.rail[0][0]) * Math.PI / 180;
    const off = Math.max(0.55 * S, 0.34 * S / Math.max(0.35, Math.abs(Math.sin(th))) + 0.14 * S);
    sim.crossList.push({ key, cell: e.cell, off });
    seen.add(key);
    if (!sim.cross[key]) sim.cross[key] = { closed: false, eff: false, gate: 0, effT: 0, off };
    sim.cross[key].off = off;
  }
  for (const k of Object.keys(sim.cross)) if (!seen.has(k)) delete sim.cross[k];

  // okolní provoz
  sim.units = sim.units.filter(u => u.owner);
  computeAmbient(sim);

  // vozidla hráče: znovu naplánovat; ztracená přípojka => vozidlo zpět do skladu
  sim.units = sim.units.filter(u => {
    if (!tokenHasPort(u.A, u.kind) || !tokenHasPort(u.B, u.kind)) { returnToInventory(u); return false; }
    return true;
  });
  for (const u of sim.units) {
    if (!u.owner) continue;
    const snap = u.ok && u.routeSig ? snapUnit(u) : null;
    planUnit(u);
    if (snap && u.ok && u.routeSig === snap.sig) restoreUnit(u, snap);
  }
}

function routeSigOf(a, b) {
  const f = p => { const n = p.length, k = Math.max(1, Math.floor(n / 10)); let s = n + ':' + Math.round(polyLength(p)); for (let i = 0; i < n; i += k) s += ',' + Math.round(p[i].x) + '/' + Math.round(p[i].y); return s; };
  return f(a) + '|' + f(b);
}
const KEEP_FIELDS = ['idx', 'dir', 's', 'v', 'state', 'at', 'did', 'loaded', 'reserved', 'fade', 'crashT', 'lastCell', 'bx', 'by', 'ba', 'stuck', 'freeT', 't', 'dwellT', 'waited', 'hidden', 'x', 'y', 'ang', 'status', 'waitCross', 'delay'];
function snapUnit(u) { const o = { sig: u.routeSig }; for (const k of KEEP_FIELDS) o[k] = u[k]; return o; }
function restoreUnit(u, o) {
  for (const k of KEEP_FIELDS) u[k] = o[k];
  const cur = curToken(u), dst = destToken(u);
  if ((u.state === 'dwell' || u.state === 'ready') && cur) occEnter(cur, u.kind, u);
  if (u.reserved && dst) occEnter(dst, u.kind, u);
}

function returnToInventory(u) {
  const P = state.players && state.players[u.pid]; if (!P) return;
  if (u.kind === 'road' || u.kind === 'ship') P.inv[u.model] = (P.inv[u.model] || 0) + 1;
  else for (const it of u.items) P.inv[it] = (P.inv[it] || 0) + 1;
}

// Políčka, kterými trať prochází (bez polí s tokeny) – pro hlídání jednokolejné trati.
function routeCellSet(pts) {
  const set = new Set(), rp = resamplePoly(pts, 0.4 * CFG.S);
  for (const p of rp) {
    const c = hitTest(p.x, p.y);
    if (c && c.t === 'o' && !tokenAt(state.map, c)) set.add(cellKey(c));
  }
  return set;
}
function routeCellList(pts) {
  const out = [], seen = new Set(), rp = resamplePoly(pts, 0.4 * CFG.S);
  for (const p of rp) { const c = hitTest(p.x, p.y); if (c && !seen.has(cellKey(c))) { seen.add(cellKey(c)); out.push(c); } }
  return out;
}
function railConflict(u, sim) {
  for (const v of sim.units) {
    if (v === u || v.kind !== 'rail' || !v.ok || (v.state !== 'run' && v.state !== 'hold') || !v.cells) continue;
    for (const k of u.cells) if (v.cells.has(k)) return true;
  }
  return false;
}

// ---------- plánování tras hráčových vozidel ----------
function planUnit(u) {
  const sim = state.sim, S = CFG.S;
  u.ok = false; u.paths = null; u.hidden = true;
  const g = u.kind === 'road' ? sim.gRoad : u.kind === 'ship' ? sim.gShip : sim.gRail;
  const nA = g.nodes.get('T' + u.A), nB = g.nodes.get('T' + u.B);
  if (!tokenById(u.A) || !tokenById(u.B) || u.A === u.B || !nA || !nB) { u.status = 'Chybí přípojka'; return false; }
  const fw = routeNodes(g, nA, nB), rv = routeNodes(g, nB, nA);
  if (!fw || !rv) { u.status = 'Bez trasy: místa nejsou propojená'; return false; }
  if (u.kind === 'rail') {
    for (const c of routeCellList(fw)) { const rec = state.net.get(c); if (rec && rec.rail.length && ownRail(rec) && ownRail(rec) !== u.pid) { u.status = 'Koleje patří jinému hráči – po cizí trati jezdit nelze'; return false; } }
  }
  if (!canEnter(u, tokenById(u.A)) || !canEnter(u, tokenById(u.B))) { u.status = 'Vjezd do podniku je zakázán'; return false; }
  const gd = u.goods && GOODS[u.goods];
  if (!gd) { u.status = 'Není vybráno zboží'; return false; }
  const ta = tokenById(u.A), tb = tokenById(u.B);
  if (u.kind === 'ship') {
    if (!isPort(ta) || !isPort(tb)) { u.status = 'Lodě jezdí jen mezi přístavy'; return false; }
    for (const gg of (u.goodsList || [])) { if (!tokenAccepts(tb).includes(gg)) { u.status = 'Cíl toto zboží nepřijímá'; return false; } }
  } else {
    if (!tokenOutputs(ta).includes(u.goods)) { u.status = 'Z tohoto místa se zboží nevyváží'; return false; }
    if (!tokenAccepts(tb).includes(u.goods)) { u.status = 'Cíl toto zboží nepřijímá'; return false; }
  }
  u.routeCells = Math.max(1, polyLength(fw) / A);
  u.routeSig = routeSigOf(fw, rv);

  if (u.kind === 'ship') {
    const mk = pts => { let rp = resamplePoly(trimPoly(pts, SHIP_TRIM, SHIP_TRIM), PATHN); rp = smoothPts(rp, 3, 4); return makePath(rp); };
    u.paths = [mk(fw), mk(rv)]; u.crossings = [[], []]; u.s0 = 0; u.lat = 0;
  } else if (u.kind === 'road') {
    const mk = pts => {
      let rp = resamplePoly(trimPoly(pts, TRIM, TRIM), PATHN);
      rp = smoothPts(rp, 3, 3);
      return makePath(offsetRight(rp, LANE));
    };
    u.paths = [mk(fw), mk(rv)];
    u.crossings = u.paths.map(p => pathCrossings(p, sim.crossList, 0.55 * S));
    u.s0 = 0;
  } else {
    const Lt = trainLength(u.items), ext = Lt + 2 * S;
    let pts = extendPoly(fw, ext, ext);
    pts = resamplePoly(pts, PATHN);
    pts = smoothPts(pts, 2, 2);
    const pf = makePath(pts), pr = makePath(pts.slice().reverse());
    u.Lt = Lt;
    u.paths = [pf, pr];
    u.crossings = u.paths.map(p => pathCrossings(p, sim.crossList, 0.3 * S));
    u.sA = ext; u.sB = pf.len - ext;
    u.s0 = u.sA; u.send = u.sB - RIM + Lt;
    u.cells = routeCellSet(fw);
  }
  u.ok = true;
  u.idx = 0; u.dir = 1; u.s = u.s0; u.v = 0;
  u.state = 'wait'; u.at = 'A'; u.did = false; u.loaded = (u.amt || 0) > 0; u.reserved = false; u.fade = 1; u.crashT = 0; u.lastCell = null;
  u.bx = u.by = u.ba = 0; u.stuck = 0; u.freeT = 0;
  u.status = 'Čeká na volné stání';
  return true;
}

function createUnit(spec) {
  const it = ECON.ITEMS;
  const u = {
    id: ++state.nextId, owner: true, pid: spec.pid || 1, kind: spec.kind, model: spec.model, items: spec.items || [spec.model],
    A: spec.A, B: spec.B, goods: spec.goods || null, amt: spec.amt || 0, age: spec.age || 0, earned: 0, trips: 0, fees: 0, tolls: 0,
    speed: 0, cap: 0, ok: false, status: '', delay: spec.delay || 0, hidden: true, crashT: 0
  };
  if (spec.kind === 'road') { u.speed = it[spec.model].speed; u.cap = it[spec.model].cap; }
  else if (spec.kind === 'ship') {
    const I = it[spec.model]; u.goodsList = (spec.goodsList || []).slice(0, I.holds);
    u.holds = u.goodsList.map(g => ({ g, amt: 0, cap: I.holdCap })); u.goods = u.goodsList[0] || null; u.speed = I.speed; u.cap = u.holds.length * I.holdCap; u.items = [spec.model];
  }
  else {
    u.speed = it[spec.items[0]].speed;
    const cls = spec.goods && GOODS[spec.goods] ? GOODS[spec.goods].cls : null;
    u.cap = spec.items.reduce((s, k) => s + (it[k].wagon && (!cls || it[k].cargo === cls) ? it[k].cap : 0), 0);
  }
  u.price = unitPrice(u);
  return u;
}

// ---------- okolní provoz ----------
function computeAmbient(sim) {
  const am = sim.amb;
  am.nodes = []; am.cum = []; am.sum = 0;
  for (const tk of state.map.tokens) {
    const n = sim.gRoad.nodes.get('T' + tk.id);
    if (!n) continue;
    const w = tk.type === 'city' ? Math.pow(tk.level, 1.4) : 0.5;      // u velkých měst hustší provoz
    am.nodes.push({ n, w, tk });
    am.sum += w; am.cum.push(am.sum);
  }
  am.target = am.nodes.length >= 2 ? Math.min(14, Math.round(am.sum * 0.8)) : 0;
}
function pickWeighted(am) {
  const r = Math.random() * am.sum;
  let lo = 0, hi = am.cum.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (am.cum[mid] >= r) hi = mid; else lo = mid + 1; }
  return am.nodes[lo].n;
}

function ambientRoute(u, startNode) {
  const sim = state.sim, am = sim.amb;
  for (let tries = 0; tries < 5; tries++) {
    const dest = pickWeighted(am);
    if (dest === startNode) continue;
    const pts = routeNodes(sim.gRoad, startNode, dest);
    if (!pts || pts.length < 2) continue;
    let rp = resamplePoly(trimPoly(pts, TRIM, TRIM), PATHN);
    rp = smoothPts(rp, 3, 3);
    const path = makePath(offsetRight(rp, LANE));
    if (path.len < 1.2 * CFG.S) continue;
    u.paths = [path]; u.idx = 0; u.s = 0;
    u.crossings = [pathCrossings(path, sim.crossList, 0.55 * CFG.S)];
    return true;
  }
  return false;
}

function spawnAmbient(sim) {
  const am = sim.amb;
  if (am.nodes.length < 2) return false;
  const start = pickWeighted(am);
  const u = {
    owner: false, kind: 'road', model: 'car', color: AMB_COLORS[Math.floor(Math.random() * AMB_COLORS.length)],
    speed: 2.0 + Math.random() * 0.7, v: 0, fade: 0, dir: 1, idx: 0, s: 0, bx: 0, by: 0, ba: 0, stuck: 0, freeT: 0, ok: true
  };
  if (!ambientRoute(u, start)) return false;
  const p0 = unitPath(u).pts[0];
  for (const w of sim.units) if (w.kind === 'road' && w.x !== undefined && !w.hidden && Math.hypot(w.x - p0.x, w.y - p0.y) < 1.1 * CFG.S) return false;
  applyPose(u, unitPath(u), 0);
  sim.units.push(u);
  return true;
}

// ---------- pohyb ----------
function applyPose(u, path, s) {
  const p = path.pose(s, 0.2 * CFG.S);
  u.x = p.x + (u.bx || 0); u.y = p.y + (u.by || 0); u.ang = p.ang + (u.ba || 0);
}
function decayBlend(u, dt) {
  if (!u.bx && !u.by && !u.ba) return;
  const k = Math.exp(-dt * 3.2);
  u.bx *= k; u.by *= k; u.ba *= k;
  if (Math.abs(u.bx) + Math.abs(u.by) < 0.01 * CFG.S && Math.abs(u.ba) < 0.01) u.bx = u.by = u.ba = 0;
}

// Cílová rychlost silničního vozidla: omezení zatáčkou, závorou a vozidlem vpředu.
function roadTargetSpeed(u, vmax) {
  const S = CFG.S, sim = state.sim, path = unitPath(u);
  const hl = modelFor(u.model).len * CFG.VSCALE * S / 2;
  let vt = vmax;
  u.waitCross = false;
  if (u.guardUntil > sim.t) return 0;                  // stráž proti překryvu (traffic.js): vozidlo vzadu chvíli stojí

  const a0 = path.pose(u.s, 0.2 * S).ang, a1 = path.pose(Math.min(path.len, u.s + 0.9 * S), 0.2 * S).ang;
  vt *= 1 / (1 + 1.1 * Math.abs(normAng(a1 - a0)));

  for (const c of unitCross(u)) {
    const cs = sim.cross[c.key];
    if (!cs) continue;
    const gap = c.s - cs.off - 0.32 * S - hl - u.s;
    if (!cs.eff) {
      // závory ještě nejsou dole, ale vlak už jede: vjet smí jen vozidlo, které přejezd stihne opustit
      if (gap < -0.25 * S || cs.eta === Infinity) continue;
      const clear = (c.s + 0.5 * S + hl - u.s) / Math.max(u.v, 0.9 * S);
      if (cs.eta > clear * 1.15 + 0.5) continue;
    } else if (gap < -0.25 * S) continue;
    vt = Math.min(vt, Math.sqrt(2 * BRK * S * Math.max(0, gap)));
    if (gap < 0.9 * S) u.waitCross = true;
  }

  if (u.freeT > 0) return vt;
  const cos = Math.cos(u.ang), sin = Math.sin(u.ang);
  if (u.mergeZ && u.s < u.mergeZ.s0 + 0.15 * S) {                  // zařazení do dálnice: přednost má provoz na dálnici
    const z = u.mergeZ; let blocked = false;
    for (const w of sim.units) {
      if (w === u || w.kind !== 'road' || w.x === undefined || w.hidden || w.mergeZ) continue;
      const lat = Math.abs((w.x - z.p.x) * -z.d.y + (w.y - z.p.y) * z.d.x);
      if (lat > 0.24 * S) continue;                                // jede v jiném pruhu
      const fw = (w.x - u.x) * z.d.x + (w.y - u.y) * z.d.y;
      if (fw > -1.7 * S && fw < 1.3 * S) { blocked = true; break; }
    }
    if (blocked) { vt = Math.min(vt, Math.sqrt(2 * BRK * S * Math.max(0, z.s0 - hl - u.s))); u.waitCross = true; }   // počká na začátku zaústění
  }
  for (const w of sim.units) {
    if (w === u || w.kind !== 'road' || w.x === undefined || w.hidden) continue;
    const dx = w.x - u.x, dy = w.y - u.y;
    const fwd = dx * cos + dy * sin;
    if (fwd <= 0 || fwd > 3.4 * S) continue;
    if (Math.abs(-dx * sin + dy * cos) > (u.latLimit || 0.3) * S) continue;     // na dálnici (u.latLimit) jsou pruhy blíž u sebe
    if (Math.abs(normAng(w.ang - u.ang)) > 1.1) continue;
    const gap = fwd - hl - modelFor(w.model).len * CFG.VSCALE * S / 2 - 0.16 * S;
    vt = Math.min(vt, Math.sqrt(2 * BRK * S * Math.max(0, gap)));
  }
  return vt;
}

// floor – nejnižší rychlost při dojezdu (vozidlo, které mizí v tokenu, nebrzdí až do zastavení)
function stepRoadMotion(u, dt, vmax, tgt, floor) {
  const S = CFG.S, path = unitPath(u);
  if (tgt === undefined) tgt = path.len;
  let vt = roadTargetSpeed(u, vmax * S);
  vt = Math.min(vt, Math.sqrt(2 * BRK * S * Math.max(0, tgt - u.s)) + (floor === undefined ? 0.08 * S : floor));
  if (u.v < 0.05 * S && vt < 0.05 * S && !u.waitCross) u.stuck += dt; else u.stuck = 0;
  if (u.stuck > 6) { u.freeT = 2.2; u.stuck = 0; }
  if (u.freeT > 0) u.freeT -= dt;
  u.v += clamp(vt - u.v, -BRK * S * dt, ACC_ROAD * S * dt);
  u.s += u.v * dt;
  decayBlend(u, dt);
  if (u.s >= tgt) u.s = tgt;
  applyPose(u, path, u.s);
  return u.s >= tgt - 0.02 * S;
}

function stepAmbient(u, dt) {
  if (u.dying) { u.v = 0; u.fade -= dt / 0.7; return u.fade > 0; }
  const path = unitPath(u);
  const arrived = stepRoadMotion(u, dt, u.speed, path.len, 0.9 * CFG.S);
  u.fade = clamp(Math.min(u.s / FADE + 0.02, (path.len - u.s) / FADE), 0, 1);
  return !arrived;                                       // v cíli zmizí v tokenu
}

// Vozidlo dojelo do tokenu: zmizí, zaplatí vstupné a odbavuje se (každý vagon zvlášť).
function enterToken(u, dest) {
  u.at = u.at === 'A' ? 'B' : 'A';
  u.state = 'dwell'; u.hidden = true; u.reserved = false; u.v = 0; u.did = false; u.waited = 0;
  u.dwellT = u.t = dest ? dwellTimeFor(u, dest) : 3;
  if (dest && dest.owner && dest.owner !== u.pid && (dest.access.fee || 0) > 0) {
    const fee = dest.access.fee * unitWagons(u);
    transfer(u.pid, dest.owner, fee, 'feeOut', 'feeIn', 'fee'); dest.earnedFees += fee; u.fees += fee;
    const c = tokenCenter(dest);
    floatAt(c.x, c.y + 10, '+' + fmtMoney(fee), '#ffe08a', [dest.owner]);
    floatAt(c.x, c.y + 10, '−' + fmtMoney(fee), '#ff9a9a', [u.pid]);
  }
}

function doLoad(u, tk) {
  if (u.kind === 'ship') return doLoadShip(u, tk);
  const g = u.goods; if (!g) return 0;
  const room = capEff(u) - (u.amt || 0);
  const take = Math.max(0, Math.min(room, tk.stock[g] || 0));
  if (take > 0) { u.amt = (u.amt || 0) + take; tk.stock[g] -= take; addInfl(tk, u.pid, take * GOODS[g].value * INFL_PER_VALUE); }
  u.loaded = u.amt > 0.01;
  return take;
}
function doUnload(u, tk, sim) {
  if (u.kind === 'ship') return doUnloadShip(u, tk, sim);
  const g = u.goods;
  if (!(u.amt > 0.01) || !tokenAccepts(tk).includes(g)) { u.loaded = u.amt > 0.01; return; }
  let free = STOCK_CAP - (tk.stock[g] || 0);
  if (isCity(tk) && g === 'cement') free = 1e9;
  const del = Math.max(0, Math.min(u.amt, free));
  if (del <= 0) return;
  u.amt -= del;
  if (isCity(tk) && g === 'cement') tk.cementIn += del; else tk.stock[g] = (tk.stock[g] || 0) + del;
  const gd = GOODS[g], income = Math.round(del * u.routeCells * ECON.RATE[u.kind] * gd.value);
  addMoney(u.pid, income, 'freight'); u.earned += income; u.trips++;
  addInfl(tk, u.pid, del * gd.value * INFL_PER_VALUE);
  const ta = tokenById(u.A);
  if (ta && ta.owner && ta.owner !== u.pid) { const buy = del * gd.value * SALE_PER_T * 0.5; transfer(u.pid, ta.owner, buy, 'goodsBuy', 'goodsSale', 'goods'); }
  const c = tokenCenter(tk);
  floatAt(c.x, c.y, '+' + fmtMoney(income), '#8cf59a', [u.pid]);
  u.loaded = u.amt > 0.01;
}

function breakVehicle(u, secs, label, costK) {
  u.crashT = secs; u.v = 0; u.status = label;
  addMoney(u.pid, -u.price * costK, 'repair');
  if (u.x !== undefined) floatAt(u.x, u.y, label === 'Nehoda' ? '💥 nehoda' : '🔧 porucha', '#ffb36b', [u.pid]);
  notify(u.pid, `${unitName(u)}: ${label.toLowerCase()} – oprava ${fmtMoney(u.price * costK)}`, true);
}

function tollStep(u) {
  if (u.kind !== 'road' || u.hidden || u.x === undefined) return;
  const c = hitTest(u.x, u.y); if (!c) return;
  const k = cellKey(c); if (k === u.lastCell) return;
  u.lastCell = k;
  const rec = state.net.get(c);
  if (state.map.hwx && hwxBuilt(state.map, c) && !(rec && rec.road)) { u.tolls += HWY_TOLL; addMoney(u.pid, -HWY_TOLL, 'tollOut'); return; }
  if (!rec || !rec.road) return;
  const o = ownRoad(rec); if (!o.length || o.includes(u.pid)) return;
  u.tolls += TOLL;
  for (const p of o) transfer(u.pid, p, TOLL / o.length, 'tollOut', 'tollIn', 'toll');
}

function stepPlayer(u, dt, sim) {
  const S = CFG.S;
  if (!u.ok) return;
  const kind = u.kind;

  // ---- uvnitř tokenu: čekání na stání, nakládka / vykládka, čekání na výjezd ----
  if (u.state === 'wait' || u.state === 'dwell' || u.state === 'ready') {
    u.hidden = true; u.v = 0;
    const tk = curToken(u);
    if (!tk) return;
    if (u.state === 'wait') {
      u.status = 'Čeká na volné stání';
      if (tokenFree(tk, kind)) {
        occEnter(tk, kind, u);
        u.state = 'dwell'; u.dwellT = u.t = dwellTimeFor(u, tk) + (u.delay || 0); u.delay = 0; u.did = false; u.waited = 0;
      }
      return;
    }
    if (u.state === 'dwell') {
      u.t -= dt;
      u.status = u.at === 'A' ? 'Nakládá' : 'Vykládá';
      if (!u.did && u.t < u.dwellT * 0.5) { u.did = true; if (u.at === 'A') doLoad(u, tk); else doUnload(u, tk, sim); }
      if (u.t <= 0) u.state = 'ready';
      return;
    }
    // ready: u A se doplňuje náklad, pak výjezd, jakmile je volný výjezd a (u vlaků) volná trať
    if (u.at === 'A') {
      u.waited += dt;
      doLoad(u, tk);
      if (u.amt < 0.6 * capEff(u) && u.waited < 20) { u.status = 'Čeká na náklad'; return; }
    } else if (unloadable(u, tk) && u.waited < 30) {
      u.waited += dt; doUnload(u, tk, sim); u.status = 'Dovykládá'; return;
    }
    u.status = 'Čeká na výjezd';
    if (sim.t < tk.outletT[kind]) return;
    if (kind === 'rail' && railConflict(u, sim)) { u.status = 'Čeká na volnou trať'; return; }
    u.loaded = u.amt > 0.01;
    u.idx = u.at === 'A' ? 0 : 1;
    u.s = u.s0; u.v = 0; u.reserved = false; u.stuck = 0; u.freeT = 0;
    u.bx = u.by = u.ba = 0; u.lastCell = null;
    occLeave(tk, kind, u); tk.visits++;
    tk.outletT[kind] = sim.t + (kind === 'road' ? 1.3 : 3 + u.Lt / (0.45 * S * u.speed));
    u.state = 'run'; u.hidden = false; u.fade = 0; u.lat = 0;
    if (kind === 'road') applyPose(u, unitPath(u), u.s); else if (kind === 'ship') shipPose(u);
    return;
  }

  // ---- porucha / nehoda ----
  if (u.crashT > 0) {
    u.crashT -= dt; u.v = 0;
    u.status = u.status === 'Nehoda' ? 'Nehoda' : 'Porucha';
    if (u.crashT <= 0) u.status = 'Jede';
    if (kind === 'road') applyPose(u, unitPath(u), u.s);
    return;
  }

  // ---- stárnutí a náhodné události ----
  u.age += dt;
  const old = Math.max(0, (u.age - AGE0) / AGE0);
  if (Math.random() < dt * (0.00003 * (1 + 2 * old))) { breakVehicle(u, 18 + Math.random() * 10, 'Porucha', 0.04); return; }
  if (old > 0 && Math.random() < dt * 0.00006 * old) {
    u.dead = true; u.hidden = true;
    const dd = destToken(u); if (dd) occLeave(dd, kind, u);
    if (u.x !== undefined) floatAt(u.x, u.y, '💥 zničeno', '#ff8a6b', [u.pid]);
    notify(u.pid, `${unitName(u)} se na stará kolena porouchal a vybouchl`, true);
    return;
  }
  const eff = ageEff(u);

  // ---- jízda ----
  const dest = destToken(u);
  if (kind === 'road') {
    const path = unitPath(u), hl = modelFor(u.model).len * CFG.VSCALE * S / 2;
    const holdS = path.len - 0.6 * S - hl;               // zastavení před plným tokenem
    if (!u.reserved && dest && u.s >= holdS - 0.35 * S && tokenFree(dest, 'road') && canEnter(u, dest)) { occEnter(dest, 'road', u); u.reserved = true; }
    const tgt = (u.reserved || !dest) ? path.len : holdS;
    const arrived = stepRoadMotion(u, dt, u.speed * eff, tgt, u.reserved ? 0.9 * S : undefined);
    u.fade = clamp(Math.min(u.s / FADE + 0.02, (path.len - u.s) / FADE), 0, 1);
    const holding = !u.reserved && u.v < 0.05 * S && u.s >= holdS - 0.15 * S;
    u.state = holding ? 'hold' : 'run';
    u.status = holding ? (dest && !canEnter(u, dest) ? 'Vjezd zakázán majitelem' : 'Čeká před plným místem') : u.waitCross ? 'Čeká na přejezd' : (u.v < 0.05 * S ? 'Stojí v koloně' : 'Jede');
    tollStep(u);
    if (arrived && u.reserved) enterToken(u, dest);
  } else if (kind === 'ship') {
    const path = unitPath(u), hl = modelFor(u.model).len * CFG.VSCALE * S / 2;
    const holdS = path.len - 0.5 * S - hl;
    if (!u.reserved && dest && u.s >= holdS - 0.4 * S && tokenFree(dest, 'ship') && canEnter(u, dest)) { occEnter(dest, 'ship', u); u.reserved = true; }
    const tgt = (u.reserved || !dest) ? path.len : holdS;
    const arrived = stepShipMotion(u, dt, u.speed * eff, tgt);
    u.fade = clamp(Math.min(u.s / FADE + 0.02, (path.len - u.s) / FADE), 0, 1);
    const holding = !u.reserved && u.v < 0.05 * S && u.s >= holdS - 0.15 * S;
    u.state = holding ? 'hold' : 'run';
    u.status = holding ? 'Čeká před plným přístavem' : u.waitShip ? 'Dává přednost jiné lodi' : (u.v < 0.05 * S ? 'Stojí' : 'Pluje');
    if (arrived && u.reserved) enterToken(u, dest);
  } else {
    const l0 = modelFor(u.items[0]).len * CFG.VSCALE * S;
    const hs = u.sB - RIM - 0.6 * S + l0 / 2;            // poloha čela před plným nádražím
    if (!u.reserved && dest && u.s >= hs - 0.4 * S && tokenFree(dest, 'rail') && canEnter(u, dest)) { occEnter(dest, 'rail', u); u.reserved = true; }
    const tgt = (u.reserved || !dest) ? u.send : hs;
    const vt = Math.min(u.speed * eff * S, Math.sqrt(2 * BRK_TRAIN * S * Math.max(0, tgt - u.s)) + (u.reserved ? 0.9 * S : 0.1 * S));
    u.v += clamp(vt - u.v, -BRK_TRAIN * S * dt, ACC_TRAIN * S * dt);
    u.s = Math.min(tgt, u.s + u.v * dt);
    const holding = !u.reserved && u.v < 0.05 * S && u.s >= hs - 0.15 * S;
    u.state = holding ? 'hold' : 'run';
    u.status = holding ? (dest && !canEnter(u, dest) ? 'Vjezd zakázán majitelem' : 'Čeká před plným místem') : 'Jede';
    if (u.reserved && u.s >= u.send - 0.02 * S) enterToken(u, dest);
  }
}

// Pozice všech kusů vlaku (lokomotiva první); kusy uvnitř tokenů se nekreslí.
function trainPoses(u) {
  if (!u.ok || !u.paths || u.hidden) return [];
  const S = CFG.S, path = unitPath(u), out = [];
  let off = 0;
  for (let ii = 0; ii < u.items.length; ii++) {
    const item = u.items[ii];
    const l = modelFor(item).len * CFG.VSCALE * S;
    const sc = u.s - off - l / 2;
    off += l + GAP_TRAIN * S;
    if (sc < u.sA + RIM || sc > u.sB - RIM) continue;
    const p = path.pose(sc, 0.25 * S);
    out.push({ x: p.x, y: p.y, ang: p.ang, item, i: ii });
  }
  return out;
}

// ---------- přejezdy ----------
function updateCrossings(dt) {
  const sim = state.sim;
  for (const k in sim.cross) { sim.cross[k].closed = false; sim.cross[k].eta = Infinity; }
  for (const u of sim.units) {
    if (u.kind !== 'rail' || !u.ok) continue;
    const head = u.s, tail = u.s - u.Lt;
    for (const c of unitCross(u)) {
      const cs = sim.cross[c.key];
      if (!cs) continue;
      const running = u.state === 'run' || u.state === 'hold';
      const near = running && head >= c.s - TWO_TILES && tail <= c.s + TWO_TILES;
      const covers = running && tail <= c.s && head >= c.s;
      if (near || covers) cs.closed = true;
      if (running && tail <= c.s + 0.5 * CFG.S && head >= c.s - 0.5 * CFG.S) cs.eta = 0;                   // vlak je na přejezdu
      else if (head < c.s && running) cs.eta = Math.min(cs.eta, (c.s - head) / Math.max(u.v, 0.6 * u.speed * CFG.S));
      else if (head < c.s) cs.eta = Math.min(cs.eta, (u.state === 'dwell' ? Math.max(0, u.t) : 0) + 1.5 + (c.s - head) / (0.6 * u.speed * CFG.S));
    }
  }
  for (const k in sim.cross) {
    const cs = sim.cross[k];
    cs.eff = cs.closed || state.trainOn;                 // semafory blikají a auta zastavují hned
    cs.effT = cs.eff ? (cs.effT || 0) + dt : 0;
    const want = cs.eff && cs.effT > 0.3 ? 1 : 0;        // závory sjíždějí s malým zpožděním (auta stihnou ujet)
    cs.gate += (want - cs.gate) * Math.min(1, dt * (want ? 4.5 : 3.2));
    if (Math.abs(cs.gate - want) < 0.003) cs.gate = want;
  }
}

// ---------- hlavní krok ----------
function simStep(dt) {
  const sim = state.sim;
  if (typeof hwxApplyTime === 'function' && state.map && state.map.hwx && hwxApplyTime(state.map, Math.floor(sim.t / 20) * 20)) state.net.ver++;
  if (sim.netVer !== state.net.ver) rebuildSim();
  sim.t += dt;

  updateCrossings(dt);
  econStep(dt);

  // srážky vozidel různých hráčů (náhoda): jen když se opravdu překrývají
  const rd = sim.units.filter(u => u.owner && u.kind === 'road' && !u.hidden && u.x !== undefined && !(u.crashT > 0));
  for (let i = 0; i < rd.length; i++) for (let j = i + 1; j < rd.length; j++) {
    const a = rd[i], b = rd[j];
    if (a.pid === b.pid) continue;
    if (Math.hypot(a.x - b.x, a.y - b.y) < 0.3 * CFG.S && (a.v > 0.3 * CFG.S || b.v > 0.3 * CFG.S) && Math.random() < 1 - Math.exp(-0.6 * dt)) {
      breakVehicle(a, 18, 'Nehoda', 0.08); breakVehicle(b, 18, 'Nehoda', 0.08);
    }
  }

  // okolní provoz: doplnit / ubrat
  const am = sim.amb;
  let alive = 0;
  for (const u of sim.units) if (!u.owner && !u.dying && !u.hwAmb) alive++;
  sim.spawnT -= dt;
  if (alive < am.target && sim.spawnT <= 0) { if (spawnAmbient(sim)) alive++; sim.spawnT = 0.7; }
  if (typeof hwAmbientStep === 'function') hwAmbientStep(sim, dt);       // provoz na dálnici: vzniká a zaniká jen v městech

  for (let i = sim.units.length - 1; i >= 0; i--) {
    const u = sim.units[i];
    if (u.owner) { stepPlayer(u, dt, sim); if (u.dead) sim.units.splice(i, 1); continue; }
    if (!stepAmbient(u, dt)) sim.units.splice(i, 1);
  }
  if (typeof trafficGuard === 'function') trafficGuard(sim);
  for (let i = sim.floaters.length - 1; i >= 0; i--) {
    sim.floaters[i].t += dt;
    if (sim.floaters[i].t > 2.2) sim.floaters.splice(i, 1);
  }
}

function runSim(dtReal) {
  const speed = state.simSpeed;
  if (!speed) return;
  let dt = Math.min(dtReal, 0.1) * speed;
  while (dt > 0) { const h = Math.min(dt, 0.04); simStep(h); dt -= h; }
}


// ===== public/js/railsig.js =====
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


// ===== public/js/traffic.js =====
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


// ===== public/js/ships.js =====
// Lodě a přístavy: plavba po řekách (map.nav), přístav = překladiště libovolného zboží.
const SHIP_TRIM = 0.5 * A;
function isPort(tk) { return !!tk && !!TOKEN_TYPES[tk.type] && !!TOKEN_TYPES[tk.type].port; }

// Vodní pole vedle přístavu (hrana k vodě); null = přístav nemá přístup k vodě.
function portDock(map, tk) {
  if (!map || !map.nav) return null;
  for (const [dc, dr] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { const k = (tk.c + dc) + ',' + (tk.r + dr); if (map.nav.has(k)) return { c: tk.c + dc, r: tk.r + dr }; }
  return null;
}

function buildShipGraph(map) {
  const nodes = new Map();
  const get = (id, x, y) => { let n = nodes.get(id); if (!n) { n = { id, x, y, adj: [] }; nodes.set(id, n); } return n; };
  const link = (n1, n2, poly) => {
    const len = polyLength(poly), e1 = { from: n1, to: n2, len, poly }, e2 = { from: n2, to: n1, len, poly: poly.slice().reverse() };
    e1.rev = e2; e2.rev = e1; n1.adj.push(e1); n2.adj.push(e2);
  };
  if (map && map.nav) {
    for (const k of map.nav) { const [c, r] = k.split(',').map(Number); get('N' + k, c * A, r * A); }
    for (const k of map.nav) {
      const [c, r] = k.split(',').map(Number);
      for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) { const k2 = (c + dc) + ',' + (r + dr); if (map.nav.has(k2) && !(dc && dr && (map.nav.has((c + dc) + ',' + r) || map.nav.has(c + ',' + (r + dr))))) { const a = nodes.get('N' + k), b = nodes.get('N' + k2); link(a, b, [{ x: a.x, y: a.y }, { x: b.x, y: b.y }]); } }
    }
    for (const tk of map.tokens) {
      if (!isPort(tk)) continue;
      const d = portDock(map, tk); if (!d) continue;
      const c0 = tokenCenter(tk), tn = get('T' + tk.id, c0.x, c0.y), dn = nodes.get('N' + d.c + ',' + d.r);
      if (dn) link(tn, dn, [{ x: tn.x, y: tn.y }, { x: dn.x, y: dn.y }]);
    }
  }
  return { kind: 'ship', nodes, list: [...nodes.values()] };
}

function unloadable(u, tk) {
  if (u.kind === 'ship') { const acc = tokenAccepts(tk); return (u.holds || []).some(h => h.amt > 0.01 && acc.includes(h.g) && (STOCK_CAP - (tk.stock[h.g] || 0)) > 1); }
  return u.amt > 0.01 && tokenAccepts(tk).includes(u.goods) && (STOCK_CAP - (tk.stock[u.goods] || 0)) > 1;
}
function shipSum(u) { return (u.holds || []).reduce((s, h) => s + h.amt, 0); }
function doLoadShip(u, tk) {
  let tot = 0; const eff = ageEff(u);
  for (const h of u.holds) {
    const room = h.cap * eff - h.amt, take = Math.max(0, Math.min(room, tk.stock[h.g] || 0));
    if (take > 0) { h.amt += take; tk.stock[h.g] -= take; addInfl(tk, u.pid, take * GOODS[h.g].value * INFL_PER_VALUE); tot += take; }
  }
  u.amt = shipSum(u); u.loaded = u.amt > 0.01; return tot;
}
function doUnloadShip(u, tk, sim) {
  const acc = tokenAccepts(tk), ta = tokenById(u.A); let any = false, inc = 0;
  for (const h of u.holds) {
    if (!(h.amt > 0.01) || !acc.includes(h.g)) continue;
    let free = STOCK_CAP - (tk.stock[h.g] || 0); if (isCity(tk) && h.g === 'cement') free = 1e9;
    const del = Math.max(0, Math.min(h.amt, free)); if (del <= 0) continue;
    h.amt -= del; any = true;
    if (isCity(tk) && h.g === 'cement') tk.cementIn += del; else tk.stock[h.g] = (tk.stock[h.g] || 0) + del;
    const gd = GOODS[h.g], income = Math.round(del * u.routeCells * ECON.RATE.ship * gd.value);
    addMoney(u.pid, income, 'freight'); u.earned += income; inc += income;
    addInfl(tk, u.pid, del * gd.value * INFL_PER_VALUE);
    if (ta && ta.owner && ta.owner !== u.pid) transfer(u.pid, ta.owner, del * gd.value * SALE_PER_T * 0.5, 'goodsBuy', 'goodsSale', 'goods');
  }
  u.amt = shipSum(u); u.loaded = u.amt > 0.01;
  if (any) { u.trips++; const c = tokenCenter(tk); floatAt(c.x, c.y, '+' + fmtMoney(inc), '#8cf59a', [u.pid]); }
}

let SHIP_RS = null;
function rightNormal(a) {
  if (SHIP_RS === null) { try { const t = offsetRight([{ x: 0, y: 0 }, { x: 10, y: 0 }], 1); SHIP_RS = t[0].y > 0 ? 1 : -1; } catch (e) { SHIP_RS = 1; } }
  return { x: -Math.sin(a) * SHIP_RS, y: Math.cos(a) * SHIP_RS };
}
function shipPose(u) {
  const path = unitPath(u), p = path.pose(u.s, 0.3 * CFG.S), n = rightNormal(p.ang);
  u.x = p.x + n.x * (u.lat || 0); u.y = p.y + n.y * (u.lat || 0); u.ang = p.ang;
}
// Pohyb lodi po řece: odstup za lodí vpředu, protijedoucí uhnou doprava, při křížení má přednost loď s vyšší náhodnou prioritou.
function stepShipMotion(u, dt, vmax, tgt) {
  const S = CFG.S, path = unitPath(u), sim = state.sim;
  const hl = modelFor(u.model).len * CFG.VSCALE * S / 2;
  if (u.prio === undefined) u.prio = Math.random();
  let vt = vmax * S, latT = 0;
  const a0 = path.pose(u.s, 0.3 * S).ang, a1 = path.pose(Math.min(path.len, u.s + 0.9 * S), 0.3 * S).ang;
  vt *= 1 / (1 + 0.9 * Math.abs(normAng(a1 - a0)));
  if (u.guardT > 0) u.guardT -= dt;
  const cs = Math.cos(u.ang || 0), sn = Math.sin(u.ang || 0);
  u.waitShip = false;
  for (const w of sim.units) {
    if (w === u || w.kind !== 'ship' || w.hidden || w.x === undefined || u.x === undefined) continue;
    const dx = w.x - u.x, dy = w.y - u.y, fwd = dx * cs + dy * sn, lat = -dx * sn + dy * cs;
    if (fwd <= -0.3 * S || fwd > 3.4 * S || Math.abs(lat) > 1.2 * S) continue;
    const dang = Math.abs(normAng((w.ang || 0) - (u.ang || 0))), wl = modelFor(w.model).len * CFG.VSCALE * S / 2;
    const gap = fwd - hl - wl - 0.15 * S;
    if (dang < 1.2) { if (Math.abs(lat) < 0.55 * S && fwd > 0) vt = Math.min(vt, Math.sqrt(2 * BRK * S * Math.max(0, gap))); }
    else if (u.guardT > 0) continue;
    else if (dang > 2.0) { latT = Math.max(latT, 0.34 * S); if (Math.abs(lat) < 0.45 * S && fwd > 0 && fwd < 1.6 * S && (w.prio || 0) > u.prio) { vt = Math.min(vt, Math.sqrt(2 * BRK * S * Math.max(0, gap))); u.waitShip = true; } }
    else if (fwd > 0 && fwd < 2.0 * S && (w.prio || 0) > u.prio) { vt = Math.min(vt, Math.sqrt(2 * BRK * S * Math.max(0, gap))); u.waitShip = true; }
  }
  vt = Math.min(vt, Math.sqrt(2 * BRK * S * Math.max(0, tgt - u.s)) + 0.08 * S);
  if (u.v < 0.05 * S && vt < 0.05 * S) u.stuck += dt; else u.stuck = 0;
  if (u.stuck > 7) { u.guardT = 3; u.stuck = 0; }
  u.v += clamp(vt - u.v, -BRK * S * dt, 1.4 * S * dt);
  u.s = Math.min(tgt, u.s + u.v * dt);
  u.lat = (u.lat || 0) + (latT - (u.lat || 0)) * Math.min(1, dt * 1.8);
  shipPose(u);
  return u.s >= tgt - 0.02 * S;
}


// ===== server/logic.js =====
// Serverová logika hry. Běží uvnitř vm kontextu spolu se sdíleným kódem (config, grid, mapgen, roads, goods,
// tokens, economy, network, vehicles, sim), takže simulace na serveru je přesně ta, kterou dřív počítal prohlížeč.
// Ven z kontextu vede jen objekt API (volá ho server.js).

var state = {
  map: null, net: null, sim: null, seed: 7, seedNum: 7, players: {}, me: 0, locks: {}, lockKey: {}, paid: {}, ledger: {},
  nextId: 0, nextPid: 1, trainOn: false, simSpeed: 1
};
var serverNotify = null;
var _outbox = [];
serverNotify = function (pid, text, warn) { _outbox.push({ pid: pid, text: text, warn: !!warn }); };

function itemLabel(k) { return ECON.ITEMS[k].name; }
function unitName(u) { return u.kind !== 'rail' ? itemLabel(u.model) : 'Vlak (' + itemLabel(u.items[0]) + ', ' + (u.items.length - 1) + ' vag.)'; }

var API = (function () {
  const START_MONEY = ECON.START;
  const STARTER_INV = { van: 1, dump: 1, kamion: 1, tanker: 1, wagonOpen: 2, wagonCovered: 2, loco2: 1 };
  const MAX_UNITS = 40;
  const OBJ_TYPES = ['lumber', 'pump', 'coalmine', 'quarry', 'cornfarm', 'sawmill', 'animalfarm', 'slaughter', 'furniture', 'cement', 'power', 'ironmine', 'sandpit', 'grainfarm', 'mill', 'bakery', 'brewery', 'dairy', 'glass', 'steel', 'machines', 'port'];
  const TK_SAVE = ['id', 'type', 'name', 'level', 'c', 'r', 'road', 'rail', 'visits', 'owner', 'access', 'share', 'infl', 'stock', 'prosp', 'cementIn', 'earnedFees', 'lastElect', 'campCd', 'homes', 'produced'];
  const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
  let ambSeq = 0, netVerSeen = -1, unitsSig = '';
  const netSig = new Map();

  const ok = (say, warn) => ({ say: say || null, warn: !!warn });
  const bad = say => ({ say: say, warn: true });

  function cellOf(c) {
    if (!c || (c.t !== 'o' && c.t !== 's')) return null;
    const cc = Number(c.c), rr = Number(c.r);
    if (!Number.isInteger(cc) || !Number.isInteger(rr)) return null;
    const cell = c.t === 'o' ? mkO(cc, rr) : mkS(cc, rr);
    return cellExists(cell) ? cell : null;
  }
  function connId(v) { if (v === CENTER) return CENTER; const n = Number(v); return Number.isInteger(n) && n >= 0 && n < 8 ? n : null; }
  function myTokens(pid) { return state.map.tokens.filter(t => t.owner === pid); }

  // ---------- svět ----------
  function pickSeed(start) {
    for (let s = start; s < start + 500; s++) { const w = makeWorld(s); if (w.ind.need) return s; }
    return start;
  }
  function init(seed, saved) {
    if (saved && saved.seed) seed = saved.seed;
    if (!seed) seed = pickSeed(7);
    state.seed = seed;
    const world = makeWorld(seed);
    state.map = world.map; state.net = new RoadNet(); state.sim = newSim();
    state.players = {}; state.ledger = {}; state.paid = {}; state.decay = {}; state.locks = {}; state.lockKey = {}; state.nextId = 0; state.nextPid = 1;
    netSig.clear(); netVerSeen = -1;
    if (saved) {
      state.nextPid = saved.nextPid || 1; state.nextId = saved.nextId | 0;
      for (const id in (saved.players || {})) { const p = saved.players[id]; state.players[id] = { id: +id, name: p.name, color: p.color, money: p.money, inv: p.inv || {}, total: p.total || 0, home: p.home }; }
      for (const id in (saved.ledger || {})) state.ledger[id] = { inc: saved.ledger[id].inc || {}, exp: saved.ledger[id].exp || {}, bk: {} };
      state.paid = saved.paid || {};
      for (const st of saved.tokens || []) {
        let tk = tokenById(st.id);
        if (!tk) tk = makeToken(state.map, st.id, st.type, st.c, st.r, st.level, st.name);
        for (const k of TK_SAVE) if (st[k] !== undefined) tk[k] = st[k];
        if (tk.type !== st.type) tk.type = st.type;
        tk.occ = { road: [], rail: [], ship: [] };
        if (!tk.homes) tk.homes = null;
      }
      state.net.load(saved.roads || []);
      for (const e of state.net.entries().slice()) { const fixed = validateRec(state.map, e.cell, e.rec); if (fixed) state.net.set(e.cell, fixed); else state.net.clearCell(e.cell); }
      state.sim.t = saved.t || 0; state.decay = saved.decay || {};
    }
    if (state.map.preRoads) for (const [k, m] of state.map.preRoads) { const cell = cellFromKey(k); if (!state.net.get(cell)) state.net.set(cell, { road: m, rail: [], own: { road: [], rail: 0 } }); }   // státní silnice u Prahy
    rebuildSim();
    if (saved) {
      for (const sp of saved.units || []) {
        if (!state.players[sp.pid]) continue;
        const u = createUnit(sp);
        u.earned = sp.earned || 0; u.trips = sp.trips || 0; u.fees = sp.fees || 0; u.tolls = sp.tolls || 0;
        if (planUnit(u)) state.sim.units.push(u); else returnToInventory(u);
      }
    }
    return state.seed;
  }

  function dump() {
    const players = {}, ledger = {};
    for (const id in state.players) { const p = state.players[id]; players[id] = { name: p.name, color: p.color, money: p.money, inv: p.inv, total: p.total, home: p.home }; }
    for (const id in state.ledger) ledger[id] = { inc: state.ledger[id].inc, exp: state.ledger[id].exp };
    return {
      v: 1, wv: CFG.WORLD_VER, seed: state.seed, t: state.sim.t, nextId: state.nextId, nextPid: state.nextPid,
      tokens: state.map.tokens.map(t => { const o = {}; for (const k of TK_SAVE) o[k] = t[k]; return o; }),
      roads: state.net.toJSON(), decay: state.decay, players: players, ledger: ledger, paid: state.paid,
      units: state.sim.units.filter(u => u.owner).map(u => ({ kind: u.kind, model: u.model, items: u.items, A: u.A, B: u.B, goods: u.goods, pid: u.pid, amt: u.amt, age: u.age, earned: u.earned, trips: u.trips, fees: u.fees, tolls: u.tolls, goodsList: u.goodsList }))
    };
  }

  function register(name, color, homeId) {
    const home = tokenById(Number(homeId));
    if (!home || !isCity(home) || home.level !== 1) return { ok: false, error: 'Neplatná domovská vesnice' };
    if (home.homes && Object.keys(home.homes).length) return { ok: false, error: 'Tuto vesnici už obsadila jiná společnost, vyber jinou.' };
    const pid = state.nextPid++;
    state.players[pid] = { id: pid, name: name, color: color, money: START_MONEY, inv: Object.assign({}, STARTER_INV), total: 0, home: home.id };
    home.homes = home.homes || {}; home.homes[pid] = 1;
    home.infl = home.infl || {}; home.infl[pid] = Math.max(home.infl[pid] || 0, 220);
    if (!home.owner) { holdElection(home); }
    return { ok: true, pid: pid };
  }

  let _bankT = 0, _decT = 0, _ended = [];
  function step(dt) {
    const dt0 = dt; let h; while (dt > 1e-9) { h = Math.min(dt, 0.04); simStep(h); dt -= h; }
    _bankT += dt0; _decT += dt0;
    if (_bankT >= 1) { _bankT = 0; bankruptcyCheck(); }
    if (_decT >= 5) { _decT = 0; decayStep(); }
  }
  function drainEnded() { const o = _ended; _ended = []; return o; }

  // ---------- zánik společnosti (zrušení hráčem nebo bankrot) ----------
  // Vozidla zmizí, silnice a koleje se stanou ničí (neudržované), podniky a města zůstanou bez majitele, domovská vesnice se uvolní.
  function endCompany(pid, why) {
    const P = state.players[pid]; if (!P) return;
    const name = P.name;
    for (const u of state.sim.units.slice()) {
      if (!u.owner || u.pid !== pid) continue;
      const tk = curToken(u); if (tk) occLeave(tk, u.kind, u); const d = destToken(u); if (d) occLeave(d, u.kind, u);
      state.sim.units.splice(state.sim.units.indexOf(u), 1);
    }
    for (const rec of state.net.m.values()) {
      const o = rec.own || { road: [], rail: 0 };
      if (o.road.includes(pid) || o.rail === pid) rec.own = { road: o.road.filter(p => p !== pid), rail: o.rail === pid ? 0 : o.rail };
    }
    state.net.ver++;
    unlockCell(pid);
    delete state.players[pid]; delete state.ledger[pid]; delete state.paid[pid];
    for (const p in state.paid) delete state.paid[p][pid];
    const mayorOf = [];
    for (const tk of state.map.tokens) {
      if (tk.owner === pid) { tk.owner = 0; if (isCity(tk)) mayorOf.push(tk); }
      if (tk.homes && tk.homes[pid]) { delete tk.homes[pid]; if (!Object.keys(tk.homes).length) tk.homes = null; }
      if (tk.infl) delete tk.infl[pid];
    }
    for (const tk of mayorOf) holdElection(tk);
    const txt = why === 'bankrupt' ? `Společnost ${name} zbankrotovala.` : `Společnost ${name} byla zrušena.`;
    for (const p of pidList()) notify(p, txt + ' Její silnice a koleje už nikdo neudržuje – časem zmizí.', true);
    _ended.push({ pid: pid, name: name, why: why });
  }
  function bankruptcyCheck() {
    for (const id of Object.keys(state.players)) {
      const P = state.players[id];
      if (P.money <= BANKRUPT_AT) { endCompany(+id, 'bankrupt'); continue; }
      if (P.money < BANKRUPT_WARN && !P.warned) { P.warned = true; notify(+id, `Pozor: dluh ${Math.round(-P.money / 1000)} tis. Kč. Při ${Math.round(-BANKRUPT_AT / 1000)} tis. Kč společnost zbankrotuje a zanikne.`, true); }
      else if (P.money > BANKRUPT_WARN + 10000) P.warned = false;
    }
  }
  function keyHash(k) { let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0; return Math.abs(h); }
  // Neudržované (ničí) cesty: každé pole dostane náhodnou délku života, po jejímž uplynutí cesta zmizí (stát a dálnice jsou chráněné).
  function decayStep() {
    const t = state.sim.t, net = state.net;
    for (const [k, rec] of Array.from(net.m)) {
      const cell = cellFromKey(k);
      if (hwxProtected(state.map, cell)) { delete state.decay[k]; continue; }
      const o = rec.own || { road: [], rail: 0 };
      const roadN = rec.road !== 0 && o.road.length === 0, railN = rec.rail.length > 0 && !o.rail;
      if (!roadN && !railN) { delete state.decay[k]; continue; }
      let ex = state.decay[k];
      if (ex === undefined) ex = state.decay[k] = t + ROAD_DECAY_MIN + keyHash(k) % ROAD_DECAY_SPAN;
      if (t < ex) continue;
      delete state.decay[k];
      const road = roadN ? 0 : rec.road, rail = railN ? [] : rec.rail;
      if (!road && !rail.length) net.clearCell(cell); else net.set(cell, { road: road, rail: rail, own: o });
    }
    for (const k of Object.keys(state.decay)) if (!net.m.has(k)) delete state.decay[k];
  }

  function drain() { const o = _outbox; _outbox = []; return o; }

  // ---------- zámky ----------
  function releaseLocks(pid) { unlockCell(pid); }
  function locks() { const out = [], now = Date.now(); for (const k in state.locks) { const l = state.locks[k]; if (now - l.t <= LOCK_MS) out.push([k, l.pid]); else delete state.locks[k]; } return out; }

  // ---------- akce hráčů ----------
  const ACT = {
    lock(pid, m) {
      const cell = cellOf(m.cell); if (!cell) { unlockCell(pid); return null; }
      const lk = lockedBy(cell, pid);
      if (lk) return bad('Pole právě upravuje ' + playerName(lk) + ' – zkus to později');
      lockCell(cell, pid); return null;
    },
    unlock(pid) { unlockCell(pid); return null; },

    build(pid, m) {
      const cell = cellOf(m.cell); if (!cell) return bad('Neplatné pole');
      const a = connId(m.a), b = connId(m.b); if (a === null || b === null) return bad('Neplatný konektor');
      const kind = m.kind === 'rail' ? 'rail' : 'road';
      const res = checkPair(state.map, state.net, cell, kind, a, b);
      if (!res.ok) return res.reason ? bad(res.reason) : null;
      const paid = changeCell(cell, res.next, pid);
      if (!paid.ok) return bad(paid.reason);
      lockCell(cell, pid);
      return null;
    },
    bulldoze(pid, m) {
      const cell = cellOf(m.cell); if (!cell) return bad('Neplatné pole');
      if (tokenAt(state.map, cell)) return bad('Přípojku určila hra');
      if (hwxProtected(state.map, cell)) return bad('Státní dálnice a silnice nelze bourat');
      const lk = lockedBy(cell, pid); if (lk) return bad('Pole právě upravuje ' + playerName(lk));
      const id = connId(m.id); if (id === null) return bad('Neplatný konektor');
      const before = state.net.get(cell); if (!before) return null;
      const cost0 = recCost(state.map, cell, before);
      const cn = connectorsOf(state.map, state.net, cell).find(c => c.id === id); if (!cn) return null;
      const isArm = id === CENTER ? (before.road !== 0 && !before.rail.length) : ((before.road >> id) & 1) === 1;
      const bothKinds = id === CENTER && before.road && before.rail.length;
      if (!mayRemove(before, isArm || !!bothKinds, pid) || (bothKinds && !mayRemove(before, false, pid)))
        return bad(isArm ? 'Tuhle silnici sdílí i jiný hráč nebo patří jemu – nemůžeš ji zbourat' : 'Tyto koleje patří jinému hráči');
      if (id === CENTER) state.net.clearCell(cell);
      else if (cn.own) { if (!isLandCell(state.map, cell) || cell.t === 's') state.net.clearCell(cell); else state.net.removeArm(cell, id); }
      else return bad('Tady doprava nevede z tohoto pole (vede ze sousedního)');
      const rf = (cost0 - recCost(state.map, cell, state.net.get(cell))) * ECON.BUILD.refund; if (rf > 0) addMoney(pid, rf, 'refund');
      lockCell(cell, pid);
      return null;
    },
    clearCell(pid, m) {
      const cell = cellOf(m.cell); if (!cell || tokenAt(state.map, cell)) return null;
      if (hwxProtected(state.map, cell)) return bad('Státní dálnice a silnice nelze smazat');
      const lk = lockedBy(cell, pid); if (lk) return bad('Pole právě upravuje ' + playerName(lk));
      const before = state.net.get(cell); if (!before) return null;
      if (!(mayRemove(before, before.road !== 0, pid) && mayRemove(before, false, pid))) return bad('Pole patří (i) jinému hráči – nelze smazat');
      addMoney(pid, recCost(state.map, cell, before) * ECON.BUILD.refund, 'refund');
      state.net.clearCell(cell); return null;
    },
    clearMine(pid) {
      let kept = 0;
      for (const e of state.net.entries().slice()) {
        if (hwxProtected(state.map, e.cell)) continue;
        if (lockedBy(e.cell, pid)) { kept++; continue; }
        if (mayRemove(e.rec, e.rec.road !== 0, pid) && mayRemove(e.rec, false, pid)) {
          const o = e.rec.own || { road: [], rail: 0 };
          if (!(o.road.includes(pid) || o.rail === pid)) continue;
          addMoney(pid, recCost(state.map, e.cell, e.rec) * ECON.BUILD.refund, 'refund'); state.net.clearCell(e.cell);
        } else if ((e.rec.own && (e.rec.own.road.includes(pid) || e.rec.own.rail === pid))) kept++;
      }
      return kept ? ok('Sdílené nebo cizí úseky zůstaly (' + kept + ' polí)') : ok('Moje silnice a koleje zbourány');
    },

    buy(pid, m) {
      const it = ECON.ITEMS[m.k]; if (!it) return bad('Neznámá položka');
      const P = state.players[pid];
      if (P.money < it.price) return bad('Nemáš dost peněz na ' + it.name.toLowerCase());
      addMoney(pid, -it.price, 'vehicles'); P.inv[m.k] = (P.inv[m.k] || 0) + 1; return null;
    },
    deploy(pid, m) {
      const P = state.players[pid], s = m.spec || {};
      if (state.sim.units.filter(u => u.owner && u.pid === pid).length >= MAX_UNITS) return bad('Můžeš mít nejvýš ' + MAX_UNITS + ' vozidel');
      const A = Number(s.A), B = Number(s.B), g = s.goods;
      if (!tokenById(A) || !tokenById(B) || A === B) return bad('Vyber dvě různá místa');
      if (s.kind === 'ship') {
        const it = ECON.ITEMS[s.model]; if (!it || it.kind !== 'ship') return bad('Neplatná loď');
        const ta = tokenById(A), tb = tokenById(B); if (!isPort(ta) || !isPort(tb)) return bad('Lodě jezdí jen mezi přístavy');
        const gl = Array.isArray(s.goodsList) ? [...new Set(s.goodsList)].filter(x => GOODS[x] && TRADE_GOODS.includes(x)).slice(0, it.holds) : [];
        if (!gl.length) return bad('Vyber zboží');
        if ((P.inv[s.model] || 0) < 1) return bad('Nemáš ve skladu: ' + itemLabel(s.model));
        const su = createUnit({ kind: 'ship', model: s.model, A: A, B: B, goodsList: gl, pid: pid });
        if (!planUnit(su)) return bad('Nasazení se nepovedlo: ' + su.status);
        P.inv[s.model] -= 1; state.sim.units.push(su);
        return Object.assign(ok('Loď vyplula'), { openUnit: su.id });
      }
      if (!GOODS[g] || g === 'energy') return bad('Vyber zboží');
      let spec, need = {};
      if (s.kind === 'road') {
        const it = ECON.ITEMS[s.model]; if (!it || it.kind !== 'road') return bad('Neplatné vozidlo');
        if (it.cargo !== GOODS[g].cls) return bad('Vozidlo neodpovídá druhu zboží');
        need[s.model] = 1; spec = { kind: 'road', model: s.model, A: A, B: B, goods: g, pid: pid };
      } else if (s.kind === 'rail') {
        const items = Array.isArray(s.items) ? s.items.slice(0, 12) : [];
        const loco = ECON.ITEMS[items[0]]; if (!loco || !loco.loco) return bad('Chybí lokomotiva');
        const wag = items.slice(1);
        if (!wag.length || wag.length > loco.pull) return bad('Lokomotiva utáhne nejvýš ' + loco.pull + ' vagonů');
        for (const w of wag) if (!ECON.ITEMS[w] || !ECON.ITEMS[w].wagon) return bad('Neplatný vagon');
        if (!wag.some(w => ECON.ITEMS[w].cargo === GOODS[g].cls)) return bad('Vagony neodpovídají druhu zboží');
        for (const k of items) need[k] = (need[k] || 0) + 1;
        spec = { kind: 'rail', items: items, A: A, B: B, goods: g, pid: pid };
      } else return bad('Neplatné nasazení');
      for (const k in need) if ((P.inv[k] || 0) < need[k]) return bad('Nemáš ve skladu: ' + itemLabel(k));
      const u = createUnit(spec);
      if (!planUnit(u)) return bad('Nasazení se nepovedlo: ' + u.status);
      for (const k in need) P.inv[k] -= need[k];
      state.sim.units.push(u);
      return Object.assign(ok('Vozidlo vyrazilo na trasu'), { openUnit: u.id });
    },
    withdraw(pid, m) {
      const u = state.sim.units.find(x => x.owner && x.id === Number(m.id) && x.pid === pid); if (!u) return null;
      const tk = curToken(u); if (tk) occLeave(tk, u.kind, u); const d = destToken(u); if (d) occLeave(d, u.kind, u);
      state.sim.units.splice(state.sim.units.indexOf(u), 1); returnToInventory(u);
      return ok('Vozidlo vráceno do skladu');
    },

    buildObject(pid, m) {
      const type = m.type, T = TOKEN_TYPES[type];
      if (!T || !OBJ_TYPES.includes(type)) return bad('Neplatný objekt');
      const P = state.players[pid];
      const st = computeSites(type).find(x => x.c === Number(m.c) && x.r === Number(m.r));
      if (!st) return bad('Tady se tento objekt postavit nedá');
      const cell = mkO(st.c, st.r), lk = lockedBy(cell, pid); if (lk) return bad('Toto místo si právě vybral ' + playerName(lk));
      if (P.money < T.cost) return bad('Nemáš dost peněz');
      addMoney(pid, -T.cost, 'build');
      let tk;
      if (st.kind === 'deposit') { tk = tokenById(st.tk); convertDeposit(tk); }
      else { const id = Math.max(0, ...state.map.tokens.map(t => t.id)) + 1; tk = makeToken(state.map, id, type, st.c, st.r, 1); }
      tk.owner = pid; tk.infl = tk.infl || {}; tk.infl[pid] = 220; tk.access = { mode: 'open', fee: 0 }; tk.stock = {};
      for (const g of tokenOutputs(tk)) tk.stock[g] = 0;
      unlockCell(pid); state.net.ver++;
      return Object.assign(ok(tk.name + ' postaveno – veď silnici k přípojce'), { openToken: tk.id });
    },
    depBuild(pid, m) {
      const tk = tokenById(Number(m.tk)); if (!tk || !isDeposit(tk)) return bad('Tady se stavět nedá');
      const nt = DEPOSIT_BUILD[tk.type], cost = TOKEN_TYPES[nt].cost, P = state.players[pid];
      const lk = lockedBy(mkO(tk.c, tk.r), pid); if (lk) return bad('Místo právě používá ' + playerName(lk));
      if (P.money < cost) return bad('Nemáš dost peněz');
      addMoney(pid, -cost, 'build');
      convertDeposit(tk); tk.owner = pid; tk.infl = tk.infl || {}; tk.infl[pid] = 250; tk.access = { mode: 'open', fee: 0 }; tk.stock = {};
      for (const g of tokenOutputs(tk)) tk.stock[g] = 0;
      state.net.ver++;
      return ok(tk.name + ' je tvoje – přibyly přípojky, napoj je silnicí');
    },
    take(pid, m) {
      const tk = tokenById(Number(m.tk)); if (!tk || isCity(tk) || isDeposit(tk) || tk.owner) return bad('Podnik nelze převzít');
      if (inflOf(tk, pid) < OWN_MIN) return bad('Nemáš dost vlivu');
      tk.owner = pid; state.net.ver++; return ok('Podnik ' + tk.name + ' je tvůj');
    },
    camp(pid, m) {
      const tk = tokenById(Number(m.tk)); if (!tk || !isCity(tk)) return bad('Kampaň lze vést jen ve městě');
      const P = state.players[pid];
      if (P.money < CAMPAIGN_COST || tk.campCd > 0) return bad('Kampaň teď nejde spustit');
      addMoney(pid, -CAMPAIGN_COST, 'campaign'); tk.infl = tk.infl || {}; addInfl(tk, pid, CAMPAIGN_INFL); tk.campCd = CAMPAIGN_CD;
      return ok('Kampaň v ' + tk.name + ' zabrala');
    },
    upgrade(pid, m) {
      const tk = tokenById(Number(m.tk)); if (!tk) return bad('Neznámé místo');
      const chk = upgradeCheck(tk, pid);
      if (!chk.req) return bad('Nejvyšší úroveň');
      if (!chk.ok) return bad('Podmínky povýšení nejsou splněny');
      addMoney(pid, -chk.req.cost, 'upgrade'); tk.level++;
      if (isCity(tk)) { tk.prosp = 0; tk.cementIn = 0; } else if (tk.infl) tk.infl[pid] *= 0.5;
      assignPorts(state.map, tk); state.net.ver++;
      return ok(tk.name + ': úroveň ' + tk.level + (isCity(tk) ? ' – ' + tokenLevelName(tk) : '') + ' (přibyla přípojka, pokud ji úroveň dovoluje)');
    },
    share(pid, m) {
      const tk = tokenById(Number(m.tk)); if (!tk || tk.owner !== pid || isCity(tk) || isDeposit(tk)) return null;
      const T = TOKEN_TYPES[tk.type]; if (!T.lines || T.lines.length < 2 || T.auto) return null;
      const id = m.id, v = Math.max(0, Math.min(1, Number(m.v))); if (!T.lines.some(l => l.id === id) || !Number.isFinite(v)) return null;
      tk.share[id] = v;
      const others = T.lines.filter(l => l.id !== id), rest = others.reduce((a, l) => a + (tk.share[l.id] || 0), 0);
      for (const l of others) tk.share[l.id] = rest > 0 ? (tk.share[l.id] || 0) * (1 - v) / rest : (1 - v) / others.length;
      return null;
    },
    fee(pid, m) {
      const tk = tokenById(Number(m.tk)); if (!tk || tk.owner !== pid || isDeposit(tk)) return null;
      const f = Math.round(Number(m.fee)); if (!Number.isFinite(f)) return null;
      tk.access.fee = Math.max(0, Math.min(FEE_MAX, f)); return null;
    },
    access(pid, m) {
      const tk = tokenById(Number(m.tk)); if (!tk || tk.owner !== pid || isCity(tk) || isDeposit(tk)) return null;
      tk.access.closed = !!m.closed; return null;
    },
    dissolve(pid) { endCompany(pid, 'dissolved'); return null; },
    color(pid, m) {
      if (typeof m.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(m.color)) return null;
      state.players[pid].color = m.color.toLowerCase(); return null;
    }
  };

  function act(pid, m) {
    if (!state.players[pid]) return bad('Nejsi přihlášen');
    const f = ACT[m && m.t]; if (!f) return null;
    try { return f(pid, m); } catch (e) { console.error('act error', m && m.t, e && e.stack); return bad('Akce se nepovedla'); }
  }

  // ---------- snímky pro klienty ----------
  function roundMap(o, d) { const out = {}; if (!o) return out; const k = d === 1 ? 10 : 1; for (const key in o) out[key] = Math.round(o[key] * k) / k; return out; }
  function tokSnap(tk) {
    return {
      id: tk.id, type: tk.type, name: tk.name, level: tk.level, c: tk.c, r: tk.r, road: tk.road, rail: tk.rail, owner: tk.owner || 0,
      access: tk.access, share: tk.share, infl: roundMap(tk.infl, 1), stock: roundMap(tk.stock, 1), prosp: r1(tk.prosp || 0), cementIn: r1(tk.cementIn || 0),
      sat: r2(tk.sat === undefined ? 1 : tk.sat), power: tk.power === undefined ? 0.5 : tk.power, running: !!tk.running, visits: tk.visits | 0,
      earnedFees: Math.round(tk.earnedFees || 0), campCd: Math.ceil(tk.campCd || 0), lastElect: r1(tk.lastElect || 0), homes: tk.homes || null,
      occ: [tk.occ.road.length, tk.occ.rail.length, (tk.occ.ship || []).length]
    };
  }
  function unitSnap(u) {
    return {
      id: u.id, pid: u.pid, kind: u.kind, model: u.model, items: u.items, A: u.A, B: u.B, goods: u.goods, amt: r1(u.amt || 0), cap: u.cap, age: Math.round(u.age || 0),
      earned: Math.round(u.earned || 0), trips: u.trips | 0, fees: Math.round(u.fees || 0), tolls: Math.round(u.tolls || 0), price: u.price, routeCells: r1(u.routeCells || 0),
      status: u.status || '', state: u.state, at: u.at, ok: !!u.ok, crashT: r1(u.crashT || 0), speed: u.speed,
      goodsList: u.goodsList || null, holds: u.holds ? u.holds.map(h => ({ g: h.g, amt: r1(h.amt), cap: h.cap })) : null
    };
  }
  function ownerUnits() { return state.sim.units.filter(u => u.owner); }
  function unitsSignature() { return ownerUnits().map(u => u.id).join(','); }
  function unitsChanged() { const s = unitsSignature(); if (s !== unitsSig) { unitsSig = s; return true; } return false; }

  function fast() {
    const sim = state.sim, u = [], a = [];
    for (const x of sim.units) {
      if (x.owner) {
        const e = [x.id, (x.hidden ? 1 : 0) | (x.loaded ? 2 : 0), Math.round((x.fade === undefined ? 1 : x.fade) * 100)];
        if (!x.hidden && x.ok) {
          if (x.kind === 'road' || x.kind === 'ship') { if (x.x !== undefined) e.push(r1(x.x), r1(x.y), r2(x.ang), 0); }
          else for (const p of trainPoses(x)) e.push(r1(p.x), r1(p.y), r2(p.ang), p.i);
        }
        u.push(e);
      } else {
        if (!x.aid) x.aid = ++ambSeq;
        if (x.x === undefined) continue;
        a.push([x.aid, Math.max(0, AMB_COLORS.indexOf(x.color)), r1(x.x), r1(x.y), r2(x.ang), Math.round(Math.max(0, Math.min(1, x.fade === undefined ? 1 : x.fade)) * 100)]);
      }
    }
    const c = sim.crossList.map(cl => { const cs = sim.cross[cl.key]; return [cl.key, r1(cl.off), cs && cs.eff ? 1 : 0, cs ? Math.round(cs.gate * 100) : 0]; });
    return { st: r2(sim.t), u: u, a: a, c: c };
  }
  function newFloaters() {
    const out = [];
    for (const f of state.sim.floaters) if (!f.sent) { f.sent = true; out.push([r1(f.x), r1(f.y), f.text, f.color, f.pids]); }
    return out;
  }
  function slow() {
    const players = {};
    for (const id in state.players) { const p = state.players[id], tot = ledgerTotals(+id); players[id] = { id: +id, name: p.name, color: p.color, home: p.home, inc: Math.round(tot.inc), exp: Math.round(tot.exp) }; }
    return { tokens: state.map.tokens.map(tokSnap), units: ownerUnits().map(unitSnap), players: players, locks: locks() };
  }
  function me(pid) {
    const P = state.players[pid]; if (!P) return null;
    const L = ledgerOf(pid), paid = {};
    for (const a in state.paid) for (const b in state.paid[a]) if (+a === pid || +b === pid) { (paid[a] = paid[a] || {})[b] = state.paid[a][b]; }
    const bk = {}, t = Math.floor(state.sim.t);
    for (let k = t - 125; k <= t; k++) if (L.bk[k]) bk[k] = L.bk[k];
    return { id: pid, money: Math.round(P.money), inv: P.inv, total: Math.round(P.total || 0), ledger: { inc: L.inc, exp: L.exp, bk: bk }, paid: paid, home: P.home };
  }
  function money(pid) { const P = state.players[pid]; return P ? Math.round(P.money) : 0; }
  function netFull() { return state.net.toJSON(); }
  function netChanges() {
    if (netVerSeen === state.net.ver) return null;
    netVerSeen = state.net.ver;
    const out = [], seen = new Set();
    for (const [k, rec] of state.net.m) {
      seen.add(k);
      const s = JSON.stringify([rec.road, rec.rail, rec.own]);
      if (netSig.get(k) !== s) { netSig.set(k, s); out.push([k, { road: rec.road, rail: rec.rail, own: rec.own }]); }
    }
    for (const k of Array.from(netSig.keys())) if (!seen.has(k)) { netSig.delete(k); out.push([k, null]); }
    return out.length ? out : null;
  }
  function primeNet() { netVerSeen = -1; netSig.clear(); for (const [k, rec] of state.net.m) netSig.set(k, JSON.stringify([rec.road, rec.rail, rec.own])); netVerSeen = state.net.ver; }

  // Seznam startovních vesnic pro přihlašovací obrazovku (název, co je poblíž, kolik společností tam sídlí).
  function freeVillages() { return state.map.tokens.filter(t => isCity(t) && t.level === 1 && !(t.homes && Object.keys(t.homes).length)); }
  // Nabídka domovských vesnic: n náhodných z volných (zabrané se do výběru nedostanou). Každý hráč dostane jiný výběr.
  function villages(n) {
    const m = state.map;
    let list = freeVillages();
    if (n && list.length > n) {
      for (let i = 0; i < n; i++) { const j = i + Math.floor(Math.random() * (list.length - i)); const t = list[i]; list[i] = list[j]; list[j] = t; }
      list = list.slice(0, n);
    }
    return list.map(t => {
      const near = m.tokens.filter(x => !isCity(x) && !isDeposit(x)).map(x => ({ x: x, d: Math.hypot(x.c - t.c, x.r - t.r) })).sort((a, b) => a.d - b.d).slice(0, 6).map(o => TOKEN_TYPES[o.x.type].name).filter((n, i, arr) => arr.indexOf(n) === i).slice(0, 2);
      const dd = m.districts && t.d !== undefined ? m.districts[t.d] : null;
      return { id: t.id, name: t.name, near: near, district: dd ? dd.name : '', kraj: dd && m.kraje ? m.kraje[dd.kraj] : '' };
    });
  }
  function version() { return CFG.VERSION; }

  return { worldVer: () => CFG.WORLD_VER, villages, freeVillageCount: () => freeVillages().length, version, init, dump, register, step, drain, drainEnded, act, fast, slow, me, money, netFull, netChanges, primeNet, newFloaters, unitsChanged, releaseLocks, locks, state: () => ({ seed: state.seed, t: state.sim.t, players: Object.keys(state.players).length }) };
})();


return API;
}
module.exports = { createGame };
