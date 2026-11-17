// Karta města / průmyslu a pomocné funkce rozhraní (panely, lišta a nasazení jsou v panels.js).

const $ = id => document.getElementById(id);
const UI = { lastMoney: null, hudT: 0, cardId: null, cardSig: null };

function itemLabel(k) { return ECON.ITEMS[k].name; }
function placeLabel(t) { return `${TOKEN_TYPES[t.type].icon} ${t.name}`; }

function unitName(u) { return u.kind !== 'rail' ? itemLabel(u.model) : `Vlak (${itemLabel(u.items[0])}, ${u.items.length - 1} vag.)`; }
function ageTxt(u) { const e = ageEff(u); return e < 0.999 ? ` · opotřebení ${Math.round((1 - e) * 200)} %` : ''; }
function stName(id) { const t = tokenById(id); return t ? t.name : '?'; }

// ---------- karta města / průmyslu ----------

function slotsHtml(tk, kind) {
  if (isCity(tk)) return `<div class="row"><span>${kind === 'road' ? 'Silniční vozidla uvnitř' : 'Vlaky uvnitř'}</span><span>${tk.occ[kind].length} <small>(bez omezení)</small></span></div>`;
  const cap = tk[kind].length * 2;
  let h = '<div class="slots">';
  for (let i = 0; i < Math.max(cap, 2); i++) h += `<span class="slot ${i < tk.occ[kind].length ? 'busy' : ''} ${i >= cap ? 'off' : ''}">${i < tk.occ[kind].length ? (kind === 'road' ? '🚚' : '🚆') : ''}</span>`;
  return h + `<span>${tk.occ[kind].length} / ${cap}</span></div>`;
}
function bar(v, max, col) { return `<div class="bar"><i style="width:${Math.max(0, Math.min(100, v / max * 100))}%;background:${col || 'var(--sign)'}"></i></div>`; }
function ownerBadge(tk) { return tk.owner ? `<span class="own" style="border-color:${playerColor(tk.owner)};color:${playerColor(tk.owner)}">${playerName(tk.owner)}</span>` : '<span class="own">nezávislý</span>'; }
function checklist(rows) { return rows.map(r => `<div class="req ${r.ok ? 'ok' : ''}">${r.ok ? '✔' : '✖'} ${r.t}</div>`).join(''); }
function stockRows(tk) {
  const T = TOKEN_TYPES[tk.type], gs = new Set();
  if (T.port) { let h = ''; for (const g of TRADE_GOODS) { const have = tk.stock[g] || 0; if (have > 0.05) h += `<div class="row"><span>${GOODS[g].icon} ${GOODS[g].name}</span><span>${have.toFixed(0)} t</span></div>`; } return h || '<div class="hint">Sklad přístavu je prázdný. Zboží sem přivezou auta nebo lodě.</div>'; }
  for (const g of tokenAccepts(tk)) gs.add(g); for (const g of tokenOutputs(tk)) gs.add(g);
  if (!gs.size) return '';
  let h = '';
  for (const g of gs) {
    const have = tk.stock[g] || 0, inn = tokenAccepts(tk).includes(g), out = tokenOutputs(tk).includes(g);
    h += `<div class="row"><span>${GOODS[g].icon} ${GOODS[g].name} <small>${inn && !out ? '← přijímá' : out && !inn ? '→ vyrábí' : ''}</small></span><span>${have.toFixed(0)} t</span></div>`;
  }
  return h;
}

function refreshTokenCard(force) {
  const tk = UI.cardId ? tokenById(UI.cardId) : null;
  const el = $('tcard');
  if (!el || SH.view !== 'token') return;
  if (!tk) return;
  if (!force && SH.touching) return;
  // během tažení posuvníku se karta nepřekresluje
  if (!force && el.contains(document.activeElement) && document.activeElement.type === 'range') { updateCardLive(tk); return; }
  const T = TOKEN_TYPES[tk.type], maxL = tokenMaxLevel(tk), city = isCity(tk), dep = isDeposit(tk);
  el.style.setProperty('--sign', T.sign);
  const portTxt = k => (k.length ? k.map(e => ({ 0: 'východ', 2: 'sever', 4: 'západ', 6: 'jih' }[e & 7])).join(', ') : '–');
  const mine = tk.owner === state.me;
  const inside = state.sim.units.filter(u => u.owner && u.hidden && ((u.at === 'A' ? u.A : u.B) === tk.id) && (u.state === 'wait' || u.state === 'dwell' || u.state === 'ready'));
  const waiting = state.sim.units.filter(u => u.owner && u.state === 'hold' && (u.at === 'A' ? u.B : u.A) === tk.id);
  let h = `<div class="th">${SH.stack.length ? '<button class="bk" id="tcBack">←</button>' : ''}<div class="ic">${T.icon}</div><div><b>${tk.name}</b><span>${city ? tokenLevelName(tk) : dep ? 'ložisko (nikdo tu zatím nepodniká)' : 'Průmysl · úroveň ' + tk.level}</span></div><button class="x" id="tcX">✕</button></div>`;
  if (!dep) h += `<div class="lv">${Array.from({ length: maxL }, (_, i) => `<i class="${i < tk.level ? 'on' : ''}"></i>`).join('')}</div>`;
  if (!dep) h += `<div class="row"><span>${city ? 'Starosta' : 'Majitel'}</span><span>${ownerBadge(tk)}</span></div>`;

  if (dep) {
    const nt = DEPOSIT_BUILD[tk.type], cost = TOKEN_TYPES[nt].cost;
    h += `<div class="hint">Tady lze postavit <b>${TOKEN_TYPES[nt].name}</b>. Bude to tvůj podnik: sám rozhodneš o vstupném a o tom, kdo smí vjet.</div>`;
    h += `<button class="up" id="tcBuild" ${state.money < cost ? 'disabled' : ''}>🏗 Postavit ${TOKEN_TYPES[nt].name} (${fmtMoney(cost)})</button>`;
  } else {
    h += `<div class="row"><span>Doba odbavení 1 vozidla / vagonu</span><span>${tokenDwell(tk).toFixed(1)} s</span></div>`;
    h += `<div class="row"><span>Odbaveno vozidel</span><span>${tk.visits || 0}</span></div>`;
    h += '<h4>Přípojky (pevné, určila hra)</h4>';
    h += `<div class="ports">Na této úrovni smí: ${rulesText(tk)}<br>Silnice: ${portTxt(tk.road)} · Koleje: ${portTxt(tk.rail)}</div>`;
    h += '<h4>Obsazenost</h4>' + (tk.road.length ? slotsHtml(tk, 'road') : '') + (tk.rail.length ? slotsHtml(tk, 'rail') : '');

    // ---- sklad a výroba ----
    h += '<h4>Zboží</h4>' + stockRows(tk);
    {   // rychlé nasazení: místo se předvyplní tímto podnikem
      const outs = tokenOutputs(tk).length > 0, ins = tokenAccepts(tk).length > 0;
      const bt = (view, side, ico, label) => `<button class="li sm" data-go="${view}:${tk.id}:${side}"><i>${ico}</i><div><b>${label}</b></div><em>›</em></button>`;
      let q = '';
      if (tk.road.length) { if (outs) q += bt('deployRoad', 'from', '🚚', 'Vozit odsud autem'); if (ins) q += bt('deployRoad', 'to', '🚚', 'Vozit sem autem'); }
      if (tk.rail.length) { if (outs) q += bt('deployRail', 'from', '🚆', 'Vozit odsud vlakem'); if (ins) q += bt('deployRail', 'to', '🚆', 'Vozit sem vlakem'); }
      if (q) h += '<h4>Nasadit vozidlo</h4>' + q;
    }
    if (city) {
      h += `<div class="row"><span>Spokojenost se zásobováním</span><span id="cSat">${Math.round(tk.sat * 100)} %</span></div>${bar(tk.sat, 1)}`;
      h += `<div class="row"><span>Elektřina</span><span>${(tk.power || 0) >= 0.9 ? '✔ dodává elektrárna' : (tk.power || 0) > 0.4 ? 'záložní zdroj' : '✖ výpadek'}</span></div>`;
      h += `<div class="row"><span>Prosperita</span><span id="cPro">${Math.floor(tk.prosp)} / 100</span></div>${bar(tk.prosp, 100)}`;
      h += `<div class="row"><span>Cement dodán</span><span id="cCem">${Math.floor(tk.cementIn)} t</span></div>`;
    } else {
      if (T.lines.length > 1 && !T.auto) {
        h += '<h4>Poměr výroby</h4>';
        for (const ln of T.lines) {
          const v = Math.round((tk.share[ln.id] || 0) * 100);
          h += `<div class="sl"><span>${ln.label}</span><input type="range" min="0" max="100" step="5" value="${v}" data-line="${ln.id}" ${mine ? '' : 'disabled'}><b>${v} %</b></div>`;
        }
        if (!mine) h += '<div class="hint">Poměr výroby nastavuje majitel.</div>';
      } else if (T.auto) h += '<div class="hint">Elektrárna spaluje, co jí dovezeš (uhlí nebo pelety). Elektřina jde po vedení do města; platí ti ji majitel.</div>';
      h += `<div class="row"><span>Stav výroby</span><span id="cRun">${tk.running ? '● běží' : '○ stojí (chybí vstup / plný sklad)'}</span></div>`;
    }

    // ---- vliv ----
    h += '<h4>Vliv v místě</h4>';
    for (const p of pidList().filter(p => p === state.me || inflOf(tk, p) >= 1)) h += `<div class="row"><span><i class="pdot" style="background:${playerColor(p)}"></i>${playerName(p)}</span><span>${Math.floor(inflOf(tk, p))}</span></div>${bar(inflOf(tk, p), 400, playerColor(p))}`;
    h += '<div class="hint">Vliv roste, když tu nakládáš a vykládáš zboží, a s časem slábne.</div>';

    // ---- vstup / poplatek ----
    if (city) {
      if (mine) {
        const f = tk.access.fee || 0;
        h += `<h4>Poplatek za vjezd (jsi starosta)</h4><div class="sl"><span>Poplatek</span><input type="range" min="0" max="${FEE_MAX}" step="1" value="${f}" id="feeR"><b id="feeV">${f} Kč</b></div>`;
        h += `<div class="hint" id="feeHint"></div>`;
      } else h += `<div class="row"><span>Poplatek za vjezd</span><span>${tk.access.fee || 0} Kč / vagon</span></div><div class="hint">Do města vjede kdokoli; majitel určuje jen poplatek.</div>`;
    } else if (tk.owner) {
      if (mine) {
        const f = tk.access.fee || 0;
        h += `<h4>Vjezd cizích dopravců (tvůj podnik)</h4>`;
        h += `<div class="seg"><button data-acc="open" class="${!tk.access.closed ? 'on' : ''}">Povolit</button><button data-acc="closed" class="${tk.access.closed ? 'on' : ''}">Zakázat</button></div>`;
        if (!tk.access.closed) h += `<div class="sl"><span>Poplatek</span><input type="range" min="0" max="${FEE_MAX}" step="1" value="${f}" id="feeR"><b id="feeV">${f} Kč</b></div>`;
        h += `<div class="row"><span>Vybráno na poplatcích</span><span>${fmtMoney(tk.earnedFees)}</span></div>`;
      } else h += `<div class="row"><span>Vjezd cizích</span><span>${tk.access.closed ? 'zakázán' : (tk.access.fee || 0) + ' Kč / vagon'}</span></div>`;
    }

    // ---- převzetí nezávislého podniku ----
    if (!city && !tk.owner) {
      const ok = inflOf(tk, state.me) >= OWN_MIN;
      h += `<div class="req ${ok ? 'ok' : ''}">${ok ? '✔' : '✖'} Vliv ${Math.floor(inflOf(tk, state.me))} / ${OWN_MIN}</div><button class="up" id="tcTake" ${ok ? '' : 'disabled'}>🤝 Převzít podnik</button>`;
    }

    // ---- volby ve městě ----
    if (city) {
      const left = Math.max(0, ELECTION_T - (state.sim.t - tk.lastElect));
      h += `<h4>Volby</h4><div class="row"><span>Příští volby za</span><span id="cEl">${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}</span></div>`;
      const cd = tk.campCd > 0 ? ` (${Math.ceil(tk.campCd)} s)` : '';
      h += `<button class="up" id="tcCamp" ${(state.money < CAMPAIGN_COST || tk.campCd > 0) ? 'disabled' : ''}>📣 Volební kampaň (${fmtMoney(CAMPAIGN_COST)}, +${CAMPAIGN_INFL} vlivu)${cd}</button>`;
      h += `<div class="hint">Starostou se stane ten, kdo má nejvíc vlivu (úřadující má malý náskok). Starosta, který drží vysoký poplatek (nad ${FAIR_FEE} Kč), ztrácí body – lidé ho nemají rádi.</div>`;
    }

    // ---- povýšení ----
    if (tk.level < maxL) {
      const chk = upgradeCheck(tk, state.me);
      h += `<h4>Povýšení na úroveň ${tk.level + 1}</h4>` + checklist(chk.rows);
      h += `<button class="up" id="tcUp" ${chk.ok ? '' : 'disabled'}>⬆ Povýšit (${fmtMoney(chk.req.cost)})</button>`;
      h += `<div class="hint">${city ? 'Povýšení města je drahé a vyžaduje starostu, prosperitu a cement.' : 'Povýšení přidá přípojku a zrychlí odbavení.'}</div>`;
    } else h += '<div class="hint">Nejvyšší úroveň.</div>';
  }
  if (!dep) {
    const linked = state.sim.units.filter(u => u.owner && (u.A === tk.id || u.B === tk.id));
    const sup = linked.filter(u => u.B === tk.id), tak = linked.filter(u => u.A === tk.id);
    const li = u => u.pid === state.me
      ? `<button class="li sm" data-go="vehicle:${u.id}"><i>${unitIcon(u)}</i><div><b>${unitName(u)} · ${GOODS[u.goods] ? GOODS[u.goods].name : ''}</b><span class="st">${u.status || ''}</span></div><em>›</em></button>`
      : `<div class="li sm static" style="border-left:4px solid ${playerColor(u.pid)}"><i>${unitIcon(u)}</i><div><b>${playerName(u.pid)} · ${GOODS[u.goods] ? GOODS[u.goods].name : ''}</b><span class="st">${u.status || ''}</span></div></div>`;
    h += `<h4>Zásobují ho (${sup.length})</h4>` + (sup.length ? sup.map(li).join('') : '<div class="hint">Nikdo sem zatím nic nevozí.</div>');
    h += `<h4>Berou z něj (${tak.length})</h4>` + (tak.length ? tak.map(li).join('') : '<div class="hint">Nikdo odsud nic nevozí.</div>');
    if (waiting.length) h += `<div class="hint" style="color:var(--warn)">Před vjezdem čeká: ${waiting.length}</div>`;
  }
  if (!force && el._h === h) return;
  const body = $('shBody'), keepTop = body.scrollTop;
  el._h = h; el.innerHTML = h; body.scrollTop = keepTop;
  $('tcX').onclick = () => closeSheet();
  if ($('tcBack')) $('tcBack').onclick = () => sheetBack();
  const q = id => $(id);
  if (q('tcUp')) q('tcUp').onclick = () => upgradeToken(tk);
  if (q('tcBuild')) q('tcBuild').onclick = () => {
    const nt = DEPOSIT_BUILD[tk.type], cost = TOKEN_TYPES[nt].cost;
    if (state.money < cost) return; send({ t: 'depBuild', tk: tk.id });
  };
  if (q('tcTake')) q('tcTake').onclick = () => send({ t: 'take', tk: tk.id });
  if (q('tcCamp')) q('tcCamp').onclick = () => { if (state.money < CAMPAIGN_COST || tk.campCd > 0) return; send({ t: 'camp', tk: tk.id }); };
  el.querySelectorAll('input[data-line]').forEach(r => r.oninput = () => {
    const id = r.dataset.line, v = +r.value / 100;
    tk.share[id] = v;
    const others = T.lines.filter(l => l.id !== id), rest = others.reduce((a, l) => a + (tk.share[l.id] || 0), 0);
    for (const l of others) tk.share[l.id] = rest > 0 ? (tk.share[l.id] || 0) * (1 - v) / rest : (1 - v) / others.length;
    el.querySelectorAll('input[data-line]').forEach(x => { x.value = Math.round((tk.share[x.dataset.line] || 0) * 100); x.nextElementSibling.textContent = x.value + ' %'; });
    sendSoon('share' + id, { t: 'share', tk: tk.id, id: id, v: v });
  });
  if (q('feeR')) q('feeR').oninput = e => { tk.access.fee = +e.target.value; q('feeV').textContent = tk.access.fee + ' Kč'; updateFeeHint(tk); sendSoon('fee', { t: 'fee', tk: tk.id, fee: tk.access.fee }); };
  el.querySelectorAll('button[data-acc]').forEach(b => b.onclick = () => { tk.access.closed = b.dataset.acc === 'closed'; send({ t: 'access', tk: tk.id, closed: tk.access.closed }); refreshTokenCard(true); });
  updateFeeHint(tk);
}
function updateFeeHint(tk) {
  const el = $('feeHint'); if (!el || !isCity(tk)) return;
  const f = tk.access.fee || 0, est = feeEstimate(tk, f);
  const best = (() => { let b = 0, bv = -1; for (let x = 0; x <= FEE_MAX; x++) { const v = feeEstimate(tk, x); if (v > bv) { bv = v; b = x; } } return { b, bv }; })();
  let txt = `Odhad příjmu z poplatků: ~${fmtMoney(est)} / min. `;
  if (f > FAIR_FEE) txt += `Město trpí (spokojenost ↓, prosperita roste pomaleji, ve volbách ti ubývá ${Math.round((f - FAIR_FEE) * 6)} bodů). `;
  if (f > best.b + 2) txt += `Vyšší poplatek už vydělává méně – provoz se vyhýbá.`;
  else if (f < 4) txt += `Zadarmo nevyděláš, ale tvoje vozidla tu dostanou pověst.`;
  el.textContent = txt;
}
function updateCardLive(tk) {
  const set = (id, t) => { const e = $(id); if (e) e.textContent = t; };
  set('cSat', Math.round(tk.sat * 100) + ' %'); set('cPro', Math.floor(tk.prosp) + ' / 100'); set('cCem', Math.floor(tk.cementIn) + ' t');
}

function upgradeToken(tk) {
  const chk = upgradeCheck(tk, state.me);
  if (!chk.req) return false;
  if (!chk.ok) { say('Podmínky povýšení nejsou splněny', true); return false; }
  send({ t: 'upgrade', tk: tk.id }); return true;
}
