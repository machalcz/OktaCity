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
