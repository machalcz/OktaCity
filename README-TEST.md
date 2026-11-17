# Hex Tycoon ALFA 0.9 – živý test

Svět: mapa ČR, rastr 3 km (182×114 polí). Verze světa `cr-2026-11-19b` (`public/js/config.js`, `WORLD_VER`).

Nově v 0.9: lodě a přístavy na Labi, Vltavě a Moravě · hranice krajů a okresů · dálnice se dostavují v čase (rozestavěné, plánované) a napojit se na ně jde až po dokončení · nadjezdy · údržba cest podle majitele · zrušení firmy · automatický bankrot při dluhu 50 000 Kč · neudržované cesty časem zmizí.

## Důležité pro provoz
- **Změna `WORLD_VER` smaže uloženou hru i všechny účty.** Mění se jen když se změní mapa nebo uložená data. Při běžných opravách ho nech být, hráči o nic nepřijdou.
- Uložení hry: Cloudflare = úložiště Durable Object, Node = `DATA_DIR/game.json`. Hra se ukládá každých 30 s a při odpojení posledního hráče.
- Simulace běží jen, když je někdo připojen (`IDLE_PAUSE=1`). Firmy a cesty se tedy mimo hru nerozpadají a nebankrotují.

## Kontroly před nasazením
```
npm install
npm run build        # přegeneruje server/game.generated.js
npm test             # test světa + test jízdy
npm start            # http://localhost:3000, v druhém okně: npm run smoke
```
Export mapy (jen při změně mapy): `python3 tools/export-mapcr.py --km=3`
