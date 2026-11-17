// Rychlá zkouška běžícího serveru: node tools/smoke-test.js ws://localhost:3000/ws
// Založí zkušební společnost, ověří stav světa a že chodí snímky ze serveru.
const WebSocket = require('ws');
const url = process.argv[2] || 'ws://localhost:3000/ws';
const ws = new WebSocket(url); const got = {}; let init = null;
const name = 'Test ' + Math.floor(Math.random() * 1e6);
const t0 = Date.now();
ws.on('open', () => console.log('spojeno'));
ws.on('error', e => { console.log('CHYBA spojení:', e.message); process.exit(1); });
ws.on('message', d => {
  const m = JSON.parse(d); got[m.t] = (got[m.t] || 0) + 1;
  if (m.t === 'hello') ws.send(JSON.stringify({ t: 'register', name, pass: 'test1234', color: '#d8402f', home: m.villages[0].id }));
  if (m.t === 'auth') console.log('přihlášení:', m.ok ? 'OK (' + m.name + ')' : 'SELHALO: ' + m.error);
  if (m.t === 'init') { init = m; console.log('svět: ' + m.slow.tokens.length + ' míst, peníze ' + m.me.money); }
});
setTimeout(() => {
  console.log('zprávy:', JSON.stringify(got));
  const ok = init && got.f >= 5;
  console.log(ok ? 'VÝSLEDEK: v pořádku' : 'VÝSLEDEK: PROBLÉM (chybí init nebo snímky)');
  process.exit(ok ? 0 : 1);
}, 4000);
