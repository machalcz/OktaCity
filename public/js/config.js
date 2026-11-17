// Základní nastavení.
const CFG = {
  VERSION: 'ALFA 0.9',
  S: 36,               // délka hrany osmiúhelníku (= hrana čtverce mezi nimi)
  WORLD_VER: 'cr-2026-11-19b',   // změň při každé změně mapy / světa: starý uložený stav se pak sám zahodí (reset)
  MAP: 'cr',           // 'cr' = mapa České republiky (data mapcr.js), jinak náhodný ostrov
  COLS: 182,            // počet osmiúhelníků na šířku (včetně moře); pro mapu ČR musí sedět s daty
  ROWS: 114,
  LAND_MIN: 6,         // pevnina leží v oblasti 10×10 uprostřed (indexy 2..11)
  LAND_MAX: 93,

  KERB: 0.5,           // šířka krajnice silnice (0.5 = polovina dálnice; dálnice je široká 1.0 = jako hrana)
  ASPHALT: 0.39,       // šířka asfaltu

  VSCALE: 0.55,        // měřítko vozidel vůči starým rozměrům (kvůli užším silnicím)
  MAX_ARMS: 4,         // do středu pole smí vést nejvýš 4 vozovky / koleje

  RAIL: {
    BALLAST: 0.40,     // šířka štěrkového lože (násobek hrany)
    GAUGE: 0.19,       // rozchod kolejnic (násobek hrany)
    SLEEPER_STEP: 0.13 // rozestup pražců
  },

  COLOR: {
    water: '#3b7fc4',
    waterDark: '#336fae',
    land: '#8c9196',
    green: '#86a863',
    greenAlt: '#7d9f5c',
    urbanAlt: '#82878c',
    landDark: '#82878c',
    grid: 'rgba(0,0,0,0.25)',
    kerb: '#d9d3c1',
    asphalt: '#383b40',
    line: '#e9c44c',
    ballastEdge: '#5b5248',
    ballast: '#a39682',
    sleeper: '#6b4a2f',
    ballastFoot: '#473f35',
    ballastSideLo: '#5b5248',
    ballastSideHi: '#8d806c',
    sleeperDark: '#3a2818',
    railDark: '#2b2d31',
    railSide: '#5c6068',
    padLo: '#23252a',
    padHi: '#3a3d43',
    railSteel: '#d3d8de',
    deck: '#7a6a55',
    deckRail: '#8d9096',
    railing: '#3b3229',
    cliffTop: '#8a7f66',
    cliffBot: '#463e30',
    bridgeTop: '#7a6a55',
    bridgeBot: '#3a2f23',
    white: '#ffffff',
    yellow: '#f0c63c',
    cyan: '#5fd4f4',
    pick: '#ff8a1f'
  },

  STORAGE_KEY: 'hextycoon_session_v1'
};
