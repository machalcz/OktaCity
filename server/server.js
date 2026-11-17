'use strict';
// Hex Tycoon – Node server (spuštění na vlastním počítači / VPS). Stejnou hru běží i Cloudflare Worker (viz worker/).
//  - servíruje statické soubory ze složky public/ a přes WebSocket (cesta /ws) drží hru
//  - stav hry a účty se ukládají do DATA_DIR/game.json
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { createGame } = require('./game.generated.js');
const { createRoom } = require('./room.js');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const PUBLIC = path.join(__dirname, '..', 'public');
const SAVE_FILE = path.join(DATA_DIR, 'game.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
if (process.argv.includes('--reset')) { try { fs.unlinkSync(SAVE_FILE); console.log('Uložená hra smazána.'); } catch (e) {} }
let auth = { accounts: {}, sessions: {} }, saved = null;
try { const raw = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8')); saved = raw.game; auth = raw.auth || auth; console.log('Načtena uložená hra (' + Object.keys(auth.accounts).length + ' společností).'); }
catch (e) { console.log('Začíná nová hra.'); }

const G = createGame();
if (saved && saved.wv !== G.worldVer()) { console.log('Uložená hra je z jiné verze světa (' + saved.wv + ' ≠ ' + G.worldVer() + ') – začíná se znovu, účty se smažou.'); saved = null; auth = { accounts: {}, sessions: {} }; }
const seed = G.init(saved ? null : (Number(process.env.SEED) || null), saved);
G.primeNet();
console.log('Svět: seed ' + seed + ', verze ' + G.version());

const room = createRoom({
  G, seed, auth, version: G.version(),
  idlePause: process.env.IDLE_PAUSE !== '0', maxCompanies: Number(process.env.MAX_COMPANIES) || 24,
  save(snap) { const tmp = SAVE_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(snap)); fs.renameSync(tmp, SAVE_FILE); },
  hash: async (pass, salt) => crypto.scryptSync(pass, salt, 32).toString('hex'),
  sha: async s => crypto.createHash('sha256').update(s).digest('hex'),
  randomHex: n => crypto.randomBytes(n).toString('hex')
});
room.start();

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Nenalezeno'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 4096 });
wss.on('connection', (ws, req) => {
  const conn = { send: s => { if (ws.readyState === 1) ws.send(s); }, ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim() };
  ws.isAlive = true; room.addClient(conn);
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', d => room.onMessage(conn, d.toString()));
  ws.on('close', () => room.removeClient(conn));
  ws.on('error', () => {});
});
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch (e) {} } }, 25000);
function bye() { room.saveNow(); process.exit(0); }
process.on('SIGINT', bye); process.on('SIGTERM', bye);
server.listen(PORT, () => console.log('Hex Tycoon běží na http://localhost:' + PORT));
