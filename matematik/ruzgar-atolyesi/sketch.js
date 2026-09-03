/*
  RÜZGAR ATÖLYESİ (ortaokul matematik: açılar, koordinat sistemi)
  ----------------------------------------------------------------
  Harita bir ızgaraya bölünür. Her hücrenin bir açısı vardır (derece, matematik
  kuralıyla: 0° doğu, saat yönünün tersine artar, 90° kuzey). Parçacıklar gerçek
  GBIF gözlemlerinde doğar ve bulundukları hücrenin rüzgarına kapılır.

  Açıdan yön vektörü:  (cos θ, sin θ).  Ekranda y aşağı arttığı için
  dikey bileşen  -sin θ  olarak uygulanır; böylece 90° yukarı (kuzey) gösterir.
*/

const CONFIG = {
  cols: 12, rows: 7,        // ızgara
  particles: 9000,
  force: 0.45,              // rüzgar gücü (panelden ayarlanır)
  homePull: 0.0045,         // doğduğu yere dönüş; rüzgar şekli büker ama Türkiye silueti kalır
  coastFade: 10,            // karanın dışına çıkan parçacığın kare başına ek ömür kaybı (kıyıda yumuşak sönme)
  drag: 0.96, maxSpeed: 2.2,
  lifeMin: 70, lifeMax: 170,
  fade: 0.06, alpha: 0.18, size: 1.6,
  classBalance: 0.7,
  seed: 1,
};

const PALETTE = [[92,168,255],[96,224,140],[255,186,72],[255,104,96],[188,128,255]];

// mulberry32
function makeRng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rng = makeRng(CONFIG.seed);

// veri
let N, classes, oLon, oLat, oCls, oX, oY, clsIdx = [];
// parçacıklar
let px, py, pvx, pvy, phx, phy, plife, pcls, palive, aliveCount = 0;
// ızgara: açı (derece)
let angles;             // Float32Array cols*rows
let grid = { x: 0, y: 0, w: 0, h: 0, cw: 0, ch: 0 };
let selected = -1, dragging = false, dragMoved = false;
// projeksiyon
const proj = { lonMin: 25.6, lonMax: 45.2, latMin: 35.6, latMax: 42.4, k: Math.cos(39 * Math.PI / 180) };
let ctx, ui = {}, panelVisible = true;
let mask = null, maskW = 0, maskH = 0;   // kara maskesi (yarım çözünürlük): parçacık denizde mi?
const enabled = [true, true, true, true, true];
const fmt = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function setup() {
  const D = window.OBSERVATIONS;
  if (!D || !D.obs) { document.getElementById('loading').textContent = 'Veri bulunamadı'; noLoop(); return; }
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  ctx = drawingContext;
  noiseSeed(CONFIG.seed);

  N = D.obs.length;
  classes = D.meta.classes;
  oLon = new Float32Array(N); oLat = new Float32Array(N); oCls = new Uint8Array(N);
  for (let i = 0; i < N; i++) { oLon[i] = D.obs[i][0]; oLat[i] = D.obs[i][1]; oCls[i] = D.obs[i][3]; }
  oX = new Float32Array(N); oY = new Float32Array(N);
  clsIdx = PALETTE.map((_, c) => { const l = []; for (let i = 0; i < N; i++) if (oCls[i] === c) l.push(i); return Int32Array.from(l); });

  angles = new Float32Array(CONFIG.cols * CONFIG.rows);
  layout();
  initParticles();
  buildUi();
  applyPreset('smooth');
  selectCell(Math.floor(CONFIG.rows / 2) * CONFIG.cols + Math.floor(CONFIG.cols / 2));
  document.getElementById('loading').remove();
  clear();
}

// Harita, panelin solundaki alana sığdırılır; ızgara haritanın kutusunu kaplar.
function layout() {
  const panelW = panelVisible ? 320 : 0;
  const availW = width - panelW, availH = height;
  const w = (proj.lonMax - proj.lonMin) * proj.k, h = proj.latMax - proj.latMin;
  const s = Math.min(availW * 0.86 / w, availH * 0.84 / h);
  proj.s = s;
  proj.ox = (availW - w * s) / 2;
  proj.oy = (availH - h * s) / 2;
  grid.x = proj.ox; grid.y = proj.oy; grid.w = w * s; grid.h = h * s;
  grid.cw = grid.w / CONFIG.cols; grid.ch = grid.h / CONFIG.rows;
  for (let i = 0; i < N; i++) { oX[i] = toX(oLon[i]); oY[i] = toY(oLat[i]); }
  drawMapLayer();
  buildMask();
}

// Türkiye dış hattını yarım çözünürlüklü bir tuvale boyayıp piksel maskesi çıkarır.
// Parçacık başına çokgen testi yerine tek bir dizi bakışı: hızlı.
function buildMask() {
  const O = window.TURKEY_OUTLINE; if (!O) return;
  maskW = Math.ceil(width / 2); maskH = Math.ceil(height / 2);
  const c = document.createElement('canvas'); c.width = maskW; c.height = maskH;
  const g = c.getContext('2d');
  g.scale(0.5, 0.5);
  const ring = (r) => { g.beginPath(); r.forEach(([lon, lat], i) => i ? g.lineTo(toX(lon), toY(lat)) : g.moveTo(toX(lon), toY(lat))); g.closePath(); };
  g.fillStyle = '#fff'; ring(O.outer); g.fill();
  g.globalCompositeOperation = 'destination-out'; ring(O.marmara); g.fill();
  const d = g.getImageData(0, 0, maskW, maskH).data;
  mask = new Uint8Array(maskW * maskH);
  for (let i = 0; i < mask.length; i++) mask[i] = d[i * 4 + 3] > 0 ? 1 : 0;
}
function onLand(x, y) {
  if (!mask) return true;
  const mx = x >> 1, my = y >> 1;
  if (mx < 0 || my < 0 || mx >= maskW || my >= maskH) return false;
  return mask[my * maskW + mx] === 1;
}
const toX = lon => proj.ox + (lon - proj.lonMin) * proj.k * proj.s;
const toY = lat => proj.oy + (proj.latMax - lat) * proj.s;

function drawMapLayer() {
  const m = document.getElementById('map');
  m.width = width; m.height = height;
  const g = m.getContext('2d');
  g.clearRect(0, 0, width, height);
  const O = window.TURKEY_OUTLINE; if (!O) return;
  g.lineWidth = 1; g.lineJoin = 'round';
  for (const [ring, land] of [[O.outer, true], [O.marmara, false]]) {
    g.beginPath();
    ring.forEach(([lon, lat], i) => i ? g.lineTo(toX(lon), toY(lat)) : g.moveTo(toX(lon), toY(lat)));
    g.closePath();
    g.fillStyle = land ? 'rgba(255,255,255,0.045)' : '#000'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.30)'; g.stroke();
  }
}

function initParticles() {
  const P = CONFIG.particles;
  px = new Float32Array(P); py = new Float32Array(P); pvx = new Float32Array(P); pvy = new Float32Array(P);
  phx = new Float32Array(P); phy = new Float32Array(P); plife = new Uint16Array(P); pcls = new Uint8Array(P); palive = new Uint8Array(P);
  aliveCount = 0;
}

function spawn(i) {
  // sınıf: gerçek oran ile eşit payın karışımı
  let total = 0; const w = [];
  for (let c = 0; c < PALETTE.length; c++) {
    const share = clsIdx[c].length / N;
    w[c] = enabled[c] ? (1 - CONFIG.classBalance) * share + CONFIG.classBalance / PALETTE.length : 0; total += w[c];
  }
  let r = rng() * total, c = 0;
  for (; c < PALETTE.length - 1; c++) { r -= w[c]; if (r <= 0) break; }
  const list = clsIdx[c]; if (!list.length) return false;
  const j = list[Math.floor(rng() * list.length)];
  px[i] = oX[j] + (rng() - 0.5) * 4; py[i] = oY[j] + (rng() - 0.5) * 4;
  phx[i] = px[i]; phy[i] = py[i]; pvx[i] = 0; pvy[i] = 0;
  plife[i] = CONFIG.lifeMin + Math.floor(rng() * (CONFIG.lifeMax - CONFIG.lifeMin));
  pcls[i] = c; palive[i] = 1; return true;
}

function cellAt(x, y) {
  if (x < grid.x || y < grid.y || x >= grid.x + grid.w || y >= grid.y + grid.h) return -1;
  return Math.floor((y - grid.y) / grid.ch) * CONFIG.cols + Math.floor((x - grid.x) / grid.cw);
}
function cellCenter(i) {
  const c = i % CONFIG.cols, r = Math.floor(i / CONFIG.cols);
  return [grid.x + (c + 0.5) * grid.cw, grid.y + (r + 0.5) * grid.ch];
}
const wrap360 = a => ((a % 360) + 360) % 360;

// =============================================================================

function draw() {
  if (!N) return;
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = `rgba(0,0,0,${CONFIG.fade})`; ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';

  // doğumlar
  let births = 0;
  for (let i = 0; i < CONFIG.particles && aliveCount < CONFIG.particles && births < 400; i++)
    if (!palive[i] && spawn(i)) { aliveCount++; births++; }

  const paths = PALETTE.map(() => new Path2D());
  const S = CONFIG.size, dt = Math.min(2, deltaTime / 16.67), DEG = Math.PI / 180;
  for (let i = 0; i < CONFIG.particles; i++) {
    if (!palive[i]) continue;
    if (--plife[i] === 0) { palive[i] = 0; aliveCount--; continue; }
    let x = px[i], y = py[i];
    const cell = cellAt(x, y);
    let ax = (phx[i] - x) * CONFIG.homePull, ay = (phy[i] - y) * CONFIG.homePull;
    if (cell >= 0) {
      const a = angles[cell] * DEG;
      ax += Math.cos(a) * CONFIG.force;
      ay += -Math.sin(a) * CONFIG.force;    // ekran y aşağı: 90° yukarı çıksın
    }
    let vx = (pvx[i] + ax * dt) * CONFIG.drag, vy = (pvy[i] + ay * dt) * CONFIG.drag;
    const sp = Math.hypot(vx, vy);
    if (sp > CONFIG.maxSpeed) { vx *= CONFIG.maxSpeed / sp; vy *= CONFIG.maxSpeed / sp; }
    if (sp < 0.25 && plife[i] > 4) plife[i] -= 3;   // sınırda sıkışan parçacık hızla söner, yığılma azalır
    x += vx * dt; y += vy * dt;
    // denize çıkan parçacık kıyıda yumuşakça söner: silüet korunur, kenar hafif parlar
    if (!onLand(x, y)) plife[i] = plife[i] > CONFIG.coastFade ? plife[i] - CONFIG.coastFade : 1;
    // ızgaradan çok uzağa kaçanı öldür
    if (x < grid.x - 60 || x > grid.x + grid.w + 60 || y < grid.y - 60 || y > grid.y + grid.h + 60) { palive[i] = 0; aliveCount--; continue; }
    pvx[i] = vx; pvy[i] = vy; px[i] = x; py[i] = y;
    paths[pcls[i]].rect(x, y, S, S);
  }
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < PALETTE.length; k++) {
    const [R, G, B] = PALETTE[k];
    ctx.fillStyle = `rgba(${R},${G},${B},${CONFIG.alpha})`; ctx.fill(paths[k]);
  }
  ctx.globalCompositeOperation = 'source-over';

  drawGrid();
}

// Izgara, oklar ve açı etiketleri parçacıkların üstüne, iz bırakmadan çizilir:
// her kare önce eski çizim solar (destination-out), sonra bunlar yeniden çizilir.
// Solma tam silmediği için oklar hafif iz bırakır; bu yüzden ayrı bir katmana çiziyoruz.
let gridLayer;
function drawGrid() {
  if (!gridLayer) { gridLayer = document.createElement('canvas'); gridLayer.style.cssText = 'position:fixed;inset:0;z-index:1;pointer-events:none'; document.body.appendChild(gridLayer); }
  if (gridLayer.width !== width || gridLayer.height !== height) { gridLayer.width = width; gridLayer.height = height; }
  const g = gridLayer.getContext('2d');
  g.clearRect(0, 0, width, height);
  const showGrid = ui.showGrid.checked, showArrows = ui.showArrows.checked;
  if (!showGrid && !showArrows && selected < 0) return;

  if (showGrid) {
    g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1; g.beginPath();
    for (let c = 0; c <= CONFIG.cols; c++) { const x = Math.round(grid.x + c * grid.cw) + 0.5; g.moveTo(x, grid.y); g.lineTo(x, grid.y + grid.h); }
    for (let r = 0; r <= CONFIG.rows; r++) { const y = Math.round(grid.y + r * grid.ch) + 0.5; g.moveTo(grid.x, y); g.lineTo(grid.x + grid.w, y); }
    g.stroke();
  }
  if (selected >= 0) {
    const c = selected % CONFIG.cols, r = Math.floor(selected / CONFIG.cols);
    g.strokeStyle = 'rgba(120,180,255,0.9)'; g.lineWidth = 2;
    g.strokeRect(grid.x + c * grid.cw + 1, grid.y + r * grid.ch + 1, grid.cw - 2, grid.ch - 2);
  }
  if (showArrows) {
    const L = Math.min(grid.cw, grid.ch) * 0.28;
    g.font = `${Math.max(10, Math.min(13, grid.ch * 0.16))}px Helvetica, Arial, sans-serif`;
    g.textAlign = 'right'; g.textBaseline = 'bottom';
    for (let i = 0; i < angles.length; i++) {
      const [cx, cy] = cellCenter(i);
      const a = angles[i] * Math.PI / 180, dx = Math.cos(a) * L, dy = -Math.sin(a) * L;
      const sel = i === selected;
      g.strokeStyle = sel ? 'rgba(120,180,255,0.95)' : 'rgba(255,255,255,0.5)';
      g.fillStyle = g.strokeStyle; g.lineWidth = sel ? 2 : 1.2;
      g.beginPath(); g.moveTo(cx - dx, cy - dy); g.lineTo(cx + dx, cy + dy); g.stroke();
      // ok başı
      const hx = cx + dx, hy = cy + dy, b = a + Math.PI;
      g.beginPath(); g.moveTo(hx, hy);
      g.lineTo(hx + Math.cos(b + 0.45) * 7, hy - Math.sin(b + 0.45) * 7);
      g.lineTo(hx + Math.cos(b - 0.45) * 7, hy - Math.sin(b - 0.45) * 7);
      g.closePath(); g.fill();
      g.fillStyle = sel ? 'rgba(120,180,255,0.95)' : 'rgba(255,255,255,0.4)';
      g.fillText(Math.round(angles[i]) + '°', cx + grid.cw / 2 - 5, cy + grid.ch / 2 - 4);
    }
  }
}

// =============================================================================
// Etkileşim

function overPanel(x) { return panelVisible && x >= width - 320; }

function mousePressed() {
  if (overPanel(mouseX)) return;
  const c = cellAt(mouseX, mouseY);
  if (c < 0) return;
  selectCell(c); dragging = true; dragMoved = false;
}
function mouseDragged() {
  if (!dragging || selected < 0) return;
  const [cx, cy] = cellCenter(selected);
  if (Math.hypot(mouseX - cx, mouseY - cy) < 6) return;
  dragMoved = true;
  let a = Math.atan2(-(mouseY - cy), mouseX - cx) * 180 / Math.PI;
  if (ui.snap.checked) a = Math.round(a / 5) * 5;
  setAngle(selected, a);
  return false;
}
function mouseReleased() {
  if (dragging && !dragMoved && selected >= 0) setAngle(selected, angles[selected] + 15);
  dragging = false;
}
function touchStarted() { mousePressed(); return false; }
function touchMoved() { mouseDragged(); return false; }
function touchEnded() { mouseReleased(); return false; }

function keyPressed() {
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  if (selected >= 0) {
    if (keyCode === LEFT_ARROW || keyCode === UP_ARROW) setAngle(selected, angles[selected] + 5);
    if (keyCode === RIGHT_ARROW || keyCode === DOWN_ARROW) setAngle(selected, angles[selected] - 5);
  }
  const k = key.toLowerCase();
  if (k === 'r') applyPreset('east');
  if (k === 'h') { panelVisible = !panelVisible; document.getElementById('panel').style.display = panelVisible ? '' : 'none'; layout(); }
  if (k === 's') savePng();
  if (k === 'f') fullscreen(!fullscreen());
}

function selectCell(i) { selected = i; updateCellUi(); }
function setAngle(i, a) { angles[i] = wrap360(Math.round(a * 100) / 100); if (i === selected) updateCellUi(); checkTasks(true); }

function applyPreset(name) {
  const C = CONFIG.cols, R = CONFIG.rows, mc = (C - 1) / 2, mr = (R - 1) / 2;
  for (let i = 0; i < angles.length; i++) {
    const c = i % C, r = Math.floor(i / C);
    const dx = c - mc, dy = -(r - mr);              // matematik yönü: yukarı pozitif
    const toCenter = Math.atan2(-dy, -dx) * 180 / Math.PI;
    let a = 0;
    switch (name) {
      case 'east': a = 0; break;
      case 'north': a = 90; break;
      case 'in': a = toCenter; break;
      case 'out': a = toCenter + 180; break;
      case 'ccw': a = toCenter - 90; break;        // merkeze dik, saat yönünün tersi
      case 'cw': a = toCenter + 90; break;
      case 'random': a = rng() * 360; break;
      case 'smooth': a = noise(c * 0.35, r * 0.35) * 720; break;
    }
    angles[i] = wrap360(Math.round(a));
  }
  document.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('on', b.dataset.preset === name));
  updateCellUi(); checkTasks(false);
}

function savePng() {
  const out = document.createElement('canvas'); out.width = width; out.height = height;
  const g = out.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, width, height);
  g.drawImage(document.getElementById('map'), 0, 0); g.drawImage(ctx.canvas, 0, 0);
  if (gridLayer) g.drawImage(gridLayer, 0, 0);
  const a = document.createElement('a'); a.download = 'ruzgar-atolyesi.png'; a.href = out.toDataURL('image/png'); a.click();
}

// =============================================================================
// Panel

function buildUi() {
  ui.snap = document.getElementById('snap');
  ui.showArrows = document.getElementById('showArrows');
  ui.showGrid = document.getElementById('showGrid');
  ui.angle = document.getElementById('angle'); ui.cx = document.getElementById('cx'); ui.cy = document.getElementById('cy');
  ui.where = document.getElementById('where');
  ui.dial = document.getElementById('dial').getContext('2d');
  document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => applyPreset(b.dataset.preset)));
  document.getElementById('force').addEventListener('input', e => { CONFIG.force = e.target.value / 100; });
  const leg = document.getElementById('legend');
  classes.forEach((n, k) => { const [R, G, B] = PALETTE[k]; const s = document.createElement('span');
    s.innerHTML = `<i style="background:rgb(${R},${G},${B})"></i>${n}`; leg.appendChild(s); });
}

function updateCellUi() {
  if (selected < 0) return;
  const a = angles[selected], rad = a * Math.PI / 180;
  ui.angle.innerHTML = Math.round(a) + '<small>°</small>';
  ui.cx.textContent = fmt.format(Math.cos(rad)); ui.cy.textContent = fmt.format(Math.sin(rad));
  const col = selected % CONFIG.cols, row = Math.floor(selected / CONFIG.cols);
  ui.where.textContent = `Hücre: sütun ${col + 1}, satır ${row + 1}`;
  // açıölçer
  const g = ui.dial, W = 192, c = W / 2, r = 78;
  g.clearRect(0, 0, W, W);
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.10)'; g.beginPath();
  for (let d = 0; d < 360; d += 30) { const t = d * Math.PI / 180; g.moveTo(c + Math.cos(t) * (r - 6), c - Math.sin(t) * (r - 6)); g.lineTo(c + Math.cos(t) * r, c - Math.sin(t) * r); }
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.font = '11px Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('0°', c + r + 14, c); g.fillText('90°', c, c - r - 12); g.fillText('180°', c - r - 18, c); g.fillText('270°', c, c + r + 12);
  // açı yayı
  g.strokeStyle = 'rgba(120,180,255,0.5)'; g.lineWidth = 3;
  g.beginPath(); g.arc(c, c, 30, 0, -rad, true); g.stroke();
  // kol
  g.strokeStyle = 'rgba(120,180,255,0.95)'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(rad) * r, c - Math.sin(rad) * r); g.stroke();
  g.fillStyle = 'rgba(120,180,255,0.95)'; g.beginPath(); g.arc(c + Math.cos(rad) * r, c - Math.sin(rad) * r, 4, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(c, c); g.lineTo(c + r, c); g.stroke();
}

// Görevlerin bazıları otomatik işaretlenir; diğerleri deftere yazılır.
// manual: değişiklik öğrencinin elinden geldi mi (hazır desenler 2. görevi saymaz)
function checkTasks(manual) {
  const allEq = v => angles.every(a => Math.abs(wrap360(a - v)) < 1e-6);
  document.getElementById('t1').classList.toggle('done', allEq(0));
  if (!manual) { document.getElementById('t2').classList.remove('done'); return; }
  // yan yana 90 ve 270
  let t2 = false;
  for (let i = 0; i < angles.length; i++) { const c = i % CONFIG.cols;
    if (c < CONFIG.cols - 1 && ((angles[i] === 90 && angles[i + 1] === 270) || (angles[i] === 270 && angles[i + 1] === 90))) t2 = true; }
  document.getElementById('t2').classList.toggle('done', t2);
}

function windowResized() { resizeCanvas(windowWidth, windowHeight); layout(); clear(); }
