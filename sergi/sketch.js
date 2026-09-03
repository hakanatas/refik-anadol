/*
  AKIŞKAN TÜR HARİTASI
  ---------------------
  Her tür gözlemi bir parçacıktır. Parçacık, gözlemin yapıldığı noktada doğar,
  görünmez bir akış alanı (Perlin gürültüsü) tarafından sürüklenir, iz bırakır,
  söner ve o yılın başka bir gözleminde yeniden doğar. Renk taksonomik sınıfı,
  parlaklık ise yoğunluğu (ekleme karışımı) anlatır. Zaman yıl yıl akar.

  Ayarlar aşağıdaki CONFIG nesnesinde. Hepsi URL'den de verilebilir:
    index.html?particles=40000&secondsPerYear=1.5&seed=7
*/

const CONFIG = {
  seed: 1,               // aynı tohum aynı akışı üretir
  particles: 24000,      // parçacık havuzu (sabit bellek)
  growthExponent: 0.5,   // canlı parçacık = particles * (gözlem payı)^üs; 1 doğrusal, 0.5 erken yılları görünür kılar
  classBalance: 0.7,     // 0: sınıflar gerçek oranında (kuş ağırlıklı), 1: eşit; arası karışım
  birthsPerFrame: 300,   // kare başına en fazla doğum (yumuşak büyüme)
  cell: 18,              // akış alanı hücre boyutu (px)
  noiseScale: 0.0021,    // akış alanının uzamsal ölçeği (küçük = geniş girdaplar)
  noiseSpeed: 0.00022,   // akış alanının zamanla değişme hızı
  flowForce: 0.11,       // akışın parçacığı sürükleme gücü
  homePull: 0.0032,      // doğduğu noktaya geri çeken zayıf yay
  drag: 0.962,           // sürtünme
  maxSpeed: 1.7,
  lifeMin: 90,           // kare
  lifeMax: 260,
  fade: 0.045,           // iz solma hızı (0.02 uzun iz, 0.10 kısa iz)
  alpha: 0.30,           // tek parçacığın saydamlığı (az parçacık varken)
  alphaRefAlive: 6000,   // bu kadar canlı parçacıktan sonra saydamlık düşer, beyaza doyma azalır
  alphaMin: 0.10,        // saydamlığın inebileceği alt sınır
  size: 1.6,             // parçacık boyutu (px)
  secondsPerYear: 2.0,   // zaman akış hızı
  recentWindow: 6,       // yıl; doğumların çoğu bu son pencereden seçilir
  recentBias: 0.7,       // pencereden seçilme olasılığı
  holdSeconds: 8,        // son yılda bekleme, sonra baştan
  introSeconds: 48,      // giriş ekranı süresi; tuş veya dokunuş erken başlatır (0 kapalı)
  introEachLoop: 1,      // 1: her döngü başında giriş yeniden gösterilir, 0: yalnızca açılışta
  introStyle: 'type',    // 'type': daktilo, harf harf, imleçli; göz imleci izler, metin okunur
                         // 'settle': harfler dağınık ve bulanıktan yerine oturur (harita gibi)
                         // 'fade': satırlar bütün olarak soluktan netliğe gelir
  typeRate: 0.048,       // daktilo: harf başına saniye (0.048 ≈ 21 harf/sn, rahat okuma hızı)
  typePause: 4.5,        // daktilo: paragraf sonunda imlecin bekleme süresi (sn)
  introReadAfter: 12,    // daktilo: son satırdan sonra kalan okuma payı (sn); toplam süre buna göre uzar
  outlineBrightness: 0.11, // kıyı çizgisi parlaklığı, ayrı alt katmanda (0 kapalı)
  mouseRadius: 140,      // fare/hareket etkileşimi yarıçapı (0 kapalı)
  mouseForce: 0.9,
  sound: 1,              // 1: veriden üretilen ses açık (sound.js), 0 kapalı
  volume: 0.6,           // ana ses düzeyi 0..1
  cards: 1,              // 1: fare/dokunuşla ışığa yaklaşınca tür kartı görünür
  cardRadius: 22,        // kart için en yakın parçacık arama yarıçapı (px)
  zoomSpan: 2.6,         // Z ile yakın bakış: görünen boylam genişliği (derece)
  camera: 0,             // 1: açılışta kamera etkileşimi dene (K tuşu da açar)
  cameraForce: 1.6,      // hareketin parçacıkları itme gücü
};

const PALETTE = [
  [92, 168, 255],   // Kuşlar     mavi
  [96, 224, 140],   // Bitkiler   yeşil
  [255, 186, 72],   // Böcekler   amber
  [255, 104, 96],   // Memeliler  kızıl
  [188, 128, 255],  // Diğer      mor
];

// ---- URL parametreleri CONFIG'i ezer ----------------------------------------
(function applyQuery() {
  const q = new URLSearchParams(location.search);
  for (const [k, v] of q) {
    if (k in CONFIG) {
      const n = Number(v);
      CONFIG[k] = Number.isFinite(n) ? n : v;
    }
  }
})();

// ---- Tohumlu rastgelelik (mulberry32) ---------------------------------------
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rng = makeRng(CONFIG.seed);

// ---- Veri -------------------------------------------------------------------
let DATA, N, yearMin, yearMax, classes;
let oLon, oLat, oYear, oCls, oSp; // ham gözlemler (oSp: tür indeksi, yoksa -1)
let speciesList = [];
let oX, oY;                       // ekran koordinatları (yeniden boyutlanınca güncellenir)
let yearStart;                    // yearStart[y - yearMin] = o yıldan itibaren ilk indeks
let clsIdx = [];                  // clsIdx[c] = o sınıfın gözlem indeksleri (yıla göre sıralı)
let clsYearStart = [];            // clsYearStart[c][y - yearMin] = clsIdx[c] içinde ilk konum
const enabled = [true, true, true, true, true];

// ---- Parçacıklar ------------------------------------------------------------
let px, py, pvx, pvy, phx, phy, plife, pcls, palive, pobs;
let aliveCount = 0;

// ---- Akış alanı -------------------------------------------------------------
let cols, rows, fx, fy;
let noiseT = 0;

// ---- Zaman ------------------------------------------------------------------
let currentYear;
let playing = true;
let holdTimer = 0;
let resetting = 0;   // >0 iken güçlü solma ve yeniden başlama geçişi
let introActive = false;
let introTimer = null;
let introShownAt = 0;   // giriş gösterim zamanı (ms), erken çıkışta hangi harflerin belirmediğini bilmek için
let typeSchedule = [];  // daktilo: [{el, t}] harf ve görünme zamanı (sn), sıralı
let typeEnd = 0;        // daktilo: son harfin görünme zamanı (sn)
let typePtr = 0;
let leaveTimer = null;
let lastSpawn = -1;   // son doğan parçacığın gözlem indeksi (ses için)

// ---- Projeksiyon ------------------------------------------------------------
const FULL = { lonMin: 25.6, lonMax: 45.2, latMin: 35.6, latMax: 42.4 };
const proj = { ...FULL, k: Math.cos(39 * Math.PI / 180) };
let zoomed = false;

// ---- Etkileşim ve arayüz ----------------------------------------------------
let overlayVisible = true;
let showFps = false;
let mouseLastMove = -1e9;
let ctx;
let ui = {};

// =============================================================================

function setup() {
  DATA = window.OBSERVATIONS;
  if (!DATA || !DATA.obs || !DATA.obs.length) {
    document.getElementById('loading').textContent =
      'Veri bulunamadı: python3 scripts/generate_synthetic.py çalıştırın';
    noLoop();
    return;
  }
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  ctx = drawingContext;
  noiseSeed(CONFIG.seed);

  loadData();
  fitProjection();
  projectAll();
  buildField();
  initParticles();
  buildUi();
  drawMapLayer();

  currentYear = yearMin;
  document.getElementById('loading').remove();
  clear();
  setTimeout(() => document.getElementById('hint').classList.add('hidden'), 9000);

  const intro = document.getElementById('intro');
  if (CONFIG.introSeconds > 0) {
    intro.addEventListener('click', () => { armSound(); hideIntro(); });
    showIntro();
  } else {
    intro.remove();
  }
  updateMuteUi();
  applyFocusParam();
  if (CONFIG.camera) toggleCamera();
}

// Satırların CSS'teki temel gecikmeleri (saniye); harf stilleri bunun üstüne dağılır
const STEP_DELAYS = [0.6, 1.6, 4.6, 11.0, 17.4, 23.4, 26.0];   // paragraf araları ~6,4 s

// Metin düğümlerini kelime ve harf span'larına sarar; içi metin olmayan öğelere de .ch verir
function wrapLetters(root) {
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.textContent.trim()) return;
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
        const w = document.createElement('span'); w.className = 'word';
        for (const chr of part) { const c = document.createElement('span'); c.className = 'ch'; c.textContent = chr; w.appendChild(c); }
        frag.appendChild(w);
      });
      node.parentNode.replaceChild(frag, node);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || node.classList.contains('bar')) return;
    if (node.tagName === 'I') { node.classList.add('ch'); return; }
    [...node.childNodes].forEach(walk);
  };
  walk(root);
}

// Daktilo imleci: tek öğe, son görünen harfin sağ kenarına taşınır; beklemede yanıp söner.
function updateCaret() {
  const caret = document.getElementById('caret');
  if (!caret || !typeSchedule.length) return;
  const elapsed = (millis() - introShownAt) / 1000;
  while (typePtr < typeSchedule.length - 1 && typeSchedule[typePtr + 1].t <= elapsed) typePtr++;
  const cur = typeSchedule[typePtr];
  if (elapsed < cur.t || elapsed > typeEnd - 0.4) { caret.style.opacity = '0'; return; }
  const next = typeSchedule[typePtr + 1];
  const waiting = !next || next.t - elapsed > 0.5;
  caret.style.opacity = waiting ? (Math.floor(elapsed * 2) % 2 ? '0' : '1') : '1';
  const inner = caret.parentElement.getBoundingClientRect();
  const r = cur.el.getBoundingClientRect();
  caret.style.left = (r.right - inner.left + 1) + 'px';
  caret.style.top = (r.top - inner.top) + 'px';
  caret.style.height = r.height + 'px';
}

// Harf gecikmelerini stile göre dağıtır. Daktiloda son harfin bittiği zamanı döndürür.
function layoutLetters(el) {
  const style = CONFIG.introStyle;
  const steps = [...el.querySelectorAll('.step')];
  let base = 0.8;
  steps.forEach((step, k) => {
    const chars = [...step.querySelectorAll('.ch')];
    if (style === 'type') {
      if (k === 0) { typeSchedule = []; typePtr = 0; }
      const isH1 = step.tagName === 'H1';
      const rate = isH1 ? 0.11 : CONFIG.typeRate;
      // paragraf sonunda uzun, başlık ve küçük satırlardan sonra kısa bekleme
      const pause = step.tagName === 'P' ? CONFIG.typePause : (isH1 ? 1.4 : 1.0);
      chars.forEach((c, i) => {
        const tt = base + i * rate;
        c.style.setProperty('--d', tt.toFixed(3) + 's');
        typeSchedule.push({ el: c, t: tt });
      });
      base += chars.length * rate + pause;
      typeEnd = base;
    } else {
      const b = STEP_DELAYS[k] ?? (k * 3);
      const spread = step.tagName === 'H1' ? 2.8 : 2.2;
      chars.forEach(c => {
        c.style.setProperty('--d', (b + rng() * spread).toFixed(3) + 's');
        c.style.setProperty('--dx', ((rng() - 0.5) * 22).toFixed(1) + 'px');
        c.style.setProperty('--dy', ((rng() - 0.5) * 14).toFixed(1) + 'px');
        c.style.setProperty('--dur', (2.0 + rng() * 1.4).toFixed(2) + 's');
      });
    }
  });
  return base;
}

let introPrepared = false;
function prepareIntro(el) {
  if (introPrepared) return;
  introPrepared = true;
  if (CONFIG.introStyle === 'settle' || CONFIG.introStyle === 'type') {
    wrapLetters(el.querySelector('.inner'));
    el.classList.add('letters', CONFIG.introStyle);
  }
}

// Giriş ekranı: harita arkada karanlıkta bekler, metin belirir.
function showIntro() {
  const el = document.getElementById('intro');
  if (!el) return;
  prepareIntro(el);
  clearTimeout(leaveTimer);
  el.classList.remove('leave');
  void el.offsetWidth;          // siyah zemin ve geçiş geri gelsin, sonra 'hidden' kalksın
  el.querySelectorAll('.ch.ghost').forEach(c => c.classList.remove('ghost'));
  let total = CONFIG.introSeconds;
  if (el.classList.contains('letters')) {
    const end = layoutLetters(el);   // her gösterimde yeni dağılım
    if (CONFIG.introStyle === 'type') total = Math.max(total, end + CONFIG.introReadAfter);
  }
  introShownAt = millis();
  introActive = true;
  playing = true;
  ui.paused.classList.remove('show');
  ui.overlay.classList.add('hidden');
  el.style.setProperty('--intro', total + 's');
  el.classList.remove('play');
  el.classList.remove('hidden');
  void el.offsetWidth;          // animasyonları sıfırlamak için yeniden akış
  el.classList.add('play');
  clearTimeout(introTimer);
  introTimer = setTimeout(hideIntro, total * 1000);
}

// Tarayıcı sesi yalnızca kullanıcı hareketinden sonra açar.
function armSound() {
  if (!CONFIG.sound) return;
  if (Sound.init(CONFIG.volume)) updateMuteUi();
}

function updateMuteUi() {
  const el = document.getElementById('mute');
  if (!el) return;
  if (!CONFIG.sound) { el.textContent = ''; return; }
  el.textContent = !Sound.ready ? 'ses için dokunun' : (Sound.muted ? 'ses kapalı · M' : 'ses açık · M');
}

function hideIntro() {
  const el = document.getElementById('intro');
  if (!el || !introActive) return;
  clearTimeout(introTimer);
  introActive = false;
  currentYear = yearMin;
  holdTimer = 0;
  clear();

  if (!el.classList.contains('letters')) {
    el.classList.add('hidden');
    if (overlayVisible) ui.overlay.classList.remove('hidden');
    return;
  }

  // Harfler akış alanı yönünde dağılır. Yön, harfin ekrandaki yerine düşen
  // akış hücresinden alınır: yazı, haritayı süren rüzgara kapılır.
  const elapsed = (millis() - introShownAt) / 1000;
  const chars = [...el.querySelectorAll('.ch')];
  let maxEnd = 0;
  for (const c of chars) {
    const started = parseFloat(c.style.getPropertyValue('--d')) || 0;
    if (started > elapsed - 0.3) { c.classList.add('ghost'); continue; }   // henüz belirmemiş harf
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const col = Math.min(cols - 1, Math.max(0, (cx / CONFIG.cell) | 0));
    const row = Math.min(rows - 1, Math.max(0, (cy / CONFIG.cell) | 0));
    const f = row * cols + col;
    const dist = 60 + rng() * 90;
    const delay = rng() * 1.1, dur = 1.6 + rng() * 1.0;
    c.style.setProperty('--lx', (fx[f] * dist).toFixed(1) + 'px');
    c.style.setProperty('--ly', (fy[f] * dist).toFixed(1) + 'px');
    c.style.setProperty('--ld', delay.toFixed(2) + 's');
    c.style.setProperty('--ldur', dur.toFixed(2) + 's');
    maxEnd = Math.max(maxEnd, delay + dur);
  }
  el.classList.add('leave');
  clearTimeout(leaveTimer);
  leaveTimer = setTimeout(() => {
    // 'leave' kalır: arka plan saydam ve geçişsizken gizlenir, siyah perde inmez.
    // showIntro bir sonraki gösterimde 'leave'i kaldırır.
    el.classList.add('hidden');
    if (overlayVisible && !introActive) ui.overlay.classList.remove('hidden');
  }, Math.ceil(maxEnd * 1000) + 100);
}

function loadData() {
  const obs = DATA.obs.slice().sort((a, b) => a[2] - b[2]);
  N = obs.length;
  classes = DATA.meta.classes || ['Kuşlar', 'Bitkiler', 'Böcekler', 'Memeliler', 'Diğer'];
  yearMin = DATA.meta.yearMin ?? obs[0][2];
  yearMax = DATA.meta.yearMax ?? obs[N - 1][2];

  oLon = new Float32Array(N); oLat = new Float32Array(N);
  oYear = new Int16Array(N); oCls = new Uint8Array(N); oSp = new Int32Array(N);
  speciesList = DATA.meta.species || [];
  for (let i = 0; i < N; i++) {
    oLon[i] = obs[i][0]; oLat[i] = obs[i][1]; oYear[i] = obs[i][2]; oCls[i] = obs[i][3];
    oSp[i] = obs[i].length > 4 ? obs[i][4] : -1;
  }
  oX = new Float32Array(N); oY = new Float32Array(N);

  // yıl -> ilk indeks tablosu (gözlemler yıla göre sıralı)
  const span = yearMax - yearMin + 2;
  yearStart = new Int32Array(span);
  let idx = 0;
  for (let y = yearMin; y <= yearMax + 1; y++) {
    while (idx < N && oYear[idx] < y) idx++;
    yearStart[y - yearMin] = idx;
  }

  // sınıf başına aynı tablo: dengeli doğum için
  const C = PALETTE.length;
  clsIdx = []; clsYearStart = [];
  for (let c = 0; c < C; c++) {
    const list = [];
    for (let i = 0; i < N; i++) if (oCls[i] === c) list.push(i);
    const arr = Int32Array.from(list);
    const ys = new Int32Array(span);
    let k = 0;
    for (let y = yearMin; y <= yearMax + 1; y++) {
      while (k < arr.length && oYear[arr[k]] < y) k++;
      ys[y - yearMin] = k;
    }
    clsIdx.push(arr); clsYearStart.push(ys);
  }
}

// sınıf c için, y yılından itibaren clsIdx[c] içindeki ilk konum
function clsIdxAtYear(c, y) {
  if (y <= yearMin) return 0;
  if (y > yearMax) return clsIdx[c].length;
  return clsYearStart[c][y - yearMin];
}

// o yıldan (dahil) itibaren ilk indeks; yılı sınırlar içine kırpar
function idxAtYear(y) {
  if (y <= yearMin) return 0;
  if (y > yearMax) return N;
  return yearStart[y - yearMin];
}

function fitProjection() {
  const w = (proj.lonMax - proj.lonMin) * proj.k;
  const h = proj.latMax - proj.latMin;
  const margin = 0.07;
  proj.s = Math.min(width * (1 - 2 * margin) / w, height * (1 - 2 * margin) / h);
  proj.ox = (width - w * proj.s) / 2;
  proj.oy = (height - h * proj.s) / 2 - height * 0.02;
}
const toX = lon => proj.ox + (lon - proj.lonMin) * proj.k * proj.s;
const toY = lat => proj.oy + (proj.latMax - lat) * proj.s;

function projectAll() {
  for (let i = 0; i < N; i++) { oX[i] = toX(oLon[i]); oY[i] = toY(oLat[i]); }
}

function buildField() {
  cols = Math.ceil(width / CONFIG.cell) + 1;
  rows = Math.ceil(height / CONFIG.cell) + 1;
  fx = new Float32Array(cols * rows);
  fy = new Float32Array(cols * rows);
  updateField();
}

function updateField() {
  const sc = CONFIG.noiseScale * CONFIG.cell;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // iki tam tur: daha kıvrımlı, daha "boya gibi" akış
      const a = noise(c * sc, r * sc, noiseT) * Math.PI * 4;
      const i = r * cols + c;
      fx[i] = Math.cos(a); fy[i] = Math.sin(a);
    }
  }
}

function initParticles() {
  const P = CONFIG.particles;
  px = new Float32Array(P); py = new Float32Array(P);
  pvx = new Float32Array(P); pvy = new Float32Array(P);
  phx = new Float32Array(P); phy = new Float32Array(P);
  plife = new Uint16Array(P); pcls = new Uint8Array(P); palive = new Uint8Array(P); pobs = new Int32Array(P);
  aliveCount = 0;
}

// Ölü bir parçacığı, aktif yılın gözlemlerinden birinde doğurur.
// Önce sınıf seçilir (gerçek oran ile eşit dağılımın karışımı), sonra o sınıfın
// pencere içindeki gerçek bir gözlemi. Her parçacık gerçek bir kayıttır; denge
// yalnızca hangi sınıfın ne sıklıkla doğduğunu etkiler.
const clsWeight = new Float64Array(PALETTE.length);
function spawn(i) {
  const cy = Math.floor(currentYear);
  const end = idxAtYear(cy + 1);
  if (end === 0) return false;
  const recent = rng() < CONFIG.recentBias;
  const yFrom = recent ? cy - CONFIG.recentWindow + 1 : yearMin;

  // sınıf ağırlıkları: pencere içindeki gerçek sayı ile eşit payın karışımı
  let total = 0;
  for (let c = 0; c < PALETTE.length; c++) {
    let n = clsIdxAtYear(c, cy + 1) - clsIdxAtYear(c, yFrom);
    if (n <= 0 && recent) n = clsIdxAtYear(c, cy + 1);   // pencere boşsa tüm geçmiş
    const share = n / Math.max(1, end);
    clsWeight[c] = (!enabled[c] || n <= 0) ? 0
      : (1 - CONFIG.classBalance) * share + CONFIG.classBalance * (1 / PALETTE.length);
    total += clsWeight[c];
  }
  if (total <= 0) return false;
  let r = rng() * total, c = 0;
  for (; c < PALETTE.length - 1; c++) { r -= clsWeight[c]; if (r <= 0) break; }

  let a = clsIdxAtYear(c, yFrom), b = clsIdxAtYear(c, cy + 1);
  if (b - a <= 0) { a = 0; }
  if (b - a <= 0) return false;
  const j = clsIdx[c][a + Math.floor(rng() * (b - a))];
  lastSpawn = j; pobs[i] = j;
  const jit = 4;   // aynı koordinatta yığılan kayıtları (popüler gözlem noktaları) hafifçe dağıt
  px[i] = oX[j] + (rng() - 0.5) * jit; py[i] = oY[j] + (rng() - 0.5) * jit;
  phx[i] = px[i]; phy[i] = py[i];
  pvx[i] = 0; pvy[i] = 0;
  plife[i] = CONFIG.lifeMin + Math.floor(rng() * (CONFIG.lifeMax - CONFIG.lifeMin));
  pcls[i] = c; palive[i] = 1;
  return true;
}

// =============================================================================

function draw() {
  if (!DATA) return;
  if (introActive && CONFIG.introStyle === 'type') updateCaret();
  advanceTime();

  noiseT += CONFIG.noiseSpeed * (deltaTime / 16.67);
  if (frameCount % 2 === 0) updateField();

  // 1) İzleri sol: kanvas saydamdır, her kare alfa biraz azaltılır.
  //    Kıyı çizgisi alttaki ayrı katmanda durduğu için solmadan etkilenmez.
  ctx.globalCompositeOperation = 'destination-out';
  const fade = resetting > 0 ? 0.18 : CONFIG.fade;
  ctx.fillStyle = `rgba(0,0,0,${fade})`;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';

  // 3) Doğumlar: canlı sayısı, o ana kadarki gözlem sayısıyla orantılı
  if (resetting === 0 && !introActive) {
    const cum = idxAtYear(Math.floor(currentYear) + 1);
    const target = Math.min(CONFIG.particles,
      Math.ceil(CONFIG.particles * Math.pow(cum / N, CONFIG.growthExponent)));
    let births = 0;
    for (let i = 0; i < CONFIG.particles && aliveCount < target && births < CONFIG.birthsPerFrame; i++) {
      if (!palive[i] && spawn(i)) {
        aliveCount++; births++;
        if (CONFIG.sound && Sound.ready) {
          const j = lastSpawn;
          Sound.birth(oCls[j], (oLon[j] - proj.lonMin) / (proj.lonMax - proj.lonMin),
                      (oLat[j] - proj.latMin) / (proj.latMax - proj.latMin));
        }
      }
    }
  }
  if (CONFIG.sound && Sound.ready && frameCount % 20 === 0) {
    Sound.setDensity(aliveCount / CONFIG.particles);
  }

  // 4) Hareket + çizim (sınıf başına tek Path2D, tek fill: hızlı)
  const paths = PALETTE.map(() => new Path2D());
  const P = CONFIG.particles, S = CONFIG.size, cell = CONFIG.cell;
  const useMouse = CONFIG.mouseRadius > 0 && (millis() - mouseLastMove) < 2500;
  const mr2 = CONFIG.mouseRadius * CONFIG.mouseRadius;
  const dt = Math.min(2, deltaTime / 16.67);

  for (let i = 0; i < P; i++) {
    if (!palive[i]) continue;
    if (--plife[i] === 0 || resetting > 0) { palive[i] = 0; aliveCount--; continue; }

    let x = px[i], y = py[i];
    const c = Math.min(cols - 1, Math.max(0, (x / cell) | 0));
    const r = Math.min(rows - 1, Math.max(0, (y / cell) | 0));
    const f = r * cols + c;

    let ax = fx[f] * CONFIG.flowForce + (phx[i] - x) * CONFIG.homePull;
    let ay = fy[f] * CONFIG.flowForce + (phy[i] - y) * CONFIG.homePull;
    if (cam.active && mx) { ax += mx[f] * CONFIG.cameraForce; ay += my[f] * CONFIG.cameraForce; }

    if (useMouse) {
      const dx = x - mouseX, dy = y - mouseY, d2 = dx * dx + dy * dy;
      if (d2 < mr2 && d2 > 1) {
        const d = Math.sqrt(d2), k = (1 - d / CONFIG.mouseRadius) * CONFIG.mouseForce / d;
        ax += dx * k; ay += dy * k;
      }
    }

    let vx = (pvx[i] + ax * dt) * CONFIG.drag, vy = (pvy[i] + ay * dt) * CONFIG.drag;
    const sp = Math.hypot(vx, vy);
    if (sp > CONFIG.maxSpeed) { vx *= CONFIG.maxSpeed / sp; vy *= CONFIG.maxSpeed / sp; }
    x += vx * dt; y += vy * dt;
    pvx[i] = vx; pvy[i] = vy; px[i] = x; py[i] = y;

    paths[pcls[i]].rect(x, y, S, S);
  }

  // Çok parçacık varken saydamlık düşer; böylece yoğun bölgeler parlar ama
  // tüm harita beyaza doymaz, renkler okunur kalır.
  const dens = Math.min(1, CONFIG.alphaRefAlive / Math.max(1, aliveCount));
  const alpha = Math.max(CONFIG.alphaMin, CONFIG.alpha * Math.pow(dens, 0.6));
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < PALETTE.length; k++) {
    if (!enabled[k]) continue;
    const [R, G, B] = PALETTE[k];
    ctx.fillStyle = `rgba(${R},${G},${B},${alpha})`;
    ctx.fill(paths[k]);
  }
  ctx.globalCompositeOperation = 'source-over';

  if (cam.active) updateCamera();
  if (CONFIG.cards) updateCard();
  updateUi();
}

function advanceTime() {
  const dts = deltaTime / 1000;
  if (resetting > 0) {
    resetting -= dts;
    if (resetting <= 0) {
      resetting = 0; currentYear = yearMin; clear();
      if (CONFIG.introSeconds > 0 && CONFIG.introEachLoop) showIntro();
    }
    return;
  }
  if (introActive || !playing) return;
  if (currentYear >= yearMax + 1) {
    holdTimer += dts;
    if (holdTimer >= CONFIG.holdSeconds) { holdTimer = 0; resetting = 1.6; }
    return;
  }
  currentYear = Math.min(yearMax + 1, currentYear + dts / CONFIG.secondsPerYear);
}

// Kıyı çizgisi ayrı, sabit bir kanvasa (index.html'deki #map) bir kez çizilir.
// Parçacık kanvası saydam olduğu için altından görünür ve solmadan etkilenmez.
function drawMapLayer() {
  const m = document.getElementById('map');
  if (!m) return;
  m.width = width; m.height = height;
  const g = m.getContext('2d');
  g.clearRect(0, 0, width, height);
  const O = window.TURKEY_OUTLINE;
  if (!O || CONFIG.outlineBrightness <= 0) return;
  const v = CONFIG.outlineBrightness;
  g.lineWidth = 1;
  g.lineJoin = 'round';
  for (const [ring, isLand] of [[O.outer, true], [O.marmara, false]]) {
    if (!ring) continue;
    g.beginPath();
    ring.forEach(([lon, lat], i) => i ? g.lineTo(toX(lon), toY(lat)) : g.moveTo(toX(lon), toY(lat)));
    g.closePath();
    // kara çok hafif aydınlık, deniz (Marmara) siyah
    g.fillStyle = isLand ? `rgba(255,255,255,${v * 0.18})` : 'rgba(0,0,0,1)';
    g.fill();
    g.strokeStyle = `rgba(255,255,255,${v})`;
    g.stroke();
  }
}

// PNG kaydı: siyah zemin + kıyı katmanı + parçacık katmanı tek görüntüde
function savePng() {
  const out = document.createElement('canvas');
  out.width = width; out.height = height;
  const g = out.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, width, height);
  const m = document.getElementById('map');
  if (m) g.drawImage(m, 0, 0);
  g.drawImage(ctx.canvas, 0, 0);
  const a = document.createElement('a');
  a.download = 'akiskan-tur-haritasi-' + Math.min(yearMax, Math.floor(currentYear)) + '.png';
  a.href = out.toDataURL('image/png');
  a.click();
}

// =============================================================================
// Arayüz

function buildUi() {
  ui.year = document.getElementById('year');
  ui.count = document.getElementById('count');
  ui.legend = document.getElementById('legend');
  ui.source = document.getElementById('source');
  ui.paused = document.getElementById('paused');
  ui.fps = document.getElementById('fps');
  ui.overlay = document.getElementById('overlay');
  ui.source.textContent = 'Veri: ' + (DATA.meta.source || 'bilinmiyor');
  ui.chips = classes.map((name, k) => {
    const el = document.createElement('div');
    el.className = 'chip';
    const [R, G, B] = PALETTE[k];
    el.innerHTML = `<small>${k + 1}</small><span>${name}</span><em></em><i style="color:rgb(${R},${G},${B});background:rgb(${R},${G},${B})"></i>`;
    ui.legend.appendChild(el);
    return el;
  });
  ui.lastYear = null; ui.lastCount = null;
}

const fmt = new Intl.NumberFormat('tr-TR');

function updateUi() {
  const y = Math.min(yearMax, Math.floor(currentYear));
  if (y !== ui.lastYear) {
    ui.year.textContent = y; ui.lastYear = y;
    if (CONFIG.sound && Sound.ready && !introActive) Sound.yearTick();
  }
  const cum = idxAtYear(y + 1);
  if (cum !== ui.lastCount) {
    ui.count.textContent = fmt.format(cum) + ' gözlem';
    ui.lastCount = cum;
    // lejantta her sınıfın o ana kadarki gerçek sayısı
    for (let c = 0; c < ui.chips.length; c++) {
      ui.chips[c].querySelector('em').textContent = fmt.format(clsIdxAtYear(c, y + 1));
    }
  }
  if (showFps && frameCount % 15 === 0) {
    ui.fps.textContent = `${frameRate().toFixed(0)} fps · ${fmt.format(aliveCount)} parçacık`;
  }
}

function toggleClass(k) {
  enabled[k] = !enabled[k];
  ui.chips[k].classList.toggle('off', !enabled[k]);
}

function keyPressed() {
  if (!DATA) return;
  armSound();
  if (introActive) {
    if (key.toLowerCase() === 'f') fullscreen(!fullscreen());
    else hideIntro();
    return false;
  }
  if (key.toLowerCase() === 'm' && CONFIG.sound) { Sound.init(CONFIG.volume); Sound.toggleMute(); updateMuteUi(); return; }
  if (key.toLowerCase() === 'i' && CONFIG.introSeconds > 0) { resetting = 0; showIntro(); return; }
  if (key === ' ') { playing = !playing; ui.paused.classList.toggle('show', !playing); return false; }
  if (keyCode === RIGHT_ARROW) currentYear = Math.min(yearMax + 1, Math.floor(currentYear) + 1);
  if (keyCode === LEFT_ARROW) currentYear = Math.max(yearMin, Math.floor(currentYear) - 1);
  if (keyCode === UP_ARROW) CONFIG.secondsPerYear = Math.max(0.1, CONFIG.secondsPerYear / 1.25);
  if (keyCode === DOWN_ARROW) CONFIG.secondsPerYear = Math.min(60, CONFIG.secondsPerYear * 1.25);
  if (key >= '1' && key <= '5') toggleClass(Number(key) - 1);
  const k = key.toLowerCase();
  if (k === 'f') fullscreen(!fullscreen());
  if (k === 'h') { overlayVisible = !overlayVisible; ui.overlay.classList.toggle('hidden', !overlayVisible); }
  if (k === 'r') { holdTimer = 0; resetting = 1.0; }
  if (k === 'l') { CONFIG.outlineBrightness = CONFIG.outlineBrightness > 0 ? 0 : 0.11; drawMapLayer(); }
  if (k === 's') savePng();
  if (k === 'd') { showFps = !showFps; ui.fps.classList.toggle('show', showFps); }
  if (k === 'z') toggleZoom();
  if (k === 'k') toggleCamera();
}

function mouseMoved() { mouseLastMove = millis(); }

// =============================================================================
// Tür kartı: imlece en yakın canlı parçacığın gerçek kaydı

const cardEl = { box: null, ring: null, n: null, s: null, m: null, last: -1 };
function updateCard() {
  if (!cardEl.box) {
    cardEl.box = document.getElementById('card'); cardEl.ring = document.getElementById('ring');
    cardEl.n = cardEl.box.querySelector('.n'); cardEl.s = cardEl.box.querySelector('.s'); cardEl.m = cardEl.box.querySelector('.m');
  }
  const fresh = (millis() - mouseLastMove) < 3000 && !introActive;
  if (!fresh || mouseX <= 0 || mouseY <= 0) { cardEl.box.classList.remove('show'); cardEl.ring.classList.remove('show'); cardEl.last = -1; return; }
  const r2 = CONFIG.cardRadius * CONFIG.cardRadius;
  let best = -1, bd = r2;
  for (let i = 0; i < CONFIG.particles; i++) {
    if (!palive[i]) continue;
    const dx = px[i] - mouseX, dy = py[i] - mouseY, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  if (best < 0) { cardEl.box.classList.remove('show'); cardEl.ring.classList.remove('show'); cardEl.last = -1; return; }
  const j = pobs[best];
  if (j !== cardEl.last) {
    cardEl.last = j;
    const sp = oSp[j] >= 0 && speciesList[oSp[j]] ? speciesList[oSp[j]] : '';
    const tr = sp && window.TUR_ADLARI ? window.TUR_ADLARI[sp] : '';
    const cls = classes[oCls[j]];
    cardEl.n.textContent = tr || sp || cls;
    cardEl.s.textContent = tr ? sp : (sp ? cls : 'tür adı veri dosyasında yok');
    const [R, G, B] = PALETTE[oCls[j]];
    cardEl.m.innerHTML = `<i style="color:rgb(${R},${G},${B});background:rgb(${R},${G},${B})"></i>${cls} · ${oYear[j]} · ${oLat[j].toFixed(2)}°K ${oLon[j].toFixed(2)}°D`;
  }
  const bw = cardEl.box.offsetWidth || 200, bh = cardEl.box.offsetHeight || 70;
  let cx = mouseX + 18, cy = mouseY + 18;
  if (cx + bw > width - 12) cx = mouseX - bw - 18;
  if (cy + bh > height - 12) cy = mouseY - bh - 18;
  cardEl.box.style.left = cx + 'px'; cardEl.box.style.top = cy + 'px';
  cardEl.ring.style.left = px[best] + 'px'; cardEl.ring.style.top = py[best] + 'px';
  cardEl.box.classList.add('show'); cardEl.ring.classList.add('show');
}

// =============================================================================
// Yakın bakış: Z ile imlecin altındaki bölgeye yaklaş, tekrar Z ile geri

function toggleZoom() {
  if (zoomed) { Object.assign(proj, FULL); zoomed = false; }
  else {
    const lon = proj.lonMin + (mouseX - proj.ox) / (proj.k * proj.s);
    const lat = proj.latMax - (mouseY - proj.oy) / proj.s;
    const spanLon = CONFIG.zoomSpan, spanLat = spanLon * proj.k * 0.62;
    proj.lonMin = lon - spanLon / 2; proj.lonMax = lon + spanLon / 2;
    proj.latMin = lat - spanLat / 2; proj.latMax = lat + spanLat / 2;
    zoomed = true;
  }
  fitProjection(); projectAll(); drawMapLayer(); clear();
  for (let i = 0; i < CONFIG.particles; i++) palive[i] = 0;   // hepsi yeni yerinde doğsun
  aliveCount = 0;
  const z = document.getElementById('zoom');
  if (zoomed) {
    z.textContent = `yakın bakış · ${((proj.latMin + proj.latMax) / 2).toFixed(1)}°K ${((proj.lonMin + proj.lonMax) / 2).toFixed(1)}°D · Z ile geri`;
    z.classList.add('show');
  } else z.classList.remove('show');
}

// URL: ?focus=boylam,enlem[,genişlik]  -> açılışta yakın bakış
function applyFocusParam() {
  const q = new URLSearchParams(location.search).get('focus');
  if (!q) return;
  const [lon, lat, span] = q.split(',').map(Number);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
  if (Number.isFinite(span)) CONFIG.zoomSpan = span;
  mouseX = toX(lon); mouseY = toY(lat);
  toggleZoom();
}

// =============================================================================
// Kamera: izleyicinin hareketi parçacıkları iter (kare farkıyla hareket algılama)

const cam = { active: false, video: null, cv: null, g: null, prev: null, w: 32, h: 18 };
let mx, my;   // hareket kuvveti alanı (akış hücreleriyle aynı çözünürlük)

async function toggleCamera() {
  const el = document.getElementById('cam');
  if (cam.active) {
    cam.active = false;
    if (cam.video && cam.video.srcObject) cam.video.srcObject.getTracks().forEach(t => t.stop());
    el.textContent = ''; return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { el.textContent = 'kamera desteklenmiyor'; return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 180, facingMode: 'user' }, audio: false });
    cam.video = document.createElement('video'); cam.video.srcObject = stream; cam.video.muted = true; cam.video.playsInline = true;
    await cam.video.play();
    cam.cv = document.createElement('canvas'); cam.cv.width = cam.w; cam.cv.height = cam.h;
    cam.g = cam.cv.getContext('2d', { willReadFrequently: true });
    cam.prev = null; cam.active = true;
    el.textContent = 'kamera açık · K';
  } catch (e) { el.textContent = 'kamera izni yok'; }
}

function updateCamera() {
  if (!mx || mx.length !== cols * rows) { mx = new Float32Array(cols * rows); my = new Float32Array(cols * rows); }
  for (let i = 0; i < mx.length; i++) { mx[i] *= 0.86; my[i] *= 0.86; }   // sönüm
  if (frameCount % 2 || !cam.video || cam.video.readyState < 2) return;
  cam.g.save(); cam.g.scale(-1, 1); cam.g.drawImage(cam.video, -cam.w, 0, cam.w, cam.h); cam.g.restore();   // aynalı
  const d = cam.g.getImageData(0, 0, cam.w, cam.h).data;
  const cur = new Float32Array(cam.w * cam.h);
  for (let i = 0; i < cur.length; i++) cur[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
  if (cam.prev) {
    for (let cy = 0; cy < cam.h; cy++) for (let cx = 0; cx < cam.w; cx++) {
      const k = cy * cam.w + cx, diff = Math.abs(cur[k] - cam.prev[k]);
      if (diff < 28) continue;
      const str = Math.min(1, (diff - 28) / 60);
      const sx = (cx + 0.5) / cam.w * width, sy = (cy + 0.5) / cam.h * height;
      const c0 = (sx / CONFIG.cell) | 0, r0 = (sy / CONFIG.cell) | 0, R = 4;
      for (let r = Math.max(0, r0 - R); r <= Math.min(rows - 1, r0 + R); r++)
        for (let c = Math.max(0, c0 - R); c <= Math.min(cols - 1, c0 + R); c++) {
          const dx = c - c0, dy = r - r0, dist = Math.hypot(dx, dy) || 1;
          if (dist > R) continue;
          const w = str * (1 - dist / R) / dist;
          const f = r * cols + c; mx[f] += dx * w; my[f] += dy * w;
        }
    }
  }
  cam.prev = cur;
}
function mousePressed() { armSound(); }
function touchStarted() { armSound(); }
function touchMoved() { mouseLastMove = millis(); return false; }

function windowResized() {
  if (!DATA) return;
  resizeCanvas(windowWidth, windowHeight);
  fitProjection();
  projectAll();
  buildField();
  drawMapLayer();
  // parçacıklar eski koordinatlarda kalır; ölüp yeni yerde doğarlar
  clear();
}
