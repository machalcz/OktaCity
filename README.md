# Hex Tycoon – ALFA 0.9 (multiplayer)

Jedna sdílená mapa, simulaci počítá server, hráči se připojují z prohlížeče.
Stejný herní kód běží ve dvou variantách:

| Varianta | Kde | Soubor |
|---|---|---|
| **Cloudflare Worker** (zdarma, bez instalace u tebe) | cloud | `worker/index.js`, `wrangler.jsonc` |
| **Node server** | tvůj počítač / VPS | `server/server.js` |

`server/game.generated.js` je vygenerovaný ze zdrojů (`public/js/*.js` + `server/logic.js`). Po úpravě zdrojů ho znovu vytvoř příkazem `npm run build` (Node server to dělá sám při `npm start`).

## Nasazení na Cloudflare bez instalace (jen prohlížeč)
Podrobný postup je v souboru `NASAZENI.md`, ve zkratce:
1. Rozbal zip, na github.com vytvoř nový repozitář a přetáhni do něj obsah složky `hextycoon` (bez složky `node_modules`).
2. Na dash.cloudflare.com: Workers & Pages → Create → Import a repository (GitHub) → vyber repozitář. Název Workeru nech **hextycoon** (musí odpovídat `name` v `wrangler.jsonc`). Build command nech prázdný, deploy command `npx wrangler deploy`.
3. Adresa hry je `https://hextycoon.<tvoje-subdomena>.workers.dev`.

Hra se ukládá do úložiště Durable Object (zdarma na Workers Free). Každou změnu v repozitáři Cloudflare sám nasadí; uložená hra a účty zůstanou.

## Node server (volitelně)
```
npm install
npm start            # http://localhost:3000
```
- `PORT`, `DATA_DIR` (trvalý disk, kam se ukládá `game.json`), `MAX_COMPANIES`, `SEED` (mapa pro novou hru), `IDLE_PAUSE=0` (svět běží i bez hráčů).
- Nová hra od nuly: `npm run reset`.

## Přihlášení
Název společnosti + heslo (uloženo jako hash). Prohlížeč si pamatuje přihlašovací klíč. Z jiného zařízení se hráč přihlásí názvem a heslem. Uložené hry z Node serveru a z Cloudflare nejsou přenosné (jiný formát hesel).

## Nástroje
- `node tools/econ-sim.js` – změří ekonomiku bez prohlížeče.
- `node tools/smoke-test.js ws://adresa/ws` – rychlá zkouška běžícího serveru.
