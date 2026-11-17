// Síťová vrstva klienta: spojení se serverem (WebSocket), přihlášení / založení společnosti, příjem stavu hry.
// Simulaci počítá server. Klient jen kreslí snímky a posílá akce hráče.

let ws = null, wsTry = 0, helloMsg = null, resumeTried = false, authKind = '', reconnectT = 0;
const NET = { pendingUnit: 0, pendingToken: 0, ready: false, lastFast: 0 };
const TOKEN_KEY = 'hextycoon_token', NAME_KEY = 'hextycoon_name';
const FAST_MS = 110;

function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
function setToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

function send(m) {
  if (ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); return true; }
  say('Spojení se serverem je přerušené', true); return false;
}
const soonT = {};
function sendSoon(key, m) { clearTimeout(soonT[key]); soonT[key] = setTimeout(() => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }, 150); }

// ---------- zámky polí (klient je hlásí serveru) ----------
function unlockCell(pid) {
  const k = state.lockKey[pid];
  if (k && state.locks[k] && state.locks[k].pid === pid) delete state.locks[k];
  delete state.lockKey[pid];
  if (k && pid === state.me && ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'unlock' }));
}
function lockCell(cell, pid) {
  unlockCell(pid);
  if (!cell || lockedBy(cell, pid)) return;
  const k = cellKey(cell);
  state.locks[k] = { pid, t: Date.now() }; state.lockKey[pid] = k;
  if (pid === state.me && ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'lock', cell: { t: cell.t, c: cell.c, r: cell.r } }));
}

// ---------- spojení ----------
let noServerT = 0;
function showNoServer() {
  if (helloMsg || state.me) return;
  const box = $('found'), local = location.protocol === 'file:';
  box.innerHTML = `<div class="fbox"><h2>Hex Tycoon</h2>
    <div class="err">${local ? 'Stránka je otevřená přímo ze souboru, takže se nemá k čemu připojit.' : 'Server hry neodpovídá.'}</div>
    <p>Hra běží na serveru, který počítá celý svět pro všechny hráče. ${local ? 'Soubor <b>index.html</b> proto samotný nestačí.' : 'Zkontroluj, že server běží, a obnov stránku.'}</p>
    <div class="lab">Jak hru spustit na svém počítači</div>
    <ol style="margin:6px 0 0;padding-left:20px;line-height:1.6">
      <li>Nainstaluj <b>Node.js</b> (verze 18 nebo novější) z nodejs.org.</li>
      <li>Ve složce hry dvakrát klikni na <b>start.bat</b> (Windows) nebo spusť <b>./start.sh</b> (Mac, Linux).</li>
      <li>V prohlížeči otevři <b>http://localhost:3000</b></li>
    </ol>
    <button class="primary go" id="aRetry">Zkusit znovu</button><button class="link" id="aRules">📖 Pravidla hry</button></div>`;
  box.classList.remove('hidden');
  box.onclick = e => { if (e.target.closest('#aRetry')) { resumeTried = false; wsTry = 0; connect(); } if (e.target.closest('#aRules')) showRules(); };
}

function connect() {
  clearTimeout(reconnectT); clearTimeout(noServerT);
  if (location.protocol === 'file:') { showNoServer(); return; }
  noServerT = setTimeout(showNoServer, 3500);
  const u = new URL('ws', location.href); u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  try { ws = new WebSocket(u.href); } catch (e) { scheduleReconnect(); return; }
  ws.onopen = () => { wsTry = 0; clearTimeout(noServerT); $('offline').classList.add('hidden'); };
  ws.onclose = () => { ws = null; resumeTried = false; if (state.me) $('offline').classList.remove('hidden'); scheduleReconnect(); };
  ws.onerror = () => {};
  ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } onNetMessage(m); };
}
function scheduleReconnect() { clearTimeout(reconnectT); reconnectT = setTimeout(connect, Math.min(5000, 800 + wsTry++ * 700)); }

function onNetMessage(m) {
  switch (m.t) {
    case 'hello':
      helloMsg = m;
      if (getToken() && !resumeTried) { resumeTried = true; authKind = 'resume'; send({ t: 'resume', token: getToken() }); }
      else if (!state.me) showAuth();
      else if (authKind === 'x') showAuth();
      break;
    case 'auth':
      if (m.ok) {
        setToken(m.token); try { localStorage.setItem(NAME_KEY, m.name); } catch (e) {}
        state.me = m.pid; state.company = { name: m.name, home: 0 };
      } else {
        if (authKind === 'resume') setToken('');
        state.me = 0; showAuth(m.error);
      }
      break;
    case 'init': applyInit(m); break;
    case 'f': applyFast(m); break;
    case 's': applySlow(m.d); break;
    case 'me': applyMe(m.d); break;
    case 'net': applyNet(m.d); break;
    case 'lk': applyLocks(m.d); break;
    case 'fl': for (const f of m.d) state.sim.floaters.push({ x: f[0], y: f[1], text: f[2], color: f[3], t: 0 }); break;
    case 'msg': say(m.say, m.warn); break;
    case 'res':
      if (m.say) say(m.say, m.warn);
      if (m.openUnit) NET.pendingUnit = m.openUnit;
      if (m.openToken) NET.pendingToken = m.openToken;
      break;
    case 'online': state.online = m.n; showOnline(); break;
    case 'ended': showEnded(m); break;
  }
}
function showOnline() { const e = $('online'); if (e) e.textContent = '👥 ' + (state.online || 1); }

// ---------- příjem stavu ----------
function applyInit(m) {
  const seed = helloMsg ? helloMsg.seed : state.seed;
  state.me = m.pid;
  if (!state.map || state.mapSeed !== seed) {
    const world = makeWorld(seed);
    state.map = world.map; state.mapSeed = seed; state.seed = seed;
    state.sim = newClientSim(); state.sel = null; state.pick = null;
  }
  state.net.load(m.net || []);
  state.locks = {}; state.lockKey = {};
  applySlow(m.slow); applyMe(m.me); applyFast(m.sim, true);
  const first = !NET.ready; NET.ready = true;
  $('found').classList.add('hidden'); $('found').innerHTML = ''; $('offline').classList.add('hidden');
  authKind = 'x';
  showOnline(); hudSlow(); updateToolbar();
  if (first) { resetSheet(); focusCity(); say('Vítej, ' + (state.company ? state.company.name : '') + '!'); }
}
function applyNet(list) {
  const n = state.net;
  for (const [k, rec] of list) { if (rec) n.m.set(k, { road: rec.road, rail: rec.rail, own: rec.own }); else n.m.delete(k); }
  n.ver++;
}
function applyLocks(list) { const L = {}; for (const [k, pid] of list) L[k] = { pid, t: Date.now() }; state.locks = L; }
function applyMe(d) {
  if (!d) return;
  state.money = d.money; state.inv = d.inv || {}; state.paid = d.paid || {};
  state.ledger = { [state.me]: { inc: d.ledger.inc, exp: d.ledger.exp, bk: d.ledger.bk } };
}
function applySlow(d) {
  if (!d || !state.map) return;
  const sim = state.sim;
  let rebuilt = false;
  for (const s of d.tokens) {
    let tk = tokenById(s.id);
    if (!tk) { tk = makeToken(state.map, s.id, s.type, s.c, s.r, s.level, s.name); rebuilt = true; }
    const changed = tk.type !== s.type || tk.level !== s.level;
    tk.type = s.type; tk.level = s.level; tk.name = s.name; tk.road = s.road; tk.rail = s.rail; tk.owner = s.owner;
    tk.access = s.access; tk.share = s.share; tk.infl = s.infl; tk.stock = s.stock; tk.prosp = s.prosp; tk.cementIn = s.cementIn;
    tk.sat = s.sat; tk.power = s.power; tk.running = s.running; tk.visits = s.visits; tk.earnedFees = s.earnedFees; tk.campCd = s.campCd;
    tk.lastElect = s.lastElect; tk.homes = s.homes; tk.occ = { road: new Array(s.occ[0]), rail: new Array(s.occ[1]), ship: new Array(s.occ[2] || 0) };
    if (changed || rebuilt) buildTokenScene(tk);
  }
  state.players = {};
  for (const id in d.players) state.players[id] = d.players[id];
  state.players = Object.assign({}, state.players);
  const mine = state.players[state.me];
  if (mine) { state.company = { name: mine.name, home: mine.home }; state.player.color = mine.color; }
  // vozidla: zachovat objekty (kvůli plynulé animaci)
  const old = new Map(sim.units.map(u => [u.id, u])), out = [];
  for (const s of d.units) {
    let u = old.get(s.id);
    if (!u) u = { owner: true, hidden: true, loaded: false, fade: 1, poses: [] };
    Object.assign(u, s); u.owner = true; out.push(u);
  }
  sim.units = out;
  applyLocks(d.locks);
  if (NET.pendingUnit && out.some(u => u.id === NET.pendingUnit)) { const id = NET.pendingUnit; NET.pendingUnit = 0; openRoot('vehicle', id); }
  if (NET.pendingToken && tokenById(NET.pendingToken)) { const id = NET.pendingToken; NET.pendingToken = 0; state.tool = null; updateToolbar(); openToken(id); }
  if (rebuilt || NET.ready) { refreshSheet(); renderCellbar(); }
}
function setTarget(o, x, y, a, snap, now) {
  if (snap || o.x === undefined) { o.x = x; o.y = y; o.ang = a; o.fx = x; o.fy = y; o.fa = a; }
  else { o.fx = o.x; o.fy = o.y; o.fa = o.ang; }
  o.tx = x; o.ty = y; o.ta = a; o.t0 = now;
}
function applyFast(m, snap) {
  if (!m || !state.map) return;
  const sim = state.sim, now = performance.now(), byId = new Map(sim.units.map(u => [u.id, u]));
  sim.t = m.st; if (m.$ !== undefined) state.money = m.$;
  if (typeof hwxApplyTime === 'function' && state.map && state.map.hwx && hwxApplyTime(state.map, Math.floor(m.st / 20) * 20)) state.net.ver++;
  NET.lastFast = now;
  for (const e of m.u) {
    const u = byId.get(e[0]); if (!u) continue;
    const was = u.hidden;
    u.hidden = !!(e[1] & 1); u.loaded = !!(e[1] & 2); u.fade = e[2] / 100;
    if (u.hidden || e.length < 7) { u.hidden = u.hidden || e.length < 7; u.poses = []; continue; }
    if (u.kind === 'road' || u.kind === 'ship') setTarget(u, e[3], e[4], e[5], snap || was, now);
    else {
      const oldp = new Map((u.poses || []).map(p => [p.i, p])), ps = [];
      for (let k = 3; k + 3 < e.length; k += 4) {
        const p = { i: e[k + 3], item: u.items[e[k + 3]] }, o = oldp.get(p.i);
        if (o && !was && !snap) { p.x = o.x; p.y = o.y; p.ang = o.ang; }
        setTarget(p, e[k], e[k + 1], e[k + 2], !o || was || snap, now);
        ps.push(p);
      }
      u.poses = ps;
    }
  }
  // okolní provoz
  const amb = sim.ambMap || (sim.ambMap = new Map()), seen = new Set();
  for (const e of m.a) {
    seen.add(e[0]);
    let o = amb.get(e[0]);
    if (!o) { o = { owner: false, kind: 'road', model: 'car', color: AMB_COLORS[e[1]] || '#ccc', hidden: false, loaded: false }; amb.set(e[0], o); setTarget(o, e[2], e[3], e[4], true, now); }
    else setTarget(o, e[2], e[3], e[4], snap, now);
    o.fade = e[5] / 100;
  }
  for (const k of Array.from(amb.keys())) if (!seen.has(k)) amb.delete(k);
  sim.ambList = Array.from(amb.values());
  // přejezdy
  const cseen = new Set();
  for (const c of m.c) {
    cseen.add(c[0]);
    let cs = sim.cross[c[0]];
    if (!cs) { cs = sim.cross[c[0]] = { closed: false, eff: false, gate: 0, effT: 1, off: c[1], tg: 0 }; sim.crossList.push({ key: c[0], cell: cellFromKey(c[0]), off: c[1] }); }
    cs.eff = !!c[2]; cs.tg = c[3] / 100; cs.off = c[1];
  }
  if (sim.crossList.length !== cseen.size) { sim.crossList = sim.crossList.filter(c => cseen.has(c.key)); for (const k of Object.keys(sim.cross)) if (!cseen.has(k)) delete sim.cross[k]; }
}
function lerpTo(o, k) {
  o.x = o.fx + (o.tx - o.fx) * k; o.y = o.fy + (o.ty - o.fy) * k;
  let d = o.ta - o.fa; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  o.ang = o.fa + d * k;
}
// volá se v každém snímku: plynulý pohyb mezi snímky ze serveru
function netFrame(now, dt) {
  const sim = state.sim;
  for (const u of sim.units) {
    if (u.hidden) continue;
    const k = Math.min(1, (now - (u.t0 || 0)) / FAST_MS);
    if (u.kind === 'road' || u.kind === 'ship') { if (u.tx !== undefined) lerpTo(u, k); }
    else for (const p of u.poses || []) lerpTo(p, Math.min(1, (now - p.t0) / FAST_MS));
  }
  if (sim.ambList) for (const o of sim.ambList) lerpTo(o, Math.min(1, (now - o.t0) / FAST_MS));
  for (const key in sim.cross) { const cs = sim.cross[key]; cs.gate += (cs.tg - cs.gate) * Math.min(1, dt * 9); if (Math.abs(cs.gate - cs.tg) < 0.004) cs.gate = cs.tg; }
  for (let i = sim.floaters.length - 1; i >= 0; i--) { sim.floaters[i].t += dt; if (sim.floaters[i].t > 2.2) sim.floaters.splice(i, 1); }
}

// ---------- přihlášení / založení společnosti ----------
const AUTH = { mode: 'login', color: null, home: 0, name: '' };
function showAuth(err) {
  if (!helloMsg) return;
  NET.ready = false;
  const box = $('found');
  if (!AUTH.color) AUTH.color = COLORS[Math.floor(Math.random() * COLORS.length)];
  if (!helloMsg.villages.some(v => v.id === AUTH.home)) AUTH.home = helloMsg.villages.length ? helloMsg.villages[0].id : 0;
  let savedName = ''; try { savedName = localStorage.getItem(NAME_KEY) || ''; } catch (e) {}
  const reg = AUTH.mode === 'register';
  let h = `<div class="fbox"><h2>Hex Tycoon <small>${helloMsg.ver}</small></h2>
    <p>${helloMsg.companies ? 'Společností ve hře: ' + helloMsg.companies + ' · online: ' + (helloMsg.online || 0) : 'Ve hře zatím nikdo není – buď první.'}</p>
    <div class="tabs"><button data-mode="login" class="${reg ? '' : 'on'}">Přihlásit se</button><button data-mode="register" class="${reg ? 'on' : ''}">Nová společnost</button></div>
    ${err ? `<div class="err">${err}</div>` : ''}
    <div class="lab">Název společnosti</div><input type="text" id="aName" maxlength="28" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="${reg ? 'Moje společnost' : 'Název tvé společnosti'}" value="${(reg ? AUTH.name : (AUTH.name || savedName)).replace(/"/g, '')}">
    <div class="lab">Heslo${reg ? ' (aspoň 4 znaky)' : ''}</div><input type="password" id="aPass" maxlength="100" autocomplete="${reg ? 'new-password' : 'current-password'}" placeholder="Heslo">`;
  if (reg) {
    h += `<div class="hint">Heslo si zapamatuj: s ním se přihlásíš z jiného zařízení nebo po vymazání dat prohlížeče. V tomto prohlížeči zůstaneš přihlášen sám.</div>
      <div class="lab">Barva</div><div class="sw" id="aSw">${COLORS.map(c => `<button data-sw="${c}" class="${c === AUTH.color ? 'on' : ''}" style="background:${c}" aria-label="barva"></button>`).join('')}</div>
      <div class="lab">Domovská vesnice</div><div class="hint">Vybráno ${helloMsg.villages.length} náhodných vesnic z celé mapy (volných je ${helloMsg.villagesFree}). Vesnice, kterou už má jiná společnost, se do výběru nedostane.</div><div class="vl" id="aVil">${helloMsg.villages.map(t => `<button data-vil="${t.id}" class="${t.id === AUTH.home ? 'on' : ''}"><b>${t.name}</b><span>${t.district ? 'okres ' + t.district + (t.kraj ? ' · ' + t.kraj : '') : ''}${t.near.length ? '<br>Poblíž: ' + t.near.join(', ') : ''}</span></button>`).join('')}</div><button class="link" id="aReroll">🎲 Nabídnout jiných ${helloMsg.villages.length} vesnic</button>`;
  }
  h += `<button class="primary go" id="aGo">${reg ? 'Založit společnost' : 'Přihlásit se'}</button>
    <button class="link" id="aRules">📖 Pravidla hry</button></div>`;
  box.innerHTML = h; box.classList.remove('hidden');
  const go = () => {
    const name = $('aName').value.trim(), pass = $('aPass').value; AUTH.name = name;
    if (name.length < 2) { showAuth('Zadej název společnosti.'); return; }
    if (!pass) { showAuth('Zadej heslo.'); return; }
    authKind = reg ? 'register' : 'login';
    $('aGo').disabled = true;
    send(reg ? { t: 'register', name, pass, color: AUTH.color, home: AUTH.home } : { t: 'login', name, pass });
  };
  box.onclick = e => {
    const md = e.target.closest('[data-mode]'), sw = e.target.closest('[data-sw]'), vl = e.target.closest('[data-vil]');
    if (md) { AUTH.name = $('aName').value; AUTH.mode = md.dataset.mode; showAuth(); return; }
    if (sw) { AUTH.color = sw.dataset.sw; box.querySelectorAll('[data-sw]').forEach(b => b.classList.toggle('on', b === sw)); return; }
    if (vl) { AUTH.home = +vl.dataset.vil; box.querySelectorAll('[data-vil]').forEach(b => b.classList.toggle('on', b === vl)); return; }
    if (e.target.closest('#aReroll')) { AUTH.name = $('aName').value; send({ t: 'villages' }); return; }
    if (e.target.closest('#aGo')) go();
    if (e.target.closest('#aRules')) showRules();
  };
  box.onkeydown = e => { if (e.key === 'Enter') go(); };
}
function doLogout() {
  if (!confirm('Odhlásit se? Příště se přihlásíš názvem společnosti a heslem.')) return;
  send({ t: 'logout', token: getToken() });
  setToken(''); NET.ready = false; authKind = 'x';
  closeSheet(); state.me = 0; state.map = null; state.mapSeed = null; state.sim = newClientSim(); state.net.clear(); state.sel = null; state.tool = null;
  AUTH.mode = 'login'; AUTH.name = '';
  if (helloMsg) showAuth();
}

connect();

// Společnost zanikla (bankrot nebo zrušení): hráč to jen potvrdí, zánik už nastal na serveru.
function showEnded(m) {
  setToken(''); NET.ready = false; authKind = 'x';
  closeSheet(); state.me = 0; state.map = null; state.mapSeed = null; state.sim = newClientSim(); state.net.clear(); state.sel = null; state.tool = null;
  AUTH.mode = 'register'; AUTH.name = '';
  let box = document.getElementById('ended');
  if (!box) { box = document.createElement('div'); box.id = 'ended'; box.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(5,10,18,.88);display:flex;align-items:center;justify-content:center;padding:20px'; document.body.appendChild(box); }
  const bank = m.why === 'bankrupt';
  box.innerHTML = '<div style="max-width:420px;background:#14202e;border:1px solid #2c4057;border-radius:14px;padding:22px;color:#e8eef5;font:15px/1.5 system-ui,sans-serif">'
    + '<h2 style="margin:0 0 10px;font-size:20px">' + (bank ? '💥 Společnost zbankrotovala' : '🏁 Společnost zanikla') + '</h2>'
    + '<p style="margin:0 0 10px"><b>' + (m.name || '') + '</b> ' + (bank ? 'dosáhla dluhu 50 000 Kč a automaticky zanikla.' : 'byla zrušena.') + '</p>'
    + '<p style="margin:0 0 16px;color:#aebccb">Vozidla zmizela a tvoje silnice a koleje už nikdo neudržuje – časem se rozpadnou. Pro další hru si založ novou společnost.</p>'
    + '<button class="primary" id="endedOk" style="width:100%;padding:12px;font-size:16px">Rozumím</button></div>';
  box.style.display = 'flex';
  box.querySelector('#endedOk').onclick = () => { box.style.display = 'none'; if (helloMsg) showAuth(); };
}
