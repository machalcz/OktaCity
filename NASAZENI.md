# Nasazení Hex Tycoon na živý test

Dvě cesty. **A (Cloudflare)** je doporučená: zdarma, bez serveru, hra se sama ukládá a přežije restart.

## A) Cloudflare Workers přes GitHub (jen prohlížeč)

1. **Repozitář.** Na github.com vytvoř nový (klidně privátní) repozitář. Přetáhni do něj **celý obsah** rozbalené složky `hex04`.
   Nenahrávej složku `node_modules` ani `data` (`.gitignore` je vynechá, pokud nahráváš přes git; při nahrávání přetažením je nepřidávej).
   Musí tam být i soubor `server/game.generated.js` (je součástí balíčku) a skrytý `.gitignore`.
2. **Cloudflare.** dash.cloudflare.com → *Workers & Pages* → *Create* → *Import a repository* → vyber repozitář.
   - **Název Workeru:** `hextycoon` (musí se shodovat s `name` v `wrangler.jsonc`).
   - **Build command:** `node tools/build-game.js`  (nebo nech prázdné, soubor je už vygenerovaný)
   - **Deploy command:** `npx wrangler deploy`
3. **Hotovo.** Adresa: `https://hextycoon.<tvoje-subdomena>.workers.dev`. Po prvním otevření Ctrl+F5.
4. **Kontrola:** otevři `…/healthz` (odpoví `ok`), pak založ firmu. Z počítače lze ověřit i `node tools/smoke-test.js wss://hextycoon.<subdomena>.workers.dev/ws`.

**Další úpravy:** změň soubory v repozitáři, Cloudflare nasadí sám. Uložená hra a účty zůstanou, pokud se nezměnilo `WORLD_VER`.
**Nová hra od nuly:** Cloudflare → Workers & Pages → hextycoon → *Settings* → *Durable Objects* → smaž objekt `GameRoom`, nebo zvyš `WORLD_VER` v `public/js/config.js` a nasaď znovu.
**Nastavení:** proměnné `MAX_COMPANIES` (počet firem, výchozí 24) a `IDLE_PAUSE` v `wrangler.jsonc` → `vars`.

## B) Vlastní server (Node nebo Docker)

```
npm install
npm start                                   # http://localhost:3000
```
Docker:
```
docker build -t hextycoon .
docker run -d --name hextycoon -p 3000:3000 -v hextycoon-data:/data --restart unless-stopped hextycoon
```
Proměnné: `PORT`, `DATA_DIR` (trvalý disk pro `game.json`, **zálohuj ho**), `MAX_COMPANIES`, `SEED`, `IDLE_PAUSE=0`.
Před internet patří reverzní proxy s HTTPS (Caddy, nginx, Cloudflare Tunnel); WebSocket běží na cestě `/ws`.
Nová hra od nuly: `npm run reset` (nebo smaž `data/game.json`).

## Co hráčům říct
- Hra je v testu a data se mohou při větších změnách smazat (změna verze světa smaže všechny účty).
- Firma, která dosáhne dluhu 50 000 Kč, automaticky zanikne a je potřeba založit novou. Hráč může firmu i sám zrušit; jeho silnice pak časem zmizí.
