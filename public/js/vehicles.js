// Modely vozidel: jednoduché kvádry s kolečky, okénky a barvou hráče. Kreslí se v 3D stejně jako mapa.
// Rozměry jsou v násobcích hrany S. Osa u míří dopředu, v doprava ve směru jízdy, z nahoru.
// Barevné klíče: 'P' barva hráče/vozu, 'Pd' tmavší, 'Pl' světlejší, 'Pk' velmi tmavá.

const GLASS = '#26323f', CHASSIS = '#2a2d32', WHEELC = '#14161a', COAL = '#1a1b1d', COAL2 = '#2d2e32', STEEL = '#7b828b';

function Gp(layer, box, col, att, top) { return { layer, box, col, att: att || [], top: top || null }; }
function Ab(box, col, top) { return { box, col, top: top || null }; }

function wheelPair(u, r, vOut, vIn, w) {            // dvě kola (levé a pravé) na ose u
  r = r || 0.11; w = w || 0.065; vOut = vOut || 0.19; vIn = vIn || 0.14;
  const a = Gp(0, [u - w, u + w, vIn, vOut, 0, r], WHEELC), b = Gp(0, [u - w, u + w, -vOut, -vIn, 0, r], WHEELC);
  a.wheel = b.wheel = true;
  return [a, b];
}
function headlights(u, vv, z0, z1) {
  return [Ab([u, u + 0.012, -vv - 0.05, -vv + 0.03, z0, z1], '#f3e9b8'), Ab([u, u + 0.012, vv - 0.03, vv + 0.05, z0, z1], '#f3e9b8')];
}
function taillights(u, vv, z0, z1) {
  return [Ab([u - 0.012, u, -vv - 0.05, -vv + 0.03, z0, z1], '#a8201c'), Ab([u - 0.012, u, vv - 0.03, vv + 0.05, z0, z1], '#a8201c')];
}
function rims(u0, u1, v0, v1, z0, z1, col) {         // okraje otevřené korby
  const t = 0.028;
  return [
    Gp(2, [u0, u1, v0, v0 + t, z0, z1], col), Gp(2, [u0, u1, v1 - t, v1, z0, z1], col),
    Gp(2, [u0, u0 + t, v0, v1, z0, z1], col), Gp(2, [u1 - t, u1, v0, v1, z0, z1], col)
  ];
}
function heap(u0, u1, v0, v1, z) {                    // hromada uhlí
  return [
    Gp(3, [u0, u1, v0, v1, z, z + 0.06], COAL, [], COAL2),
    Gp(3, [u0 + 0.10, u1 - 0.10, v0 + 0.05, v1 - 0.05, z + 0.06, z + 0.105], COAL, [], COAL2)
  ];
}

// ---------- modely ----------
function modelCar() {
  return {
    len: 0.62, wid: 0.30, groups: [
      ...wheelPair(0.20, 0.095, 0.16, 0.12, 0.06), ...wheelPair(-0.20, 0.095, 0.16, 0.12, 0.06),
      Gp(0, [-0.31, 0.31, -0.14, 0.14, 0.05, 0.15], 'B', [...headlights(0.31, 0.10, 0.08, 0.12), ...taillights(-0.31, 0.10, 0.08, 0.12)]),
      Gp(1, [-0.16, 0.12, -0.125, 0.125, 0.15, 0.255], 'B', [
        Ab([-0.115, 0.075, -0.131, 0.131, 0.175, 0.235], GLASS),
        Ab([0.09, 0.126, -0.105, 0.105, 0.17, 0.24], GLASS),
        Ab([-0.176, -0.14, -0.10, 0.10, 0.175, 0.235], GLASS)
      ])
    ]
  };
}

function cabParts(u0, u1, z1, wide) {                 // kabina nákladního auta s okénky
  const w = wide || 0.15;
  return Gp(1, [u0, u1, -w, w, 0.10, z1], 'P', [
    Ab([u1 - 0.03, u1 + 0.012, -w + 0.03, w - 0.03, z1 - 0.13, z1 - 0.025], GLASS),
    Ab([u0 + 0.03, u1 - 0.05, -w - 0.006, w + 0.006, z1 - 0.13, z1 - 0.04], GLASS),
    ...headlights(u1, w - 0.06, 0.13, 0.17)
  ]);
}

function tarpBox(u0, u1, w, z0, z1) {                 // zaplachtovaná korba
  const cut = [];
  for (let i = 1; i <= 3; i++) {
    const u = u0 + (u1 - u0) * i / 4;
    cut.push(Ab([u - 0.012, u + 0.012, -w - 0.004, w + 0.004, z0, z1 - 0.01], 'Pk'));
  }
  return Gp(1, [u0, u1, -w, w, z0, z1], 'Pl', [Ab([u0 + 0.03, u1 - 0.03, -w + 0.05, w - 0.05, z1, z1 + 0.03], 'P'), ...cut, ...taillights(u0, w - 0.06, z0 + 0.02, z0 + 0.06)]);
}

function modelVan() {
  return {
    len: 0.94, wid: 0.32, groups: [
      ...wheelPair(0.30, 0.11), ...wheelPair(-0.27, 0.11),
      Gp(0, [-0.47, 0.47, -0.14, 0.14, 0.05, 0.10], CHASSIS),
      cabParts(0.20, 0.47, 0.32),
      tarpBox(-0.47, 0.17, 0.16, 0.10, 0.36)
    ]
  };
}

function bedBox(u0, u1, w, z0, z1) {                   // sklápěcí korba (otevřená, s okraji)
  return [Gp(1, [u0, u1, -w, w, z0, z1], 'P', [], 'Pk'), ...rims(u0, u1, -w, w, z1, z1 + 0.025, 'P')];
}
function modelDump() {
  return {
    len: 0.94, wid: 0.32, groups: [
      ...wheelPair(0.30, 0.11), ...wheelPair(-0.27, 0.11),
      Gp(0, [-0.47, 0.47, -0.14, 0.14, 0.05, 0.10], CHASSIS),
      cabParts(0.20, 0.47, 0.32),
      ...bedBox(-0.47, 0.17, 0.16, 0.10, 0.29)
    ], cargoAt: { u0: -0.41, u1: 0.12, v: 0.13, z: 0.29 }
  };
}

function modelKamion() {
  return {
    len: 1.60, wid: 0.36, groups: [
      ...wheelPair(0.66, 0.12, 0.20, 0.15, 0.07), ...wheelPair(0.42, 0.12, 0.20, 0.15, 0.07),
      ...wheelPair(-0.46, 0.12, 0.20, 0.15, 0.07), ...wheelPair(-0.64, 0.12, 0.20, 0.15, 0.07),
      Gp(0, [-0.80, 0.80, -0.15, 0.15, 0.06, 0.12], CHASSIS),
      cabParts(0.47, 0.80, 0.42, 0.17),
      Gp(1, [0.30, 0.46, -0.10, 0.10, 0.12, 0.22], CHASSIS),
      tarpBox(-0.80, 0.28, 0.18, 0.12, 0.54)
    ]
  };
}
function modelKamionDump() {
  return {
    len: 1.60, wid: 0.36, groups: [
      ...wheelPair(0.66, 0.12, 0.20, 0.15, 0.07), ...wheelPair(0.42, 0.12, 0.20, 0.15, 0.07),
      ...wheelPair(-0.46, 0.12, 0.20, 0.15, 0.07), ...wheelPair(-0.64, 0.12, 0.20, 0.15, 0.07),
      Gp(0, [-0.80, 0.80, -0.15, 0.15, 0.06, 0.12], CHASSIS),
      cabParts(0.47, 0.80, 0.42, 0.17),
      Gp(1, [0.30, 0.46, -0.10, 0.10, 0.12, 0.22], CHASSIS),
      ...bedBox(-0.80, 0.28, 0.18, 0.12, 0.40)
    ], cargoAt: { u0: -0.74, u1: 0.22, v: 0.145, z: 0.40 }
  };
}

function modelLoco(tier) {
  const h = 0.45 + 0.05 * (tier - 1);                  // půl délky: 0.45 .. 0.60
  const stripes = [];
  for (let i = 0; i < tier; i++) {
    const u = -h + 0.16 + i * 0.075;
    if (u < 0.28 * h) stripes.push(Ab([u, u + 0.03, -0.196, 0.196, 0.17, 0.30], 'Pl'));
  }
  const groups = [
    Gp(0, [-h, h, -0.17, 0.17, 0.07, 0.12], CHASSIS),
    Gp(0, [-0.50 * h - 0.17, -0.50 * h + 0.17, -0.15, 0.15, 0.03, 0.09], '#1f2125'),
    Gp(0, [0.50 * h - 0.17, 0.50 * h + 0.17, -0.15, 0.15, 0.03, 0.09], '#1f2125'),
    ...wheelPair(-0.50 * h - 0.09, 0.10, 0.18, 0.15, 0.055), ...wheelPair(-0.50 * h + 0.09, 0.10, 0.18, 0.15, 0.055),
    ...wheelPair(0.50 * h - 0.09, 0.10, 0.18, 0.15, 0.055), ...wheelPair(0.50 * h + 0.09, 0.10, 0.18, 0.15, 0.055),
    Gp(1, [-h, 0.22 * h, -0.19, 0.19, 0.12, 0.34], 'P', [...stripes, Ab([-h + 0.06, 0.22 * h - 0.06, -0.14, 0.14, 0.34, 0.385], 'Pd'), ...taillights(-h, 0.12, 0.17, 0.22)]),
    Gp(1, [0.22 * h, h, -0.19, 0.19, 0.12, 0.45], 'P', [
      Ab([h - 0.035, h + 0.012, -0.15, 0.15, 0.28, 0.41], GLASS),
      Ab([0.22 * h + 0.06, h - 0.07, -0.196, 0.196, 0.28, 0.40], GLASS),
      ...headlights(h, 0.12, 0.15, 0.20)
    ])
  ];
  if (tier >= 3) groups.push(Gp(2, [-0.35 * h, -0.05 * h, -0.10, 0.10, 0.385, 0.43], 'Pl'));
  if (tier >= 4) groups.push(Gp(2, [-0.80 * h, -0.55 * h, -0.10, 0.10, 0.385, 0.43], 'Pl'));
  return { len: 2 * h, wid: 0.38, groups };
}

function modelWagonCovered() {
  return {
    len: 0.84, wid: 0.38, groups: [
      Gp(0, [-0.42, 0.42, -0.16, 0.16, 0.07, 0.12], CHASSIS),
      Gp(0, [-0.27 - 0.15, -0.27 + 0.15, -0.14, 0.14, 0.03, 0.09], '#1f2125'),
      Gp(0, [0.27 - 0.15, 0.27 + 0.15, -0.14, 0.14, 0.03, 0.09], '#1f2125'),
      ...wheelPair(-0.33, 0.10, 0.17, 0.14, 0.055), ...wheelPair(-0.21, 0.10, 0.17, 0.14, 0.055),
      ...wheelPair(0.21, 0.10, 0.17, 0.14, 0.055), ...wheelPair(0.33, 0.10, 0.17, 0.14, 0.055),
      Gp(1, [-0.40, 0.40, -0.19, 0.19, 0.12, 0.44], 'P', [
        Ab([-0.05, 0.05, -0.195, 0.195, 0.14, 0.40], 'Pk'),
        Ab([-0.40, 0.40, -0.15, 0.15, 0.44, 0.485], 'Pl')
      ])
    ]
  };
}
function modelWagonOpen() {
  return {
    len: 0.84, wid: 0.38, groups: [
      Gp(0, [-0.42, 0.42, -0.16, 0.16, 0.07, 0.12], CHASSIS),
      Gp(0, [-0.27 - 0.15, -0.27 + 0.15, -0.14, 0.14, 0.03, 0.09], '#1f2125'),
      Gp(0, [0.27 - 0.15, 0.27 + 0.15, -0.14, 0.14, 0.03, 0.09], '#1f2125'),
      ...wheelPair(-0.33, 0.10, 0.17, 0.14, 0.055), ...wheelPair(-0.21, 0.10, 0.17, 0.14, 0.055),
      ...wheelPair(0.21, 0.10, 0.17, 0.14, 0.055), ...wheelPair(0.33, 0.10, 0.17, 0.14, 0.055),
      ...bedBox(-0.40, 0.40, 0.19, 0.12, 0.31)
    ], cargoAt: { u0: -0.34, u1: 0.34, v: 0.15, z: 0.31 }
  };
}

function modelFlatbed() {                                // plošinový návěs: nízká plošina, náklad = ocelové svitky a bedny
  return {
    len: 1.60, wid: 0.36, groups: [
      ...wheelPair(0.66, 0.12, 0.20, 0.15, 0.07), ...wheelPair(0.42, 0.12, 0.20, 0.15, 0.07),
      ...wheelPair(-0.46, 0.12, 0.20, 0.15, 0.07), ...wheelPair(-0.64, 0.12, 0.20, 0.15, 0.07),
      Gp(0, [-0.80, 0.80, -0.15, 0.15, 0.06, 0.12], CHASSIS),
      cabParts(0.47, 0.80, 0.42, 0.17),
      Gp(1, [0.30, 0.46, -0.10, 0.10, 0.12, 0.22], CHASSIS),
      Gp(1, [-0.80, 0.28, -0.18, 0.18, 0.12, 0.17], 'Pk', [Ab([-0.80, 0.28, -0.18, -0.15, 0.17, 0.205], 'P'), Ab([-0.80, 0.28, 0.15, 0.18, 0.17, 0.205], 'P')])
    ], cargoAt: { u0: -0.74, u1: 0.22, v: 0.15, z: 0.17 }
  };
}
function modelReefer() {                                 // chladírenský vůz: světlá skříň s chladicí jednotkou na čele
  return {
    len: 1.20, wid: 0.34, groups: [
      ...wheelPair(0.50, 0.115, 0.19, 0.145, 0.065), ...wheelPair(-0.34, 0.115, 0.19, 0.145, 0.065), ...wheelPair(-0.50, 0.115, 0.19, 0.145, 0.065),
      Gp(0, [-0.60, 0.60, -0.145, 0.145, 0.06, 0.115], CHASSIS),
      cabParts(0.36, 0.60, 0.38, 0.16),
      Gp(1, [-0.60, 0.32, -0.17, 0.17, 0.115, 0.50], '#e9edf0', [Ab([0.20, 0.30, -0.10, 0.10, 0.40, 0.46], '#7f8d99'), Ab([-0.60, -0.57, -0.14, 0.14, 0.16, 0.44], 'P'), Ab([-0.30, -0.27, -0.176, 0.176, 0.12, 0.49], '#c4ccd2'), Ab([0.0, 0.03, -0.176, 0.176, 0.12, 0.49], '#c4ccd2')])
    ]
  };
}

function modelShip(kind) {
  const L = { 1: 2.2, 2: 3.0, 4: 3.7 }[kind], Wd = { 1: 0.56, 2: 0.64, 4: 0.90 }[kind], h = L / 2, w = Wd / 2;
  const HULL = '#3d4b5c', g = [];
  g.push(Gp(0, [-h, h - 0.36, -w, w, 0.0, 0.17], HULL, [Ab([-h, h - 0.36, -w - 0.004, w + 0.004, 0.02, 0.055], 'Pd')]));
  g.push(Gp(0, [h - 0.36, h - 0.20, -w * 0.82, w * 0.82, 0.0, 0.17], HULL));
  g.push(Gp(0, [h - 0.20, h - 0.08, -w * 0.52, w * 0.52, 0.0, 0.17], HULL));
  g.push(Gp(0, [h - 0.08, h, -w * 0.2, w * 0.2, 0.0, 0.17], HULL));
  g.push(Gp(1, [-h + 0.02, h - 0.36, -w + 0.02, w - 0.02, 0.17, 0.20], '#8a8f95'));
  const dh0 = -h + 0.04, dh1 = dh0 + (kind == 1 ? 0.38 : 0.48), dw = w * 0.8;
  g.push(Gp(2, [dh0, dh1, -dw, dw, 0.20, 0.52], 'P', [Ab([dh1 - 0.02, dh1 + 0.012, -dw + 0.04, dw - 0.04, 0.36, 0.48], GLASS), Ab([dh0 + 0.04, dh1 - 0.06, -dw - 0.006, dw + 0.006, 0.36, 0.48], GLASS)]));
  g.push(Gp(3, [dh0 + 0.05, dh0 + 0.17, -0.07, 0.07, 0.52, 0.70], '#c9ccd0', [Ab([dh0 + 0.05, dh0 + 0.17, -0.071, 0.071, 0.62, 0.66], 'Pd')]));
  const hu0 = dh1 + 0.06, hu1 = h - 0.46; let holds = [];
  if (kind == 1) holds.push([hu0, hu1, -w + 0.07, w - 0.07]);
  if (kind == 2) { const m = (hu0 + hu1) / 2; holds.push([hu0, m - 0.025, -w + 0.07, w - 0.07], [m + 0.025, hu1, -w + 0.07, w - 0.07]); }
  if (kind == 4) { const m = (hu0 + hu1) / 2; holds.push([hu0, m - 0.025, -w + 0.06, -0.02], [hu0, m - 0.025, 0.02, w - 0.06], [m + 0.025, hu1, -w + 0.06, -0.02], [m + 0.025, hu1, 0.02, w - 0.06]); }
  holds.forEach(b => { g.push(Gp(2, [b[0], b[1], b[2], b[3], 0.20, 0.31], 'Pk')); g.push(...rims(b[0], b[1], b[2], b[3], 0.31, 0.335, 'P')); });
  return { len: L, wid: Wd, groups: g, holds: holds.map(b => [b[0] + 0.035, b[1] - 0.035, b[2] + 0.035, b[3] - 0.035, 0.20, 0.325]) };
}

function modelTanker() {
  return {
    len: 1.60, wid: 0.36, groups: [
      ...wheelPair(0.66, 0.12, 0.20, 0.15, 0.07), ...wheelPair(0.42, 0.12, 0.20, 0.15, 0.07),
      ...wheelPair(-0.46, 0.12, 0.20, 0.15, 0.07), ...wheelPair(-0.64, 0.12, 0.20, 0.15, 0.07),
      Gp(0, [-0.80, 0.80, -0.15, 0.15, 0.06, 0.12], CHASSIS),
      cabParts(0.47, 0.80, 0.42, 0.17),
      Gp(1, [0.30, 0.46, -0.10, 0.10, 0.12, 0.22], CHASSIS),
      Gp(1, [-0.80, 0.28, -0.17, 0.17, 0.14, 0.50], '#c9d3da', [Ab([-0.55, -0.49, -0.176, 0.176, 0.14, 0.50], '#8aa0ae'), Ab([-0.15, -0.09, -0.176, 0.176, 0.14, 0.50], '#8aa0ae'), Ab([0.2, 0.26, -0.176, 0.176, 0.14, 0.50], '#8aa0ae'), Ab([-0.70, 0.18, -0.10, 0.10, 0.50, 0.545], '#aab7c0')], '#e6edf1')
    ]
  };
}
function modelWagonTank() {
  return {
    len: 0.84, wid: 0.38, groups: [
      Gp(0, [-0.42, 0.42, -0.16, 0.16, 0.07, 0.12], CHASSIS),
      Gp(0, [-0.27 - 0.15, -0.27 + 0.15, -0.14, 0.14, 0.03, 0.09], '#1f2125'),
      Gp(0, [0.27 - 0.15, 0.27 + 0.15, -0.14, 0.14, 0.03, 0.09], '#1f2125'),
      ...wheelPair(-0.33, 0.10, 0.17, 0.14, 0.055), ...wheelPair(-0.21, 0.10, 0.17, 0.14, 0.055),
      ...wheelPair(0.21, 0.10, 0.17, 0.14, 0.055), ...wheelPair(0.33, 0.10, 0.17, 0.14, 0.055),
      Gp(1, [-0.40, 0.40, -0.17, 0.17, 0.12, 0.40], '#c9d3da', [Ab([-0.3, -0.24, -0.176, 0.176, 0.12, 0.40], '#8aa0ae'), Ab([0.24, 0.30, -0.176, 0.176, 0.12, 0.40], '#8aa0ae'), Ab([-0.3, 0.3, -0.07, 0.07, 0.40, 0.44], '#aab7c0')], '#e6edf1')
    ]
  };
}

const GOODS_COL = { coal: ['#1a1b1d', '#2d2e32'], stone: ['#c9c5b8', '#e3dfd3'], wood: ['#8a5a32', '#b4824f'], pellets: ['#6b4a2f', '#8b6a44'], corn: ['#d3bf3f', '#ebd95e'], water: ['#4a86c4', '#7fb2e0'], animals: ['#8a6a4a', '#b08a66'], milk: ['#e8e6e0', '#ffffff'], meat: ['#b04a4a', '#d06a6a'], planks: ['#d9b878', '#ead29a'], furniture: ['#a67c52', '#c49a6c'], cement: ['#a9acb0', '#cfd2d6'], ironore: ['#7a4a38', '#9a6450'], sand: ['#d6c58a', '#ecdca4'], wheat: ['#d9b94a', '#f0d46a'], flour: ['#ece6d6', '#fbf7ec'], bread: ['#c98a4a', '#e0a866'], beer: ['#d9a032', '#f0c24e'], glass: ['#8fc9d8', '#b8e4ee'], steel: ['#6c7380', '#8d95a3'], machines: ['#4a6fa5', '#6c91c7'], dairy: ['#f2ecd0', '#fffbe6'] };
const MODEL_CACHE = {};
function modelFor(item) {
  const it = ECON.ITEMS[item] || {};
  const key = item || 'car';
  if (MODEL_CACHE[key]) return MODEL_CACHE[key];
  let m;
  switch (item) {
    case 'van': m = modelVan(); break;
    case 'dump': m = modelDump(); break;
    case 'kamion': m = modelKamion(); break;
    case 'kamionDump': m = modelKamionDump(); break;
    case 'ship1': m = modelShip(1); break;
    case 'ship2': m = modelShip(2); break;
    case 'ship4': m = modelShip(4); break;
    case 'flatbed': m = modelFlatbed(); break;
    case 'reefer': m = modelReefer(); break;
    case 'tanker': m = modelTanker(); break;
    case 'wagonTank': m = modelWagonTank(); break;
    case 'loco1': m = modelLoco(1); break;
    case 'loco2': m = modelLoco(2); break;
    case 'loco3': m = modelLoco(3); break;
    case 'loco4': m = modelLoco(4); break;
    case 'wagonCovered': m = modelWagonCovered(); break;
    case 'wagonOpen': m = modelWagonOpen(); break;
    default: m = modelCar();
  }
  MODEL_CACHE[key] = m;
  return m;
}

// ---------- barvy ----------
const _rgbCache = {};
function rgbOf(h) { let c = _rgbCache[h]; if (!c) { c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); _rgbCache[h] = c; } return c; }
const _shadeCache = new Map();
function shade(h, f) {
  const key = h + '|' + Math.round(f * 100);
  let r = _shadeCache.get(key);
  if (!r) { const c = rgbOf(h), k = Math.round(f * 100) / 100; r = 'rgb(' + c.map(v => Math.max(0, Math.min(255, Math.round(v * k)))).join(',') + ')'; _shadeCache.set(key, r); }
  return r;
}
function paletteFor(color) {
  return { P: color, Pd: shadeHex(color, 0.72), Pl: lightenHex(color, 0.22), Pk: shadeHex(color, 0.42), B: color };
}
function shadeHex(h, f) { const c = rgbOf(h).map(v => Math.round(v * f)); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); }
function lightenHex(h, t) { const c = rgbOf(h).map(v => Math.round(v + (255 - v) * t)); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); }

// ---------- kvádr ve 3D ----------
let LOD_LOW = false;
let VZ = 0;                                           // pixelů na jednotku S výšky (podle pohledu a zoomu)

// fr = { x, y, c, s, zb }: poloha a směr jednotky, zb = výška podkladu (násyp apod.) v násobcích S
function drawBox(ctx, fr, box, col, topCol) {
  const S = CFG.S * (fr.vs || 1), u0 = box[0], u1 = box[1], v0 = box[2], v1 = box[3], z0 = box[4], z1 = box[5];
  const fc = fr.c * S, fs = fr.s * S, cp = fr.cp === undefined ? 1 : fr.cp, sp = fr.sp || 0;
  const o = w2s(fr.x, fr.y, true), ex = w2s(fr.x + fc, fr.y + fs, true), ey = w2s(fr.x - fs, fr.y + fc, true);
  const ux = ex.x - o.x, uy = ex.y - o.y, vx = ey.x - o.x, vy = ey.y - o.y;
  const base = (fr.zb + (fr.zr || 0)) * VZ, vz = VZ * (fr.vs || 1);
  // vrchol (u, v, z) -> obrazovka; náklon kolem příčné osy (stoupání rampy)
  const V = (u, v, z) => { const ue = u * cp - z * sp, he = u * sp + z * cp; return { x: o.x + ux * ue + vx * v, y: o.y + uy * ue + vy * v - base - he * vz }; };
  if (VZ > 0) {
    const sides = [
      [[u1, v0], [u1, v1], fr.c, fr.s],            // vpředu
      [[u0, v0], [u0, v1], -fr.c, -fr.s],          // vzadu
      [[u0, v1], [u1, v1], -fr.s, fr.c],           // vpravo
      [[u0, v0], [u1, v0], fr.s, -fr.c]            // vlevo
    ];
    for (const sd of sides) {
      const pn = projDelta(sd[2], sd[3]);
      if (pn.y <= 0.001) continue;
      const L = Math.hypot(pn.x, pn.y) || 1;
      const f = 0.72 + 0.20 * (-pn.x / L) + 0.07 * (pn.y / L);
      const a = V(sd[0][0], sd[0][1], z0), b = V(sd[1][0], sd[1][1], z0), c2 = V(sd[1][0], sd[1][1], z1), d2 = V(sd[0][0], sd[0][1], z1);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(d2.x, d2.y); ctx.closePath();
      ctx.fillStyle = shade(col, f); ctx.fill();
      if (!LOD_LOW) { ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.stroke(); }
    }
  }
  const t0 = V(u0, v0, z1), t1 = V(u1, v0, z1), t2 = V(u1, v1, z1), t3 = V(u0, v1, z1);
  ctx.beginPath(); ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.lineTo(t3.x, t3.y); ctx.closePath();
  ctx.fillStyle = shade(topCol || col, 1.10); ctx.fill();
  if (!LOD_LOW) { ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(0,0,0,0.30)'; ctx.stroke(); }
}

function resolveCol(c, pal) { return c.charAt(0) === '#' ? c : pal[c]; }

// Jedna jednotka (auto, lokomotiva, vagon). fr – poloha, pal – barvy, loaded – naložená.
function drawModelUnit(ctx, fr, model, pal, loaded, gcol, holdCols) {
  const S = CFG.S * (fr.vs || 1);
  // stín na zemi
  const hl = model.len / 2 + 0.03, hw = model.wid / 2 + 0.03;
  const sh = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].map(([u, v]) => {
    const px = fr.x + (fr.c * u - fr.s * v) * S + S * 0.07, py = fr.y + (fr.s * u + fr.c * v) * S + S * 0.09;
    return w2s(px, py, true);
  });
  const shz = (fr.zb * 0.5 + (fr.zr || 0)) * VZ;
  ctx.beginPath(); sh.forEach((p, i) => i ? ctx.lineTo(p.x, p.y - shz) : ctx.moveTo(p.x, p.y - shz));
  ctx.closePath(); ctx.fillStyle = 'rgba(0,0,0,0.26)'; ctx.fill();

  // pořadí: vrstva, pak vzdálenost od kamery
  const nearRight = projDelta(-fr.s, fr.c).y > 0;     // je pravý bok (v > 0) blíž ke kameře?
  const groups = model.groups.map((g, i) => {
    const b = g.box, uc = (b[0] + b[1]) / 2, vc = (b[2] + b[3]) / 2;
    const q = w2s(fr.x + (fr.c * uc - fr.s * vc) * S, fr.y + (fr.s * uc + fr.c * vc) * S, true);
    let layer = g.layer;
    if (g.wheel && (vc > 0) === nearRight) layer = 0.5;       // bližší kola se kreslí až po karoserii
    return { g, d: q.y, i, layer };
  });
  groups.sort((a, b) => a.layer - b.layer || a.d - b.d || a.i - b.i);
  for (const e of groups) {
    const g = e.g;
    drawBox(ctx, fr, g.box, resolveCol(g.col, pal), g.top ? resolveCol(g.top, pal) : null);
    for (const a of g.att) drawBox(ctx, fr, a.box, resolveCol(a.col, pal), a.top ? resolveCol(a.top, pal) : null);
  }
  if (model.holds && holdCols) model.holds.forEach((b, i) => { const c = holdCols[i]; if (c) drawBox(ctx, fr, b, c[0], c[1]); });
  if (loaded && model.cargoAt) {
    const c = model.cargoAt;
    let gi = 0;
    for (const g of heap(c.u0, c.u1, -c.v, c.v, c.z)) { drawBox(ctx, fr, g.box, gcol ? gcol[gi % 2] : g.col, gcol ? gcol[(gi + 1) % 2] : g.top); gi++; }
  }
}

// ---------- sdružené kreslení všech objektů s pořadím podle hloubky ----------
function addDrawable(list, wx, wy, fn) {
  const vr = window.__vr;
  if (vr && (wx < vr.x0 || wx > vr.x1 || wy < vr.y0 || wy > vr.y1)) return;
  list.push({ d: w2s(wx, wy, true).y, fn });
}

function drawEntities(ctx, state) {
  const sim = state.sim;
  VZ = CFG.S * state.cam.zoom * viewK();
  LOD_LOW = state.cam.zoom < 0.5;
  const list = [];
  const S = CFG.S;
  window.__hwBr = new Map();

  // svět, stanice
  window.__vr = visWorldRect(3 * A);
  collectWorldDrawables(state, list, window.__vr);
  // závory a semafory
  collectGearDrawables(state, list);
  // vozidla
  for (const u of sim.units) collectUnitDrawables(state, u, list);
  if (sim.ambList) for (const u of sim.ambList) collectUnitDrawables(state, u, list);
  const vr = window.__vr;

  if (state.map.hw && state.map.hw.size) hwCollect(list, vr);
  if (state.railSim) rsCollectSignals(list, state.railSim);
  list.sort((a, b) => a.d - b.d);
  applyScreen(ctx);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const tk of state.map.tokens) { const c = tokenCenter(tk); if (c.x >= window.__vr.x0 && c.x <= window.__vr.x1 && c.y >= window.__vr.y0 && c.y <= window.__vr.y1) drawTokenDisc(ctx, tk); }
  drawSiteHints(ctx);
  for (const it of list) it.fn(ctx);
  drawFloaters(ctx, state);
}

function collectUnitDrawables(state, u, list) {
  const S = CFG.S;
  if (u.hidden) return;
  if (u.kind === 'road') {
    if (u.x === undefined) return;
    const m = modelFor(u.model);
    const pal = paletteFor(u.owner ? playerColor(u.pid) : u.color);
    let fr = { x: u.x, y: u.y, c: Math.cos(u.ang), s: Math.sin(u.ang), zb: u.zb || 0, vs: CFG.VSCALE };
    if (!u.under) fr = hwVehFrame(fr, u.x, u.y, u.ang);          // vozidla na dálnici (u.under) výšku nemění
    const al = u.fade === undefined ? 1 : Math.max(0, Math.min(1, u.fade));
    const gc = u.loaded && u.goods ? GOODS_COL[u.goods] : null;
    const n0 = list.length;
    addDrawable(list, u.x, u.y, ctx => { if (al < 1) ctx.globalAlpha = al; drawModelUnit(ctx, fr, m, pal, u.loaded, gc); ctx.globalAlpha = 1; });
    hwDrawableFix(list, n0, u.x, u.y, !!u.under, u.ang, m.len * CFG.VSCALE * S / 2);
  } else if (u.kind === 'ship') {
    if (u.x === undefined) return;
    const m = modelFor(u.model), pal = paletteFor(playerColor(u.pid)), al = u.fade === undefined ? 1 : Math.max(0, Math.min(1, u.fade));
    const hc = (u.holds || []).map(h => h.amt > 0.01 ? (GOODS_COL[h.g] || ['#888', '#aaa']) : null);
    addDrawable(list, u.x, u.y, ctx => {
      const fr = { x: u.x, y: u.y, c: Math.cos(u.ang), s: Math.sin(u.ang), zb: -(liftPx() / Math.max(VZ, 1)), vs: CFG.VSCALE };
      if (al < 1) ctx.globalAlpha = al; drawModelUnit(ctx, fr, m, pal, false, null, hc); ctx.globalAlpha = 1;
    });
  } else {
    const poses = u.poses || trainPoses(u);
    const pal = paletteFor(playerColor(u.pid));
    const gc = u.loaded && u.goods ? GOODS_COL[u.goods] : null;
    for (const p of poses) {
      const m = modelFor(p.item);
      const fr = hwVehFrame({ x: p.x, y: p.y, c: Math.cos(p.ang), s: Math.sin(p.ang), zb: 0.15, vs: CFG.VSCALE }, p.x, p.y, p.ang);
      const n0 = list.length;
      addDrawable(list, p.x, p.y, ctx => drawModelUnit(ctx, fr, m, pal, u.loaded && !!ECON.ITEMS[p.item].wagon, gc));
      hwDrawableFix(list, n0, p.x, p.y, false);
    }
  }
}

function drawFloaters(ctx, state) {
  const z = state.cam.zoom;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of state.sim.floaters) {
    const p = w2s(f.x, f.y, true);
    const a = Math.max(0, 1 - f.t / 2.2);
    ctx.globalAlpha = a;
    ctx.font = 'bold 13px sans-serif';
    const y = p.y - 26 - f.t * 22 * Math.max(0.8, Math.min(z, 1.6));
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.strokeText(f.text, p.x, y);
    ctx.fillStyle = f.color || '#8cf59a'; ctx.fillText(f.text, p.x, y);
    ctx.globalAlpha = 1;
  }
}

// ======================= SVĚT: budovy, důl, elektrárna, vedení, stromy =======================
const WIN_DARK = '#3a4a5c', WIN_LIT = '#e8d490';

function drawWindows(ctx, fr, hw, hd, h, kind, idx) {
  if (VZ <= 0 || h < 0.3 || LOD_LOW) return;
  const t = 0.007;
  const rows = Math.max(1, Math.round((h - 0.1) / (kind === 'tower' ? 0.17 : 0.22)));
  const faces = [
    { n: { x: 0, y: 1 },  w: hw, mk: (z0, z1) => [-hw + 0.06, hw - 0.06, hd, hd + t, z0, z1] },
    { n: { x: 0, y: -1 }, w: hw, mk: (z0, z1) => [-hw + 0.06, hw - 0.06, -hd - t, -hd, z0, z1] },
    { n: { x: 1, y: 0 },  w: hd, mk: (z0, z1) => [hw, hw + t, -hd + 0.06, hd - 0.06, z0, z1] },
    { n: { x: -1, y: 0 }, w: hd, mk: (z0, z1) => [-hw - t, -hw, -hd + 0.06, hd - 0.06, z0, z1] }
  ];
  for (const f of faces) {
    if (projDelta(f.n.x, f.n.y).y <= 0.001) continue;
    for (let r = 0; r < rows; r++) {
      const z0 = 0.08 + r * (h - 0.13) / rows;
      const lit = hash2(idx, r + 7, 99) > 0.8;
      drawBox(ctx, fr, f.mk(z0, z0 + (kind === 'tower' ? 0.085 : 0.07)), lit ? WIN_LIT : WIN_DARK);
    }
  }
}

function drawBuilding(ctx, b) {
  const hw = b.w / 2, hd = b.d / 2, fr = { x: b.x, y: b.y, c: 1, s: 0, zb: b.z || 0 };
  ctx.save();
  // stín
  if (!LOD_LOW) {
    const sh = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => w2s(b.x + (u + 0.12 + b.h * 0.1) * CFG.S, b.y + (v + 0.14 + b.h * 0.1) * CFG.S, true));
    ctx.beginPath(); sh.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.20)'; ctx.fill();
  }

  if (b.k === 'house') {
    drawBox(ctx, fr, [-hw, hw, -hd, hd, 0, b.h * 0.62], b.col, '#d0c8b4');
    // sedlová střecha: dva šikmé hranoly aproximované třemi vrstvami
    const rh = Math.max(0.16, b.h * 0.38);
    for (let i = 0; i < 3; i++) {
      const f = i / 3, inset = hd * 0.9 * f;
      drawBox(ctx, fr, [-hw - 0.03, hw + 0.03, -hd - 0.03 + inset, hd + 0.03 - inset, b.h * 0.62 + rh * f, b.h * 0.62 + rh * (f + 1 / 3)], b.roof);
    }
    if (VZ > 0 && b.w > 0.5) drawWindows(ctx, fr, hw, hd, b.h * 0.62, 'house', b.idx);
  } else if (b.k === 'tower') {
    drawBox(ctx, fr, [-hw, hw, -hd, hd, 0, b.h], b.col, b.roof);
    drawWindows(ctx, fr, hw, hd, b.h, 'tower', b.idx);
    drawBox(ctx, fr, [-hw * 0.35, hw * 0.35, -hd * 0.35, hd * 0.35, b.h, b.h + 0.14], '#586069', '#7a828c');
  } else if (b.k === 'factory') {
    drawBox(ctx, fr, [-hw, hw, -hd, hd, 0, b.h], b.col, b.roof);
    for (let i = 0; i < 3; i++) drawBox(ctx, fr, [-hw + 0.1 + i * hw * 0.62, -hw + 0.1 + i * hw * 0.62 + hw * 0.5, -hd, hd, b.h, b.h + 0.18], b.roof, '#98a0a8');
    if (b.chim) drawBox(ctx, fr, [hw * 0.55, hw * 0.55 + 0.16, hd * 0.35, hd * 0.35 + 0.16, b.h, b.h + 1.1], '#7c5a4a', '#5a4034');
    drawBox(ctx, fr, [-hw * 0.25, hw * 0.25, hd, hd + 0.01, 0.0, 0.32], '#4a525c');
  } else if (b.k === 'ware') {
    drawBox(ctx, fr, [-hw, hw, -hd, hd, 0, b.h], b.col, b.roof);
    drawBox(ctx, fr, [-hw * 0.7, -hw * 0.1, hd, hd + 0.01, 0, 0.28], '#4a525c');
  } else {                                     // block
    drawBox(ctx, fr, [-hw, hw, -hd, hd, 0, b.h], b.col, b.roof);
    drawWindows(ctx, fr, hw, hd, b.h, 'block', b.idx);
  }
  ctx.restore();
}

// ---- válec (komín, chladicí věž, silo) ----
function drawCyl(ctx, st) {
  const S = CFG.S, z = state.cam.zoom;
  const base = w2s(st.x, st.y, true), r0 = st.r * S * z;
  base.y -= (st.z0 || 0) * VZ;
  const h = st.h * VZ, tilt = Math.max(VIEW.tilt, 0.35);
  const taper = st.taper || 1;
  const rAt = f => r0 * (1 - (1 - taper) * Math.sin(Math.min(1, f) * Math.PI * 0.5) * 0.92);
  const n = 22;
  // tělo po segmentech
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i <= n; i++) { const f = i / n, y = base.y - h * f, r = (st.taper ? r0 * (1 - (1 - taper) * (1 - Math.abs(2 * f - 1) * 0.0) * 0) : r0) ; }
  const prof = f => st.taper ? r0 * (taper + (1 - taper) * Math.pow(Math.abs(f - 0.62) / 0.62, 1.4) * (f < 0.62 ? 1 : 0.55)) : r0;
  ctx.moveTo(base.x - prof(0), base.y);
  for (let i = 1; i <= n; i++) { const f = i / n; ctx.lineTo(base.x - prof(f), base.y - h * f); }
  for (let i = n; i >= 0; i--) { const f = i / n; ctx.lineTo(base.x + prof(f), base.y - h * f); }
  ctx.closePath();
  const g = ctx.createLinearGradient(base.x - r0, 0, base.x + r0, 0);
  g.addColorStop(0, shade(st.col, 0.78)); g.addColorStop(0.45, shade(st.col, 1.08)); g.addColorStop(1, shade(st.col, 0.62));
  ctx.fillStyle = g; ctx.fill();
  if (st.band) {
    for (const f of [0.25, 0.5, 0.75]) {
      ctx.fillStyle = st.band; ctx.fillRect(base.x - prof(f), base.y - h * (f + 0.07), prof(f) * 2, h * 0.07);
    }
  }
  ctx.restore();
  // horní okraj
  const rt = prof(1), ty = base.y - h;
  ctx.beginPath(); ctx.ellipse(base.x, ty, rt, rt * tilt, 0, 0, Math.PI * 2);
  ctx.fillStyle = st.top || shade(st.col, 0.5); ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke();
  if (st.steam) {
    const t = performance.now() / 1000;
    for (let i = 0; i < 5; i++) {
      const ph = ((t * 0.18 + i / 5 + hash2(st.x | 0, st.y | 0, 3)) % 1);
      const sy = ty - ph * r0 * 3.4, sr = rt * (0.55 + ph * 1.1);
      ctx.globalAlpha = 0.5 * (1 - ph);
      ctx.beginPath(); ctx.arc(base.x + Math.sin(ph * 4 + i) * rt * 0.25 + ph * r0 * 0.6, sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = '#f2f4f6'; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function drawPile(ctx, st) {
  const S = CFG.S;
  const fr = { x: st.x, y: st.y, c: 1, s: 0, zb: st.z0 || 0 };
  const hw = st.w / 2, hd = st.d / 2, n = 4;
  for (let i = 0; i < n; i++) {
    const f = i / n, ins = f * 0.4;
    drawBox(ctx, fr, [-hw * (1 - ins), hw * (1 - ins), -hd * (1 - ins), hd * (1 - ins), st.h * f, st.h * (f + 1 / n)], i % 2 ? (st.c2 || '#222427') : (st.c1 || '#1a1b1d'), st.c1 ? shade(st.c2 || st.c1, 1) : '#34363b');
  }
}

function drawPart(ctx, p) {
  if (p.t === 'bld') drawBuilding(ctx, p);
  else if (p.t === 'box') {
    const fr = { x: p.x, y: p.y, c: 1, s: 0, zb: p.z0 || 0 }, hw = p.w / 2, hd = p.d / 2;
    drawBox(ctx, fr, [-hw, hw, -hd, hd, 0, p.h], p.col, p.top);
  } else if (p.t === 'cyl') drawCyl(ctx, p);
  else if (p.t === 'pile') drawPile(ctx, p);
  else if (p.t === 'tree') drawTree(ctx, p);
}

// Které popisky se kreslí: při oddálení jen okresní a pak jen krajská města, a vždy bez vzájemného překrývání
// (důležitější popisek má přednost). Vybraný token má popisek vždy.
const LBL_ALL = 0.32, LBL_DISTRICT = 0.2;
function tkTier(tk) { return tk.lblTier !== undefined ? tk.lblTier : (isCity(tk) ? 1 : 0); }
function visibleLabels(map, z, vr) {
  const out = new Set(), sel = typeof UI !== 'undefined' ? UI.cardId : null;
  const minT = z >= LBL_ALL ? 0 : z >= LBL_DISTRICT ? 2 : 3, cull = z < 1.0;
  const cand = [];
  for (const tk of map.tokens) {
    const c = tokenCenter(tk);
    if (c.x < vr.x0 || c.x > vr.x1 || c.y < vr.y0 || c.y > vr.y1) continue;
    if (tkTier(tk) < minT && tk.id !== sel) continue;
    cand.push(tk);
  }
  if (!cull) { for (const tk of cand) out.add(tk.id); return out; }
  cand.sort((a, b) => (b.id === sel) - (a.id === sel) || tkTier(b) - tkTier(a) || (isCity(b) ? b.level : 0) - (isCity(a) ? a.level : 0));
  const rects = [];
  for (const tk of cand) {
    const c = tokenCenter(tk), p = w2s(c.x, c.y, true), y = p.y - (tk.hmax + 0.25) * VZ - 6;
    const tw = Math.max(tk.name.length * 7.2, 70) + 16, r = { x0: p.x - tw / 2 - 2, x1: p.x + tw / 2 + 2, y0: y - 34, y1: y + 2 };
    if (tk.id !== sel && rects.some(q => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0)) continue;
    rects.push(r); out.add(tk.id);
  }
  return out;
}

function collectWorldDrawables(state, list, vr) {
  const map = state.map, z = state.cam.zoom, S = CFG.S;
  const lbl = visibleLabels(map, z, vr);
  for (const tk of map.tokens) {
    const c = tokenCenter(tk);
    if (c.x < vr.x0 || c.x > vr.x1 || c.y < vr.y0 || c.y > vr.y1) continue;
    for (const p of tk.parts) list.push({ d: w2s(p.x, p.y + (p.d || p.r || 0.2) * 0.5 * S, true).y, fn: ctx => drawPart(ctx, p) });
    if (lbl.has(tk.id)) list.push({ d: w2s(c.x, c.y, true).y + 2000, fn: ctx => drawTokenLabel(ctx, tk) });      // popisek vždy nahoře
  }
  if (z >= 0.4) {
    const TL = map.trees;
    for (let i = 0; i < TL.length; i++) {
      const t = TL[i];
      if (t.x < vr.x0 || t.x > vr.x1 || t.y < vr.y0 || t.y > vr.y1) continue;
      addDrawable(list, t.x, t.y, ctx => drawTree(ctx, t));
    }
  }
  const P = map.poles;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    if (p.x >= vr.x0 && p.x <= vr.x1 && p.y >= vr.y0 && p.y <= vr.y1) addDrawable(list, p.x, p.y, ctx => drawPole(ctx, p));
    if (i + 1 < P.length && !p.end) {
      const q = P[i + 1], mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      if (mx >= vr.x0 - 6 * A && mx <= vr.x1 + 6 * A && my >= vr.y0 - 6 * A && my <= vr.y1 + 6 * A) {
        list.push({ d: w2s(mx, my, true).y + 1, fn: ctx => drawWires(ctx, p, q) });
      }
    }
  }
}

// Kulatá podložka tokenu (kreslí se pod objekty).
function drawMultiDisc(ctx, tk, def) {
  const S = CFG.S, z = state.cam.zoom, R = DISC_R * S * z, t = VIEW.tilt, h = DISC_H * VZ, Rw = DISC_R * S;
  const cs = tokenCellList(tk).map(q => ({ x: q.c * A, y: q.r * A })).concat((tk.sq || []).map(q => cellCenter(mkS(q.c, q.r))));
  const sel = state.sel && tokenAt(state.map, state.sel) === tk;
  const shapes = [];
  for (const c of cs) shapes.push({ e: c });
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const dx = cs[j].x - cs[i].x, dy = cs[j].y - cs[i].y, d = Math.hypot(dx, dy);
    if (d > A * 1.05) continue;
    const nx = -dy / d * Rw, ny = dx / d * Rw;
    shapes.push({ q: [[cs[i].x + nx, cs[i].y + ny], [cs[i].x - nx, cs[i].y - ny], [cs[j].x - nx, cs[j].y - ny], [cs[j].x + nx, cs[j].y + ny]] });
  }
  const trace = (sh, dx, dy) => {
    ctx.beginPath();
    if (sh.e) { const p = w2s(sh.e.x, sh.e.y, true); ctx.ellipse(p.x + dx, p.y + dy, R, R * t, 0, 0, Math.PI * 2); }
    else sh.q.forEach((w, i) => { const p = w2s(w[0], w[1], true); i ? ctx.lineTo(p.x + dx, p.y + dy) : ctx.moveTo(p.x + dx, p.y + dy); }), ctx.closePath();
  };
  for (const sh of shapes) { trace(sh, R * 0.08, R * 0.1); ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill(); }
  if (h > 0) for (let dy = 0; dy >= -h; dy -= Math.max(1, h / 3)) for (const sh of shapes) { trace(sh, 0, dy); ctx.fillStyle = def.rim; ctx.fill(); }
  ctx.lineJoin = 'round'; ctx.lineWidth = sel ? 6 : 3; ctx.strokeStyle = sel ? '#ffffff' : 'rgba(0,0,0,0.45)';
  for (const sh of shapes) { trace(sh, 0, -h); ctx.stroke(); }
  for (const sh of shapes) { trace(sh, 0, -h); ctx.fillStyle = def.top; ctx.fill(); }
}
function drawTokenDisc(ctx, tk) {
  if (tk.cells && tk.cells.length > 1) { drawMultiDisc(ctx, tk, TOKEN_TYPES[tk.type]); return; }
  const S = CFG.S, z = state.cam.zoom, def = TOKEN_TYPES[tk.type];
  const c = tokenCenter(tk), p = w2s(c.x, c.y, true);
  const R = DISC_R * S * z, t = VIEW.tilt, h = DISC_H * VZ;
  const sel = state.sel && state.sel.t === 'o' && state.sel.c === tk.c && state.sel.r === tk.r;
  ctx.beginPath(); ctx.ellipse(p.x + R * 0.08, p.y + R * 0.1, R * 1.03, R * 1.03 * t, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill();
  if (h > 0) {
    ctx.beginPath(); ctx.ellipse(p.x, p.y, R, R * t, 0, 0, Math.PI);
    ctx.lineTo(p.x - R, p.y - h); ctx.ellipse(p.x, p.y - h, R, R * t, 0, Math.PI, 0, true); ctx.closePath();
    ctx.fillStyle = def.rim; ctx.fill();
  }
  ctx.beginPath(); ctx.ellipse(p.x, p.y - h, R, R * t, 0, 0, Math.PI * 2);
  ctx.fillStyle = def.top; ctx.fill();
  ctx.lineWidth = sel ? 3 : 1.5; ctx.strokeStyle = sel ? '#ffffff' : 'rgba(0,0,0,0.45)'; ctx.stroke();
  if (tk.owner) { ctx.beginPath(); ctx.ellipse(p.x, p.y - h, R * 0.93, R * 0.93 * t, 0, 0, Math.PI * 2); ctx.lineWidth = Math.max(2.5, R * 0.07); ctx.strokeStyle = playerColor(tk.owner); ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(p.x, p.y - h, R * 0.88, R * 0.88 * t, 0, 0, Math.PI * 2);
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.stroke();
}

function drawTokenLabel(ctx, tk) {
  const S = CFG.S, def = TOKEN_TYPES[tk.type], c = tokenCenter(tk), p = w2s(c.x, c.y, true);
  const top = (tk.hmax + 0.25) * VZ;
  const y = p.y - top - 6;
  const title = tk.name, sub = isCity(tk) ? tokenLevelName(tk) + (tk.owner ? ' · ' + playerName(tk.owner) : '') : (isDeposit(tk) ? 'ložisko' : 'úr. ' + tk.level + (tk.owner ? ' · ' + playerName(tk.owner) : ''));
  ctx.font = 'bold 12px sans-serif';
  const w1 = ctx.measureText(title).width;
  ctx.font = '10px sans-serif';
  const w2 = ctx.measureText(sub).width;
  const tw = Math.max(w1, w2) + 16;
  ctx.fillStyle = 'rgba(14,24,34,0.9)'; ctx.strokeStyle = tk.owner ? playerColor(tk.owner) : def.sign; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.roundRect(p.x - tw / 2, y - 32, tw, 32, 7); ctx.fill(); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.fillText(title, p.x, y - 22);
  ctx.fillStyle = def.sign; ctx.font = '10px sans-serif'; ctx.fillText(sub, p.x, y - 9);
  ctx.beginPath(); ctx.moveTo(p.x, y); ctx.lineTo(p.x, p.y - DISC_H * VZ - 2); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.stroke();
}

function drawTree(ctx, t) {
  const S = CFG.S, z = state.cam.zoom, base = w2s(t.x, t.y, true), u = S * z * t.s;
  if (t.z) base.y -= t.z * VZ;
  const tilt = Math.max(VIEW.tilt, 0.5), k = viewK();
  const lift = k ? 1 : 0.6;
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.beginPath(); ctx.ellipse(base.x + u * 0.12, base.y + u * 0.04, u * 0.34, u * 0.34 * tilt * 0.7, 0, 0, Math.PI * 2); ctx.fill();
  if (t.k === 1) {                                   // jehličnan: tři vrstvy kuželů
    ctx.fillStyle = '#5a3d28'; ctx.fillRect(base.x - u * 0.04, base.y - u * 0.18 * lift, u * 0.08, u * 0.18 * lift);
    const cols = ['#2f5a3a', '#376a43', '#3f7a4c'];
    for (let i = 0; i < 3; i++) {
      const y0 = base.y - u * (0.12 + i * 0.26) * lift, w = u * (0.42 - i * 0.1), h = u * 0.36 * lift;
      ctx.beginPath(); ctx.moveTo(base.x - w, y0); ctx.lineTo(base.x + w, y0); ctx.lineTo(base.x, y0 - h); ctx.closePath();
      ctx.fillStyle = cols[i]; ctx.fill();
    }
  } else {                                           // listnáč: kmen a koule
    ctx.fillStyle = '#5a3d28'; ctx.fillRect(base.x - u * 0.045, base.y - u * 0.32 * lift, u * 0.09, u * 0.32 * lift);
    const cy = base.y - u * 0.55 * lift, r = u * 0.34;
    ctx.beginPath(); ctx.arc(base.x, cy, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(base.x - r * 0.35, cy - r * 0.4, r * 0.1, base.x, cy, r);
    const hue = 0.85 + t.g * 0.3;
    g.addColorStop(0, shade('#7fb35a', hue)); g.addColorStop(1, shade('#3f7a3a', hue));
    ctx.fillStyle = g; ctx.fill();
  }
}

function drawPole(ctx, p) {
  const S = CFG.S, z = state.cam.zoom, k = viewK();
  const b = w2s(p.x, p.y, true);
  const px = v => v * S * z;
  const h = px(p.h) * (k ? 1 : 0.45);
  const dx = Math.cos(p.ang), dy = Math.sin(p.ang);                  // směr vedení
  const nx = -dy, ny = dx;                                           // kolmo na vedení (světově)
  const side = w2s(p.x + nx * S * 0.55, p.y + ny * S * 0.55, true);  // vodorovný rozměr příčníku na obrazovce
  const sx = side.x - b.x, sy = side.y - b.y;
  ctx.lineCap = 'round';
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(b.x + px(0.12), b.y + px(0.04), px(0.3), px(0.1), 0, 0, Math.PI * 2); ctx.fill();
  if (p.type === 'tower') {
    const legs = [[-1, 1], [1, 1]];
    ctx.strokeStyle = '#6c737c'; ctx.lineWidth = Math.max(1.2, px(0.05));
    for (const [d] of legs) {
      ctx.beginPath(); ctx.moveTo(b.x + sx * 0.45 * d, b.y + sy * 0.45 * d); ctx.lineTo(b.x + sx * 0.08 * d, b.y - h * 0.9 + sy * 0.08 * d); ctx.stroke();
    }
    ctx.lineWidth = Math.max(1, px(0.025));
    for (let i = 1; i < 5; i++) {
      const f = i / 5, wA = 0.45 - 0.37 * f, wB = 0.45 - 0.37 * (f + 0.2);
      ctx.beginPath(); ctx.moveTo(b.x - sx * wA, b.y - h * 0.9 * f - sy * wA); ctx.lineTo(b.x + sx * Math.max(0.08, wB), b.y - h * 0.9 * Math.min(1, f + 0.2) + sy * Math.max(0.08, wB)); ctx.stroke();
    }
    ctx.lineWidth = Math.max(1.5, px(0.05)); ctx.strokeStyle = '#59606a';
    for (const f of [0.78, 0.95]) {
      const w = f > 0.9 ? 0.62 : 0.85;
      ctx.beginPath(); ctx.moveTo(b.x - sx * w, b.y - h * f - sy * w); ctx.lineTo(b.x + sx * w, b.y - h * f + sy * w); ctx.stroke();
    }
  } else {                                            // portál rozvodny
    ctx.strokeStyle = '#59606a'; ctx.lineWidth = Math.max(1.6, px(0.06));
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(b.x + sx * 0.7 * d, b.y + sy * 0.7 * d); ctx.lineTo(b.x + sx * 0.7 * d, b.y - h + sy * 0.7 * d); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(b.x - sx * 0.7, b.y - h - sy * 0.7); ctx.lineTo(b.x + sx * 0.7, b.y - h + sy * 0.7); ctx.stroke();
    ctx.fillStyle = '#e8e4d8';
    for (const d of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.arc(b.x + sx * 0.7 * d, b.y - h + sy * 0.7 * d + px(0.05), px(0.045), 0, Math.PI * 2); ctx.fill(); }
  }
}

function poleAnchors(p) {
  const S = CFG.S, k = viewK(), z = state.cam.zoom;
  const b = w2s(p.x, p.y, true), h = p.h * S * z * (k ? 1 : 0.45);
  const nx = -Math.sin(p.ang), ny = Math.cos(p.ang);
  const side = w2s(p.x + nx * S * 0.55, p.y + ny * S * 0.55, true);
  const sx = side.x - b.x, sy = side.y - b.y;
  if (p.type === 'tower') return [[-0.85, 0.78], [0.85, 0.78], [0, 0.95]].map(([d, f]) => ({ x: b.x + sx * d * (f > 0.9 ? 0.6 : 1), y: b.y - h * f + sy * d * (f > 0.9 ? 0.6 : 1) }));
  return [-0.5, 0, 0.5].map(d => ({ x: b.x + sx * 0.7 * d, y: b.y - h + sy * 0.7 * d + S * z * 0.05 }));
}
function drawWires(ctx, p, q) {
  const a = poleAnchors(p), b = poleAnchors(q), z = state.cam.zoom;
  const len = Math.hypot(b[0].x - a[0].x, b[0].y - a[0].y);
  const sag = Math.min(len * 0.055, CFG.S * z * 0.5) * (viewK() ? 1 : 0.4);
  ctx.strokeStyle = 'rgba(30,34,40,0.9)'; ctx.lineWidth = Math.max(1, z * 0.9);
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    ctx.beginPath(); ctx.moveTo(a[i].x, a[i].y);
    ctx.quadraticCurveTo((a[i].x + b[i].x) / 2, (a[i].y + b[i].y) / 2 + sag * 2, b[i].x, b[i].y);
    ctx.stroke();
  }
}


// Vhodná místa pro stavbu podniku (režim stavby objektu).
const SITE_COL = { lake: ['rgba(95,212,244,0.28)', '#5fd4f4'], forest: ['rgba(185,138,74,0.30)', '#d9b36a'], deposit: ['rgba(235,200,80,0.30)', '#f0d060'], free: ['rgba(140,220,140,0.22)', '#9be09b'] };
function drawSiteHints(ctx) {
  if (!state.buildMode || !state.sites) return;
  const S = CFG.S, z = state.cam.zoom, t = VIEW.tilt;
  for (const st of state.sites) {
    const p = w2s(st.c * A, st.r * A, true), R = DISC_R * S * z, cl = SITE_COL[st.kind] || SITE_COL.free;
    const on = state.objSite && state.objSite.c === st.c && state.objSite.r === st.r;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, R, R * t, 0, 0, Math.PI * 2);
    ctx.fillStyle = on ? 'rgba(255,255,255,0.35)' : cl[0]; ctx.fill();
    ctx.setLineDash(on ? [] : [6, 5]); ctx.lineWidth = on ? 4 : 2; ctx.strokeStyle = on ? '#ffffff' : cl[1]; ctx.stroke(); ctx.setLineDash([]);
  }
}
