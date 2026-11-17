// Slepí sdílený herní kód (public/js/*.js) a server/logic.js do jednoho souboru server/game.generated.js.
// Ten používá Node server i Cloudflare Worker (ve Workeru nejde použít modul vm ani eval).
// Spuštění: node tools/build-game.js   (jde i přes npm run build)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const FILES = ['config', 'grid', 'view', 'mapgen', 'roads', 'highway', 'goods', 'tokens', 'mapcr', 'hwcr', 'worldcr', 'economy', 'network', 'vehicles', 'sim', 'railsig', 'traffic', 'ships'].map(f => path.join('public', 'js', f + '.js')).concat([path.join('server', 'logic.js')]);
let out = "'use strict';\n// TENTO SOUBOR JE VYGENEROVÁN (node tools/build-game.js). Needituj ho, uprav zdroje v public/js a server/logic.js.\nfunction createGame() {\n";
for (const f of FILES) out += '\n// ===== ' + f.replace(/\\/g, '/') + ' =====\n' + fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n';
out += '\nreturn API;\n}\nmodule.exports = { createGame };\n';
fs.writeFileSync(path.join(ROOT, 'server', 'game.generated.js'), out);
console.log('server/game.generated.js: ' + FILES.length + ' souborů, ' + Math.round(out.length / 1024) + ' kB');
