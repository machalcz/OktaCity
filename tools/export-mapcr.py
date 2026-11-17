# Export mapy ČR (mapa_cr/index.html) do public/js/mapcr.js.  Spuštění: python3 tools/export-mapcr.py [cesta/k/index.html]
import asyncio, json, sys, re, os
from playwright.async_api import async_playwright
SRC = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else '/home/user/mapa_cr/index.html'
KM = next((a.split('=')[1] for a in sys.argv if a.startswith('--km=')), '3')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'js', 'mapcr.js')
async def main():
    html = open(SRC, encoding='utf8').read()
    html = html.replace('window.HT={', 'window.HT={elev,agri,distr,krajOf,KRAJ_KEYS,KRAJ_NAMES:Object.fromEntries(KRAJ_KEYS.map(k=>[k,KRAJ[k][0]])),', 1)
    tmp = '/tmp/mapcr_export.html'; open(tmp, 'w', encoding='utf8').write(html)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        pg = await b.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + tmp + '?km=' + KM); await pg.wait_for_timeout(2500)
        data = await pg.evaluate("""() => {
          const H = window.HT, N = H.N, COLS = H.COLS, ROWS = H.ROWS;
          const cr = id => id < N ? { t: 'o', c: id % COLS, r: (id / COLS) | 0 } : { t: 's', c: (id - N) % COLS, r: (((id - N) / COLS) | 0) };
          let land = '', elev = '', agri = '';
          for (let i = 0; i < N; i++) { land += H.land[i] ? '1' : '0'; elev += H.land[i] ? Math.min(9, Math.round(H.elev[i] * 9)) : '0'; agri += H.agri[i] ? '1' : '0'; }
          const lakes = []; for (let i = 0; i < N; i++) if (H.lake[i] && H.occ.get(i) && H.occ.get(i).kind === 'lake') lakes.push([i % COLS, (i / COLS) | 0]);
          return {
            COLS, ROWS, CELL_KM: H.CELL_KM, land, elev, agri, lakes,
            districts: H.districts.map(d => ({ name: d.name, kraj: d.kraj })),
            kraje: Object.fromEntries(H.KRAJ_KEYS.map(k => [k, H.KRAJ_NAMES[k]])),
            settlements: H.settlements.map(s => ({ name: s.name, lvl: s.lvl, c: s.cell % COLS, r: (s.cell / COLS) | 0, d: H.distr[s.cell] })),
            sites: H.sites.map(s => ({ type: s.type, name: s.name, c: s.cell % COLS, r: (s.cell / COLS) | 0, d: H.distr[s.cell] })),
            highways: H.highways.map(h => ({ id: h.id, name: h.name, segs: h.segs.map(sg => ({ st: sg.st, cells: sg.cells.map(cr) })) }))
          };
        }""")
        await b.close()
    if errs: print('chyby', errs[:3])
    js = '// VYGENEROVÁNO: tools/export-mapcr.py (z mapa_cr/index.html). Needituj ručně.\nconst CR_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
    open(OUT, 'w', encoding='utf8').write(js)
    print('mapcr.js', len(js) // 1024, 'kB; sídel', len(data['settlements']), 'podniků', len(data['sites']), 'dálnic', len(data['highways']), 'jezer', len(data['lakes']))
asyncio.run(main())
