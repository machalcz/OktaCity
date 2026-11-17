// Panely, dolní lišta, rychlý přehled a založení společnosti (ALFA 0.2).
// Mapa je vždy na pozadí. Obsah se zobrazuje v jednom panelu (SH): na telefonu zespodu, na počítači zprava.

const SH = { view: null, arg: null, stack: [], touching: false, last: '', key: '' };
const OBJ_ORDER = ['lumber', 'pump', 'coalmine', 'quarry', 'ironmine', 'sandpit', 'cornfarm', 'grainfarm', 'sawmill', 'animalfarm', 'slaughter', 'dairy', 'port', 'mill', 'bakery', 'brewery', 'furniture', 'cement', 'glass', 'steel', 'machines', 'power'];
const COLORS = ['#d8402f', '#e8892b', '#d9b92a', '#8a4fc0', '#d95f9e', '#2fa7a0', '#8b5e3c', '#cfd6dc'];
const VEH_ICON = { van: '🚐', dump: '🚛', kamion: '🚚', kamionDump: '🚛', flatbed: '🏗', reefer: '❄', tanker: '🛢', ship1: '🚢', ship2: '🚢', ship4: '🚢' };
const SITE_TXT = { river: 'u řeky', forest: 'u lesa', lake: 'u jezera', deposit: 'na ložisku', free: 'na volném místě' };

function fmtSigned(n) { return (n >= 0 ? '+' : '−') + fmtMoney(Math.abs(n)); }
function myUnits() { return state.sim.units.filter(u => u.owner && u.pid === state.me); }
function unitProblem(u) {
  if (u.crashT > 0) return u.status || 'Porucha';
  const s = u.status || '';
  return /Bez trasy|zakázán|nepřijímá|nevyváží|patří jinému|Není vybráno/.test(s) ? s : '';
}
function unitIcon(u) { return u.kind === 'rail' ? '🚆' : (VEH_ICON[u.model] || '🚚'); }
function goodsName(g) { return g === 'energy' ? 'Elektřina' : (GOODS[g] ? GOODS[g].name : g); }
function hdr(title, extra) {
  return `<div class="shh">${SH.stack.length ? '<button class="hb" data-act="back">←</button>' : ''}<h3>${title}</h3>${extra || ''}<button class="hb" data-act="close">✕</button></div>`;
}
function kvr(a, b) { return `<div class="kv"><span>${a}</span><b>${b}</b></div>`; }
function placesOf(kind) { return state.map.tokens.filter(t => (kind === 'road' ? t.road : t.rail).length > 0); }
function opts(list, f) { return list.map(x => `<option value="${f.v(x)}">${f.t(x)}</option>`).join(''); }

// ---------- navigace panelu ----------
function openSheet(view, arg) {
  if (SH.view === view && String(SH.arg) === String(arg)) return;
  if (SH.view && SH.view !== view) SH.stack.push({ view: SH.view, arg: SH.arg });
  SH.view = view; SH.arg = arg; renderSheet();
}
function openRoot(view, arg) {
  if (state.sel) selectCell(null);
  SH.stack = []; SH.view = view; SH.arg = arg; renderSheet();
}
function toggleRoot(view) {
  if (SH.view === view && !SH.stack.length) { closeSheet(); return; }
  if (state.tool) setTool(null);
  openRoot(view);
}
function closeSheet() {
  SH.stack = []; SH.view = null; SH.arg = null; state.follow = null;
  if (state.sel && tokenAt(state.map, state.sel)) selectCell(null);
  renderSheet();
}
function sheetBack() {
  if (SH.view === 'token') { selectCell(null); return; }
  const p = SH.stack.pop();
  if (p) { SH.view = p.view; SH.arg = p.arg; renderSheet(); } else closeSheet();
}
function sheetLeaveToken() {
  if (SH.view !== 'token') return;
  const p = SH.stack.pop();
  if (p) { SH.view = p.view; SH.arg = p.arg; } else { SH.view = null; SH.arg = null; }
  renderSheet();
}
function resetSheet() { SH.view = null; SH.arg = null; SH.stack = []; renderSheet(); }

function showTokenCard(tk, opt) {
  UI.cardId = tk.id; UI.cardSig = null;
  if (SH.view !== 'token') {
    if (opt && opt.push && SH.view) SH.stack.push({ view: SH.view, arg: SH.arg }); else SH.stack = [];
    SH.view = 'token';
  }
  SH.arg = tk.id; renderSheet();
}
function hideTokenCard() { UI.cardId = null; sheetLeaveToken(); }

function startFollow(id) { state.follow = id; state.followZ = Math.max(state.cam.zoom, 1.25); state.glide = null; }
function openToken(id) {
  const tk = tokenById(+id); if (!tk) return;
  if (selectCell(mkO(tk.c, tk.r), { push: true })) { const c = tokenCenter(tk); focusWorld(c.x, c.y, Math.max(state.cam.zoom, 0.9)); }
}

// ---------- pohledy ----------
const VIEW_FN = {
  company: viewCompany, vehicles: viewVehicles, vehicle: viewVehicle, finance: viewFinance, infra: viewInfra,
  rivals: viewRivals, hwplan: viewHwPlan, shop: viewShop, objects: viewObjects, more: viewMore, deployRoad: () => '', deployRail: () => '', deployShip: () => ''
};
const LIVE = new Set(['company', 'vehicles', 'vehicle', 'finance', 'infra', 'rivals', 'hwplan']);

function renderSheet() {
  const sh = $('sheet'), body = $('shBody');
  document.body.classList.toggle('shopen', !!SH.view);
  if (SH.view !== 'vehicle' && state.follow != null) state.follow = null;
  if (!SH.view) { sh.classList.add('hidden'); SH.last = ''; SH.key = ''; updateToolbar(); renderCellbar(); return; }
  sh.classList.remove('hidden');
  const key = SH.view + ':' + SH.arg, changed = key !== SH.key; SH.key = key;
  if (SH.view === 'token') {
    if (!$('tcard')) body.innerHTML = '<div id="tcard"></div>';
    SH.last = ''; refreshTokenCard(true);
    if (changed) body.scrollTop = 0;
  } else if (SH.view === 'deployShip') {
    renderDeployShip(); SH.last = '';
  } else if (SH.view === 'deployRoad' || SH.view === 'deployRail') {
    renderDeploy(SH.view === 'deployRoad' ? 'road' : 'rail', SH.arg); SH.last = '';
  } else {
    if (SH.view === 'vehicle' && changed) startFollow(+SH.arg);
    const html = VIEW_FN[SH.view](SH.arg);
    body.innerHTML = html; SH.last = html;
    if (changed) body.scrollTop = 0;
  }
  updateToolbar(); renderCellbar();
}
function refreshSheet() {
  if (!SH.view || SH.touching) return;
  if (SH.view === 'token') { refreshTokenCard(); return; }
  if (!LIVE.has(SH.view)) return;
  const html = VIEW_FN[SH.view](SH.arg);
  if (html === SH.last) return;
  const body = $('shBody'), st = body.scrollTop;
  body.innerHTML = html; SH.last = html; body.scrollTop = st;
}

function updateToolbar() {
  const on = (id, v) => $(id).classList.toggle('active', !!v);
  on('tbRoad', state.tool === 'road'); on('tbRail', state.tool === 'rail'); on('tbObj', state.tool === 'object' || SH.view === 'objects');
  on('tbShip', SH.view === 'deployShip'); on('tbCar', SH.view === 'deployRoad'); on('tbTrain', SH.view === 'deployRail');
  on('tbCo', ['company', 'vehicles', 'vehicle', 'finance', 'infra', 'rivals', 'shop'].includes(SH.view)); on('tbMore', SH.view === 'more');
}

// ---------- společnost ----------
function infraStats() {
  let roadCells = 0, roadArms = 0, shared = 0, railCells = 0, railTracks = 0;
  for (const e of state.net.entries()) {
    const rec = e.rec, o = rec.own || { road: [], rail: 0 };
    if (rec.road && o.road.includes(state.me)) { roadCells++; roadArms += armsOf(rec.road).length; if (o.road.length > 1) shared++; }
    if (rec.rail.length && o.rail === state.me) { railCells++; railTracks += rec.rail.length; }
  }
  return { roadCells, roadArms, shared, railCells, railTracks, up: (roadUpkeepRates()[state.me] || 0) * 60 };
}
function paidTo(from, to) { const c = (state.paid[from] || {})[to] || {}; return { toll: c.toll || 0, fee: c.fee || 0, goods: c.goods || 0 }; }

function viewCompany() {
  const co = state.company || { name: 'Společnost' }, home = co.home ? tokenById(co.home) : null;
  const lm = lastMinute(state.me), units = myUnits(), probs = units.filter(unitProblem).length;
  const mine = state.map.tokens.filter(t => t.owner === state.me && !isCity(t) && !isDeposit(t)), mayor = state.map.tokens.filter(t => t.owner === state.me && isCity(t));
  let h = hdr('Moje společnost');
  h += `<div class="co-head"><div class="big" style="background:${playerColor(state.me)}"></div><div><b>${co.name}</b><span>${home ? 'Domovská obec: ' + home.name : ''}</span></div></div>`;
  h += `<div class="tiles"><div><small>Peníze</small><b>${fmtMoney(state.money)}</b></div><div><small>Za minutu</small><b class="${lm.rate >= 0 ? 'pos' : 'neg'}">${fmtSigned(lm.rate)}</b></div><div><small>Vozidel</small><b>${units.length}</b></div></div>`;
  if (state.money < BANKRUPT_WARN) h += `<div class="hint" style="color:#ff9a8a;margin:6px 0">⚠ Dluh: při ${fmtMoney(BANKRUPT_AT)} společnost automaticky zbankrotuje a zanikne.</div>`;
  h += `<button class="li" data-go="vehicles"><i>🚚</i><div><b>Vozidla (${units.length})</b><span class="st ${probs ? 'bad' : 'ok'}">${probs ? probs + ' s problémem' : (units.length ? 'vše jede' : 'zatím žádná nasazená')}</span></div><em>›</em></button>`;
  h += `<button class="li" data-go="finance"><i>💰</i><div><b>Finance</b><span>Výdaje a zisky, detailní rozpis</span></div><em>›</em></button>`;
  h += `<button class="li" data-go="infra"><i>🛣</i><div><b>Silnice a koleje</b><span>Moje síť a příjem z ní</span></div><em>›</em></button>`;
  h += `<button class="li" data-go="rivals"><i>👥</i><div><b>Ostatní společnosti</b><span>Příjmy, výdaje a co jim platím</span></div><em>›</em></button>`;
  h += `<button class="li" data-go="shop"><i>🛒</i><div><b>Obchod s vozidly</b><span>Sklad: ${ECON.ORDER.reduce((n, k) => n + (state.inv[k] || 0), 0)} ks</span></div><em>›</em></button>`;
  if (mine.length || mayor.length) {
    h += '<div class="sec">Moje podniky a města</div>';
    for (const t of [...mayor, ...mine]) h += `<button class="li sm" data-act="focus:${t.id}"><i>${TOKEN_TYPES[t.type].icon}</i><div><b>${t.name}</b><span>${isCity(t) ? 'starosta · ' + tokenLevelName(t) : 'úroveň ' + t.level}</span></div><em>›</em></button>`;
  }
  h += '<button class="li sm" data-act="dissolve"><i>🏳</i><div><b>Zrušit společnost</b><span>Silnice se stanou neudržované a časem zmizí</span></div></button>';
  h += `<div class="colorrow"><span>Barva společnosti</span><input type="color" data-color value="${playerColor(state.me)}"></div>`;
  return h;
}

function viewVehicles() {
  const list = myUnits().sort((a, b) => (!!unitProblem(b)) - (!!unitProblem(a)));
  let h = hdr(`Vozidla (${list.length})`);
  if (!list.length) h += '<div class="hint">Zatím nemáš žádné nasazené vozidlo. Použij tlačítko Auto nebo Vlak v dolní liště.</div>';
  for (const u of list) h += unitLi(u);
  return h;
}
function unitLi(u) {
  const prob = unitProblem(u), cls = prob ? 'bad' : (/^Jede/.test(u.status || '') ? 'ok' : ''), g = GOODS[u.goods];
  return `<button class="li" data-go="vehicle:${u.id}"><i>${unitIcon(u)}</i><div><b>${unitName(u)}${g ? ' · ' + g.name : ''}</b><span>${stName(u.A)} ⇄ ${stName(u.B)}</span><span class="st ${cls}">${u.status || ''}${u.loaded ? ' · naloženo' : ''}</span></div><em>›</em></button>`;
}

function viewVehicle(id) {
  const u = state.sim.units.find(x => x.id === +id);
  if (!u) return hdr('Vozidlo') + '<div class="hint">Tohle vozidlo už neexistuje (bylo staženo nebo zničeno).</div>';
  const g = GOODS[u.goods], wear = Math.round((1 - ageEff(u)) * 200), prob = unitProblem(u);
  const running = Math.round(u.price * 0.0005 * (1 + (u.age || 0) / AGE0) * 60);
  let h = hdr(`${unitIcon(u)} ${unitName(u)}`);
  h += `<div class="hint" style="margin:0 0 8px">${stName(u.A)} ⇄ ${stName(u.B)}</div>`;
  h += `<div class="tiles"><div><small>Náklad</small><b>${(u.amt || 0).toFixed(0)} / ${capEff(u).toFixed(0)} t</b></div><div><small>Opotřebení</small><b class="${wear > 40 ? 'neg' : ''}">${wear} %</b></div><div><small>Vyděláno</small><b class="pos">${fmtMoney(u.earned)}</b></div></div>`;
  h += `<div class="kv"><span>Stav</span><b class="${prob ? 'neg' : ''}">${u.status || '—'}</b></div>`;
  h += kvr('Zboží', g ? g.icon + ' ' + g.name : '—') + kvr('Počet cest', u.trips) + kvr('Délka trasy', Math.round(u.routeCells || 0) + ' polí');
  h += kvr('Zaplacené mýto', fmtMoney(u.tolls)) + kvr('Zaplacené vstupné', fmtMoney(u.fees)) + kvr('Hodnota vozidla', fmtMoney(u.price)) + kvr('Provoz za minutu', '−' + fmtMoney(running));
  h += `<div class="btnrow"><button class="${state.follow === u.id ? 'primary' : ''}" data-act="follow:${u.id}">${state.follow === u.id ? '📍 Sleduji' : '📍 Sledovat'}</button><button data-act="withdraw:${u.id}">Stáhnout</button></div>`;
  h += '<div class="sec">Trasa</div>';
  for (const t of [tokenById(u.A), tokenById(u.B)]) if (t) h += `<button class="li sm" data-act="focus:${t.id}"><i>${TOKEN_TYPES[t.type].icon}</i><div><b>${t.name}</b></div><em>›</em></button>`;
  return h;
}

function sparkSvg(pid) {
  const L = ledgerOf(pid), t = Math.floor(state.sim.t), n = 24, step = 5, vals = [];
  for (let i = n - 1; i >= 0; i--) { let s = 0; for (let k = 0; k < step; k++) { const b = L.bk[t - i * step - k]; if (b) s += b[0] - b[1]; } vals.push(s); }
  const mx = Math.max(1, ...vals.map(Math.abs));
  const pts = vals.map((v, i) => `${(i * 200 / (n - 1)).toFixed(1)},${(27 - v / mx * 24).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 200 54" preserveAspectRatio="none"><line x1="0" x2="200" y1="27" y2="27" stroke="#35536e" stroke-dasharray="3 3"/><polyline fill="none" stroke="#7cc0f4" stroke-width="2" points="${pts}"/></svg>`;
}
function viewFinance() {
  const L = ledgerOf(state.me), tot = ledgerTotals(state.me), lm = lastMinute(state.me);
  let h = hdr('Finance');
  h += `<div class="tiles"><div><small>Příjmy</small><b class="pos">${fmtMoney(tot.inc)}</b></div><div><small>Výdaje</small><b class="neg">${fmtMoney(tot.exp)}</b></div><div><small>Zisk</small><b class="${tot.inc - tot.exp >= 0 ? 'pos' : 'neg'}">${fmtSigned(tot.inc - tot.exp)}</b></div></div>`;
  h += `<div class="kv"><span>Posledních 60 s</span><b class="${lm.rate >= 0 ? 'pos' : 'neg'}">${fmtSigned(lm.rate)} / min</b></div>` + sparkSvg(state.me);
  const block = (title, obj, total, cls) => {
    const rows = Object.keys(obj).sort((a, b) => obj[b] - obj[a]);
    let s = `<div class="sec">${title}</div>`;
    if (!rows.length) return s + '<div class="hint">Zatím nic.</div>';
    for (const k of rows) s += `<div class="kv"><span>${LEDGER_NAMES[k] || k}</span><b class="${cls}">${fmtMoney(obj[k])} <small>${Math.round(obj[k] / Math.max(1, total) * 100)} %</small></b></div>`;
    return s;
  };
  h += block('Příjmy podle zdroje', L.inc, tot.inc, 'pos') + block('Výdaje podle druhu', L.exp, tot.exp, 'neg');
  h += `<button class="li" data-go="infra" style="margin-top:12px"><i>🛣</i><div><b>Silnice a koleje</b><span>Kolik mám sítě a jestli z ní mám příjem</span></div><em>›</em></button>`;
  return h;
}
function viewInfra() {
  const s = infraStats(), L = ledgerOf(state.me), toll = L.inc.tollIn || 0, paid = L.exp.tollOut || 0;
  let h = hdr('Silnice a koleje');
  h += `<div class="tiles"><div><small>Silnice</small><b>${s.roadCells} polí</b></div><div><small>Koleje</small><b>${s.railCells} polí</b></div><div><small>Údržba</small><b class="neg">−${fmtMoney(s.up)}/min</b></div></div>`;
  h += '<div class="sec">Silnice</div>' + kvr('Moje silnice', `${s.roadCells} polí · ${s.roadArms} ramen`) + kvr('Sdílené s jiným majitelem', s.shared + ' polí');
  h += kvr('Mýtné, které mi zaplatili cizí', `<span class="${toll > 0 ? 'pos' : ''}">${fmtMoney(toll)}</span>`);
  h += `<div class="hint">${toll > 0 ? 'Po tvých silnicích jezdí cizí vozidla a platí ti za každé pole.' : 'Zatím z nich nemáš žádný příjem. Po tvých silnicích zatím nejezdí nikdo cizí.'}</div>`;
  h += kvr('Mýtné za cizí silnice (já platím)', `<span class="${paid > 0 ? 'neg' : ''}">${fmtMoney(paid)}</span>`);
  h += '<div class="sec">Koleje</div>' + kvr('Moje koleje', `${s.railCells} polí · ${s.railTracks} tratí`);
  h += '<div class="hint">Po koleji smí jezdit jen její majitel, takže mýtné nepřináší. Kolej se vyplatí rychlostí a kapacitou vlaků.</div>';
  h += '<div class="sec">Další příjmy společnosti</div>';
  for (const k of ['feeIn', 'goodsSale', 'energy', 'cityfees']) h += kvr(LEDGER_NAMES[k], `<span class="${(L.inc[k] || 0) > 0 ? 'pos' : ''}">${fmtMoney(L.inc[k] || 0)}</span>`);
  return h;
}

function viewRivals() {
  let h = hdr('Ostatní společnosti');
  const others = Object.values(state.players).filter(p => p.id !== state.me);
  if (!others.length) h += '<div class="hint">Zatím tu nejsi nikdo jiný. Pošli kamarádům odkaz na hru – každý si založí vlastní společnost.</div>';
  for (const p of others) {
    const a = paidTo(state.me, p.id), b = paidTo(p.id, state.me), sum = a.toll + a.fee + a.goods, back = b.toll + b.fee + b.goods;
    h += `<div class="li static" style="border-left:5px solid ${p.color}"><i>🏢</i><div><b>${p.name}${p.online ? ' <small style="color:var(--ok)">● online</small>' : ''}</b><span>Příjmy ${fmtMoney(p.inc)} · Výdaje ${fmtMoney(p.exp)}</span><span>Já jim platím: <b class="${sum ? 'neg' : ''}">${fmtMoney(sum)}</b> <small>(mýto ${fmtMoney(a.toll)}, vstupné ${fmtMoney(a.fee)}, zboží ${fmtMoney(a.goods)})</small></span><span>Platí mně: <b class="${back ? 'pos' : ''}">${fmtMoney(back)}</b></span></div></div>`;
  }
  return h + '<div class="hint">Z cizích společností vidíš jen barvu, název a celkové příjmy a výdaje. Jejich silnice a koleje poznáš podle barvy lemování.</div>';
}

// ---------- obchod ----------
function viewShop() {
  const inv = ECON.ORDER.filter(k => state.inv[k] > 0).map(k => `${state.inv[k]}× ${itemLabel(k)}`);
  let h = hdr('Obchod s vozidly') + `<div class="tiles" style="grid-template-columns:1fr 1fr"><div><small>Peníze</small><b>${fmtMoney(state.money)}</b></div><div><small>Ve skladu</small><b>${inv.length ? inv.join(', ') : 'prázdný'}</b></div></div>`;
  const groups = [['Silniční vozidla', ['van', 'dump', 'kamion', 'kamionDump', 'flatbed', 'reefer', 'tanker']], ['Lodě (jen mezi přístavy)', ['ship1', 'ship2', 'ship4']], ['Lokomotivy', ['loco1', 'loco2', 'loco3', 'loco4']], ['Vagony', ['wagonCovered', 'wagonOpen', 'wagonTank']]];
  for (const [title, keys] of groups) {
    h += `<div class="sec">${title}</div>`;
    for (const k of keys) {
      const it = ECON.ITEMS[k];
      h += `<div class="shopitem"><div class="nm"><b>${it.name}</b><span>${it.sub}${it.cap ? ' · ' + it.cap + ' t' : ''}</span></div><button data-act="buy:${k}" ${state.money < it.price ? 'disabled' : ''}>${fmtMoney(it.price)}</button><div class="pr">${(state.inv[k] || 0) ? 've skladu ' + state.inv[k] + '×' : ''}</div></div>`;
    }
  }
  return h;
}
function buyItem(k) {
  const it = ECON.ITEMS[k];
  if (state.money < it.price) { say('Nemáš dost peněz na ' + it.name.toLowerCase(), true); return; }
  send({ t: 'buy', k: k });
}
function updateInventoryUI() { if (SH.view === 'shop') { SH.last = ''; renderSheet(); } }
function renderUnits() {}

// ---------- stavba objektů ----------
function recipeText(type) {
  if (TOKEN_TYPES[type].port) return 'Překladiště: přijímá a vydává jakékoli zboží, lodě jezdí jen mezi přístavy';
  const T = TOKEN_TYPES[type], ins = new Set(), outs = new Set();
  for (const ln of (T.lines || [])) { for (const g in (ln.in || {})) ins.add(g); for (const g in ln.out) outs.add(g); }
  const f = s => [...s].map(goodsName).join(', ');
  return (ins.size ? 'Potřebuje: ' + f(ins) + ' · ' : '') + 'Vyrábí: ' + f(outs);
}
function viewObjects() {
  let h = hdr('Postavit objekt');
  h += '<div class="hint" style="margin:0 0 8px">Postavit lze vždy jen úroveň 1. Jako zakladatel tam hned získáš velký vliv, ale konkurence ho časem může přebrat. Vyšší úroveň se získává povýšením.</div>';
  for (const type of OBJ_ORDER) {
    const T = TOKEN_TYPES[type], n = computeSites(type).length, dis = state.money < T.cost || !n;
    h += `<div class="shopitem"><div class="nm"><b>${T.icon} ${T.name}</b><span>${SITE_TXT[T.site] || ''} · ${recipeText(type)}</span></div><button data-act="obj:${type}" ${dis ? 'disabled' : ''}>${fmtMoney(T.cost)}</button><div class="pr">${n ? n + ' míst' : 'žádné volné místo'}</div></div>`;
  }
  return h;
}

// ---------- Více ----------
function viewMore() {
  let h = hdr('Více');
  h += '<div class="sec">Pohled na mapu</div><div class="seg">' + ['top', 'tilt'].map(v => `<button data-act="setview:${v}" class="${state.view === v ? 'on' : ''}">${VIEWS[v].name}</button>`).join('') + '</div>';
  h += `<button class="li sm" data-go="hwplan"><i>🛣</i><div><b>Dálniční síť</b><span>Stavba a plány dálnic, časy dokončení</span></div><em>›</em></button>`;
  h += `<button class="li sm" data-act="borders"><i>🗺</i><div><b>Hranice krajů a okresů: ${state.showBorders === false ? 'vypnuto' : 'zapnuto'}</b><span>Červeně kraje, čárkovaně okresy</span></div></button>`;
  h += `<button class="li sm" data-go="shop"><i>🛒</i><div><b>Obchod s vozidly</b></div><em>›</em></button>`;
  h += `<button class="li sm" data-act="rules"><i>📖</i><div><b>Pravidla hry</b><span>Jak se staví, omezení a ekonomika</span></div><em>›</em></button>`;
  h += `<button class="li sm" data-act="clearRoads"><i>🧹</i><div><b>Zbourat všechny moje silnice a koleje</b></div></button>`;
  h += `<button class="li sm" data-act="logout"><i>🚪</i><div><b>Odhlásit se</b><span>Přihlášen jako ${(state.company && state.company.name) || ''}</span></div></button>`;
  h += `<div class="hint" style="margin-top:14px">Hex Tycoon ${CFG.VERSION} · online hráčů: ${state.online || 1}<br>Ovládání: tahem posouváš mapu, dvěma prsty přibližuješ, klepnutím vybereš pole nebo token. Na počítači: kolečko = zoom, pravé tlačítko nebo mezerník = posun, 1 / 2 / X / B nástroje, Q / E otáčení, V pohled.</div>`;
  return h;
}

// ---------- vlastní akce ----------
function onUiClick(e) {
  const el = e.target.closest('[data-go],[data-act]'); if (!el || el.disabled) return;
  if (el.dataset.go) { const i = el.dataset.go.indexOf(':'); openSheet(i < 0 ? el.dataset.go : el.dataset.go.slice(0, i), i < 0 ? undefined : el.dataset.go.slice(i + 1)); return; }
  const parts = el.dataset.act.split(':'), act = parts[0], arg = parts[1];
  switch (act) {
    case 'back': sheetBack(); break;
    case 'close': closeSheet(); break;
    case 'buy': buyItem(arg); break;
    case 'focus': openToken(arg); break;
    case 'follow': { if (state.follow === +arg) state.follow = null; else startFollow(+arg); SH.last = ''; refreshSheet(); break; }
    case 'withdraw': {
      send({ t: 'withdraw', id: +arg }); state.follow = null; sheetBack(); break;
    }
    case 'obj': startObject(arg); break;
    case 'doBuild': confirmObject(); break;
    case 'tool': setTool(arg === 'back' ? (state.lastKind || 'road') : arg); break;
    case 'toolOff': setTool(null); break;
    case 'clearCell': clearSelectedCell(); break;
    case 'setview': setView(arg); SH.last = ''; renderSheet(); break;
    case 'rules': showRules(); break;
    case 'borders': state.showBorders = state.showBorders === false; try { localStorage.setItem('hx_borders', state.showBorders === false ? '0' : '1'); } catch (e) {} SH.last = ''; renderSheet(); dirty = true; break;
    case 'logout': doLogout(); break;
    case 'dissolve': if (confirm('Opravdu zrušit společnost?\n\nVozidla zmizí a všechny tvoje silnice a koleje se stanou neudržované – bez údržby se časem rozpadnou a zmizí i těm, kdo je používají. Návrat není možný, budeš si muset založit novou společnost.')) send({ t: 'dissolve' }); break;
    case 'clearRoads': clearMyRoads(); break;
  }
}

// ---------- spodní lišta u vybraného pole / nástroje ----------
function renderCellbar() {
  const bar = $('cellbar'); if (!bar) return;
  const t = state.tool;
  if (!t) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
  let txt = '', btns = '';
  if (t === 'object') {
    const T = TOKEN_TYPES[state.objType];
    if (state.objSite) { txt = `${T.icon} ${T.name} · ${fmtMoney(T.cost)}`; btns = `<button class="primary" data-act="doBuild" ${state.money < T.cost ? 'disabled' : ''}>🏗 Postavit</button>`; }
    else txt = `${T.icon} ${T.name}: klepni na označené místo (${state.sites.length})`;
  } else {
    const kindTxt = state.kind === 'rail' ? 'Koleje' : 'Silnice';
    if (t === 'bulldoze') txt = 'Bourání: vyber pole, pak konektor (střed smaže celé pole)';
    else if (!state.sel) txt = `${kindTxt}: klepni na pole`;
    else if (state.sel && hwxNote(state.sel)) txt = hwxNote(state.sel);
    else if (state.sel && roadOwnerNote(state.sel)) txt = roadOwnerNote(state.sel);
    else if (tokenAt(state.map, state.sel)) txt = 'Přípojky určuje hra – veď trať k bílému kroužku';
    else if (state.pick !== null) txt = 'Vyber druhý konektor';
    else txt = 'Vyber první konektor';
    btns = t === 'bulldoze' ? '<button class="on" data-act="tool:back">🧱 Stavět</button>' : '<button data-act="tool:bulldoze">🧹 Bourat</button>';
    if (state.sel && state.net.get(state.sel)) btns += '<button data-act="clearCell">Smazat pole</button>';
  }
  btns += '<button data-act="toolOff">✕</button>';
  const html = `<span>${txt}</span>${btns}`;
  if (bar._h !== html) { bar._h = html; bar.innerHTML = html; }
  bar.classList.remove('hidden');
}

// ---------- horní lišta a rychlý přehled ----------
function setSimSpeed() {}
function updateHud() {
  const m = Math.round(state.money);
  if (m !== UI.lastMoney) { UI.lastMoney = m; $('money').textContent = fmtMoney(m); }
  const now = performance.now();
  if (now - (UI.hudT || 0) > 500) { UI.hudT = now; hudSlow(); }
}
function hudSlow() {
  const lm = lastMinute(state.me), rt = $('rate');
  rt.textContent = fmtSigned(lm.rate) + ' / min'; rt.className = lm.rate >= 0 ? 'pos' : 'neg';
  $('coName').textContent = (state.company && state.company.name) || 'Společnost';
  $('coDot').style.background = playerColor(state.me);
  const units = myUnits(), probs = units.filter(unitProblem).length, home = state.company && state.company.home ? tokenById(state.company.home) : null;
  let q = `<button data-go="vehicles">🚚 ${units.length} ${units.length === 1 ? 'vozidlo' : units.length >= 2 && units.length <= 4 ? 'vozidla' : 'vozidel'}</button><button data-go="finance">${lm.rate >= 0 ? '📈' : '📉'} ${fmtSigned(lm.rate)}/min</button>`;
  if (probs) q += `<button class="alert" data-go="vehicles">⚠ ${probs} s problémem</button>`;
  if (home) q += `<button data-act="focus:${home.id}">🏠 ${home.name}</button>`;
  q += '<button data-go="rivals">👥 Ostatní</button>';
  const qe = $('quick'); if (qe._h !== q) { qe._h = q; qe.innerHTML = q; }
  refreshSheet();
}

// ---------- založení společnosti ----------

function initPanels() {
  $('ver').textContent = 'Hex Tycoon ' + CFG.VERSION; document.title = 'Hex Tycoon – ' + CFG.VERSION;
  for (const id of ['shBody', 'quick', 'cellbar']) $(id).addEventListener('click', onUiClick);
  $('sheet').addEventListener('pointerdown', () => { SH.touching = true; });
  window.addEventListener('pointerup', () => { SH.touching = false; });
  window.addEventListener('pointercancel', () => { SH.touching = false; });
  $('shBody').addEventListener('change', e => { if (e.target.matches('[data-color]')) send({ t: 'color', color: e.target.value }); });
  $('rulesBtn').addEventListener('click', () => showRules());
  $('tbRoad').addEventListener('click', () => setTool(state.tool === 'road' ? null : 'road'));
  $('tbRail').addEventListener('click', () => setTool(state.tool === 'rail' ? null : 'rail'));
  $('tbCar').addEventListener('click', () => toggleRoot('deployRoad'));
  $('tbTrain').addEventListener('click', () => toggleRoot('deployRail'));
  $('tbShip').addEventListener('click', () => toggleRoot('deployShip'));
  $('tbObj').addEventListener('click', () => { if (state.tool === 'object') setTool(null); else toggleRoot('objects'); });
  $('tbCo').addEventListener('click', () => toggleRoot('company'));
  $('tbMore').addEventListener('click', () => toggleRoot('more'));
  $('coBtn').addEventListener('click', () => toggleRoot('company'));
  updateToolbar();
}

function renderDeploy(kind, arg) {
  const body = $('shBody');
  const sts = placesOf(kind).filter(t => !isDeposit(t));
  const inv = state.inv;
  let html = hdr(kind === 'road' ? '🚚 Nasadit vozidlo' : '🚆 Nasadit vlak') + '<div id="shInner">';
  if (sts.length < 2) html += `<p class="warn">Potřebuješ aspoň dvě místa s ${kind === 'road' ? 'silniční' : 'železniční'} přípojkou, propojená ${kind === 'road' ? 'silnicí' : 'kolejí'}.</p>`;
  if (kind === 'road') {
    const have = ['van', 'dump', 'kamion', 'kamionDump', 'flatbed', 'reefer', 'tanker'].filter(k => inv[k] > 0);
    if (!have.length) html += '<p class="warn">Ve skladu nemáš žádné silniční vozidlo – kup si ho v obchodě.</p>';
    html += `<label>Vozidlo <select id="dpV">${opts(have, { v: x => x, t: x => `${itemLabel(x)} – ${ECON.ITEMS[x].sub} (${inv[x]}×)` })}</select></label>`;
  } else {
    const locos = ['loco1', 'loco2', 'loco3', 'loco4'].filter(k => inv[k] > 0);
    if (!locos.length) html += '<p class="warn">Ve skladu nemáš lokomotivu – kup si ji v obchodě.</p>';
    html += `<label>Lokomotiva <select id="dpL">${opts(locos, { v: x => x, t: x => `${itemLabel(x)} – táhne ${ECON.ITEMS[x].pull} (${inv[x]}×)` })}</select></label>`;
    html += `<label>Krytých vagonů <select id="dpC"></select></label><label>Otevřených vagonů <select id="dpO"></select></label><label>Cisternových vagonů <select id="dpT"></select></label><div id="dpInfo" class="info"></div>`;
  }
  html += '<h4 class="dph">Z (nakládka)</h4><div class="dpbox"><label>Okres <select id="dpAd"></select></label><label>Místo <select id="dpA"></select></label></div>';
  html += '<label>Zboží <select id="dpG"></select></label>';
  html += '<h4 class="dph">Do (vykládka)</h4><div class="dpbox"><label>Okres <select id="dpBd"></select></label><label>Místo <select id="dpB"></select></label></div>';
  html += '<div id="dpHint" class="info"></div>';
  html += '<div class="btns"><button id="dpGo" class="primary">Nasadit</button><button id="dpNo">Zavřít</button></div>';
  html += '<button class="li sm" data-go="shop" style="margin-top:10px"><i>🛒</i><div><b>Obchod s vozidly</b></div><em>›</em></button></div>';
  body.innerHTML = html;

  // ---- filtry: okres → místo → zboží → okres → místo. Zboží vždy omezuje druhou stranu (jen kdo ho vyrábí / přijímá) ----
  const [presetId, presetSide] = String(arg === undefined ? '' : arg).split(':');
  const preset = presetId ? tokenById(+presetId) : null;
  const mode = presetSide === 'to' ? 'B' : 'A';                      // která strana určuje nabídku zboží
  const home = state.company && state.company.home ? tokenById(state.company.home) : null;
  const hasD = !!state.map.districts, dName = i => (i < 0 ? 'Všechny okresy' : state.map.districts[i].name);
  const tier = t => (isCity(t) ? 1 : 0);
  const sortPl = (a, b) => tier(a) - tier(b) || (isCity(a) ? b.level - a.level : 0) || a.name.localeCompare(b.name, 'cs');
  const prod = g => sts.filter(t => tokenOutputs(t).includes(g)), cons = g => sts.filter(t => tokenAccepts(t).includes(g));
  const driverList = sts.filter(t => mode === 'A' ? tokenOutputs(t).some(g => cons(g).some(x => x.id !== t.id)) : tokenAccepts(t).some(g => prod(g).some(x => x.id !== t.id)));
  const goodsOf = tk => mode === 'A' ? tokenOutputs(tk).filter(g => cons(g).some(x => x.id !== tk.id)) : tokenAccepts(tk).filter(g => prod(g).some(x => x.id !== tk.id));
  const otherList = (g, tk) => (mode === 'A' ? cons(g) : prod(g)).filter(x => x.id !== tk.id);
  const drv = mode === 'A' ? { d: 'dpAd', p: 'dpA' } : { d: 'dpBd', p: 'dpB' }, oth = mode === 'A' ? { d: 'dpBd', p: 'dpB' } : { d: 'dpAd', p: 'dpA' };
  let touched = false;
  const fillDistricts = (dId, list, prefer) => {
    const dsel = $(dId);
    if (!hasD) { dsel.parentNode.style.display = 'none'; dsel.innerHTML = '<option value="-1"></option>'; return; }
    const ds = [...new Set(list.map(t => t.d))].filter(d => d !== undefined).sort((a, b) => dName(a).localeCompare(dName(b), 'cs'));
    const keep = dsel.value;
    dsel.innerHTML = `<option value="-1">Všechny okresy (${list.length})</option>` + ds.map(d => `<option value="${d}">${dName(d)} (${list.filter(t => t.d === d).length})</option>`).join('');
    const want = prefer !== undefined ? String(prefer) : keep;
    dsel.value = want === '-1' || ds.map(String).includes(want) ? want : '-1';
  };
  const fillPlaces = (dId, pId, list, prefer) => {
    const dv = hasD ? +$(dId).value : -1, psel = $(pId), keep = psel.value;
    const pl = list.filter(t => dv < 0 || t.d === dv).sort(sortPl);
    psel.innerHTML = pl.length ? opts(pl, { v: x => x.id, t: placeLabel }) : '<option value="">– žádné místo –</option>';
    const want = prefer !== undefined ? String(prefer) : keep;
    if (pl.some(t => String(t.id) === want)) psel.value = want;
  };
  // vozidlo (nebo vagony) se samo přepne podle druhu zboží, pokud je ve skladu odpovídající
  const autoVehicle = () => {
    const g = $('dpG').value; if (!g || classOk(g)) return;
    const cls = GOODS[g].cls;
    if (kind === 'road') {
      const sel = $('dpV'), o = [...sel.options].find(x => ECON.ITEMS[x.value].cargo === cls);
      if (o) sel.value = o.value;
    } else {
      const id = cls === 'goods' ? 'dpC' : cls === 'bulk' ? 'dpO' : cls === 'liquid' ? 'dpT' : null, el = id ? $(id) : null;
      if (el && el.options.length > 1) { el.value = '1'; if ($('dpL')) $('dpL').dispatchEvent(new Event('change')); }
    }
  };
  const hint = () => {
    autoVehicle();
    const g = $('dpG').value, ta = tokenById(+$('dpA').value), tb = tokenById(+$('dpB').value);
    let t = '';
    if (!g) t = mode === 'A' ? 'Z tohoto místa nelze nic vozit – nikdo nepřijímá to, co vyrábí.' : 'Do tohoto místa nelze nic vozit – nikdo nevyrábí to, co přijímá.';
    else if (kind === 'rail' && (GOODS[g].cls === 'flat' || GOODS[g].cls === 'cold')) t = `${GOODS[g].name} se zatím převáží jen po silnici (${CLS_NAME[GOODS[g].cls]}).`;
    else if (!classOk(g)) t = `Toto zboží je ${CLS_NAME[GOODS[g].cls]} – vyber odpovídající vozidlo${kind === 'rail' ? ' / vagony' : ''}.`;
    else if (ta) t = `Skladem v ${ta.name}: ${(ta.stock[g] || 0).toFixed(0)} t · hodnota zboží ×${GOODS[g].value}`;
    if (ta && tb && ta.id === tb.id) t = 'Vyber dvě různá místa.';
    $('dpHint').textContent = t;
  };
  const buildOther = () => {
    const tk = tokenById(+$(drv.p).value), g = $('dpG').value, list = tk && g ? otherList(g, tk) : [];
    fillDistricts(oth.d, list, touched ? undefined : (tk ? tk.d : undefined));
    fillPlaces(oth.d, oth.p, list);
    hint();
  };
  const buildGoods = () => {
    const tk = tokenById(+$(drv.p).value), gs = tk ? goodsOf(tk) : [], sel = $('dpG'), keep = sel.value;
    sel.innerHTML = gs.length ? gs.map(g => `<option value="${g}">${GOODS[g].icon} ${GOODS[g].name} (${CLS_NAME[GOODS[g].cls].split(' ')[0]})</option>`).join('') : '<option value="">– nic, co by šlo vozit –</option>';
    if (gs.includes(keep)) sel.value = keep;
    buildOther();
  };
  const buildDriver = first => {
    const pd = first ? (preset && driverList.some(t => t.id === preset.id) ? preset.d : (home ? home.d : undefined)) : undefined;
    fillDistricts(drv.d, driverList, pd);
    fillPlaces(drv.d, drv.p, driverList, first && preset && driverList.some(t => t.id === preset.id) ? preset.id : undefined);
    buildGoods();
  };
  const refreshGoods = hint;

  const classOk = g => {
    const cls = GOODS[g].cls;
    if (kind === 'road') { const m = $('dpV') && $('dpV').value; return m && ECON.ITEMS[m].cargo === cls; }
    return cls === 'goods' ? (+$('dpC').value || 0) > 0 : cls === 'bulk' ? (+$('dpO').value || 0) > 0 : cls === 'liquid' ? (+$('dpT').value || 0) > 0 : false;
  };
  if (kind === 'rail') {
    const refresh = () => {
      const lk = $('dpL').value; if (!lk) return;
      const pull = ECON.ITEMS[lk].pull;
      const keys = [['dpC', 'wagonCovered'], ['dpO', 'wagonOpen'], ['dpT', 'wagonTank']];
      const cur = {}; keys.forEach(([id]) => cur[id] = +$(id).value || 0);
      keys.forEach(([id, key]) => {
        const other = keys.reduce((n, [i2]) => n + (i2 === id ? 0 : (+$(i2).value || 0)), 0);
        const max = Math.max(0, Math.min(inv[key] || 0, pull - other)), v = Math.min(cur[id], max);
        $(id).innerHTML = Array.from({ length: max + 1 }, (_, i) => `<option value="${i}">${i}</option>`).join(''); $(id).value = v;
      });
      const n = keys.reduce((a, [id]) => a + (+$(id).value || 0), 0);
      $('dpInfo').textContent = `Vagonů: ${n} z ${pull}; odbavení vlaku trvá ${n}× déle než jednoho vagonu`;
      refreshGoods();
    };
    if ($('dpL')) { ['dpL', 'dpC', 'dpO', 'dpT'].forEach(id => $(id).addEventListener('change', refresh)); refresh(); }
  } else { $('dpV').addEventListener('change', refreshGoods); }
  $(drv.d).addEventListener('change', () => { fillPlaces(drv.d, drv.p, driverList); buildGoods(); });
  $(drv.p).addEventListener('change', buildGoods);
  $('dpG').addEventListener('change', buildOther);
  $(oth.d).addEventListener('change', () => { touched = true; const tk = tokenById(+$(drv.p).value), g = $('dpG').value; fillPlaces(oth.d, oth.p, tk && g ? otherList(g, tk) : []); hint(); });
  $(oth.p).addEventListener('change', hint);
  buildDriver(true);
  $('dpNo').onclick = () => closeSheet();
  $('dpGo').onclick = () => {
    const A = +$('dpA').value, B = +$('dpB').value, g = $('dpG').value;
    if (!A || !B || A === B) { say('Vyber dvě různá místa', true); return; }
    if (!g) { say('Vyber zboží, které jde z A do B', true); return; }
    if (!classOk(g)) { say('Vozidlo / vagony neodpovídají druhu zboží', true); return; }
    let spec;
    if (kind === 'road') {
      const m = $('dpV') && $('dpV').value; if (!m) { say('Nemáš co nasadit', true); return; }
      spec = { kind: 'road', model: m, A, B, goods: g };
    } else {
      const lk = $('dpL') && $('dpL').value; if (!lk) { say('Nemáš lokomotivu', true); return; }
      const nc = +$('dpC').value || 0, no = +$('dpO').value || 0, nt = +$('dpT').value || 0;
      if (nc + no + nt < 1) { say('Přidej aspoň jeden vagon', true); return; }
      spec = { kind: 'rail', items: [lk, ...Array(nc).fill('wagonCovered'), ...Array(no).fill('wagonOpen'), ...Array(nt).fill('wagonTank')], A, B, goods: g };
    }
    send({ t: 'deploy', spec: spec });
  };
}




// Kdo vlastní silnici / koleje ve vybraném poli (aby bylo vidět, kde se platí mýto).
function hwxNote(cell) {
  const h = typeof hwxAt === 'function' ? hwxAt(state.map, cell) : null;
  if (!h || h.st === 'built') return '';
  const eta = h.t1 !== undefined ? ' · hotovo za ' + fmtEta(h.t1 - state.sim.t) : '';
  return h.st === 'cons' ? '🚧 Dálnice ve výstavbě' + eta + ' · napojit ji půjde až po dokončení' : '📐 Plánovaná dálnice' + eta + ' · stavba začne za ' + fmtEta(h.t0 - state.sim.t);
}
function roadOwnerNote(cell) {
  const rec = state.net.get(cell); if (!rec) return '';
  const o = rec.own || { road: [], rail: 0 }, parts = [];
  if (rec.road && o.road.length) { const names = o.road.map(p => (p === state.me ? 'tvoje' : playerName(p))).join(' + '); const foreign = o.road.some(p => p !== state.me); parts.push('Silnice: ' + names + (foreign && !o.road.includes(state.me) ? ' · průjezd ' + fmtMoney(TOLL) : '')); }
  if (rec.rail.length && o.rail) parts.push('Koleje: ' + (o.rail === state.me ? 'tvoje' : playerName(o.rail) + ' (jezdit smí jen majitel)'));
  if (!parts.length && ((rec.road && !o.road.length) || (rec.rail.length && !o.rail)) && !hwxProtected(state.map, cell)) return 'Neudržovaná cesta bez majitele – časem zmizí';
  return parts.join(' · ');
}


// ---------- nasazení lodi: přístav A → přístav B, náklad podle počtu skladů lodi ----------
function renderDeployShip() {
  const body = $('shBody'), ports = state.map.tokens.filter(isPort), inv = state.inv;
  const have = ['ship1', 'ship2', 'ship4'].filter(k => inv[k] > 0);
  const poOpts = ports.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  let h = hdr('🚢 Nasadit loď') + '<div id="shInner">';
  if (ports.length < 2) h += '<p class="warn">Na mapě musí být aspoň dva přístavy.</p>';
  if (!have.length) h += '<p class="warn">Ve skladu nemáš žádnou loď – kup si ji v obchodě.</p>';
  h += `<label>Loď <select id="dsM">${have.map(k => `<option value="${k}">${itemLabel(k)} – ${ECON.ITEMS[k].sub}, ${ECON.ITEMS[k].cap} t (${inv[k]}×)</option>`).join('')}</select></label>`;
  h += `<h4 class="dph">Z (nakládka)</h4><label>Přístav <select id="dsA">${poOpts}</select></label>`;
  h += `<h4 class="dph">Do (vykládka)</h4><label>Přístav <select id="dsB">${poOpts}</select></label>`;
  h += '<h4 class="dph">Zboží (každý sklad lodi jeden druh)</h4><div id="dsG"></div><div id="dsHint" class="info"></div>';
  h += '<div class="btns"><button id="dsGo" class="primary">Vyplout</button><button id="dsNo">Zavřít</button></div>';
  h += '<button class="li sm" data-go="shop" style="margin-top:10px"><i>🛒</i><div><b>Obchod s vozidly</b></div><em>›</em></button></div>';
  body.innerHTML = h;
  if (ports.length > 1 && $('dsB').options.length > 1) $('dsB').selectedIndex = 1;
  const fillG = () => {
    const m = $('dsM') && $('dsM').value, n = m ? ECON.ITEMS[m].holds : 0;
    $('dsG').innerHTML = Array.from({ length: n }, (_, i) => `<label>Sklad ${i + 1} <select class="dsGs"><option value="">– nic –</option>${TRADE_GOODS.map(g => `<option value="${g}">${GOODS[g].icon} ${GOODS[g].name}</option>`).join('')}</select></label>`).join('');
    const sels = $('dsG').querySelectorAll('select'); if (sels[0]) sels[0].selectedIndex = 1;
    sels.forEach(s => s.addEventListener('change', hint)); hint();
  };
  const hint = () => {
    const a = tokenById(+$('dsA').value), g = [...$('dsG').querySelectorAll('select')].map(s => s.value).filter(Boolean);
    $('dsHint').textContent = a && g.length ? 'Skladem v ' + a.name + ': ' + g.map(x => GOODS[x].name + ' ' + (a.stock[x] || 0).toFixed(0) + ' t').join(', ') : 'Vyber aspoň jedno zboží.';
  };
  if ($('dsM')) { $('dsM').addEventListener('change', fillG); fillG(); }
  $('dsA').addEventListener('change', hint);
  $('dsNo').onclick = () => closeSheet();
  $('dsGo').onclick = () => {
    const A = +$('dsA').value, B = +$('dsB').value, m = $('dsM') && $('dsM').value;
    const gl = [...new Set([...$('dsG').querySelectorAll('select')].map(s => s.value).filter(Boolean))];
    if (!m) { say('Nemáš co nasadit', true); return; }
    if (!A || !B || A === B) { say('Vyber dva různé přístavy', true); return; }
    if (!gl.length) { say('Vyber zboží', true); return; }
    send({ t: 'deploy', spec: { kind: 'ship', model: m, A: A, B: B, goodsList: gl } });
  };
}


// ---------- přehled dálnic: hotové / ve výstavbě / plánované, odhad dokončení ----------
function fmtEta(sec) { const m = Math.max(0, Math.round(sec / 60)); return m < 1 ? 'do minuty' : m + ' min'; }
function viewHwPlan() {
  const map = state.map; let h = hdr('🛣 Dálniční síť');
  if (!map || !map.hwx) return h + '<div class="hint">Na této mapě nejsou dálnice.</div>';
  const t = state.sim.t, P = hwxProgress(map, t), ids = Object.keys(P).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
  let tot = { built: 0, cons: 0, plan: 0 }; for (const id of ids) for (const k in tot) tot[k] += P[id][k];
  h += `<div class="tiles"><div><small>Hotové</small><b>${tot.built}</b></div><div><small>Ve výstavbě</small><b>${tot.cons}</b></div><div><small>Plánované</small><b>${tot.plan}</b></div></div>`;
  h += '<div class="hint" style="margin:6px 0">Hotové úseky jsou zpoplatněné. Rozestavěné jsou hnědé s oranžovými značkami, plánované čárkované. Napojení silnic na úsek je možné až po dokončení.</div>';
  for (const id of ids) {
    const r = P[id], n = r.built + r.cons + r.plan, pct = Math.round(r.built / n * 100), name = (map.hwNames && map.hwNames[id]) || id;
    const eta = r.cons + r.plan > 0 ? 'dokončení za ' + fmtEta(r.done - t) : 'hotová';
    h += `<div class="li sm" style="display:block"><b>${id} · ${name}</b><span style="display:block">${r.built} hotovo · ${r.cons} ve stavbě · ${r.plan} plán · ${eta}</span><div style="height:5px;border-radius:3px;background:#243447;margin-top:5px"><div style="height:5px;border-radius:3px;width:${pct}%;background:${pct === 100 ? '#46c46a' : '#f0a63a'}"></div></div></div>`;
  }
  return h;
}
