/*
  VERİDEN SES
  -----------
  Dış ses dosyası yok; her şey tarayıcının Web Audio motorunda anlık üretilir.
  - Alt uğultu: dört detune'lu osilatör, alçak geçiren filtre. Canlı parçacık
    yoğunluğu arttıkça sesi açılır, filtresi parlar.
  - Doğum notaları: parçacık doğduğunda sınıfına göre bir tını çalar.
      Kuşlar     kısa, yukarı kayan cıvıltı (yüksek sinüs)
      Bitkiler   yumuşak, uzun pad (üçgen dalga)
      Böcekler   çok kısa tık (kare dalga)
      Memeliler  alçak vuruş
      Diğer      çan (iki sinüs)
    Perde enleme göre pentatonik dizide seçilir (kuzey tiz, güney pes),
    sağ-sol konumu boylama göre. Sentetik yankı hepsini aynı mekana koyar.
  - Yıl tıkı: yıl değişince belli belirsiz bir tık.

  Tarayıcılar sesi ancak bir dokunuş veya tuştan sonra açar; giriş ekranındaki
  dokunuş bunu sağlar. M tuşu sesi kapatır/açar.
*/
const Sound = (() => {
  let ctx, master, reverb, dry, wet, drone = null;
  let ready = false, muted = false, lastBirth = 0;
  const cfg = { volume: 0.6, birthMinGap: 0.07, birthChance: 0.5, droneLevel: 0.14, wet: 0.55 };

  function impulse(seconds = 3.0, decay = 2.6) {
    const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function init(volume) {
    if (ready) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    if (volume != null) cfg.volume = volume;
    master = ctx.createGain(); master.gain.value = muted ? 0 : cfg.volume; master.connect(ctx.destination);
    reverb = ctx.createConvolver(); reverb.buffer = impulse();
    wet = ctx.createGain(); wet.gain.value = cfg.wet; reverb.connect(wet); wet.connect(master);
    dry = ctx.createGain(); dry.gain.value = 0.75; dry.connect(master);
    startDrone();
    ready = true;
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function out(node) { node.connect(dry); node.connect(reverb); }

  function startDrone() {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = 0;
    f.connect(g); g.connect(dry); g.connect(reverb);
    const freqs = [55, 82.41, 110, 164.81];           // A1 E2 A2 E3: açık, boş beşli
    const oscs = freqs.map((fr, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = fr; o.detune.value = (i - 1.5) * 5;
      o.connect(f); o.start();
      return o;
    });
    drone = { gain: g, filter: f, oscs };
  }

  // d: 0..1 yoğunluk
  function setDensity(d) {
    if (!ready || !drone) return;
    const t = ctx.currentTime;
    drone.gain.gain.setTargetAtTime(cfg.droneLevel * (0.25 + 0.75 * d), t, 1.2);
    drone.filter.frequency.setTargetAtTime(140 + 900 * d, t, 1.5);
  }

  const SCALE = [0, 2, 4, 7, 9];   // majör pentatonik
  function note(base, degree) {
    const oct = Math.floor(degree / 5), st = SCALE[((degree % 5) + 5) % 5];
    return base * Math.pow(2, oct + st / 12);
  }

  function env(g, t, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  // cls: sınıf, panX: 0..1 (batı..doğu), latN: 0..1 (güney..kuzey)
  function birth(cls, panX, latN) {
    if (!ready || muted) return;
    const t = ctx.currentTime;
    if (t - lastBirth < cfg.birthMinGap || Math.random() > cfg.birthChance) return;
    lastBirth = t;

    const degree = Math.max(0, Math.min(9, Math.floor(latN * 10)));
    const o = ctx.createOscillator(), g = ctx.createGain();
    let freq, dur, vol;
    switch (cls) {
      case 0: o.type = 'sine'; freq = note(880, degree);
        o.frequency.setValueAtTime(freq * 0.78, t);
        o.frequency.exponentialRampToValueAtTime(freq, t + 0.07);
        dur = 0.4; vol = 0.14; break;
      case 1: o.type = 'triangle'; freq = note(220, degree); o.frequency.value = freq;
        dur = 2.0; vol = 0.11; break;
      case 2: o.type = 'square'; freq = note(1760, degree % 5); o.frequency.value = freq;
        dur = 0.07; vol = 0.035; break;
      case 3: o.type = 'sine'; freq = note(110, degree % 5);
        o.frequency.setValueAtTime(freq * 1.6, t);
        o.frequency.exponentialRampToValueAtTime(freq, t + 0.12);
        dur = 0.8; vol = 0.26; break;
      default: o.type = 'sine'; freq = note(440, degree); o.frequency.value = freq;
        dur = 1.6; vol = 0.09;
    }
    env(g, t, vol, cls === 1 ? 0.25 : 0.012, dur);
    o.connect(g);
    let tail = g;
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner(); pan.pan.value = (panX * 2 - 1) * 0.8;
      g.connect(pan); tail = pan;
    }
    out(tail);
    o.start(t); o.stop(t + dur + 0.1);

    if (cls === 4) {   // çanın parlak üst tonu
      const o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'sine'; o2.frequency.value = freq * 2.76;
      env(g2, t, vol * 0.35, 0.01, dur * 0.45);
      o2.connect(g2); g2.connect(tail);
      o2.start(t); o2.stop(t + dur);
    }
  }

  function yearTick() {
    if (!ready || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 1320;
    env(g, t, 0.025, 0.005, 0.12);
    o.connect(g); g.connect(dry);
    o.start(t); o.stop(t + 0.15);
  }

  function toggleMute() {
    muted = !muted;
    if (ready) master.gain.setTargetAtTime(muted ? 0 : cfg.volume, ctx.currentTime, 0.15);
    return muted;
  }

  return { init, birth, setDensity, yearTick, toggleMute, cfg,
           get ready() { return ready; }, get muted() { return muted; } };
})();
