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
