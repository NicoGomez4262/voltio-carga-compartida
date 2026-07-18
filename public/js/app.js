/* =========================================================
   VOLTIO — Carga Compartida · v1.2
   Marketplace de carga + calculadora (sin dependencias)
   ========================================================= */
(function () {
  'use strict';

  /* ---------- Constantes ---------- */
  const LS_SETTINGS = 'voltio.settings.v1';
  const LS_SESSIONS = 'voltio.sessions.v1';
  const LS_BOOKINGS = 'voltio.bookings.v1';
  const LS_REQUESTS = 'voltio.requests.v1';
  const CO2_GAS_PER_L = 2.31;
  const GAS_KM_PER_L = 12;
  const GAS_PRICE_PER_L = 4300;
  const DIAS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  const DEFAULTS = {
    pricePerKwh: 800,
    serviceFee: 0,
    stationName: '',
    ownerName: '',
    kmPerKwh: 6,
    accent: 'cyan',
    animations: true,
    role: null,          // 'driver' | 'host'
    vehicle: 'pickup',   // 'sedan' | 'pickup' | 'suv' | '4x4'
    mySpot: null
  };

  // Puestos de demostración (Bogotá) — en una versión con backend vendrían de la nube
  const DEMO_SPOTS = [
    { id: 'd1', nombre: 'Garaje Chapinero Alto', host: 'Carolina M.', dir: 'Cl 60 # 4-32, Chapinero', precio: 950, pow: 7.4, puerto: 'Tipo 2', distKm: 0.8, rating: 4.9, votes: 23, desde: '06:00', hasta: '22:00', dias: [1, 1, 1, 1, 1, 1, 1], verificado: true, breb: '@caro.carga', titular: 'Carolina Martínez', x: 210, y: 100 },
    { id: 'd2', nombre: 'Parqueadero Cedritos 140', host: 'Jorge P.', dir: 'Cl 140 # 12-18, Cedritos', precio: 1100, pow: 7.4, puerto: 'Tipo 1', distKm: 2.4, rating: 4.7, votes: 15, desde: '07:00', hasta: '20:00', dias: [0, 1, 1, 1, 1, 1, 0], verificado: false, breb: '@evcedritos', titular: 'Jorge Peña', x: 265, y: 60 },
    { id: 'd3', nombre: 'La Soledad 24h', host: 'Estación Local', dir: 'Cra 19 # 39-41, La Soledad', precio: 1250, pow: 11, puerto: 'CCS', distKm: 1.5, rating: 4.8, votes: 41, desde: '00:00', hasta: '23:59', dias: [1, 1, 1, 1, 1, 1, 1], verificado: true, breb: '@lasoledad.ev', titular: 'EV Soledad SAS', x: 150, y: 160 },
    { id: 'd4', nombre: 'Casa Kennedy Central', host: 'Marta L.', dir: 'Cl 38 sur # 78-15, Kennedy', precio: 800, pow: 3.6, puerto: 'Doméstico', distKm: 5.1, rating: 4.5, votes: 9, desde: '18:00', hasta: '23:00', dias: [1, 1, 1, 1, 1, 1, 1], verificado: false, breb: '@kdy.carga', titular: 'Marta López', x: 70, y: 195 },
    { id: 'd5', nombre: 'Torres del Parque', host: 'Andrés G.', dir: 'Cra 5 # 26-57, Centro', precio: 1000, pow: 7.4, puerto: 'Tipo 2', distKm: 1.1, rating: 4.6, votes: 18, desde: '08:00', hasta: '21:00', dias: [1, 1, 1, 1, 1, 1, 1], verificado: false, breb: '@torrespq', titular: 'Andrés Gil', x: 205, y: 140 },
    { id: 'd6', nombre: 'Chía — Finca El Roble', host: 'Familia Roble', dir: 'Vereda Bojacá, Chía', precio: 1400, pow: 22, puerto: 'Tipo 2', distKm: 12.5, rating: 5.0, votes: 12, desde: '09:00', hasta: '18:00', dias: [0, 0, 0, 0, 0, 1, 1], verificado: true, breb: '@roble.ev', titular: 'Camilo Roble', x: 320, y: 35 },
    { id: 'd7', nombre: 'Suba Compartir', host: 'Deivid R.', dir: 'Cl 145 # 91-20, Suba', precio: 850, pow: 3.6, puerto: 'Doméstico', distKm: 3.8, rating: 4.4, votes: 7, desde: '19:00', hasta: '23:00', dias: [1, 1, 1, 1, 1, 0, 0], verificado: false, breb: '@subaev', titular: 'Deivid Rojas', x: 110, y: 75 }
  ];

  /* ---------- Helpers ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const SVGNS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => {
    const el = document.createElementNS(SVGNS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  };

  const copFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  const fmtCOP = (n) => copFmt.format(Math.round(n || 0));
  const fmtKwh = (n) => (Math.round((n || 0) * 100) / 100).toLocaleString('es-CO', { maximumFractionDigits: 2 });
  const fmtNum = (n, d = 0) => (n || 0).toLocaleString('es-CO', { maximumFractionDigits: d });

  function fmtCompact(n, metric) {
    if (metric === 'kwh') return (Math.round(n * 10) / 10).toLocaleString('es-CO', { maximumFractionDigits: 1 });
    if (metric === 'count') return String(Math.round(n));
    if (n >= 1e6) return '$' + (n / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + 'M';
    if (n >= 1e4) return '$' + Math.round(n / 1e3) + 'k';
    if (n >= 1e3) return '$' + (n / 1e3).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + 'k';
    return '$' + Math.round(n);
  }

  function parseNum(v) {
    if (typeof v === 'number') return v;
    if (v == null) return 0;
    let s = String(v).trim().replace(/\s/g, '').replace(/[^0-9.,-]/g, '');
    if (s === '' || s === '-') return 0;
    const hasDot = s.includes('.'), hasComma = s.includes(',');
    if (hasDot && hasComma) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (hasComma) s = s.replace(/,/g, '.');
    else if (hasDot && s.split('.').length > 2) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  const round2 = (n) => Math.round((n || 0) * 100) / 100;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const uid = (p) => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function loadJSON(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }

  /* ---------- Estado ---------- */
  let settings = Object.assign({}, DEFAULTS, loadJSON(LS_SETTINGS, {}));
  let sessions = loadJSON(LS_SESSIONS, []);
  let bookings = loadJSON(LS_BOOKINGS, []);
  let requests = loadJSON(LS_REQUESTS, null); // null => aún no sembradas
  let mode = 'meter';
  let lastCalc = null;
  let stationEditing = false;
  let spotEditing = false;
  let currentView = 'charge';
  let sheetSpot = null;
  const taState = { torre: null, piso: null, unit: null };
  const chartState = { group: 'day' };
  const filters = { sort: 'dist', maxPrice: 2000, minPow: 0, port: 'all', now: false };
  const spDias = [0, 1, 1, 1, 1, 1, 0]; // editor de disponibilidad (D..S)

  const persistSettings = () => localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
  const persistSessions = () => localStorage.setItem(LS_SESSIONS, JSON.stringify(sessions));
  const persistBookings = () => localStorage.setItem(LS_BOOKINGS, JSON.stringify(bookings));
  const persistRequests = () => localStorage.setItem(LS_REQUESTS, JSON.stringify(requests));

  /* =========================================================
     Roles y navegación
     ========================================================= */
  const TABS = {
    driver: ['map', 'bookings', 'charge', 'settings'],
    host: ['charge', 'requests', 'history', 'charts', 'settings']
  };

  function applyRole(role, opts) {
    settings.role = role;
    persistSettings();
    const list = TABS[role] || TABS.host;
    $$('.nav-btn').forEach((b) => b.classList.toggle('nav-hidden', !list.includes(b.dataset.view)));
    $('#roleTag').textContent = role === 'driver' ? 'Encuentra tu carga' : 'Carga compartida';
    $$('#roleSwitch .seg-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.role === role));
    $('#roleGate').classList.add('hidden');
    $('#roleGate').setAttribute('aria-hidden', 'true');
    if (!opts || !opts.keepView) goView(list[0]);
    else if (!list.includes(currentView)) goView(list[0]);
  }

  function goView(name) {
    currentView = name;
    $$('.view').forEach((v) => {
      const active = v.id === 'view-' + name;
      v.classList.toggle('is-active', active);
      v.hidden = !active;
    });
    $$('.nav-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.view === name));
    if (name === 'history') renderHistory();
    if (name === 'charts') renderCharts();
    if (name === 'map') renderMap();
    if (name === 'bookings') renderBookings();
    if (name === 'requests') { renderSpotCard(); renderRequests(); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* =========================================================
     Torre y apartamento
     ========================================================= */
  function buildTAChips() {
    const torre = $('#torreChips'), piso = $('#pisoChips'), apto = $('#aptoChips');
    for (let t = 1; t <= 6; t++) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = t; b.dataset.v = t;
      b.addEventListener('click', () => { taState.torre = taState.torre === t ? null : t; renderTA(); });
      torre.appendChild(b);
    }
    for (let p = 2; p <= 8; p++) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = p; b.dataset.v = p;
      b.addEventListener('click', () => {
        if (taState.piso === p) { taState.piso = null; taState.unit = null; }
        else taState.piso = p;
        renderTA();
      });
      piso.appendChild(b);
    }
    for (let u = 1; u <= 4; u++) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.dataset.v = u;
      b.addEventListener('click', () => { taState.unit = taState.unit === u ? null : u; renderTA(); });
      apto.appendChild(b);
    }
    $('#taClear').addEventListener('click', () => {
      taState.torre = null; taState.piso = null; taState.unit = null; renderTA();
    });
  }

  function renderTA() {
    $$('#torreChips .chip').forEach((c) => c.classList.toggle('is-active', +c.dataset.v === taState.torre));
    $$('#pisoChips .chip').forEach((c) => c.classList.toggle('is-active', +c.dataset.v === taState.piso));
    const hasPiso = taState.piso != null;
    $('#aptoRow').classList.toggle('hidden', !hasPiso);
    if (hasPiso) {
      $$('#aptoChips .chip').forEach((c) => {
        const u = +c.dataset.v;
        c.textContent = taState.piso * 100 + u;
        c.classList.toggle('is-active', taState.unit === u);
      });
    }
    const apto = hasPiso && taState.unit ? taState.piso * 100 + taState.unit : null;
    const parts = [];
    if (taState.torre) parts.push('Torre ' + taState.torre);
    if (apto) parts.push('Apto ' + apto);
    $('#taSummary').classList.toggle('hidden', !parts.length);
    if (parts.length) $('#taSummaryText').textContent = '🏢 ' + parts.join(' · ');
  }

  const getTA = () => ({
    torre: taState.torre || null,
    apto: taState.piso && taState.unit ? taState.piso * 100 + taState.unit : null
  });

  /* =========================================================
     Cálculo
     ========================================================= */
  function readInputs() {
    const driverName = $('#driverName').value.trim();
    const carModel = $('#carModel').value.trim();
    const serviceFee = parseNum($('#serviceFee').value) || 0;
    const discount = parseNum($('#discount').value) || 0;
    const ta = getTA();
    let kwh = 0, readingStart = null, readingEnd = null;
    if (mode === 'meter') {
      readingStart = parseNum($('#readingStart').value);
      readingEnd = parseNum($('#readingEnd').value);
      kwh = readingEnd - readingStart;
    } else {
      kwh = parseNum($('#directKwh').value);
    }
    return { driverName, carModel, serviceFee, discount, kwh, readingStart, readingEnd, torre: ta.torre, apto: ta.apto };
  }

  function computeCharge() {
    const inp = readInputs();
    const price = settings.pricePerKwh;
    const kwh = inp.kwh;
    const subtotal = kwh * price;
    const total = Math.max(0, subtotal + inp.serviceFee - inp.discount);
    const eff = settings.kmPerKwh || DEFAULTS.kmPerKwh;
    const kmAdded = kwh * eff;
    const co2 = (kmAdded / GAS_KM_PER_L) * CO2_GAS_PER_L;
    const gasCost = (kmAdded / GAS_KM_PER_L) * GAS_PRICE_PER_L;
    const savings = Math.max(0, gasCost - total);
    return Object.assign(inp, { pricePerKwh: price, subtotal, total, kmAdded, co2, savings });
  }

  function validate(inp) {
    if (settings.pricePerKwh <= 0) return 'Configura primero el precio por kWh en Ajustes.';
    if (mode === 'meter') {
      if (!$('#readingStart').value.trim() || !$('#readingEnd').value.trim())
        return 'Ingresa la lectura inicial y final del contador.';
      if (inp.readingEnd < inp.readingStart)
        return 'La lectura final debe ser mayor que la inicial.';
      if (inp.kwh <= 0) return 'El consumo debe ser mayor a 0 kWh.';
    } else if (inp.kwh <= 0) return 'Ingresa la energía consumida (mayor a 0 kWh).';
    return null;
  }

  function updateLive() {
    const inp = readInputs();
    const kwh = inp.kwh > 0 ? inp.kwh : 0;
    const cost = Math.max(0, kwh * settings.pricePerKwh + inp.serviceFee - inp.discount);
    $('#liveKwh').textContent = fmtKwh(kwh);
    $('#liveCost').textContent = fmtCOP(cost);
    $('#liveBar').style.width = clamp(kwh / 60 * 100, 0, 100) + '%';
  }

  /* =========================================================
     Animación
     ========================================================= */
  const anim = { timers: [], running: [] };
  const prefersReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PORT = { x: 477, y: 207 };

  function clearAnims() {
    anim.timers.forEach(clearTimeout); anim.timers = [];
    anim.running.forEach((a) => { try { a.cancel(); } catch (e) {} });
    anim.running = [];
  }

  function setBattery(pct) {
    pct = clamp(pct, 0, 100);
    $('#batteryFill').setAttribute('width', (pct / 100 * 78).toFixed(1));
    $('#batteryPct').textContent = Math.round(pct) + '%';
  }

  function setConsole(status, phase) {
    $('#roStatus').textContent = status;
    const cc = $('#chargeConsole');
    cc.classList.toggle('is-charging', phase === 'charging');
    cc.classList.toggle('is-done', phase === 'done');
  }

  function buildSparks() {
    const g = $('#sparks'); g.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      const c = svgEl('circle', {
        class: 'spark',
        cx: (PORT.x + (Math.random() * 22 - 11)).toFixed(0),
        cy: (PORT.y + (Math.random() * 8 - 4)).toFixed(0),
        r: (Math.random() * 2 + 1.4).toFixed(1)
      });
      c.style.setProperty('--sx', (Math.random() * 44 - 22).toFixed(0) + 'px');
      c.style.animationDelay = (Math.random()).toFixed(2) + 's';
      g.appendChild(c);
    }
  }

  const startWheels = (dur) => $$('#sceneMain .wheel-spin').map((w) =>
    w.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
      { duration: dur, iterations: Infinity, easing: 'linear' }));

  function burstPort() {
    anim.running.push($('#portBurst').animate(
      [{ opacity: 0.9, transform: 'scale(0.5)' }, { opacity: 0, transform: 'scale(2.6)' }],
      { duration: 480, easing: 'ease-out' }));
  }

  function resetScene() {
    const scene = $('#sceneMain');
    scene.classList.remove('charging', 'moving');
    $('.scene-holder').classList.remove('flash');
    $('#evCar').style.transform = 'translateX(-560px)';
    setBattery(0);
    $('#roKwh').textContent = '0,0';
    $('#roCop').textContent = fmtCOP(0);
    setConsole('Conectando', 'idle');
    buildSparks();
  }

  function tween(dur, onUpdate, onDone) {
    const t0 = performance.now();
    function step(now) {
      const p = clamp((now - t0) / dur, 0, 1);
      onUpdate(1 - Math.pow(1 - p, 3));
      if (p < 1) { const id = requestAnimationFrame(step); anim.running.push({ cancel: () => cancelAnimationFrame(id) }); }
      else if (onDone) onDone();
    }
    const id = requestAnimationFrame(step);
    anim.running.push({ cancel: () => cancelAnimationFrame(id) });
  }

  const countTo = (el, from, to, dur, fmt) => tween(dur, (e) => { el.textContent = fmt(from + (to - from) * e); });

  function playSequence(calc) {
    clearAnims();
    resetScene();
    const scene = $('#sceneMain');
    const car = $('#evCar');
    const body = $('#carBodyGrp');

    if (prefersReduced() || !settings.animations) {
      car.style.transform = 'translateX(0)';
      scene.classList.add('charging');
      setBattery(100);
      $('#roKwh').textContent = fmtKwh(calc.kwh);
      $('#roCop').textContent = fmtCOP(calc.total);
      setConsole('¡Completa!', 'done');
      revealResult(calc);
      return;
    }

    const ENTER = 1150, CHARGE = 2100;
    scene.classList.add('moving');
    const wheels = startWheels(480);
    anim.running.push.apply(anim.running, wheels);
    anim.running.push(car.animate(
      [{ transform: 'translateX(-560px)' }, { transform: 'translateX(14px)', offset: 0.84 }, { transform: 'translateX(0px)' }],
      { duration: 1100, easing: 'cubic-bezier(.17,.84,.28,1)', fill: 'forwards' }));
    anim.running.push(body.animate(
      [
        { transform: 'rotate(0deg) translateY(0px)' },
        { transform: 'rotate(0deg) translateY(0px)', offset: 0.6 },
        { transform: 'rotate(1.6deg) translateY(2px)', offset: 0.8 },
        { transform: 'rotate(-0.6deg) translateY(-1px)', offset: 0.92 },
        { transform: 'rotate(0deg) translateY(0px)' }
      ],
      { duration: 1150, easing: 'ease-out' }));

    anim.timers.push(setTimeout(() => {
      wheels.forEach((w) => { try { w.cancel(); } catch (e) {} });
      scene.classList.remove('moving');
      car.style.transform = 'translateX(0)';
      burstPort();
      scene.classList.add('charging');
      setConsole('Cargando', 'charging');
      anim.running.push(body.animate(
        [{ transform: 'translateY(0px)' }, { transform: 'translateY(-3px)' }, { transform: 'translateY(0px)' }],
        { duration: 2400, iterations: Infinity, easing: 'ease-in-out' }));
      countTo($('#roKwh'), 0, calc.kwh, CHARGE - 200, (v) => fmtKwh(v));
      countTo($('#roCop'), 0, calc.total, CHARGE - 200, (v) => fmtCOP(v));
      tween(CHARGE - 200, (e) => setBattery(e * 100));
    }, ENTER));

    anim.timers.push(setTimeout(() => {
      $('#roKwh').textContent = fmtKwh(calc.kwh);
      $('#roCop').textContent = fmtCOP(calc.total);
      setBattery(100);
      setConsole('¡Completa!', 'done');
      revealResult(calc);
    }, ENTER + CHARGE));
  }

  function playExit(after) {
    clearAnims();
    const scene = $('#sceneMain');
    const car = $('#evCar');
    const body = $('#carBodyGrp');
    scene.classList.remove('charging');
    let done = false;
    const finish = () => { if (done) return; done = true; scene.classList.remove('moving'); if (after) after(); };
    if (prefersReduced() || !settings.animations) { finish(); return; }
    setConsole('Desconectando', 'idle');
    burstPort();
    scene.classList.add('moving');
    const wheels = startWheels(400);
    anim.running.push.apply(anim.running, wheels);
    anim.running.push(car.animate(
      [{ transform: 'translateX(0px)' }, { transform: 'translateX(-16px)', offset: 0.16 }, { transform: 'translateX(920px)' }],
      { duration: 900, easing: 'cubic-bezier(.5,0,.78,.2)', fill: 'forwards' }));
    anim.running.push(body.animate(
      [
        { transform: 'rotate(0deg) translateY(0px)' },
        { transform: 'rotate(-2.2deg) translateY(2px)', offset: 0.3 },
        { transform: 'rotate(-0.8deg) translateY(1px)', offset: 0.65 },
        { transform: 'rotate(0deg) translateY(0px)' }
      ],
      { duration: 900, easing: 'ease-out' }));
    anim.timers.push(setTimeout(() => { wheels.forEach((w) => { try { w.cancel(); } catch (e) {} }); finish(); }, 940));
  }

  function skipToResult(calc) {
    clearAnims();
    const scene = $('#sceneMain');
    scene.classList.remove('moving');
    $('#evCar').style.transform = 'translateX(0)';
    scene.classList.add('charging');
    setBattery(100);
    $('#roKwh').textContent = fmtKwh(calc.kwh);
    $('#roCop').textContent = fmtCOP(calc.total);
    setConsole('¡Completa!', 'done');
    revealResult(calc);
  }

  /* =========================================================
     Overlay + resultado
     ========================================================= */
  function openOverlay() {
    const ov = $('#overlay');
    ov.classList.add('is-open');
    ov.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    $('#resultPanel').classList.remove('is-visible');
    $('#skipBtn').classList.remove('hidden');
  }
  function closeOverlay() {
    const ov = $('#overlay');
    ov.classList.remove('is-open');
    ov.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    $('.scene-holder').classList.remove('flash');
    clearAnims();
    // dejar el vehículo "parqueado" para la escena en reposo (stage-mini usa <use>)
    $('#evCar').style.transform = 'translateX(0)';
    setBattery(100);
  }

  function buildBreakdown(calc) {
    const row = (l, v, cls) => `<div class="bd-row ${cls || ''}"><span>${l}</span><b>${v}</b></div>`;
    let h = '';
    if (calc.readingStart != null && (calc.readingStart || calc.readingEnd)) {
      h += row('Lectura inicial', fmtKwh(calc.readingStart) + ' kWh');
      h += row('Lectura final', fmtKwh(calc.readingEnd) + ' kWh');
    }
    h += row('Consumo', fmtKwh(calc.kwh) + ' kWh');
    h += row('Precio por kWh', fmtCOP(calc.pricePerKwh));
    h += row('Subtotal', fmtCOP(calc.subtotal));
    if (calc.serviceFee > 0) h += row('Tarifa de servicio', fmtCOP(calc.serviceFee));
    if (calc.discount > 0) h += row('Descuento', '− ' + fmtCOP(calc.discount));
    if (calc.torre || calc.apto) {
      const ta = [calc.torre ? 'Torre ' + calc.torre : null, calc.apto ? 'Apto ' + calc.apto : null].filter(Boolean).join(' · ');
      h += row('Ubicación', ta);
    }
    h += row('Total a cobrar', fmtCOP(calc.total), 'bd-total');
    return h;
  }

  function revealResult(calc) {
    lastCalc = calc;
    $('#skipBtn').classList.add('hidden');
    $('#rSub').textContent = fmtKwh(calc.kwh) + ' kWh · ' + fmtCOP(calc.pricePerKwh) + '/kWh';
    $('#rKm').textContent = fmtNum(Math.round(calc.kmAdded)) + ' km';
    $('#rCo2').textContent = (calc.co2).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' kg';
    $('#rSave').textContent = fmtCOP(calc.savings || 0);
    $('#rBreakdown').innerHTML = buildBreakdown(calc);

    const holder = $('.scene-holder');
    holder.classList.add('flash');
    anim.timers.push(setTimeout(() => holder.classList.remove('flash'), 750));

    $('#resultPanel').classList.add('is-visible');
    $('#rTotal').textContent = fmtCOP(calc.total);
    countTo($('#rTotal'), 0, calc.total, 1000, (v) => fmtCOP(v));
    if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) {} }
  }

  function saveSession(calc) {
    const s = Object.assign({ id: uid('s'), dateISO: calc.dateISO || new Date().toISOString() }, calc);
    sessions.unshift(s);
    persistSessions();
    return s;
  }

  /* =========================================================
     Historial
     ========================================================= */
  const computeStats = () => sessions.reduce((a, s) => {
    a.earn += s.total || 0; a.kwh += s.kwh || 0; a.count++; return a;
  }, { earn: 0, kwh: 0, count: 0 });

  function taLabel(s) {
    const parts = [];
    if (s.torre) parts.push('T' + s.torre);
    if (s.apto) parts.push(String(s.apto));
    return parts.join(' · ');
  }

  function renderHistory() {
    const st = computeStats();
    $('#statEarn').textContent = fmtCOP(st.earn);
    $('#statKwh').innerHTML = fmtKwh(st.kwh) + ' <small>kWh</small>';
    $('#statCount').textContent = st.count;

    const list = $('#histList');
    const empty = $('#histEmpty');
    list.innerHTML = '';
    if (!sessions.length) { empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');

    sessions.forEach((s) => {
      const li = document.createElement('li');
      li.className = 'hist-item';
      const date = new Date(s.dateISO);
      const title = s.driverName || s.carModel || 'Carga';
      const ta = taLabel(s);
      const sub = [
        date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }),
        date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
        ta || (s.driverName ? s.carModel : '')
      ].filter(Boolean).join(' · ');
      li.innerHTML = `
        <div class="hist-ico"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h7l-1 8 10-12h-7z"/></svg></div>
        <div class="hist-main"><div class="hist-title">${escapeHtml(title)}</div><div class="hist-sub">${escapeHtml(sub)}</div></div>
        <div class="hist-amount"><div class="hist-cop">${fmtCOP(s.total)}</div><div class="hist-kwh">${fmtKwh(s.kwh)} kWh</div></div>
        <div class="hist-actions">
          <button class="btn-ghost btn-sm" data-share="${s.id}">Compartir</button>
          <button class="btn-ghost btn-sm btn-danger" data-del="${s.id}">Eliminar</button>
        </div>`;
      list.appendChild(li);
    });

    $$('#histList [data-del]').forEach((b) => b.addEventListener('click', () => {
      sessions = sessions.filter((x) => x.id !== b.getAttribute('data-del'));
      persistSessions(); renderHistory(); toast('Carga eliminada');
    }));
    $$('#histList [data-share]').forEach((b) => b.addEventListener('click', () => {
      const s = sessions.find((x) => x.id === b.getAttribute('data-share'));
      if (s) shareReceipt(s);
    }));
  }

  /* =========================================================
     Recibo / compartir / CSV
     ========================================================= */
  function receiptText(calc) {
    const L = [];
    L.push('⚡ *Voltio* — Recibo de carga');
    if (settings.stationName) L.push('📍 ' + settings.stationName);
    L.push('🗓️ ' + new Date(calc.dateISO || Date.now()).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }));
    if (calc.driverName) L.push('👤 ' + calc.driverName);
    if (calc.torre || calc.apto) L.push('🏢 ' + [calc.torre ? 'Torre ' + calc.torre : null, calc.apto ? 'Apto ' + calc.apto : null].filter(Boolean).join(' · '));
    if (calc.carModel) L.push('🚗 ' + calc.carModel);
    L.push('──────────────');
    if (calc.readingStart != null && (calc.readingStart || calc.readingEnd)) {
      L.push('Lectura inicial: ' + fmtKwh(calc.readingStart) + ' kWh');
      L.push('Lectura final:  ' + fmtKwh(calc.readingEnd) + ' kWh');
    }
    L.push('Consumo: ' + fmtKwh(calc.kwh) + ' kWh');
    L.push('Precio kWh: ' + fmtCOP(calc.pricePerKwh));
    if (calc.serviceFee > 0) L.push('Tarifa servicio: ' + fmtCOP(calc.serviceFee));
    if (calc.discount > 0) L.push('Descuento: −' + fmtCOP(calc.discount));
    L.push('──────────────');
    L.push('*TOTAL: ' + fmtCOP(calc.total) + '*');
    L.push('🔋 ~' + fmtNum(Math.round(calc.kmAdded)) + ' km de autonomía · 🌱 ' + (calc.co2).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' kg CO₂ evitados');
    if (calc.savings > 500) L.push('💵 Ahorro vs gasolina: ~' + fmtCOP(calc.savings));
    if (settings.ownerName) L.push('Cargador de ' + settings.ownerName);
    L.push('Gracias por cargar con energía limpia ⚡');
    return L.join('\n');
  }

  async function shareReceipt(calc) {
    const text = receiptText(calc);
    if (navigator.share) {
      try { await navigator.share({ title: 'Recibo Voltio', text }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  }

  const csvCell = (v) => { v = v == null ? '' : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
  }
  function exportCSV() {
    if (!sessions.length) { toast('No hay cargas para exportar', 'error'); return; }
    const head = ['Fecha', 'Conductor', 'Vehiculo', 'Torre', 'Apto', 'Lectura inicial (kWh)', 'Lectura final (kWh)', 'Consumo (kWh)', 'Precio kWh (COP)', 'Tarifa servicio (COP)', 'Descuento (COP)', 'Total (COP)'];
    const rows = sessions.map((s) => [
      new Date(s.dateISO).toLocaleString('es-CO'),
      s.driverName || '', s.carModel || '', s.torre || '', s.apto || '',
      s.readingStart != null ? round2(s.readingStart) : '',
      s.readingEnd != null ? round2(s.readingEnd) : '',
      round2(s.kwh), Math.round(s.pricePerKwh), Math.round(s.serviceFee || 0),
      Math.round(s.discount || 0), Math.round(s.total)
    ]);
    const csv = [head].concat(rows).map((r) => r.map(csvCell).join(',')).join('\r\n');
    download('voltio-historial.csv', '﻿' + csv, 'text/csv;charset=utf-8');
    toast('Historial exportado ⬇');
  }

  /* =========================================================
     Gráficas (2, con unidades)
     ========================================================= */
  const dayKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  function bucketize() {
    if (chartState.group === 'day') {
      const days = [];
      const now = new Date();
      for (let i = 7; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        days.push({ key: dayKey(d), label: d.getDate() + ' ' + d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', ''), cop: 0, kwh: 0, count: 0 });
      }
      sessions.forEach((s) => {
        const b = days.find((x) => x.key === dayKey(new Date(s.dateISO)));
        if (b) { b.cop += s.total || 0; b.kwh += s.kwh || 0; b.count++; }
      });
      return days;
    }
    const map = {};
    sessions.forEach((s) => {
      const k = s.driverName || 'Sin nombre';
      const b = map[k] || (map[k] = { key: k, label: k.length > 8 ? k.slice(0, 7) + '…' : k, full: k, cop: 0, kwh: 0, count: 0 });
      b.cop += s.total || 0; b.kwh += s.kwh || 0; b.count++;
    });
    return Object.values(map).sort((a, b) => b.cop - a.cop).slice(0, 6);
  }

  function drawGrid(svg, X0, X1, Y0, Y1, maxVal, metric) {
    [0.25, 0.5, 0.75].forEach((f) => {
      svg.appendChild(svgEl('line', { x1: X0, x2: X1, y1: Y1 - (Y1 - Y0) * f, y2: Y1 - (Y1 - Y0) * f, stroke: 'rgba(255,255,255,0.06)', 'stroke-dasharray': '3 5' }));
      const t = svgEl('text', { x: X0, y: Y1 - (Y1 - Y0) * f - 4, class: 'chart-axis' });
      t.textContent = fmtCompact(maxVal * f, metric);
      svg.appendChild(t);
    });
    svg.appendChild(svgEl('line', { x1: X0, x2: X1, y1: Y0 - 4, y2: Y0 - 4, stroke: 'rgba(255,255,255,0.07)', 'stroke-dasharray': '3 5' }));
    const tm = svgEl('text', { x: X0, y: Y0 - 8, class: 'chart-axis' });
    tm.textContent = fmtCompact(maxVal, metric);
    svg.appendChild(tm);
    const base = svgEl('line', { x1: X0, x2: X1, y1: Y1, y2: Y1 });
    base.style.stroke = 'rgba(255,255,255,0.14)'; base.style.strokeWidth = '1.5';
    svg.appendChild(base);
  }

  function drawBars(svg, buckets, metric, unit) {
    const X0 = 14, X1 = 350, Y0 = 36, Y1 = 200, LABY = 220;
    const vals = buckets.map((b) => metric === 'cop' ? b.cop : b.kwh);
    const max = Math.max.apply(null, vals.concat([0.001])) * 1.05;
    drawGrid(svg, X0, X1, Y0, Y1, max, metric);
    const span = (X1 - X0) / buckets.length;
    const barW = Math.min(30, span * 0.52);
    buckets.forEach((b, i) => {
      const v = vals[i];
      const cx = X0 + span * i + span / 2;
      const zero = v <= 0;
      const h = zero ? 3 : Math.max(6, (v / max) * (Y1 - Y0));
      const rect = svgEl('rect', {
        x: (cx - barW / 2).toFixed(1), y: (Y1 - h).toFixed(1),
        width: barW.toFixed(1), height: h.toFixed(1), rx: Math.min(6, barW / 2),
        fill: zero ? 'rgba(255,255,255,0.06)' : 'url(#accentGrad)',
        class: 'chart-bar' + (zero ? ' bar-zero' : '')
      });
      rect.style.transitionDelay = (i * 55) + 'ms';
      if (!zero) {
        const detail = (b.full || b.label) + ': ' + fmtCOP(b.cop) + ' · ' + fmtKwh(b.kwh) + ' kWh · ' + b.count + (b.count === 1 ? ' carga' : ' cargas');
        rect.addEventListener('click', () => toast(detail));
        const t = svgEl('title', {}); t.textContent = detail; rect.appendChild(t);
      }
      svg.appendChild(rect);
      if (!zero) {
        const vt = svgEl('text', { x: cx.toFixed(1), y: (Y1 - h - 8).toFixed(1), 'text-anchor': 'middle', 'font-size': '9.5', 'font-weight': '700', fill: '#eaf2ff', 'font-family': 'Orbitron, sans-serif', class: 'chart-val' });
        vt.style.transitionDelay = (i * 55 + 250) + 'ms';
        vt.textContent = fmtCompact(v, metric) + (metric === 'kwh' ? '' : '');
        svg.appendChild(vt);
      }
      const lt = svgEl('text', { x: cx.toFixed(1), y: LABY, 'text-anchor': 'middle', 'font-size': '9', fill: 'rgba(159,178,204,0.85)' });
      lt.textContent = b.label;
      svg.appendChild(lt);
    });
  }

  function drawArea(svg, buckets, metric) {
    const X0 = 14, X1 = 350, Y0 = 36, Y1 = 200, LABY = 220;
    const vals = buckets.map((b) => b.kwh);
    const max = Math.max.apply(null, vals.concat([0.001])) * 1.1;
    drawGrid(svg, X0, X1, Y0, Y1, max, metric);
    const span = (X1 - X0) / buckets.length;
    const pts = buckets.map((b, i) => ({
      x: X0 + span * i + span / 2,
      y: Y1 - Math.max(0, (b.kwh / max)) * (Y1 - Y0),
      b
    }));
    // línea suavizada
    let d = 'M ' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1], p1 = pts[i];
      const mx = (p0.x + p1.x) / 2;
      d += ' C ' + mx.toFixed(1) + ' ' + p0.y.toFixed(1) + ', ' + mx.toFixed(1) + ' ' + p1.y.toFixed(1) + ', ' + p1.x.toFixed(1) + ' ' + p1.y.toFixed(1);
    }
    const area = svgEl('path', { d: d + ' L ' + pts[pts.length - 1].x.toFixed(1) + ' ' + Y1 + ' L ' + pts[0].x.toFixed(1) + ' ' + Y1 + ' Z', class: 'chart-area' });
    svg.appendChild(area);
    const line = svgEl('path', { d, class: 'chart-line' });
    const len = 900;
    line.style.strokeDasharray = len;
    line.style.strokeDashoffset = len;
    line.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.3,.7,.3,1)';
    svg.appendChild(line);
    area.style.opacity = '0';
    area.style.transition = 'opacity 0.8s ease 0.3s';
    pts.forEach((p, i) => {
      const dot = svgEl('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 3.5, class: 'chart-dot chart-val' });
      dot.style.transitionDelay = (i * 60 + 300) + 'ms';
      svg.appendChild(dot);
      if (p.b.kwh > 0) {
        const vt = svgEl('text', { x: p.x.toFixed(1), y: (p.y - 9).toFixed(1), 'text-anchor': 'middle', 'font-size': '9.5', 'font-weight': '700', fill: '#eaf2ff', 'font-family': 'Orbitron, sans-serif', class: 'chart-val' });
        vt.style.transitionDelay = (i * 60 + 350) + 'ms';
        vt.textContent = fmtCompact(p.b.kwh, 'kwh');
        svg.appendChild(vt);
        const detail = p.b.label + ': ' + fmtKwh(p.b.kwh) + ' kWh · ' + fmtCOP(p.b.cop);
        dot.addEventListener('click', () => toast(detail));
      }
      const lt = svgEl('text', { x: p.x.toFixed(1), y: LABY, 'text-anchor': 'middle', 'font-size': '9', fill: 'rgba(159,178,204,0.85)' });
      lt.textContent = p.b.label;
      svg.appendChild(lt);
    });
    // rAF con respaldo por temporizador (pestañas en 2º plano no pintan frames)
    const reveal = () => { line.style.strokeDashoffset = '0'; area.style.opacity = '1'; };
    requestAnimationFrame(() => requestAnimationFrame(reveal));
    setTimeout(reveal, 120);
  }

  function renderCharts() {
    const A = $('#chartSvgA'), B = $('#chartSvgB');
    const empty = $('#chartEmpty');
    [A, B].forEach((s) => { s.classList.remove('chart-in'); s.innerHTML = ''; });

    const has = sessions.length > 0;
    $$('.chart-card').forEach((c) => c.classList.toggle('hidden', !has));
    $('.chart-controls').classList.toggle('hidden', !has);
    empty.classList.toggle('hidden', has);
    if (!has) return;

    const buckets = bucketize();
    const totCop = buckets.reduce((a, b) => a + b.cop, 0);
    const totKwh = buckets.reduce((a, b) => a + b.kwh, 0);
    const totCount = buckets.reduce((a, b) => a + b.count, 0);
    $('#chartPeriod').textContent = chartState.group === 'day' ? 'Últimos 8 días' : 'Top vecinos';

    drawBars(A, buckets, 'cop', 'COP');
    $('#chartFootA').innerHTML = `<span>Total del período</span><b>${fmtCOP(totCop)}</b>`;

    if (chartState.group === 'day') drawArea(B, buckets, 'kwh');
    else drawBars(B, buckets, 'kwh', 'kWh');
    $('#chartFootB').innerHTML = `<span>${totCount} ${totCount === 1 ? 'carga' : 'cargas'} en total</span><b>${fmtKwh(totKwh)} kWh</b>`;

    const reveal = () => { A.classList.add('chart-in'); B.classList.add('chart-in'); };
    requestAnimationFrame(() => requestAnimationFrame(reveal));
    setTimeout(reveal, 120);
  }

  /* =========================================================
     Mapa + puestos
     ========================================================= */
  function allSpots() {
    const list = DEMO_SPOTS.slice();
    const my = settings.mySpot;
    if (my && my.visible) {
      list.unshift(Object.assign({}, my, { id: 'mine', mine: true, x: 160, y: 138, distKm: 0, rating: 5.0, votes: 1, host: settings.ownerName || 'Tú' }));
    }
    return list;
  }

  function isOpenNow(sp) {
    const now = new Date();
    if (!sp.dias[now.getDay()]) return false;
    const cur = now.getHours() * 60 + now.getMinutes();
    const [h1, m1] = sp.desde.split(':').map(Number);
    const [h2, m2] = sp.hasta.split(':').map(Number);
    return cur >= h1 * 60 + m1 && cur <= h2 * 60 + m2;
  }

  function filteredSpots() {
    let list = allSpots().filter((sp) =>
      sp.precio <= filters.maxPrice &&
      sp.pow >= filters.minPow &&
      (filters.port === 'all' || sp.puerto === filters.port) &&
      (!filters.now || isOpenNow(sp))
    );
    if (filters.sort === 'dist') list.sort((a, b) => a.distKm - b.distKm);
    if (filters.sort === 'price') list.sort((a, b) => a.precio - b.precio);
    if (filters.sort === 'pow') list.sort((a, b) => b.pow - a.pow);
    return list;
  }

  function diasLabel(sp) {
    if (sp.dias.every(Boolean)) return 'Todos los días';
    const on = sp.dias.map((v, i) => v ? DIAS[i] : null).filter(Boolean);
    return on.join(' · ');
  }

  function renderMap() {
    const svg = $('#mapSvg');
    svg.innerHTML = '';
    const visible = filteredSpots();
    const visibleIds = new Set(visible.map((s) => s.id));

    // fondo tipo ciudad
    for (let gx = 20; gx < 360; gx += 34) svg.appendChild(svgEl('line', { x1: gx, y1: 8, x2: gx, y2: 232, class: 'mp-grid' }));
    for (let gy = 16; gy < 240; gy += 34) svg.appendChild(svgEl('line', { x1: 8, y1: gy, x2: 352, y2: gy, class: 'mp-grid' }));
    svg.appendChild(svgEl('path', { d: 'M 0 190 C 90 170, 150 200, 240 150 S 360 110, 360 110', fill: 'none', class: 'mp-road' }));
    svg.appendChild(svgEl('path', { d: 'M 60 0 C 90 80, 170 90, 200 240', fill: 'none', class: 'mp-road' }));
    svg.appendChild(svgEl('path', { d: 'M 0 190 C 90 170, 150 200, 240 150 S 360 110, 360 110', fill: 'none', class: 'mp-road2' }));

    // anillos de distancia
    [[46, '1 km'], [92, '3 km']].forEach(([r, lab]) => {
      svg.appendChild(svgEl('circle', { cx: 180, cy: 118, r, fill: 'none', class: 'mp-ring' }));
      const t = svgEl('text', { x: 180 + 6, y: 118 - r + 11, class: 'mp-ring-label' });
      t.textContent = lab;
      svg.appendChild(t);
    });

    // yo
    svg.appendChild(svgEl('circle', { cx: 180, cy: 118, r: 6, fill: 'none', class: 'mp-me-ring' }));
    svg.appendChild(svgEl('circle', { cx: 180, cy: 118, r: 5, class: 'mp-me' }));
    const meT = svgEl('text', { x: 180, y: 108, 'text-anchor': 'middle', 'font-size': '8.5', fill: 'rgba(234,242,255,0.8)', 'font-weight': '700' });
    meT.textContent = 'Tú';
    svg.appendChild(meT);

    // pines
    allSpots().forEach((sp) => {
      const open = isOpenNow(sp);
      const dim = !visibleIds.has(sp.id);
      const g = svgEl('g', { class: 'mp-pin' + (open ? '' : ' pin-off') + (dim ? ' pin-dim' : '') });
      g.appendChild(svgEl('circle', { class: 'pin-bg', cx: sp.x, cy: sp.y, r: 11 }));
      const bolt = svgEl('path', { class: 'pin-bolt', d: `M${sp.x + 2} ${sp.y - 6} L${sp.x - 4} ${sp.y + 1} H${sp.x - 0.5} L${sp.x - 2} ${sp.y + 6} L${sp.x + 4} ${sp.y - 1} H${sp.x + 0.5} Z` });
      g.appendChild(bolt);
      const label = svgEl('text', { x: sp.x, y: sp.y + 23, 'text-anchor': 'middle' });
      label.textContent = sp.mine ? 'Tu puesto' : fmtCompact(sp.precio, 'cop');
      g.appendChild(label);
      if (!dim) g.addEventListener('click', () => openSheet(sp));
      svg.appendChild(g);
    });

    $('#mapCount').textContent = visible.length + (visible.length === 1 ? ' puesto' : ' puestos');
    renderSpotList(visible);
  }

  function renderSpotList(list) {
    const ul = $('#mapList');
    ul.innerHTML = '';
    $('#mapEmpty').classList.toggle('hidden', list.length > 0);
    list.forEach((sp) => {
      const open = isOpenNow(sp);
      const li = document.createElement('li');
      li.className = 'spot-card';
      li.innerHTML = `
        <div class="sc-top">
          <div>
            <div class="sc-name">${escapeHtml(sp.nombre)}</div>
            <div class="sc-badges">
              <span class="sc-badge ${open ? 'b-ok' : 'b-off'}">${open ? '● Disponible ahora' : '○ Cerrado ahora'}</span>
              ${sp.verificado ? '<span class="sc-badge b-ver">✓ Verificado</span>' : ''}
              ${sp.mine ? '<span class="sc-badge b-mine">★ Tu puesto</span>' : ''}
            </div>
          </div>
          <div class="sc-price"><b>${fmtCOP(sp.precio)}</b><small>/ kWh</small></div>
        </div>
        <div class="sc-meta">
          <span>📍 ${sp.mine ? 'Tu ubicación' : sp.distKm.toLocaleString('es-CO') + ' km'}</span>
          <span>⚡ ${sp.pow.toLocaleString('es-CO')} kW</span>
          <span>🔌 ${sp.puerto}</span>
          <span class="sc-rating">★ ${sp.rating.toLocaleString('es-CO', { minimumFractionDigits: 1 })}</span>
        </div>`;
      li.addEventListener('click', () => openSheet(sp));
      ul.appendChild(li);
    });
  }

  /* =========================================================
     Hoja de reserva
     ========================================================= */
  function openSheet(sp) {
    sheetSpot = sp;
    const open = isOpenNow(sp);
    const c = $('#sheetContent');
    c.innerHTML = `
      <div class="sh-head">
        <div>
          <div class="sh-name">${escapeHtml(sp.nombre)}</div>
          <div class="sh-host">de ${escapeHtml(sp.host)} · ${escapeHtml(sp.dir)}</div>
          <div class="sc-badges" style="margin-top:8px">
            <span class="sc-badge ${open ? 'b-ok' : 'b-off'}">${open ? '● Disponible ahora' : '○ Cerrado ahora'}</span>
            ${sp.verificado ? '<span class="sc-badge b-ver">✓ Verificado</span>' : ''}
            <span class="sc-badge">★ ${sp.rating.toLocaleString('es-CO', { minimumFractionDigits: 1 })} (${sp.votes})</span>
          </div>
        </div>
        <div class="sc-price"><b>${fmtCOP(sp.precio)}</b><small>/ kWh</small></div>
      </div>
      <div class="sh-specs">
        <div class="sh-spec"><b>${sp.mine ? '—' : sp.distKm.toLocaleString('es-CO') + ' km'}</b><small>distancia</small></div>
        <div class="sh-spec"><b>${sp.pow.toLocaleString('es-CO')} kW</b><small>potencia</small></div>
        <div class="sh-spec"><b>${sp.puerto}</b><small>puerto</small></div>
        <div class="sh-spec"><b>~${Math.round(sp.pow * settings.kmPerKwh)} km/h</b><small>recarga</small></div>
      </div>
      <div class="sh-avail">🗓️ ${diasLabel(sp)} · ${sp.desde} – ${sp.hasta}</div>
      ${sp.mine ? '<p class="hint">Este es tu puesto publicado. Así lo ven los conductores 👀</p>' : `
      <div class="grid-2">
        <div class="field"><label>Fecha</label><div class="input-wrap"><input id="bkFecha" type="date" min="${todayISO()}" value="${todayISO()}"/></div></div>
        <div class="field"><label>Hora de llegada</label><div class="input-wrap"><input id="bkHora" type="time" value="${sp.desde}"/></div></div>
      </div>
      <div class="field" style="margin-top:10px"><label>Energía estimada</label><div class="input-wrap"><input id="bkKwh" inputmode="decimal" value="20" autocomplete="off"/><span class="unit">kWh</span></div></div>
      <div class="sh-est"><span>Costo estimado</span><b id="bkEst">${fmtCOP(20 * sp.precio)}</b></div>
      <button id="bkSend" class="btn-primary" type="button" style="margin-top:14px">
        <span class="btn-glow"></span>
        Solicitar reserva
      </button>
      <p class="hint" style="text-align:center;margin-top:8px">El anfitrión puede aceptar o declinar tu solicitud.</p>`}
    `;
    $('#spotSheet').classList.add('is-open');
    $('#spotSheet').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    if (!sp.mine) {
      const est = () => { $('#bkEst').textContent = fmtCOP(Math.max(0, parseNum($('#bkKwh').value)) * sp.precio); };
      $('#bkKwh').addEventListener('input', est);
      $('#bkSend').addEventListener('click', () => submitBooking(sp));
    }
  }

  function closeSheet() {
    $('#spotSheet').classList.remove('is-open');
    $('#spotSheet').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    sheetSpot = null;
  }

  function submitBooking(sp) {
    const fecha = $('#bkFecha').value || todayISO();
    const hora = $('#bkHora').value || sp.desde;
    const kwhEst = Math.max(1, parseNum($('#bkKwh').value) || 20);
    const dow = new Date(fecha + 'T12:00:00').getDay();
    if (!sp.dias[dow]) { toast('Ese día el puesto no está disponible', 'error'); return; }
    if (hora < sp.desde || hora > sp.hasta) { toast('Elige una hora entre ' + sp.desde + ' y ' + sp.hasta, 'error'); return; }
    const bk = {
      id: uid('b'), spotId: sp.id, spotName: sp.nombre, hostName: sp.host, dir: sp.dir,
      breb: sp.breb, titular: sp.titular, precio: sp.precio,
      fecha, hora, kwhEst, total: kwhEst * sp.precio,
      estado: 'pendiente', createdAt: Date.now()
    };
    bookings.unshift(bk);
    persistBookings();
    closeSheet();
    goView('bookings');
    toast('Solicitud enviada al anfitrión 📨');
    scheduleAutoConfirm(bk.id);
  }

  // Demo: el "anfitrión" responde a los pocos segundos
  function scheduleAutoConfirm(id) {
    setTimeout(() => {
      const bk = bookings.find((b) => b.id === id);
      if (bk && bk.estado === 'pendiente') {
        bk.estado = 'confirmada';
        persistBookings();
        if (currentView === 'bookings') renderBookings();
        toast('¡' + bk.hostName + ' confirmó tu reserva! ✅');
      }
    }, 8000);
  }

  function renderBookings() {
    const ul = $('#bookList');
    ul.innerHTML = '';
    $('#bookEmpty').classList.toggle('hidden', bookings.length > 0);
    const PILL = { pendiente: ['p-pend', 'Pendiente'], confirmada: ['p-ok', 'Confirmada'], rechazada: ['p-no', 'Rechazada'], cancelada: ['p-dim', 'Cancelada'] };
    bookings.forEach((bk) => {
      const [cls, lab] = PILL[bk.estado] || ['p-dim', bk.estado];
      const li = document.createElement('li');
      li.className = 'book-card';
      const fechaTxt = new Date(bk.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short' });
      li.innerHTML = `
        <div class="bk-top">
          <div><div class="bk-name">${escapeHtml(bk.spotName)}</div><div class="bk-sub">de ${escapeHtml(bk.hostName)} · ${escapeHtml(bk.dir || '')}</div></div>
          <span class="bk-pill ${cls}">${lab}</span>
        </div>
        <div class="bk-meta">
          <span>🗓️ ${fechaTxt} · ${bk.hora}</span>
          <span>⚡ ~${fmtKwh(bk.kwhEst)} kWh</span>
          <span>💰 ${fmtCOP(bk.total)} aprox.</span>
        </div>
        ${bk.estado === 'confirmada' && bk.breb ? `
        <div class="bk-pay">Al terminar tu carga, transfiere por <b>Bre-B</b> a la llave
          <span class="bk-key">${escapeHtml(bk.breb)}</span> · Titular: <b>${escapeHtml(bk.titular || bk.hostName)}</b>
          <div class="bk-actions"><button class="btn-ghost btn-sm" data-copy="${escapeHtml(bk.breb)}">Copiar llave</button></div>
        </div>` : ''}
        ${bk.estado === 'pendiente' ? `<div class="bk-actions"><button class="btn-ghost btn-sm btn-danger" data-cancel="${bk.id}">Cancelar solicitud</button></div>` : ''}
      `;
      ul.appendChild(li);
    });
    $$('#bookList [data-cancel]').forEach((b) => b.addEventListener('click', () => {
      const bk = bookings.find((x) => x.id === b.getAttribute('data-cancel'));
      if (bk) { bk.estado = 'cancelada'; persistBookings(); renderBookings(); toast('Solicitud cancelada'); }
    }));
    $$('#bookList [data-copy]').forEach((b) => b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(b.getAttribute('data-copy')); toast('Llave Bre-B copiada 📋'); }
      catch (e) { toast('No se pudo copiar', 'error'); }
    }));
  }

  /* =========================================================
     Anfitrión: mi puesto + solicitudes
     ========================================================= */
  function buildDiasChips() {
    const wrap = $('#spDias');
    wrap.style.gridTemplateColumns = 'repeat(7,1fr)';
    DIAS.forEach((d, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip' + (spDias[i] ? ' is-active' : ''); b.textContent = d;
      b.addEventListener('click', () => { spDias[i] = spDias[i] ? 0 : 1; b.classList.toggle('is-active', !!spDias[i]); });
      wrap.appendChild(b);
    });
  }

  function loadSpotForm() {
    const sp = settings.mySpot;
    if (!sp) return;
    $('#spName').value = sp.nombre || '';
    $('#spDir').value = sp.dir || '';
    $('#spPrecio').value = sp.precio || '';
    $('#spPow').value = String(sp.pow || 7.4);
    $('#spPort').value = sp.puerto || 'Tipo 2';
    $('#spDesde').value = sp.desde || '07:00';
    $('#spHasta').value = sp.hasta || '21:00';
    $('#spBreb').value = sp.breb || '';
    $('#spTitular').value = sp.titular || '';
    (sp.dias || []).forEach((v, i) => { spDias[i] = v; });
    $$('#spDias .chip').forEach((c, i) => c.classList.toggle('is-active', !!spDias[i]));
    const sw = $('#spVisible');
    sw.classList.toggle('is-on', sp.visible !== false);
    sw.setAttribute('aria-checked', String(sp.visible !== false));
  }

  function saveSpot() {
    const nombre = $('#spName').value.trim();
    if (!nombre) { toast('Ponle un nombre a tu puesto', 'error'); return; }
    settings.mySpot = {
      nombre,
      dir: $('#spDir').value.trim(),
      precio: Math.max(0, Math.round(parseNum($('#spPrecio').value))) || settings.pricePerKwh,
      pow: parseFloat($('#spPow').value),
      puerto: $('#spPort').value,
      desde: $('#spDesde').value || '07:00',
      hasta: $('#spHasta').value || '21:00',
      dias: spDias.slice(),
      breb: $('#spBreb').value.trim(),
      titular: $('#spTitular').value.trim(),
      visible: $('#spVisible').classList.contains('is-on')
    };
    persistSettings();
    spotEditing = false;
    renderSpotCard();
    toast('¡Tu puesto quedó publicado! ⚡');
  }

  function renderSpotCard() {
    const sp = settings.mySpot;
    const editing = spotEditing || !sp;
    $('#spotForm').classList.toggle('hidden', !editing);
    $('#spotSummary').classList.toggle('hidden', editing);
    $('#spotEditBtn').classList.toggle('hidden', editing);
    if (sp && !editing) {
      $('#spotSummary').innerHTML = `
        <div class="spot-summary-box">
          <div class="ssb-row">
            <div class="station-tile"><svg viewBox="0 0 100 100" width="24" height="24"><path d="M57 14 L28 56 H46 L41 86 L73 42 H53 Z" fill="currentColor"/></svg></div>
            <div>
              <div class="station-name">${escapeHtml(sp.nombre)}</div>
              <div class="station-owner">${escapeHtml(sp.dir || 'Sin dirección')} · ${fmtCOP(sp.precio)}/kWh</div>
            </div>
          </div>
          <div class="ssb-meta">
            <span class="sc-badge">⚡ ${sp.pow.toLocaleString('es-CO')} kW</span>
            <span class="sc-badge">🔌 ${escapeHtml(sp.puerto)}</span>
            <span class="sc-badge">🗓️ ${sp.desde}–${sp.hasta}</span>
            <span class="sc-badge ${sp.visible ? 'b-ok' : 'b-off'}">${sp.visible ? '● Visible en el mapa' : '○ Oculto'}</span>
            ${sp.breb ? '<span class="sc-badge b-ver">Bre-B ✓</span>' : ''}
          </div>
        </div>`;
    }
  }

  function seedRequests() {
    if (requests !== null) return;
    const t = new Date(); t.setDate(t.getDate() + 1);
    const p = new Date(); p.setDate(p.getDate() + 2);
    requests = [
      { id: uid('q'), nombre: 'Camila R.', info: 'Torre 2 · Apto 305', fecha: dayKey(t), hora: '19:00', kwhEst: 25, estado: 'pendiente' },
      { id: uid('q'), nombre: 'Andrés V.', info: 'Visitante · BYD Yuan', fecha: dayKey(p), hora: '10:00', kwhEst: 12, estado: 'pendiente' }
    ];
    persistRequests();
  }

  function renderRequests() {
    seedRequests();
    const ul = $('#reqList');
    ul.innerHTML = '';
    const list = requests || [];
    $('#reqEmpty').classList.toggle('hidden', list.length > 0);
    const price = (settings.mySpot && settings.mySpot.precio) || settings.pricePerKwh;
    const PILL = { pendiente: ['p-pend', 'Pendiente'], confirmada: ['p-ok', 'Aceptada'], rechazada: ['p-no', 'Rechazada'] };
    list.forEach((rq) => {
      const [cls, lab] = PILL[rq.estado] || ['p-dim', rq.estado];
      const li = document.createElement('li');
      li.className = 'book-card';
      const fechaTxt = new Date(rq.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short' });
      li.innerHTML = `
        <div class="bk-top">
          <div><div class="bk-name">${escapeHtml(rq.nombre)}</div><div class="bk-sub">${escapeHtml(rq.info)}</div></div>
          <span class="bk-pill ${cls}">${lab}</span>
        </div>
        <div class="bk-meta">
          <span>🗓️ ${fechaTxt} · ${rq.hora}</span>
          <span>⚡ ~${fmtKwh(rq.kwhEst)} kWh</span>
          <span>💰 ${fmtCOP(rq.kwhEst * price)} aprox.</span>
        </div>
        ${rq.estado === 'pendiente' ? `
        <div class="bk-actions">
          <button class="btn-ok" data-acc="${rq.id}">Aceptar</button>
          <button class="btn-ghost btn-danger" data-rej="${rq.id}">Declinar</button>
        </div>` : ''}
      `;
      ul.appendChild(li);
    });
    $$('#reqList [data-acc]').forEach((b) => b.addEventListener('click', () => {
      const rq = requests.find((x) => x.id === b.getAttribute('data-acc'));
      if (rq) { rq.estado = 'confirmada'; persistRequests(); renderRequests(); toast('Reserva aceptada ✅ Avisamos a ' + rq.nombre.split(' ')[0]); }
    }));
    $$('#reqList [data-rej]').forEach((b) => b.addEventListener('click', () => {
      const rq = requests.find((x) => x.id === b.getAttribute('data-rej'));
      if (rq) { rq.estado = 'rechazada'; persistRequests(); renderRequests(); toast('Reserva declinada'); }
    }));
  }

  /* =========================================================
     Toasts
     ========================================================= */
  function toast(msg, type) {
    const wrap = $('#toasts');
    const t = document.createElement('div');
    t.className = 'toast' + (type === 'error' ? ' t-error' : '');
    t.innerHTML = `<span class="t-ico">${type === 'error' ? '!' : '✓'}</span><span>${escapeHtml(msg)}</span>`;
    wrap.appendChild(t);
    setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 300); }, 2800);
  }

  /* =========================================================
     Ajustes
     ========================================================= */
  function applyAccent(name) {
    document.body.dataset.accent = name;
    settings.accent = name;
    $$('#accentRow .accent-dot').forEach((d) => d.classList.toggle('is-active', d.dataset.accent === name));
  }

  function applyVehicle(v) {
    settings.vehicle = v;
    $$('.car-model').forEach((m) => m.classList.toggle('is-active', m.dataset.model === v));
    $$('#vehRow .veh-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.veh === v));
  }

  function syncPriceUI() {
    const p = settings.pricePerKwh;
    $('#setPrice').value = p;
    const range = $('#setPriceRange');
    range.value = clamp(p, +range.min, +range.max);
    const pct = (clamp(p, +range.min, +range.max) - range.min) / (range.max - range.min) * 100;
    range.style.setProperty('--rangePct', pct.toFixed(1) + '%');
    $('#priceChipValue').textContent = fmtCOP(p).replace(/\s?COP$/, '');
    $$('#pricePresets .chip').forEach((c) => c.classList.toggle('is-active', +c.dataset.price === p));
    updateLive();
  }

  function setPrice(p) {
    p = Math.max(0, Math.round(p || 0));
    settings.pricePerKwh = p;
    persistSettings();
    syncPriceUI();
  }

  function renderStationCard() {
    const has = !!(settings.stationName || settings.ownerName);
    const editing = stationEditing || !has;
    $('#stationView').classList.toggle('hidden', editing);
    $('#stationEdit').classList.toggle('hidden', !editing);
    $('#stationEditBtn').classList.toggle('hidden', editing);
    $('#stationNameView').textContent = settings.stationName || 'Mi estación';
    $('#stationOwnerView').textContent = settings.ownerName ? 'de ' + settings.ownerName : '';
  }

  function loadSettingsUI() {
    applyAccent(settings.accent || 'cyan');
    applyVehicle(settings.vehicle || 'pickup');
    syncPriceUI();
    $('#setServiceFee').value = settings.serviceFee || '';
    $('#setEff').value = settings.kmPerKwh || '';
    $('#setStation').value = settings.stationName || '';
    $('#setOwner').value = settings.ownerName || '';
    const sw = $('#setAnim');
    sw.classList.toggle('is-on', !!settings.animations);
    sw.setAttribute('aria-checked', String(!!settings.animations));
    if (settings.serviceFee > 0 && !$('#serviceFee').value) $('#serviceFee').value = settings.serviceFee;
    renderStationCard();
    loadSpotForm();
  }

  /* =========================================================
     PWA
     ========================================================= */
  function registerSW() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      });
    }
  }

  let deferredPrompt = null;
  function setupInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      $('#installBtn').classList.remove('hidden');
    });
    $('#installBtn').addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (e) {}
      deferredPrompt = null;
      $('#installBtn').classList.add('hidden');
    });
    window.addEventListener('appinstalled', () => {
      $('#installBtn').classList.add('hidden');
      toast('¡App instalada! ⚡');
    });
  }

  function setupNet() {
    const pill = $('#netStatus');
    const label = pill.querySelector('.net-label');
    function upd() {
      const on = navigator.onLine;
      pill.classList.toggle('is-off', !on);
      label.textContent = on ? 'En línea' : 'Sin conexión';
    }
    window.addEventListener('online', upd);
    window.addEventListener('offline', upd);
    upd();
  }

  /* =========================================================
     Wiring / init
     ========================================================= */
  function setMode(m) {
    mode = m;
    $$('.seg-btn[data-mode]').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === m));
    $('#meterFields').classList.toggle('hidden', m !== 'meter');
    $('#directFields').classList.toggle('hidden', m !== 'direct');
    updateLive();
  }

  function doCalc() {
    const err = $('#calcError');
    const inp = readInputs();
    const msg = validate(inp);
    if (msg) {
      err.textContent = msg;
      err.classList.remove('hidden');
      if (navigator.vibrate) { try { navigator.vibrate([20, 40, 20]); } catch (e) {} }
      return;
    }
    err.classList.add('hidden');
    const calc = computeCharge();
    calc.dateISO = new Date().toISOString(); // hora tomada al presionar "Calcular cobro"
    saveSession(calc);                       // guardado automático
    openOverlay();
    playSequence(calc);
  }

  function resetForm() {
    ['#readingStart', '#readingEnd', '#directKwh', '#driverName', '#carModel', '#discount'].forEach((s) => { $(s).value = ''; });
    $('#serviceFee').value = settings.serviceFee > 0 ? settings.serviceFee : '';
    taState.torre = null; taState.piso = null; taState.unit = null;
    renderTA();
    updateLive();
  }

  function init() {
    registerSW();
    setupInstall();
    setupNet();
    buildTAChips();
    renderTA();
    buildDiasChips();
    loadSettingsUI();
    renderHistory();
    setBattery(100); // escena en reposo: vehículo "cargado"

    // Confirmaciones demo que quedaron pendientes de otra sesión
    let dirty = false;
    bookings.forEach((b) => {
      if (b.estado === 'pendiente' && Date.now() - (b.createdAt || 0) > 25000) { b.estado = 'confirmada'; dirty = true; }
      else if (b.estado === 'pendiente') scheduleAutoConfirm(b.id);
    });
    if (dirty) persistBookings();

    // Rol
    if (settings.role === 'driver' || settings.role === 'host') applyRole(settings.role, { keepView: true });
    else {
      $('#roleGate').classList.remove('hidden');
      $('#roleGate').setAttribute('aria-hidden', 'false');
      // mientras tanto, ocultar tabs de conductor
      applyRolePreview();
    }
    $('#roleDriverBtn').addEventListener('click', () => { applyRole('driver'); toast('Modo conductor activado 🚗'); });
    $('#roleHostBtn').addEventListener('click', () => { applyRole('host'); toast('Modo anfitrión activado 🏠'); });
    $$('#roleSwitch .seg-btn').forEach((b) => b.addEventListener('click', () => {
      if (settings.role !== b.dataset.role) { applyRole(b.dataset.role, { keepView: true }); toast(b.dataset.role === 'driver' ? 'Modo conductor 🚗' : 'Modo anfitrión 🏠'); }
    }));

    function applyRolePreview() {
      $$('.nav-btn').forEach((b) => b.classList.toggle('nav-hidden', !TABS.host.includes(b.dataset.view)));
    }

    // Navegación
    $$('.nav-btn').forEach((b) => b.addEventListener('click', () => goView(b.dataset.view)));

    // Modo calculadora
    $$('.seg-btn[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    ['#readingStart', '#readingEnd', '#directKwh', '#serviceFee', '#discount'].forEach((s) => {
      $(s).addEventListener('input', updateLive);
    });
    $$('#view-charge input').forEach((el) => el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doCalc(); }
    }));

    $('#detailsToggle').addEventListener('click', () => {
      const body = $('#detailsBody');
      const open = body.classList.toggle('hidden') === false;
      $('#detailsToggle').setAttribute('aria-expanded', String(open));
    });

    $('#priceChip').addEventListener('click', () => { goView('settings'); setTimeout(() => $('#setPrice').focus(), 350); });
    $('#calcBtn').addEventListener('click', doCalc);

    // Overlay
    $('#skipBtn').addEventListener('click', () => { if (lastCalc) skipToResult(lastCalc); });
    $('.overlay-backdrop').addEventListener('click', () => {
      if ($('#resultPanel').classList.contains('is-visible')) playExit(closeOverlay);
      else if (lastCalc) skipToResult(lastCalc);
    });
    $('#shareBtn').addEventListener('click', () => { if (lastCalc) shareReceipt(lastCalc); });
    $('#newBtn').addEventListener('click', () => {
      playExit(() => { closeOverlay(); resetForm(); goView('charge'); });
    });

    // Historial
    $('#exportBtn').addEventListener('click', exportCSV);
    $('#exportBtn2').addEventListener('click', exportCSV);
    $('#clearHistBtn').addEventListener('click', () => {
      if (!sessions.length) { toast('El historial ya está vacío'); return; }
      if (confirm('¿Borrar todo el historial de cargas? Esta acción no se puede deshacer.')) {
        sessions = []; persistSessions(); renderHistory(); toast('Historial borrado');
      }
    });

    // Gráficas
    $$('#chartGroup .seg-btn').forEach((b) => b.addEventListener('click', () => {
      chartState.group = b.dataset.group;
      $$('#chartGroup .seg-btn').forEach((x) => x.classList.toggle('is-active', x === b));
      renderCharts();
    }));

    // Mapa: filtros
    $$('#fSort .chip').forEach((c) => c.addEventListener('click', () => {
      filters.sort = c.dataset.sort;
      $$('#fSort .chip').forEach((x) => x.classList.toggle('is-active', x === c));
      renderMap();
    }));
    $('#fPrice').addEventListener('input', () => {
      filters.maxPrice = +$('#fPrice').value;
      $('#fPriceVal').textContent = fmtCOP(filters.maxPrice).replace(/\s?COP$/, '');
      const r = $('#fPrice');
      r.style.setProperty('--rangePct', ((r.value - r.min) / (r.max - r.min) * 100).toFixed(1) + '%');
      renderMap();
    });
    $$('#fPow .chip').forEach((c) => c.addEventListener('click', () => {
      filters.minPow = +c.dataset.pow;
      $$('#fPow .chip').forEach((x) => x.classList.toggle('is-active', x === c));
      renderMap();
    }));
    $$('#fPort .chip').forEach((c) => c.addEventListener('click', () => {
      filters.port = c.dataset.port;
      $$('#fPort .chip').forEach((x) => x.classList.toggle('is-active', x === c));
      renderMap();
    }));
    $('#fNow').addEventListener('click', () => {
      filters.now = !filters.now;
      $('#fNow').classList.toggle('is-on', filters.now);
      $('#fNow').setAttribute('aria-checked', String(filters.now));
      renderMap();
    });
    $('#fReset').addEventListener('click', () => {
      filters.sort = 'dist'; filters.maxPrice = 2000; filters.minPow = 0; filters.port = 'all'; filters.now = false;
      $('#fPrice').value = 2000;
      $('#fPriceVal').textContent = '$2.000';
      $('#fPrice').style.setProperty('--rangePct', '100%');
      $$('#fSort .chip').forEach((x) => x.classList.toggle('is-active', x.dataset.sort === 'dist'));
      $$('#fPow .chip').forEach((x) => x.classList.toggle('is-active', x.dataset.pow === '0'));
      $$('#fPort .chip').forEach((x) => x.classList.toggle('is-active', x.dataset.port === 'all'));
      $('#fNow').classList.remove('is-on');
      renderMap();
      toast('Filtros restablecidos');
    });

    // Hoja de reserva
    $('#sheetBackdrop').addEventListener('click', closeSheet);

    // Mi puesto
    $('#spotSaveBtn').addEventListener('click', saveSpot);
    $('#spotEditBtn').addEventListener('click', () => { spotEditing = true; renderSpotCard(); loadSpotForm(); setTimeout(() => $('#spName').focus(), 100); });
    $('#spVisible').addEventListener('click', () => {
      const sw = $('#spVisible');
      sw.classList.toggle('is-on');
      sw.setAttribute('aria-checked', String(sw.classList.contains('is-on')));
    });

    // Ajustes: precio
    $('#setPrice').addEventListener('input', () => setPrice(parseNum($('#setPrice').value)));
    // isTrusted: ignora eventos sintéticos de herramientas/extensiones que
    // pueden "sondear" el slider a sus extremos y alterar el precio guardado
    $('#setPriceRange').addEventListener('input', (e) => { if (!e.isTrusted) return; setPrice(+$('#setPriceRange').value); });
    $$('#pricePresets .chip').forEach((c) => c.addEventListener('click', () => setPrice(+c.dataset.price)));

    // Ajustes: estación
    $('#setStation').addEventListener('input', () => { settings.stationName = $('#setStation').value.trim(); persistSettings(); });
    $('#setOwner').addEventListener('input', () => { settings.ownerName = $('#setOwner').value.trim(); persistSettings(); });
    $('#stationDoneBtn').addEventListener('click', () => {
      stationEditing = false;
      renderStationCard();
      if (settings.stationName || settings.ownerName) toast('Estación guardada ⚡');
    });
    $('#stationEditBtn').addEventListener('click', () => {
      stationEditing = true;
      renderStationCard();
      setTimeout(() => $('#setStation').focus(), 100);
    });

    // Ajustes: otros
    $('#setServiceFee').addEventListener('input', () => { settings.serviceFee = Math.max(0, parseNum($('#setServiceFee').value)); persistSettings(); });
    $('#setEff').addEventListener('input', () => { settings.kmPerKwh = Math.max(0, parseNum($('#setEff').value)) || DEFAULTS.kmPerKwh; persistSettings(); });
    $$('#accentRow .accent-dot').forEach((d) => d.addEventListener('click', () => { applyAccent(d.dataset.accent); persistSettings(); }));
    $$('#vehRow .veh-btn').forEach((b) => b.addEventListener('click', () => { applyVehicle(b.dataset.veh); persistSettings(); toast('Vehículo actualizado 🚙'); }));
    $('#setAnim').addEventListener('click', () => {
      settings.animations = !settings.animations;
      const sw = $('#setAnim');
      sw.classList.toggle('is-on', settings.animations);
      sw.setAttribute('aria-checked', String(settings.animations));
      persistSettings();
    });

    // Reset
    $('#resetBtn').addEventListener('click', () => {
      if (confirm('¿Restablecer TODO? Se borrarán ajustes, historial y reservas.')) {
        [LS_SETTINGS, LS_SESSIONS, LS_BOOKINGS, LS_REQUESTS].forEach((k) => localStorage.removeItem(k));
        settings = Object.assign({}, DEFAULTS);
        sessions = []; bookings = []; requests = null;
        stationEditing = false; spotEditing = false;
        loadSettingsUI(); renderHistory(); resetForm();
        $('#roleGate').classList.remove('hidden');
        toast('Todo restablecido');
      }
    });

    // Atajos PWA
    const action = new URLSearchParams(location.search).get('action');
    if (action === 'history') goView('history');
    else if (action === 'charts') goView('charts');
    else if (action === 'new') goView('charge');

    updateLive();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
