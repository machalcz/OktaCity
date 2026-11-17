// Mřížka 4.8.8: osmiúhelníky ('o') a mezi nimi čtverce ('s') otočené o 45°.
//
// Osmiúhelník (c,r) má střed (c·A, r·A). A = S·(1+√2) je rozteč středů.
// Jeho 8 hran značíme k = 0..7 od východu proti směru hodinových ručiček (po 45°):
//   0=V  1=SV  2=S  3=SZ  4=Z  5=JZ  6=J  7=JV    (sudé = rovné, liché = úhlopříčné)
// Čtverec (c,r) leží mezi osmiúhelníky, střed ((c+½)·A, (r+½)·A). Má 4 hrany j = 0..3:
//   0=SV  1=SZ  2=JZ  3=JV    (všechny úhlopříčné, leží na úhlopříčných hranách osmiúhelníků)

const SQ2 = Math.SQRT2;
const A = CFG.S * (1 + SQ2);
const AP = A / 2;                       // apotéma osmiúhelníku (střed → střed hrany)

function mkO(c, r) { return { t: 'o', c, r }; }
function mkS(c, r) { return { t: 's', c, r }; }
function cellKey(cell) { return cell.t + cell.c + ',' + cell.r; }
function cellFromKey(k) {
  const [c, r] = k.slice(1).split(',').map(Number);
  return { t: k[0], c, r };
}
function sameCell(a, b) { return !!a && !!b && a.t === b.t && a.c === b.c && a.r === b.r; }

function cellExists(cell) {
  if (cell.t === 'o') return cell.c >= 0 && cell.r >= 0 && cell.c < CFG.COLS && cell.r < CFG.ROWS;
  return cell.c >= 0 && cell.r >= 0 && cell.c < CFG.COLS - 1 && cell.r < CFG.ROWS - 1;
}
function cellCenter(cell) {
  return cell.t === 'o' ? { x: cell.c * A, y: cell.r * A }
                        : { x: (cell.c + 0.5) * A, y: (cell.r + 0.5) * A };
}
function edgeCount(cell) { return cell.t === 'o' ? 8 : 4; }
function edgeAngle(cell, k) { return cell.t === 'o' ? k * Math.PI / 4 : Math.PI / 4 + k * Math.PI / 2; }
function edgeDist(cell) { return cell.t === 'o' ? AP : CFG.S / 2; }
function edgeVec(cell, k) {             // střed hrany vůči středu pole (osa y míří dolů)
  const a = edgeAngle(cell, k), d = edgeDist(cell);
  return { x: Math.cos(a) * d, y: -Math.sin(a) * d };
}
function isDiagEdge(cell, k) { return cell.t === 's' || (k & 1) === 1; }
function oppositeEdge(cell, k) { return cell.t === 'o' ? (k + 4) % 8 : (k + 2) % 4; }

// Co leží za hranou k: { cell, k } (sousední pole a jeho hrana, která na nás navazuje).
function neighborAcross(cell, k) {
  const { c, r } = cell;
  if (cell.t === 'o') {
    if ((k & 1) === 0) {
      const T = [[1, 0, 4], [0, -1, 6], [-1, 0, 0], [0, 1, 2]][k / 2];
      return { cell: mkO(c + T[0], r + T[1]), k: T[2] };
    }
    const T = { 1: [0, -1, 2], 3: [-1, -1, 3], 5: [-1, 0, 0], 7: [0, 0, 1] }[k];
    return { cell: mkS(c + T[0], r + T[1]), k: T[2] };
  }
  const T = [[1, 0, 5], [0, 0, 7], [0, 1, 1], [1, 1, 3]][k];
  return { cell: mkO(c + T[0], r + T[1]), k: T[2] };
}

function cellPath(ctx, cell) {
  const { x, y } = cellCenter(cell);
  ctx.beginPath();
  if (cell.t === 'o') {
    const R = AP / Math.cos(Math.PI / 8);
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + i * Math.PI / 4;
      const px = x + R * Math.cos(a), py = y + R * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  } else {
    const R = CFG.S / SQ2;
    ctx.moveTo(x + R, y); ctx.lineTo(x, y + R); ctx.lineTo(x - R, y); ctx.lineTo(x, y - R);
  }
  ctx.closePath();
}

// Světové souřadnice -> pole (osmiúhelník nebo čtverec) nebo null mimo mapu.
function hitTest(wx, wy) {
  const c = Math.round(wx / A), r = Math.round(wy / A);
  const dx = wx - c * A, dy = wy - r * A;
  if (Math.abs(dx) <= AP && Math.abs(dy) <= AP && Math.abs(dx) + Math.abs(dy) <= AP * SQ2) {
    const cell = mkO(c, r);
    return cellExists(cell) ? cell : null;
  }
  const sc = Math.floor(wx / A), sr = Math.floor(wy / A);
  const cx = (sc + 0.5) * A, cy = (sr + 0.5) * A;
  if (Math.abs(wx - cx) + Math.abs(wy - cy) <= CFG.S / SQ2) {
    const cell = mkS(sc, sr);
    return cellExists(cell) ? cell : null;
  }
  return null;
}

// Jako cellPath, ale bez beginPath – pro hromadné kreslení mnoha polí jedním tahem.
function cellSub(ctx, cell) {
  const { x, y } = cellCenter(cell);
  if (cell.t === 'o') {
    const R = AP / Math.cos(Math.PI / 8);
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + i * Math.PI / 4;
      const px = x + R * Math.cos(a), py = y + R * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  } else {
    const R = CFG.S / SQ2;
    ctx.moveTo(x + R, y); ctx.lineTo(x, y + R); ctx.lineTo(x - R, y); ctx.lineTo(x, y - R);
  }
  ctx.closePath();
}
