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
