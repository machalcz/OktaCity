'use strict';
// Herní místnost: přihlášení, rozesílání stavu a hlavní smyčka. Nezávislé na platformě (Node i Cloudflare Worker).
// Platformu dodává volající přes `opts`:
//   G, seed, auth, save(snapshot), hash(pass, salt) -> Promise<hex>, sha(text) -> Promise<hex>, randomHex(bytes) -> hex
// Připojení (conn) je objekt { send(text), ip } – room si na něj ukládá pid a čítače.
const TICK_MS = 50, FAST_EVERY = 2, SLOW_EVERY = 20, SAVE_MS = 30000;
const MAX_MSG = 4096;
const TOKEN_ACTS = new Set(['buildObject', 'depBuild', 'take', 'camp', 'upgrade', 'share', 'fee', 'access', 'color', 'deploy', 'withdraw']);

function createRoom(opts) {
  const G = opts.G, auth = opts.auth, version = opts.version, seed = opts.seed;
  const idlePause = opts.idlePause !== false, maxCompanies = opts.maxCompanies || 24;
  const clients = new Set();
  let timer = 0, saveTimer = 0, last = Date.now(), tick = 0;
  const fails = new Map();

  const authed = () => Array.from(clients).filter(c => c.pid);
  const onlineCount = () => new Set(authed().map(c => c.pid)).size;
  const sendTo = (c, obj) => { try { c.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch (e) {} };
  const sendPid = (pid, obj) => { const s = JSON.stringify(obj); for (const c of clients) if (c.pid === pid) sendTo(c, s); };
  const broadcast = obj => { const s = typeof obj === 'string' ? obj : JSON.stringify(obj); for (const c of clients) if (c.pid) sendTo(c, s); };

  function saveNow() { try { opts.save({ game: G.dump(), auth: auth, savedAt: new Date().toISOString() }); } catch (e) { console.error('Uložení selhalo:', e && e.message); } }

  function cleanName(s) { return String(s || '').replace(/[<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 28); }
  function findByName(name) { const k = name.toLowerCase(); for (const pid in auth.accounts) if (auth.accounts[pid].name.toLowerCase() === k) return Number(pid); return 0; }
  async function newToken(pid) { const t = opts.randomHex(24); auth.sessions[await opts.sha(t)] = pid; return t; }
  function eqHex(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
  function blocked(ip) { const f = fails.get(ip); if (!f) return false; if (Date.now() - f.t > 5 * 60000) { fails.delete(ip); return false; } return f.n >= 8; }
  function fail(ip) { const f = fails.get(ip) || { n: 0, t: Date.now() }; f.n++; f.t = Date.now(); fails.set(ip, f); }

  const OFFER = 10;       // kolik náhodných volných vesnic se nabízí při založení společnosti
  function hello(c) { const v = G.villages(OFFER); if (c) c.offer = v.map(x => x.id); return { t: 'hello', seed: seed, ver: version, villages: v, villagesFree: G.freeVillageCount(), online: onlineCount(), companies: Object.keys(auth.accounts).length }; }
  // Zánik společnosti: online hráč dostane zprávu hned, offline při příštím přihlášení (účet se přesune do auth.ended).
  function dropEnded(pid) { if (auth.ended) delete auth.ended[pid]; for (const k of Object.keys(auth.sessions)) if (auth.sessions[k] === pid) delete auth.sessions[k]; }
  function findEnded(name) { const k = name.toLowerCase(); for (const pid in (auth.ended || {})) if (auth.ended[pid].name.toLowerCase() === k) return Number(pid); return 0; }
  function sendEnded(c, pid, why, name) { sendTo(c, { t: 'ended', why: why, name: name }); dropEnded(pid); }
  function processEnded() {
    for (const e of G.drainEnded()) {
      const a = auth.accounts[e.pid];
      if (a) { (auth.ended = auth.ended || {})[e.pid] = { name: a.name, salt: a.salt, hash: a.hash, why: e.why }; delete auth.accounts[e.pid]; }
      let delivered = false;
      for (const c of clients) if (c.pid === e.pid) { c.pid = 0; sendTo(c, { t: 'ended', why: e.why, name: e.name }); delivered = true; }
      if (delivered) dropEnded(e.pid);
      broadcast({ t: 'online', n: onlineCount() });
      saveNow();
    }
  }
  function authFail(c, error) { sendTo(c, { t: 'auth', ok: false, error: error }); }
  function startSession(c, pid, token, isNew) {
    c.pid = pid;
    sendTo(c, { t: 'auth', ok: true, pid: pid, token: token, name: auth.accounts[pid].name, isNew: !!isNew });
    sendTo(c, { t: 'init', net: G.netFull(), slow: G.slow(), me: G.me(pid), pid: pid, sim: G.fast() });
    broadcast({ t: 'online', n: onlineCount() });
    ensureRunning();
  }

  async function handleAuth(c, m) {
    if (c.busy) return;
    c.busy = true;
    try {
      if (blocked(c.ip)) return authFail(c, 'Příliš mnoho pokusů, zkus to za několik minut.');
      if (m.t === 'villages') { sendTo(c, hello(c)); return; }               // nabídnout jiných 10 vesnic
      if (m.t === 'resume') {
        const pid = auth.sessions[await opts.sha(String(m.token || ''))];
        if (pid && !auth.accounts[pid] && auth.ended && auth.ended[pid]) return sendEnded(c, pid, auth.ended[pid].why, auth.ended[pid].name);
        if (!pid || !auth.accounts[pid]) return authFail(c, 'Přihlášení vypršelo, přihlas se znovu.');
        return startSession(c, pid, String(m.token), false);
      }
      if (m.t === 'login') {
        const pid = findByName(cleanName(m.name)), a = auth.accounts[pid];
        if (!a && typeof m.pass === 'string') {
          const ep = findEnded(cleanName(m.name));
          if (ep && eqHex(await opts.hash(m.pass.slice(0, 200), auth.ended[ep].salt), auth.ended[ep].hash)) return sendEnded(c, ep, auth.ended[ep].why, auth.ended[ep].name);
        }
        if (!a || typeof m.pass !== 'string') { fail(c.ip); return authFail(c, 'Špatný název společnosti nebo heslo.'); }
        const h = await opts.hash(m.pass.slice(0, 200), a.salt);
        if (!eqHex(h, a.hash)) { fail(c.ip); return authFail(c, 'Špatný název společnosti nebo heslo.'); }
        return startSession(c, pid, await newToken(pid), false);
      }
      if (m.t === 'register') {
        const name = cleanName(m.name), pass = typeof m.pass === 'string' ? m.pass.slice(0, 200) : '';
        if (name.length < 2) return authFail(c, 'Název společnosti musí mít aspoň 2 znaky.');
        if (pass.length < 4) return authFail(c, 'Heslo musí mít aspoň 4 znaky.');
        if (!/^#[0-9a-fA-F]{6}$/.test(String(m.color || ''))) return authFail(c, 'Neplatná barva.');
        if (findByName(name)) return authFail(c, 'Společnost s tímto názvem už existuje.');
        if (Object.keys(auth.accounts).length >= maxCompanies) return authFail(c, 'Hra je plná.');
        const salt = opts.randomHex(16), hash = await opts.hash(pass, salt);
        if (findByName(name)) return authFail(c, 'Společnost s tímto názvem už existuje.');   // mezitím mohl zaregistrovat někdo jiný
        if (c.offer && !c.offer.includes(Number(m.home))) return authFail(c, 'Tuhle vesnici ti hra nenabídla, vyber z aktuálního seznamu.');
        const res = G.register(name, String(m.color).toLowerCase(), m.home);
        if (!res.ok) return authFail(c, res.error);
        auth.accounts[res.pid] = { name: name, salt: salt, hash: hash };
        saveNow();
        return startSession(c, res.pid, await newToken(res.pid), true);
      }
    } finally { c.busy = false; }
  }

  function addClient(c) { c.pid = 0; c.busy = false; c.actN = 0; c.actT = Date.now(); clients.add(c); sendTo(c, hello(c)); }
  function removeClient(c) {
    if (!clients.delete(c)) return;
    if (c.pid && !authed().some(x => x.pid === c.pid)) { G.releaseLocks(c.pid); broadcast({ t: 'lk', d: G.locks() }); }
    broadcast({ t: 'online', n: onlineCount() });
    if (!clients.size) maybeStop();
  }

  async function onMessage(c, text) {
    if (typeof text !== 'string' || text.length > MAX_MSG) return;
    let m; try { m = JSON.parse(text); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (!c.pid) return handleAuth(c, m);
    const now = Date.now(); if (now - c.actT > 1000) { c.actT = now; c.actN = 0; }
    if (++c.actN > 40) return;
    if (m.t === 'ping') return sendTo(c, { t: 'pong', c: m.c });
    if (m.t === 'logout') {
      delete auth.sessions[await opts.sha(String(m.token || ''))];
      c.pid = 0; sendTo(c, hello(c)); broadcast({ t: 'online', n: onlineCount() }); return;
    }
    let r = null;
    try { r = G.act(c.pid, m); } catch (e) { console.error('act', e); }
    processEnded();
    if (r && (r.say || r.openUnit || r.openToken)) sendTo(c, { t: 'res', say: r.say, warn: !!r.warn, openUnit: r.openUnit || 0, openToken: r.openToken || 0 });
    if (m.t === 'lock' || m.t === 'unlock') broadcast({ t: 'lk', d: G.locks() });
    else { sendTo(c, { t: 'me', d: G.me(c.pid) }); if (TOKEN_ACTS.has(m.t)) broadcast({ t: 's', d: G.slow() }); }
  }

  function loop() {
    const now = Date.now(); let dt = (now - last) / 1000; last = now;
    const people = authed();
    if (idlePause && !people.length) return;
    dt = Math.min(dt, 0.25);
    try { G.step(dt); } catch (e) { console.error('Chyba simulace:', e && e.stack); }
    tick++;
    processEnded();
    for (const n of G.drain()) sendPid(n.pid, { t: 'msg', say: n.text, warn: n.warn });
    if (!people.length) return;
    const nc = G.netChanges(); if (nc) broadcast({ t: 'net', d: nc });
    if (tick % FAST_EVERY === 0) {
      const base = JSON.stringify(G.fast()), fl = G.newFloaters(), flAll = fl.filter(f => !f[4]), cache = new Map();
      for (const c of people) {
        let money = cache.get(c.pid); if (money === undefined) { money = G.money(c.pid); cache.set(c.pid, money); }
        sendTo(c, base.slice(0, -1) + ',"t":"f","$":' + money + '}');
        const mine = flAll.concat(fl.filter(f => f[4] && f[4].indexOf(c.pid) >= 0));
        if (mine.length) sendTo(c, { t: 'fl', d: mine.map(f => [f[0], f[1], f[2], f[3]]) });
      }
    }
    if (tick % SLOW_EVERY === 0 || G.unitsChanged()) {
      const s = JSON.stringify({ t: 's', d: G.slow() });
      for (const c of people) sendTo(c, s);
      for (const pid of new Set(people.map(c => c.pid))) sendPid(pid, { t: 'me', d: G.me(pid) });
    }
  }

  // Simulace běží jen když je někdo připojený (a tak může Cloudflare i Node nechat proces odpočívat).
  function ensureRunning() { if (timer) return; last = Date.now(); timer = setInterval(loop, TICK_MS); if (!saveTimer) saveTimer = setInterval(saveNow, SAVE_MS); }
  function maybeStop() { if (!idlePause) return; clearInterval(timer); clearInterval(saveTimer); timer = 0; saveTimer = 0; saveNow(); }
  function start() { if (!idlePause) ensureRunning(); }

  return { addClient, removeClient, onMessage, saveNow, start, onlineCount, companyCount: () => Object.keys(auth.accounts).length };
}
module.exports = { createRoom };
