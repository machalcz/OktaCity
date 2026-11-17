// Pohled na mapu. Herní logika zůstává 2D, mění se jen promítnutí na obrazovku:
//   obrazovka = střed + zoom · Sklon(tilt) · Otočení(rot) · (svět − kamera)
// Pevnina je "zvednutá" nad hladinu o lift (v násobcích hrany), takže má boční stěny (útesy).
// Otáčení: viewStep × 45° (0..7).
//   top   – pohled shora (původní)
//   tilt  – mírný nadhled: bez otočení, svislý rozměr zkrácený, vodorovné hrany zůstávají vodorovné
//   (izometrie je zrušená: byla jen nadhled otočený o 45°, což dá tlačítko Otočit)

const VIEWS = {
  top:  { name: 'Shora',          rot: 0,           tilt: 1.00, lift: 0 },
  tilt: { name: 'Nadhled',        rot: 0,           tilt: 0.62, lift: 0.40 }
};
let VIEW = VIEWS.tilt;

function updateView() {
  const b = VIEWS[state.view] || VIEWS.tilt;
  VIEW = { rot: b.rot + state.viewStep * Math.PI / 4, tilt: b.tilt, lift: b.lift };
}
function liftPx() { return VIEW.lift * CFG.S * state.cam.zoom; }

// Posun ve světě -> posun na obrazovce (při zoomu 1) a zpět.
function projDelta(x, y) {
  const c = Math.cos(VIEW.rot), s = Math.sin(VIEW.rot);
  return { x: x * c - y * s, y: VIEW.tilt * (x * s + y * c) };
}
function unprojDelta(u, v) {
  const c = Math.cos(VIEW.rot), s = Math.sin(VIEW.rot), vv = v / VIEW.tilt;
  return { x: u * c + vv * s, y: -u * s + vv * c };
}

// Svět -> obrazovka (CSS pixely). lifted = bod leží na úrovni pevniny, ne hladiny.
function w2s(wx, wy, lifted) {
  const z = state.cam.zoom;
  const p = projDelta(wx - state.cam.x, wy - state.cam.y);
  return { x: W / 2 + p.x * z, y: H / 2 + p.y * z - (lifted ? liftPx() : 0) };
}
function s2w(sx, sy, lifted) {
  const z = state.cam.zoom;
  const d = unprojDelta((sx - W / 2) / z, (sy - H / 2 + (lifted ? liftPx() : 0)) / z);
  return { x: state.cam.x + d.x, y: state.cam.y + d.y };
}

// Nastaví plátno tak, aby se do něj kreslilo ve světových souřadnicích; off = posun nahoru v pixelech.
function applyTransformOff(ctx, off) {
  const z = state.cam.zoom, c = Math.cos(VIEW.rot), s = Math.sin(VIEW.rot), t = VIEW.tilt;
  const a = z * c, b = z * t * s, cc = -z * s, d = z * t * c;
  const e = W / 2 - (a * state.cam.x + cc * state.cam.y);
  const f = H / 2 - (b * state.cam.x + d * state.cam.y) - off;
  ctx.setTransform(DPR * a, DPR * b, DPR * cc, DPR * d, DPR * e, DPR * f);
}
// Kreslení v pixelech obrazovky (konektory, zvýraznění).
function applyScreen(ctx) { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
