// Hex Tycoon na Cloudflare Workers: statické soubory z public/ + jedna Durable Object (místnost) pro celou hru.
// Cesta /ws = WebSocket do hry, vše ostatní obslouží statické soubory.
import { DurableObject } from 'cloudflare:workers';
import { createGame } from '../server/game.generated.js';
import { createRoom } from '../server/room.js';

const hex = buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
const enc = new TextEncoder();
async function hash(pass, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256));
}
async function sha(text) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(text))); }
function randomHex(n) { return hex(crypto.getRandomValues(new Uint8Array(n))); }

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Při probuzení (po době, kdy nikdo nehrál) se hra načte z úložiště.
    ctx.blockConcurrencyWhile(async () => {
      const raw = await ctx.storage.get('state');
      let saved = null, auth = { accounts: {}, sessions: {} };
      if (raw) { const o = JSON.parse(raw); saved = o.game; auth = o.auth || auth; }
      const G = createGame();
      if (saved && saved.wv !== G.worldVer()) { saved = null; auth = { accounts: {}, sessions: {} }; }   // jiná verze světa -> čistý start
      const seed = G.init(saved ? null : (Number(env.SEED) || null), saved);
      G.primeNet();
      this.room = createRoom({
        G, seed, auth, version: G.version(),
        idlePause: env.IDLE_PAUSE !== '0', maxCompanies: Number(env.MAX_COMPANIES) || 24,
        save: snap => { ctx.storage.put('state', JSON.stringify(snap)); },
        hash, sha, randomHex
      });
      this.room.start();
    });
  }
  async fetch(request) {
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    server.accept();
    const conn = { send: s => server.send(s), ip: request.headers.get('CF-Connecting-IP') || '' };
    this.room.addClient(conn);
    server.addEventListener('message', ev => this.room.onMessage(conn, typeof ev.data === 'string' ? ev.data : ''));
    const gone = () => this.room.removeClient(conn);
    server.addEventListener('close', gone);
    server.addEventListener('error', gone);
    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Očekávám WebSocket', { status: 426 });
      return env.GAME.get(env.GAME.idFromName('main')).fetch(request);
    }
    if (url.pathname === '/healthz') return new Response('ok');
    return env.ASSETS.fetch(request);
  }
};
