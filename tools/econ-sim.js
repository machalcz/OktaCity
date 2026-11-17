// Vývojářský nástroj: změří ekonomiku bez prohlížeče a bez sítě (stejný kód jako server).
//   node tools/econ-sim.js [minut]     výchozí 20 minut herního času na scénář
const vm = require('vm'), fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public', 'js');
const ctx = vm.createContext({ console });
for (const f of ['config', 'grid', 'view', 'mapgen', 'roads', 'goods', 'tokens', 'economy', 'network', 'vehicles', 'sim']) vm.runInContext(fs.readFileSync(path.join(PUB, f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'server', 'logic.js'), 'utf8'), ctx, { filename: 'logic.js' });
const ev = c => vm.runInContext(c, ctx), G = ev('API');
const MIN = Number(process.argv[2]) || 20;
const E = [[1, 0, 0], [0, -1, 2], [-1, 0, 4], [0, 1, 6]];
const fmt = n => Math.round(n).toLocaleString('cs-CZ');

function world() {
  return JSON.parse(ev('JSON.stringify({land:Array.from(state.map.land),toks:state.map.tokens.map(t=>({id:t.id,type:t.type,name:t.name,c:t.c,r:t.r,road:t.road,rail:t.rail,out:isDeposit(t)?[]:tokenOutputs(t),acc:tokenAccepts(t),city:isCity(t)}))})'));
}
function route(W, A, B) {
  const tk = (c, r) => W.toks.find(t => t.c === c && t.r === r), land = (c, r) => c >= 0 && r >= 0 && c < 44 && r < 44 && W.land[r * 44 + c] === 1;
  const pc = (t, e) => { const d = E[e / 2]; return { c: t.c + d[0], r: t.r + d[1], edge: (e + 4) % 8 }; };
  if (!A.road.length || !B.road.length) return null;
  const s0 = pc(A, A.road[0]), e0 = pc(B, B.road[0]);
  const ok = (c, r) => { if (!land(c, r) || tk(c, r)) return false; for (const d of E) if (tk(c + d[0], r + d[1]) && !((c === s0.c && r === s0.r) || (c === e0.c && r === e0.r))) return false; return true; };
  const key = (c, r) => c + ',' + r, prev = new Map([[key(s0.c, s0.r), null]]), q = [s0];
  for (let i = 0; i < q.length; i++) { const cur = q[i]; if (cur.c === e0.c && cur.r === e0.r) break; for (const d of E) { const n = { c: cur.c + d[0], r: cur.r + d[1] }; if (!ok(n.c, n.r) || prev.has(key(n.c, n.r))) continue; prev.set(key(n.c, n.r), cur); q.push(n); } }
  if (!prev.has(key(e0.c, e0.r))) return null;
  const chain = []; for (let n = e0; n; n = prev.get(key(n.c, n.r))) chain.push(n); chain.reverse();
  return chain.map((n, i) => ({ c: n.c, r: n.r,
    a: i === 0 ? s0.edge : E.find(d => d[0] === chain[i - 1].c - n.c && d[1] === chain[i - 1].r - n.r)[2],
    b: i === chain.length - 1 ? e0.edge : E.find(d => d[0] === chain[i + 1].c - n.c && d[1] === chain[i + 1].r - n.r)[2] }));
}
function fresh() {
  G.init(7);
  const v = ev('state.map.tokens.find(t=>isCity(t)&&t.level===1).id');
  return G.register('Test', '#d8402f', v).pid;
}
function ledger(pid) { const m = G.me(pid); return JSON.parse(JSON.stringify({ inc: m.ledger.inc, exp: m.ledger.exp, money: m.money })); }
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);

console.log('== PASIVNĚ (nic nestavím, jen domovská vesnice) ==');
{ const pid = fresh(); const m0 = G.me(pid).money; G.step(600); const L = ledger(pid);
  console.log('peníze na startu', fmt(m0), '-> po 10 min', fmt(L.money), '(' + fmt((L.money - m0) / 10) + ' Kč/min)', JSON.stringify(L.inc), JSON.stringify(L.exp)); }

const W = world();
const pairs = [];
for (const a of W.toks) for (const b of W.toks) { if (a === b) continue; for (const g of a.out) if (b.acc.includes(g) && ['coalmine', 'lumber', 'pump'].includes(a.type)) pairs.push({ a, b, g }); }
const found = [];
for (const p of pairs) { const r = route(W, p.a, p.b); if (r) found.push(Object.assign(p, { len: r.length })); }
found.sort((x, y) => x.len - y.len);
console.log('\nnalezené trasy:', found.map(f => `${f.a.name} → ${f.b.name} [${f.g}] ${f.len} polí`).join(' | '));

function scenario(label, p, model, minutes) {
  const pid = fresh(), r = route(W, p.a, p.b); if (!r) { console.log(label, 'bez trasy'); return; }
  ev(`state.players[${pid}].money = 100000; state.players[${pid}].inv = { ${model}: 3 };`);
  const m0 = G.me(pid).money;
  for (const s of r) G.act(pid, { t: 'build', cell: { t: 'o', c: s.c, r: s.r }, kind: 'road', a: s.a, b: s.b });
  const built = m0 - G.me(pid).money;
  G.step(0.2); G.netChanges();                    // přepočet grafu silnic
  const dep = G.act(pid, { t: 'deploy', spec: { kind: 'road', model, A: p.a.id, B: p.b.id, goods: p.g } });
  if (!dep || dep.warn) { console.log(label, 'nasazení selhalo', JSON.stringify(dep)); return; }
  const price = ev(`ECON.ITEMS.${model}.price`);
  G.step(120);                                    // rozjezd
  const L0 = ledger(pid); G.step(minutes * 60); const L1 = ledger(pid);
  const d = (k, side) => ((L1[side][k] || 0) - (L0[side][k] || 0)) / minutes;
  const inc = sum(L1.inc) - sum(L0.inc), exp = sum(L1.exp) - sum(L0.exp), net = (inc - exp) / minutes;
  const u = JSON.parse(ev('JSON.stringify(state.sim.units.filter(u=>u.owner).map(u=>({trips:u.trips,earned:u.earned,status:u.status})))'))[0];
  console.log(`\n${label}: ${model} (${fmt(price)} Kč), trasa ${r.length} polí, silnice stála ${fmt(built)} Kč`);
  console.log(`  tržby z dopravy ${fmt(d('freight', 'inc'))}/min | provoz vozidla ${fmt(d('maint', 'exp'))}/min | údržba silnic ${fmt(d('upkeep', 'exp'))}/min | opravy ${fmt(d('repair', 'exp'))}/min | cizí mýto ${fmt(d('tollOut', 'exp'))}/min`);
  console.log(`  čistý zisk ${fmt(net)} Kč/min  ->  vozidlo + silnice se zaplatí za ${net > 0 ? (((price + built) / net)).toFixed(1) + ' min' : 'nikdy'} ; cest za ${minutes} min: ${u ? u.trips : '?'}`);
  return net;
}
const short = found[0], long = found[found.length - 1];
for (const p of [short, long]) if (p) { scenario(`${p.a.name} → ${p.b.name} [${p.g}]`, p, 'dump', MIN); scenario(`${p.a.name} → ${p.b.name} [${p.g}]`, p, 'kamionDump', MIN); }
