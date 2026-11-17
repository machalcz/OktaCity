// Rychlá kontrola světa ČR: dálnice, graf tras, jízda vozidla po dálnici.  Spuštění: node tools/test-world.js
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'game.generated.js'), 'utf8')
  .replace("return API;\n}", "return Object.assign({}, API, { _s: () => state, _x: { hwxProtected, hwChain, oppositeEdge, isPort, portDock, buildShipGraph, checkPair, CENTER, cellCenter, tokenCenter, A, tokenPortList, tokenById, edgeNodeId, edgePos, cellFromKey, edgeCount, hwxValidate, buildGraph, hwxBuilt, hwxArms, HWY_TOLL, createUnit, planUnit, tokenById, hitTest, cellKey, tokenOutputs, tokenAccepts, hwxRoute, hwxTurnStep, hwxCount, mkO, neighborAcross, cellExists, isLandCell, tokenCenter, cellCenter, sameCell, tokenAt, edgeNodeId, roadPoly, armsOf, rebuildSim } });\n}");
const tmp = path.join(require('os').tmpdir(), 'gg_test.js'); fs.writeFileSync(tmp, src);
const G = require(tmp).createGame();
let t0 = Date.now(); G.init(7); console.log('init ms', Date.now() - t0);
const S = G._s(), m = S.map, rep = m.hwReport;
console.log('hwx polí', m.hwx.size, '| rovných', m.hw.size, '| státních silnic', m.preRoads.size, '| problémy', JSON.stringify(rep.problems));
console.log('napojení dálnic na města:', JSON.stringify(rep.linked)); console.log('sjezdy:', JSON.stringify(rep.exits));
const bad = G._x.hwxValidate(m); console.log('porušení pravidel', bad.length, bad.slice(0, 5));
const st = {}; for (const h of m.hwx.values()) st[h.st] = (st[h.st] || 0) + 1; console.log('stavy', JSON.stringify(st));
const g = G._x.buildGraph(S.net, 'road'), seen = new Set(), comps = [];
for (const n of g.list) { if (seen.has(n)) continue; const q = [n]; seen.add(n); let h = 0, t = 0; for (let i = 0; i < q.length; i++) { const x = q[i]; if (String(x.id)[0] === 'H') h++; if (String(x.id)[0] === 'T') t++; for (const e of x.adj) if (!seen.has(e.to)) { seen.add(e.to); q.push(e.to); } } if (h) comps.push({ h, měst: t }); }
console.log('komponenty s dálnicí', JSON.stringify(comps.sort((a, b) => b.h - a.h)));
module.exports = { G, S, m };
