// Zboží, typy tokenů a receptury výroby. Čísla jsou první odhad pro ladění hratelnosti.
//
// Řetězce:
//   uhlí (důl) → elektrárna (energie)      vápenec (lom) + uhlí → cement → města (růst)
//   voda (čerpací stanice) → farma kukuřice → farma zvířat (+ voda) → jatka → maso → města
//   dřevo (těžba) → pila → prkna → nábytek → města        pila → pelety (palivo pro elektrárnu)
// Cargo třídy určují vozidla: goods = kryté, bulk = otevřené / sklápěč, liquid = cisterna.

const GOODS = {
  coal:      { name: 'Uhlí',      cls: 'bulk',    value: 1.0, icon: '⚫' },
  stone:     { name: 'Vápenec',   cls: 'bulk',    value: 0.9, icon: '🪨' },
  wood:      { name: 'Dřevo',     cls: 'bulk',    value: 1.0, icon: '🪵' },
  pellets:   { name: 'Pelety',    cls: 'bulk',    value: 1.2, icon: '🟤' },
  corn:      { name: 'Kukuřice',  cls: 'bulk',    value: 0.9, icon: '🌽' },
  water:     { name: 'Voda',      cls: 'liquid',  value: 0.6, icon: '💧' },
  animals:   { name: 'Zvířata',   cls: 'goods',   value: 1.5, icon: '🐄' },
  milk:      { name: 'Mléko',     cls: 'goods',   value: 1.7, icon: '🥛' },
  meat:      { name: 'Maso',      cls: 'goods',   value: 2.2, icon: '🥩' },
  planks:    { name: 'Prkna',     cls: 'goods',   value: 1.5, icon: '📏' },
  furniture: { name: 'Nábytek',   cls: 'goods',   value: 2.6, icon: '🪑' },
  cement:    { name: 'Cement',    cls: 'goods',   value: 1.8, icon: '🧱' },
  ironore:   { name: 'Železná ruda', cls: 'bulk', value: 1.1, icon: '🟫' },
  sand:      { name: 'Písek',     cls: 'bulk',    value: 0.8, icon: '⏳' },
  wheat:     { name: 'Pšenice',   cls: 'bulk',    value: 1.0, icon: '🌾' },
  flour:     { name: 'Mouka',     cls: 'goods',   value: 1.4, icon: '🥡' },
  bread:     { name: 'Pečivo',    cls: 'goods',   value: 2.0, icon: '🥖' },
  beer:      { name: 'Pivo',      cls: 'goods',   value: 2.4, icon: '🍺' },
  glass:     { name: 'Sklo',      cls: 'goods',   value: 2.2, icon: '🔷' },
  steel:     { name: 'Ocel',      cls: 'flat',    value: 2.4, icon: '🔩' },
  machines:  { name: 'Stroje',    cls: 'flat',    value: 3.4, icon: '⚙' },
  dairy:     { name: 'Mléčné výrobky', cls: 'cold', value: 2.3, icon: '🧀' },
  energy:    { name: 'Elektřina', cls: 'virtual', value: 0,   icon: '⚡' }
};
const CLS_NAME = { goods: 'zboží (kryté vozy)', bulk: 'sypký materiál (sklápěče, otevřené vagony)', liquid: 'kapaliny (cisterny)', flat: 'plošina (ocel a stroje – plošinový návěs, zatím jen silnice)', cold: 'chlazené (chladírenský vůz, zatím jen silnice)' };

// Typy tokenů. levels = počet úrovní; lines = receptury (na jednotku práce); site = kde lze postavit;
// cost = cena postavení; dep = ložisko (po postavení se změní na podnik DEPOSIT_BUILD[type]).
const TOKEN_TYPES = {
  city:       { name: 'Město',            icon: '🏘', top: '#d3cfc0', rim: '#6c7177', sign: '#7cc0f4', levels: 4, city: true },
  dep_coal:   { name: 'Uhelné ložisko',   icon: '⚫', top: '#8a8174', rim: '#4a443b', sign: '#d9a441', levels: 1, dep: true, res: 'coal' },
  dep_limestone: { name: 'Ložisko vápence', icon: '🪨', top: '#bdb8aa', rim: '#6a665c', sign: '#e6e0cf', levels: 1, dep: true, res: 'limestone' },
  dep_iron:   { name: 'Ložisko rudy',   icon: '🟫', top: '#8f6a58', rim: '#4d3a30', sign: '#c9805e', levels: 1, dep: true, res: 'iron' },
  dep_sand:   { name: 'Ložisko písku',  icon: '⏳', top: '#d6c690', rim: '#8a7d52', sign: '#f0e2a8', levels: 1, dep: true, res: 'sand' },
  dep_field:  { name: 'Úrodné pole',      icon: '🌾', top: '#a9b86a', rim: '#5d6a33', sign: '#e8d24a', levels: 1, dep: true, res: 'field' },
  coalmine:   { name: 'Uhelný důl',       icon: '⛏', top: '#7a6f61', rim: '#403a32', sign: '#d9a441', levels: 3, site: 'deposit', cost: 12000,
                lines: [{ id: 'coal', label: 'Uhlí', out: { coal: 1 } }] },
  quarry:     { name: 'Lom na vápenec',   icon: '🪨', top: '#a9a59a', rim: '#625f57', sign: '#e6e0cf', levels: 3, site: 'deposit', cost: 10000,
                lines: [{ id: 'stone', label: 'Vápenec', out: { stone: 1 } }] },
  lumber:     { name: 'Těžba dřeva',      icon: '🪓', top: '#9a8a62', rim: '#4a3f2a', sign: '#b98a4a', levels: 3, site: 'forest', cost: 9000,
                lines: [{ id: 'wood', label: 'Dřevo', out: { wood: 1 } }] },
  pump:       { name: 'Čerpací stanice',  icon: '💧', top: '#8fb0c2', rim: '#4d6877', sign: '#5fd4f4', levels: 3, site: 'lake', cost: 8000,
                lines: [{ id: 'water', label: 'Voda', out: { water: 1 } }] },
  cornfarm:   { name: 'Farma – kukuřice', icon: '🌽', top: '#b9b86e', rim: '#6a6a35', sign: '#e8d24a', levels: 3, site: 'deposit', cost: 9000,
                lines: [{ id: 'corn', label: 'Kukuřice', in: { water: 1 }, out: { corn: 1 } }] },
  animalfarm: { site: 'free', cost: 11000, name: 'Farma – zvířata',  icon: '🐄', top: '#a8b784', rim: '#5c6b3f', sign: '#9bd36a', levels: 3,
                lines: [{ id: 'animals', label: 'Chov na maso', in: { corn: 1, water: 0.5 }, out: { animals: 1 } },
                        { id: 'milk', label: 'Mléko', in: { corn: 0.6, water: 0.8 }, out: { milk: 1 } }] },
  slaughter:  { site: 'free', cost: 12000, name: 'Jatka',            icon: '🥩', top: '#c2a9a4', rim: '#6d5551', sign: '#e07a7a', levels: 3,
                lines: [{ id: 'meat', label: 'Maso', in: { animals: 1 }, out: { meat: 1 } }] },
  sawmill:    { site: 'free', cost: 10000, name: 'Pila',             icon: '🪚', top: '#c4b48e', rim: '#6b5d3d', sign: '#d9b36a', levels: 3,
                lines: [{ id: 'planks', label: 'Prkna', in: { wood: 1 }, out: { planks: 0.85 } },
                        { id: 'pellets', label: 'Pelety (palivo)', in: { wood: 1 }, out: { pellets: 1 } }] },
  furniture:  { site: 'free', cost: 12000, name: 'Výroba nábytku',   icon: '🪑', top: '#c7b7a6', rim: '#6f5f4f', sign: '#e0a56a', levels: 3,
                lines: [{ id: 'furniture', label: 'Nábytek', in: { planks: 1 }, out: { furniture: 0.7 } }] },
  cement:     { site: 'free', cost: 14000, name: 'Cementárna',       icon: '🧱', top: '#b7b9bc', rim: '#5d6166', sign: '#cfd3d8', levels: 3,
                lines: [{ id: 'cement', label: 'Cement', in: { stone: 1, coal: 0.4 }, out: { cement: 0.9 } }] },
  power:      { site: 'free', cost: 20000, name: 'Elektrárna',       icon: '⚡', top: '#9aa0a7', rim: '#565c63', sign: '#f0d23c', levels: 3, auto: true,
                lines: [{ id: 'coal', label: 'Uhlí', in: { coal: 1 }, out: { energy: 2.4 } },
                        { id: 'pellets', label: 'Pelety', in: { pellets: 1.3 }, out: { energy: 2.4 } }] },
  ironmine:   { name: 'Důl na rudu',      icon: '⛏', top: '#8a6a58', rim: '#4a382e', sign: '#c9805e', levels: 3, site: 'deposit', cost: 13000,
                lines: [{ id: 'ironore', label: 'Železná ruda', out: { ironore: 1 } }] },
  sandpit:    { name: 'Pískovna',         icon: '⏳', top: '#cdbd88', rim: '#85784f', sign: '#f0e2a8', levels: 3, site: 'deposit', cost: 9000,
                lines: [{ id: 'sand', label: 'Písek', out: { sand: 1 } }] },
  grainfarm:  { site: 'free', cost: 9000, name: 'Farma – obilí',  icon: '🌾', top: '#c4b95e', rim: '#756d33', sign: '#ecd96a', levels: 3,
                lines: [{ id: 'wheat', label: 'Pšenice', in: { water: 0.5 }, out: { wheat: 1 } }] },
  mill:       { site: 'free', cost: 10000, name: 'Mlýn',            icon: '🥡', top: '#cfc7b4', rim: '#7a7261', sign: '#efe6cc', levels: 3,
                lines: [{ id: 'flour', label: 'Mouka', in: { wheat: 1 }, out: { flour: 0.9 } }] },
  bakery:     { site: 'free', cost: 11000, name: 'Pekárna',         icon: '🥖', top: '#d3b894', rim: '#7d6446', sign: '#eec58a', levels: 3,
                lines: [{ id: 'bread', label: 'Pečivo', in: { flour: 1 }, out: { bread: 1 } }] },
  brewery:    { site: 'free', cost: 13000, name: 'Pivovar',         icon: '🍺', top: '#c9a56a', rim: '#6f5530', sign: '#f2c25a', levels: 3,
                lines: [{ id: 'beer', label: 'Pivo', in: { wheat: 0.6, water: 0.8 }, out: { beer: 1 } }] },
  dairy:      { site: 'free', cost: 11000, name: 'Mlékárna',        icon: '🧀', top: '#d8d6cf', rim: '#7f7d75', sign: '#f4efd8', levels: 3,
                lines: [{ id: 'dairy', label: 'Mléčné výrobky', in: { milk: 1 }, out: { dairy: 0.9 } }] },
  glass:      { site: 'free', cost: 13000, name: 'Sklárna',         icon: '🔷', top: '#b9cdd6', rim: '#5c7480', sign: '#9fe0f4', levels: 3,
                lines: [{ id: 'glass', label: 'Sklo', in: { sand: 1, coal: 0.3 }, out: { glass: 0.8 } }] },
  steel:      { site: 'free', cost: 22000, name: 'Ocelárna',        icon: '🔩', top: '#a4a8ae', rim: '#4d5158', sign: '#ff9a4a', levels: 3,
                lines: [{ id: 'steel', label: 'Ocel', in: { ironore: 1, coal: 0.5 }, out: { steel: 0.8 } }] },
  port:       { site: 'river', cost: 15000, name: 'Přístav', icon: '⚓', top: '#8fa6b8', rim: '#4a6074', sign: '#9fd0f0', levels: 1, port: true, lines: [] },
  machines:   { site: 'free', cost: 18000, name: 'Strojírna',       icon: '⚙', top: '#b6bbc2', rim: '#575d66', sign: '#8fc1ff', levels: 3,
                lines: [{ id: 'machines', label: 'Stroje', in: { steel: 1 }, out: { machines: 0.6 } }] }
};
const DEPOSIT_BUILD = { dep_coal: 'coalmine', dep_limestone: 'quarry', dep_field: 'cornfarm', dep_iron: 'ironmine', dep_sand: 'sandpit' };
const CITY_LEVELS = ['Vesnice', 'Malé město', 'Město', 'Velkoměsto'];

// Výroba
const BASE_RATE = 0.32;                      // jednotek práce za sekundu na úrovni 1
const LVL_RATE = [1, 1.6, 2.4];
const STOCK_CAP = 90;                        // kapacita skladu jednoho zboží v průmyslu
const ENERGY_PRICE = 0.9;                    // Kč za jednotku elektřiny (vlastníkovi elektrárny)
const SALE_PER_T = 3.0;                      // Kč za tunu hodnoty 1.0 – vlastník podniku dostane při odvozu jeho zboží

// Města: spotřeba (t/s na úrovni 1), od jaké úrovně, násobek podle úrovně
// extra: nepovinné zboží – chybějící dodávka nesnižuje spokojenost, ale dodané zboží ji zvyšuje
const CITY_NEEDS = { milk: { w: 0.035, from: 1 }, meat: { w: 0.035, from: 1 }, furniture: { w: 0.03, from: 2 }, cement: { w: 0, from: 1 },
  bread: { w: 0.03, from: 1, extra: true }, dairy: { w: 0.025, from: 1, extra: true }, beer: { w: 0.022, from: 2, extra: true }, glass: { w: 0.02, from: 2, extra: true }, machines: { w: 0.014, from: 3, extra: true } };
const CITY_MULT = [1, 1.8, 3, 4.6];
const CITY_UP = { cost: [15000, 40000, 90000], prosp: [25, 40, 60], cement: [30, 60, 120] };
const IND_UP = { cost: [10000, 25000], infl: [150, 300] };

// Vliv, volby, poplatky
const OWN_MIN = 60;                          // vliv potřebný k převzetí nezávislého podniku
const INFL_DECAY = 0.9992;                   // za sekundu (poločas ~ 14 minut)
const INFL_PER_VALUE = 1.5;                  // vliv za tunu × hodnotu zboží (při nakládce i vykládce)
const ELECTION_T = 360;                      // s mezi volbami
const CAMPAIGN_COST = 3000, CAMPAIGN_INFL = 150, CAMPAIGN_CD = 60;
const FEE_MAX = 40;
const FAIR_FEE = 12;                         // nad touto hodnotou město trpí a starosta ztrácí v nových volbách
const HWY_TOLL = 9;                          // Kč za průjezd jedním polem hotové dálnice (platí se státu)
const TOLL = 3;                              // Kč za průjezd jedním polem cizí silnice
const ROAD_UPKEEP = 0.018, RAIL_UPKEEP = 0.050;       // Kč/s za jedno vlastní pole
// Firma zanikne při dluhu BANKRUPT_AT (automaticky, hráč to jen potvrdí). Cesty bez majitele zmizí za ROAD_DECAY_MIN + náhodně až ROAD_DECAY_SPAN s.
const BANKRUPT_AT = -50000, BANKRUPT_WARN = -25000, ROAD_DECAY_MIN = 180, ROAD_DECAY_SPAN = 600;

const TRADE_GOODS = Object.keys(GOODS).filter(g => GOODS[g].cls !== 'virtual');
function tokenAccepts(tk) {
  const T = TOKEN_TYPES[tk.type], out = [];
  if (T.port) return TRADE_GOODS.slice();
  if (T.city) { for (const g in CITY_NEEDS) if (CITY_NEEDS[g].from <= tk.level) out.push(g); return out; }
  if (!T.lines) return out;
  for (const ln of T.lines) for (const g in (ln.in || {})) if (!out.includes(g)) out.push(g);
  return out;
}
function tokenOutputs(tk) {
  const T = TOKEN_TYPES[tk.type], out = [];
  if (T.port) return TRADE_GOODS.slice();
  if (!T.lines) return out;
  for (const ln of T.lines) for (const g in ln.out) if (g !== 'energy' && !out.includes(g)) out.push(g);
  return out;
}
