/* =========================================================
   VOLTIO — Red de Carga Compartida · v2.0
   Frontend: mapa real, reservas, chat y calificaciones en
   tiempo real (Firebase vía backend.js) + calculadora local.
   ========================================================= */
(function () {
  'use strict';

  /* ---------- Constantes ---------- */
  const LS_SETTINGS = 'voltio.settings.v1';
  const LS_SESSIONS = 'voltio.sessions.v1';
  const LS_CHATSEEN = 'voltio.chatseen.v1';
  const CO2_GAS_PER_L = 2.31;
  const GAS_KM_PER_L = 12;
  const GAS_PRICE_PER_L = 4300;
  const DIAS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  const BOGOTA = { lat: 4.6533, lng: -74.0836 };
  const DEFAULTS = {
    pricePerKwh: 800, serviceFee: 0, stationName: '', ownerName: '',
    kmPerKwh: 6, accent: 'cyan', animations: true, role: null, vehicle: 'pickup'
  };

  /* ---------- Helpers ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const SVGNS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => { const el = document.createElementNS(SVGNS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); return el; };

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
  const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const uid8 = (p) => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const tsDate = (ts) => (ts && ts.seconds ? new Date(ts.seconds * 1000) : new Date());
  const haversine = (a, b) => {
    const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  };
  const starTxt = (avg) => '★'.repeat(Math.round(avg)) + '☆'.repeat(5 - Math.round(avg));

  function loadJSON(key, fb) { try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fb : v; } catch (e) { return fb; } }

  /* ---------- Estado ---------- */
  let settings = Object.assign({}, DEFAULTS, loadJSON(LS_SETTINGS, {}));
  let sessions = loadJSON(LS_SESSIONS, []);
  let mode = 'meter';
  let lastCalc = null;
  let stationEditing = false;
  let spotEditing = false;
  let currentView = 'charge';
  const taState = { torre: null, piso: null, unit: null };
  const chartState = { group: 'day' };
  const filters = { sort: 'dist', maxPrice: 2000, minPow: 0, port: 'all', now: false };
  const spDias = [0, 1, 1, 1, 1, 1, 0];

  // Backend
  let VB = null;
  let user = null;
  let backendOff = false;
  let stations = [];
  let myBookings = [];
  let myRequests = [];
  let myChats = [];
  let myStationDoc = null;
  let sheetStation = null;
  let chatCtx = null;      // { chatId, title, sub, demo }
  let rateCtx = null;      // { bookingId, stationId, toName, tipo }
  let rateStars = 0;
  let spFotos = [];
  let spLoc = { lat: BOGOTA.lat, lng: BOGOTA.lng };
  let userLoc = null;
  let liveMap = null, pickMap = null, pickMarker = null, markersLayer = null, meMarker = null;
  const unsubs = {};

  const persistSettings = () => localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
  const persistSessions = () => localStorage.setItem(LS_SESSIONS, JSON.stringify(sessions));

  function whenVB(cb) {
    if (window.VB) { cb(window.VB); return; }
    window.addEventListener('vb-ready', () => cb(window.VB), { once: true });
    setTimeout(() => { if (!window.VB && !backendOff) { backendOff = true; showBackendNotice('Sin conexión con la nube de Voltio. Revisa tu internet.'); } }, 9000);
  }

  function showBackendNotice(msg) {
    ['#mapNotice', '#reqNotice'].forEach((s) => {
      const el = $(s);
      if (el) { el.textContent = '⚠️ ' + msg; el.classList.remove('hidden'); }
    });
  }

  const needLogin = () => { openLoginSheet(); toast('Inicia sesión para continuar', 'error'); };

  /* =========================================================
     Roles y navegación
     ========================================================= */
  const TABS = {
    driver: ['map', 'bookings', 'chats', 'charge', 'settings'],
    host: ['charge', 'requests', 'chats', 'insights', 'settings']
  };

  function applyRole(role, opts) {
    settings.role = role;
    persistSettings();
    const list = TABS[role] || TABS.host;
    $$('.nav-btn').forEach((b) => b.classList.toggle('nav-hidden', !list.includes(b.dataset.view)));
    $('#roleTag').textContent = role === 'driver' ? 'Encuentra tu carga' : 'Red de carga';
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
    if (name === 'insights') { renderHistory(); renderCharts(); }
    if (name === 'map') setTimeout(initLiveMap, 60);
    if (name === 'bookings') renderBookings();
    if (name === 'chats') { localStorage.setItem(LS_CHATSEEN, String(Date.now())); renderChatList(); updateDots(); }
    if (name === 'requests') renderHostArea();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* =========================================================
     Autenticación (UI)
     ========================================================= */
  let lgMode = 'login';

  function openLoginSheet() { openSheetEl('#loginSheet'); setTimeout(() => $('#lgEmail').focus(), 250); }

  function renderAuthUI() {
    const logged = !!user;
    $('#accSignedOut').classList.toggle('hidden', logged);
    $('#accSignedIn').classList.toggle('hidden', !logged);
    const top = $('#topAvatar');
    if (logged) {
      const name = VB.userName() || 'U';
      const photo = user.photoURL;
      top.innerHTML = photo ? `<img src="${escapeHtml(photo)}" alt=""/>` : escapeHtml(name[0].toUpperCase());
      $('#accAvatar').innerHTML = photo ? `<img src="${escapeHtml(photo)}" alt=""/>` : escapeHtml(name[0].toUpperCase());
      $('#accName').textContent = name;
      $('#accEmail').textContent = user.email || '';
      const badges = [];
      if (VB.isGoogle()) badges.push('<span class="sc-badge b-ver">✓ Google</span>');
      if (user.emailVerified) badges.push('<span class="sc-badge b-ok">✓ Correo verificado</span>');
      else if (user.email) badges.push('<span class="sc-badge b-off">Correo sin verificar</span>');
      badges.push('<span class="sc-badge b-id">🪪 Identidad: próximamente</span>');
      $('#accBadges').innerHTML = badges.join('');
    } else {
      top.textContent = '👤';
    }
  }

  function startWatchers() {
    stopWatchers(['bookings', 'requests', 'chats']);
    if (!VB || !user) { myBookings = []; myRequests = []; myChats = []; renderBookings(); renderChatList(); renderHostArea(); updateDots(); return; }
    unsubs.bookings = VB.watchMyBookings((list) => { myBookings = list; if (currentView === 'bookings') renderBookings(); updateDots(); });
    unsubs.requests = VB.watchRequests((list) => { myRequests = list; if (currentView === 'requests') renderRequests(); updateDots(); });
    unsubs.chats = VB.watchChats((list) => { myChats = list; if (currentView === 'chats') renderChatList(); updateDots(); });
    VB.myStation().then((st) => { myStationDoc = st; if (currentView === 'requests') renderHostArea(); }).catch(() => {});
  }

  function stopWatchers(keys) {
    keys.forEach((k) => { if (unsubs[k]) { try { unsubs[k](); } catch (e) {} delete unsubs[k]; } });
  }

  function updateDots() {
    const pend = myRequests.filter((r) => r.estado === 'pendiente').length;
    $('#dotRequests').classList.toggle('hidden', !pend);
    const seen = +(localStorage.getItem(LS_CHATSEEN) || 0);
    const uidv = VB && VB.uid();
    const unread = myChats.some((c) => c.lastFrom && c.lastFrom !== uidv && tsDate(c.lastAt).getTime() > seen);
    $('#dotChats').classList.toggle('hidden', !unread);
    const news = myBookings.some((b) => b.estado === 'confirmada' && !b.seenConf);
    $('#dotBookings').classList.toggle('hidden', !news);
  }

  /* =========================================================
     Mapa real (Leaflet)
     ========================================================= */
  function initLiveMap() {
    if (!window.L || liveMap || !$('#liveMap')) { if (liveMap) { liveMap.invalidateSize(); applyFilters(); } return; }
    liveMap = L.map('liveMap', { zoomControl: true, attributionControl: true }).setView([BOGOTA.lat, BOGOTA.lng], 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(liveMap);
    markersLayer = L.layerGroup().addTo(liveMap);
    applyFilters();
    setTimeout(() => liveMap.invalidateSize(), 200);
  }

  function locateMe(silent) {
    if (!navigator.geolocation) { if (!silent) toast('Tu navegador no permite geolocalización', 'error'); return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      $('#locState').textContent = 'tu ubicación real';
      if (liveMap) {
        if (meMarker) meMarker.remove();
        meMarker = L.marker([userLoc.lat, userLoc.lng], {
          icon: L.divIcon({ className: 'v-me', html: '<i></i>', iconSize: [18, 18], iconAnchor: [9, 9] }),
          zIndexOffset: 900
        }).addTo(liveMap);
        liveMap.setView([userLoc.lat, userLoc.lng], 13);
      }
      applyFilters();
      if (!silent) toast('Ubicación actualizada 📍');
    }, () => { if (!silent) toast('No pudimos obtener tu ubicación. Revisa los permisos.', 'error'); }, { enableHighAccuracy: true, timeout: 9000 });
  }

  function isOpenNow(sp) {
    const now = new Date();
    const dias = sp.dias || [1, 1, 1, 1, 1, 1, 1];
    if (!dias[now.getDay()]) return false;
    const cur = now.getHours() * 60 + now.getMinutes();
    const [h1, m1] = String(sp.desde || '00:00').split(':').map(Number);
    const [h2, m2] = String(sp.hasta || '23:59').split(':').map(Number);
    return cur >= h1 * 60 + m1 && cur <= h2 * 60 + m2;
  }

  const distTo = (sp) => haversine(userLoc || BOGOTA, { lat: sp.lat || BOGOTA.lat, lng: sp.lng || BOGOTA.lng });
  const ratingAvg = (sp) => (sp.ratingCount ? sp.ratingSum / sp.ratingCount : 0);

  function filteredStations() {
    let list = stations.filter((sp) =>
      (sp.precio || 0) <= filters.maxPrice &&
      (sp.pow || 0) >= filters.minPow &&
      (filters.port === 'all' || sp.puerto === filters.port) &&
      (!filters.now || isOpenNow(sp))
    );
    if (filters.sort === 'dist') list.sort((a, b) => distTo(a) - distTo(b));
    if (filters.sort === 'price') list.sort((a, b) => (a.precio || 0) - (b.precio || 0));
    if (filters.sort === 'pow') list.sort((a, b) => (b.pow || 0) - (a.pow || 0));
    if (filters.sort === 'rating') list.sort((a, b) => ratingAvg(b) - ratingAvg(a));
    return list;
  }

  function applyFilters() {
    const list = filteredStations();
    $('#mapCount').textContent = list.length + (list.length === 1 ? ' puesto' : ' puestos');
    if (markersLayer) {
      markersLayer.clearLayers();
      list.forEach((sp) => {
        if (sp.lat == null || sp.lng == null) return;
        const open = isOpenNow(sp);
        const icon = L.divIcon({
          className: '',
          html: `<div class="v-pin ${open ? '' : 'vp-off'}"><div class="vp-dot"><span>⚡</span></div><div class="vp-price">${fmtCompact(sp.precio || 0, 'cop')}</div></div>`,
          iconSize: [34, 48], iconAnchor: [17, 34]
        });
        L.marker([sp.lat, sp.lng], { icon })
          .addTo(markersLayer)
          .on('click', () => openSpotSheet(sp));
      });
    }
    renderSpotList(list);
  }

  function renderSpotList(list) {
    const ul = $('#mapList');
    ul.innerHTML = '';
    $('#mapEmpty').classList.toggle('hidden', list.length > 0 || backendOff);
    list.forEach((sp) => {
      const open = isOpenNow(sp);
      const avg = ratingAvg(sp);
      const mine = user && sp.ownerUid === user.uid;
      const li = document.createElement('li');
      li.className = 'spot-card';
      li.innerHTML = `
        <div class="sc-top">
          <div>
            <div class="sc-name">${escapeHtml(sp.nombre)}</div>
            <div class="sc-badges">
              <span class="sc-badge ${open ? 'b-ok' : 'b-off'}">${open ? '● Disponible ahora' : '○ Cerrado ahora'}</span>
              ${sp.ownerVerified || sp.demo ? '<span class="sc-badge b-ver">✓ Verificado</span>' : ''}
              ${mine ? '<span class="sc-badge b-mine">★ Tu puesto</span>' : ''}
              ${sp.demo ? '<span class="sc-badge">Ejemplo</span>' : ''}
            </div>
          </div>
          <div class="sc-price"><b>${fmtCOP(sp.precio || 0)}</b><small>/ kWh</small></div>
        </div>
        <div class="sc-meta">
          <span>📍 ${distTo(sp).toLocaleString('es-CO', { maximumFractionDigits: 1 })} km</span>
          <span>⚡ ${(sp.pow || 0).toLocaleString('es-CO')} kW</span>
          <span>🔌 ${escapeHtml(sp.puerto || '—')}</span>
          <span class="sc-rating">★ ${avg ? avg.toLocaleString('es-CO', { maximumFractionDigits: 1 }) : '—'} <small>(${sp.ratingCount || 0})</small></span>
        </div>`;
      li.addEventListener('click', () => openSpotSheet(sp));
      ul.appendChild(li);
    });
  }

  /* =========================================================
     Hoja del puesto (detalle + reserva + chat)
     ========================================================= */
  function openSheetEl(sel) {
    $(sel).classList.add('is-open');
    $(sel).setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeSheetEl(sel) {
    $(sel).classList.remove('is-open');
    $(sel).setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function openSpotSheet(sp) {
    sheetStation = sp;
    const open = isOpenNow(sp);
    const avg = ratingAvg(sp);
    const dias = sp.dias || [1, 1, 1, 1, 1, 1, 1];
    const diasTxt = dias.every(Boolean) ? 'Todos los días' : dias.map((v, i) => v ? DIAS[i] : null).filter(Boolean).join(' · ');
    const fotos = (sp.fotos || []).filter(Boolean);
    const mine = user && sp.ownerUid === user.uid;
    const c = $('#sheetContent');
    c.innerHTML = `
      <div class="sh-head">
        <div>
          <div class="sh-name">${escapeHtml(sp.nombre)}</div>
          <div class="sh-host">de ${escapeHtml(sp.ownerName || 'Anfitrión')} · ${escapeHtml(sp.dir || '')}</div>
          <div class="sc-badges" style="margin-top:8px">
            <span class="sc-badge ${open ? 'b-ok' : 'b-off'}">${open ? '● Disponible ahora' : '○ Cerrado ahora'}</span>
            ${sp.ownerVerified || sp.demo ? '<span class="sc-badge b-ver">✓ Anfitrión verificado</span>' : ''}
            <span class="sc-badge"><span class="sc-stars">${starTxt(avg)}</span> ${avg ? avg.toLocaleString('es-CO', { maximumFractionDigits: 1 }) : 'Nuevo'} <small>(${sp.ratingCount || 0})</small></span>
          </div>
        </div>
        <div class="sc-price"><b>${fmtCOP(sp.precio || 0)}</b><small>/ kWh</small></div>
      </div>

      <div class="sh-fotos">${
        fotos.length
          ? fotos.map((f) => `<img src="${f}" alt="Foto del parqueadero"/>`).join('')
          : '<div class="sh-foto-ph">📷 El anfitrión aún no sube fotos</div>'
      }</div>

      <div class="sh-specs">
        <div class="sh-spec"><b>${distTo(sp).toLocaleString('es-CO', { maximumFractionDigits: 1 })} km</b><small>distancia</small></div>
        <div class="sh-spec"><b>${(sp.pow || 0).toLocaleString('es-CO')} kW</b><small>potencia</small></div>
        <div class="sh-spec"><b>${escapeHtml(sp.puerto || '—')}</b><small>puerto</small></div>
        <div class="sh-spec"><b>~${Math.round((sp.pow || 0) * settings.kmPerKwh)} km/h</b><small>recarga</small></div>
      </div>
      <div class="sh-avail">🗓️ ${diasTxt} · ${escapeHtml(sp.desde || '00:00')} – ${escapeHtml(sp.hasta || '23:59')}</div>
      ${sp.condiciones ? `<div class="bk-pay" style="margin:0 0 14px">📋 <b>Condiciones:</b> ${escapeHtml(sp.condiciones)}</div>` : ''}

      <div id="shRatings"></div>

      ${mine ? '<p class="hint" style="text-align:center">Así ven tu puesto los conductores 👀</p>' : `
      <div class="grid-2">
        <div class="field"><label>Fecha</label><div class="input-wrap"><input id="bkFecha" type="date" min="${todayISO()}" value="${todayISO()}"/></div></div>
        <div class="field"><label>Hora de llegada</label><div class="input-wrap"><input id="bkHora" type="time" value="${escapeHtml(sp.desde || '08:00')}"/></div></div>
      </div>
      <div class="field" style="margin-top:10px"><label>Energía estimada</label><div class="input-wrap"><input id="bkKwh" inputmode="decimal" value="20" autocomplete="off"/><span class="unit">kWh</span></div></div>
      <div class="sh-est"><span>Costo estimado</span><b id="bkEst">${fmtCOP(20 * (sp.precio || 0))}</b></div>
      <button id="bkSend" class="btn-primary" type="button" style="margin-top:14px"><span class="btn-glow"></span>Solicitar reserva</button>
      <button id="bkChat" class="btn-ghost btn-block" type="button" style="margin-top:10px">💬 Pregúntale al anfitrión</button>
      <p class="hint" style="text-align:center;margin-top:8px">${sp.demo ? 'Puesto de ejemplo: la reserva es de prueba.' : 'El anfitrión puede aceptar o declinar tu solicitud.'}</p>`}
    `;
    openSheetEl('#spotSheet');

    if (!mine) {
      $('#bkKwh').addEventListener('input', () => {
        $('#bkEst').textContent = fmtCOP(Math.max(0, parseNum($('#bkKwh').value)) * (sp.precio || 0));
      });
      $('#bkSend').addEventListener('click', () => submitBooking(sp));
      $('#bkChat').addEventListener('click', () => startChatWith(sp));
    }

    if (VB) {
      VB.stationRatings(sp.id).then((list) => {
        if (!list.length || sheetStation !== sp) return;
        $('#shRatings').innerHTML = '<div class="f-label" style="margin-bottom:4px">Opiniones recientes</div>' +
          list.map((r) => `<div class="rv-item"><b>${escapeHtml(r.fromName || 'Usuario')}</b> <span class="rv-stars">${starTxt(r.stars)}</span>${r.comment ? '<br/>' + escapeHtml(r.comment) : ''}</div>`).join('');
      });
    }
  }

  async function submitBooking(sp) {
    if (!user) { needLogin(); return; }
    const fecha = $('#bkFecha').value || todayISO();
    const hora = $('#bkHora').value || sp.desde || '08:00';
    const kwhEst = Math.max(1, parseNum($('#bkKwh').value) || 20);
    const dias = sp.dias || [1, 1, 1, 1, 1, 1, 1];
    const dow = new Date(fecha + 'T12:00:00').getDay();
    if (!dias[dow]) { toast('Ese día el puesto no está disponible', 'error'); return; }
    if (hora < (sp.desde || '00:00') || hora > (sp.hasta || '23:59')) { toast('Elige una hora entre ' + sp.desde + ' y ' + sp.hasta, 'error'); return; }
    try {
      $('#bkSend').disabled = true;
      await VB.createBooking({
        stationId: sp.id, stationName: sp.nombre, ownerUid: sp.ownerUid, ownerName: sp.ownerName || 'Anfitrión',
        dir: sp.dir || '', breb: sp.breb || '', titular: sp.titular || '', precio: sp.precio || 0,
        fecha, hora, kwhEst, total: kwhEst * (sp.precio || 0), demo: !!sp.demo
      });
      closeSheetEl('#spotSheet');
      goView('bookings');
      toast('Solicitud enviada al anfitrión 📨');
    } catch (e) {
      $('#bkSend').disabled = false;
      toast(e.message === 'login' ? 'Inicia sesión para reservar' : 'No se pudo crear la reserva', 'error');
      if (e.message === 'login') openLoginSheet();
    }
  }

  /* =========================================================
     Reservas (conductor)
     ========================================================= */
  const PILL = {
    pendiente: ['p-pend', 'Pendiente'], confirmada: ['p-ok', 'Confirmada'],
    rechazada: ['p-no', 'Rechazada'], cancelada: ['p-dim', 'Cancelada'], completada: ['p-dim', 'Completada']
  };

  function renderBookings() {
    const logged = !!user;
    $('#bookAuth').classList.toggle('hidden', logged);
    const ul = $('#bookList');
    ul.innerHTML = '';
    $('#bookEmpty').classList.toggle('hidden', !logged || myBookings.length > 0);
    if (!logged) return;

    myBookings.forEach((bk) => {
      const [cls, lab] = PILL[bk.estado] || ['p-dim', bk.estado];
      const li = document.createElement('li');
      li.className = 'book-card';
      const fechaTxt = new Date(bk.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short' });
      li.innerHTML = `
        <div class="bk-top">
          <div><div class="bk-name">${escapeHtml(bk.stationName)}</div><div class="bk-sub">de ${escapeHtml(bk.ownerName || '')} · ${escapeHtml(bk.dir || '')}</div></div>
          <span class="bk-pill ${cls}">${lab}</span>
        </div>
        <div class="bk-meta">
          <span>🗓️ ${fechaTxt} · ${escapeHtml(bk.hora)}</span>
          <span>⚡ ~${fmtKwh(bk.kwhEst)} kWh</span>
          <span>💰 ${fmtCOP(bk.total)} aprox.</span>
        </div>
        ${bk.estado === 'confirmada' && bk.breb ? `
        <div class="bk-pay">Al terminar tu carga, transfiere por <b>Bre-B</b> a la llave
          <span class="bk-key">${escapeHtml(bk.breb)}</span> · Titular: <b>${escapeHtml(bk.titular || bk.ownerName)}</b>
          <div class="bk-actions"><button class="btn-ghost btn-sm" data-copy="${escapeHtml(bk.breb)}">Copiar llave</button></div>
        </div>` : ''}
        <div class="bk-actions">
          ${bk.estado === 'pendiente' ? `<button class="btn-ghost btn-sm btn-danger" data-cancel="${bk.id}">Cancelar</button>` : ''}
          ${(bk.estado === 'confirmada' || bk.estado === 'completada') && !bk.ratedByDriver ? `<button class="btn-ok" data-rate="${bk.id}">⭐ Calificar</button>` : ''}
          ${bk.ratedByDriver ? '<span class="sc-badge b-ok">✓ Calificado</span>' : ''}
        </div>`;
      ul.appendChild(li);
    });

    $$('#bookList [data-cancel]').forEach((b) => b.addEventListener('click', () => {
      VB.updateBooking(b.getAttribute('data-cancel'), { estado: 'cancelada' }).then(() => toast('Solicitud cancelada')).catch(() => toast('Error al cancelar', 'error'));
    }));
    $$('#bookList [data-copy]').forEach((b) => b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(b.getAttribute('data-copy')); toast('Llave Bre-B copiada 📋'); } catch (e) { toast('No se pudo copiar', 'error'); }
    }));
    $$('#bookList [data-rate]').forEach((b) => b.addEventListener('click', () => {
      const bk = myBookings.find((x) => x.id === b.getAttribute('data-rate'));
      if (bk) openRateSheet({ bookingId: bk.id, stationId: bk.stationId, toName: bk.ownerName || 'el anfitrión', tipo: 'driver-host' });
    }));
  }

  /* =========================================================
     Anfitrión: mi puesto + solicitudes
     ========================================================= */
  function renderHostArea() { renderSpotCard(); renderRequests(); }

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

  function renderFotoThumbs() {
    const wrap = $('#spFotoThumbs');
    $$('.foto-thumb', wrap).forEach((t) => t.remove());
    const addBtn = $('.foto-add', wrap);
    spFotos.forEach((f, i) => {
      const d = document.createElement('div');
      d.className = 'foto-thumb';
      d.innerHTML = `<img src="${f}" alt=""/><button class="foto-del" type="button" data-i="${i}">✕</button>`;
      d.querySelector('.foto-del').addEventListener('click', () => { spFotos.splice(i, 1); renderFotoThumbs(); });
      wrap.insertBefore(d, addBtn);
    });
    addBtn.style.display = spFotos.length >= 3 ? 'none' : '';
  }

  function compressImage(file) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 900 / img.width);
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale);
        cv.height = Math.round(img.height * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        let q = 0.72, url = cv.toDataURL('image/jpeg', q);
        while (url.length > 260000 && q > 0.3) { q -= 0.12; url = cv.toDataURL('image/jpeg', q); }
        URL.revokeObjectURL(img.src);
        res(url.length > 300000 ? null : url);
      };
      img.onerror = () => res(null);
      img.src = URL.createObjectURL(file);
    });
  }

  function initPickMap() {
    if (!window.L || !$('#pickMap')) return;
    if (pickMap) { pickMap.invalidateSize(); return; }
    pickMap = L.map('pickMap', { zoomControl: true, attributionControl: false }).setView([spLoc.lat, spLoc.lng], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(pickMap);
    pickMarker = L.marker([spLoc.lat, spLoc.lng], {
      draggable: true,
      icon: L.divIcon({ className: '', html: '<div class="v-pin"><div class="vp-dot"><span>⚡</span></div></div>', iconSize: [34, 34], iconAnchor: [17, 30] })
    }).addTo(pickMap);
    const sync = () => {
      const p = pickMarker.getLatLng();
      spLoc = { lat: +p.lat.toFixed(5), lng: +p.lng.toFixed(5) };
      $('#spLatLng').textContent = spLoc.lat + ', ' + spLoc.lng;
    };
    pickMarker.on('dragend', sync);
    pickMap.on('click', (e) => { pickMarker.setLatLng(e.latlng); sync(); });
    sync();
    setTimeout(() => pickMap.invalidateSize(), 200);
  }

  function loadSpotForm(sp) {
    if (sp) {
      $('#spName').value = sp.nombre || '';
      $('#spDir').value = sp.dir || '';
      $('#spPrecio').value = sp.precio || '';
      $('#spPow').value = String(sp.pow || 7.4);
      $('#spPort').value = sp.puerto || 'Tipo 2';
      $('#spDesde').value = sp.desde || '07:00';
      $('#spHasta').value = sp.hasta || '21:00';
      $('#spBreb').value = sp.breb || '';
      $('#spTitular').value = sp.titular || '';
      $('#spCond').value = sp.condiciones || '';
      (sp.dias || []).forEach((v, i) => { spDias[i] = v ? 1 : 0; });
      $$('#spDias .chip').forEach((c, i) => c.classList.toggle('is-active', !!spDias[i]));
      spFotos = (sp.fotos || []).slice(0, 3);
      if (sp.lat != null) spLoc = { lat: sp.lat, lng: sp.lng };
      const sw = $('#spVisible');
      sw.classList.toggle('is-on', sp.visible !== false);
      sw.setAttribute('aria-checked', String(sp.visible !== false));
    }
    renderFotoThumbs();
    setTimeout(() => {
      initPickMap();
      if (pickMap && pickMarker) { pickMarker.setLatLng([spLoc.lat, spLoc.lng]); pickMap.setView([spLoc.lat, spLoc.lng], 13); $('#spLatLng').textContent = spLoc.lat + ', ' + spLoc.lng; }
    }, 100);
  }

  async function saveSpot() {
    if (!user) { needLogin(); return; }
    const nombre = $('#spName').value.trim();
    if (!nombre) { toast('Ponle un nombre a tu puesto', 'error'); return; }
    const data = {
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
      condiciones: $('#spCond').value.trim(),
      fotos: spFotos.slice(0, 3),
      lat: spLoc.lat, lng: spLoc.lng,
      visible: $('#spVisible').classList.contains('is-on')
    };
    try {
      $('#spotSaveBtn').disabled = true;
      $('#spotSaveBtn').textContent = 'Publicando…';
      const id = await VB.publishStation(data, myStationDoc && myStationDoc.id);
      myStationDoc = Object.assign({ id }, myStationDoc || {}, data);
      spotEditing = false;
      renderSpotCard();
      toast('¡Tu puesto quedó publicado en el mapa! ⚡');
    } catch (e) {
      toast(e.message === 'login' ? 'Inicia sesión para publicar' : 'No se pudo publicar: ' + e.message, 'error');
    } finally {
      $('#spotSaveBtn').disabled = false;
      $('#spotSaveBtn').textContent = 'Publicar mi puesto';
    }
  }

  function renderSpotCard() {
    const logged = !!user;
    $('#spotAuth').classList.toggle('hidden', logged);
    const sp = myStationDoc;
    const editing = logged && (spotEditing || !sp);
    $('#spotForm').classList.toggle('hidden', !editing);
    $('#spotSummary').classList.toggle('hidden', !logged || editing || !sp);
    $('#spotEditBtn').classList.toggle('hidden', !logged || editing || !sp);
    if (editing) loadSpotForm(sp);
    if (sp && logged && !editing) {
      const avg = ratingAvg(sp);
      $('#spotSummary').innerHTML = `
        <div class="spot-summary-box">
          <div class="ssb-row">
            ${sp.fotos && sp.fotos[0] ? `<div class="foto-thumb" style="width:52px;height:52px"><img src="${sp.fotos[0]}" alt=""/></div>`
              : '<div class="station-tile"><svg viewBox="0 0 100 100" width="24" height="24"><path d="M57 14 L28 56 H46 L41 86 L73 42 H53 Z" fill="currentColor"/></svg></div>'}
            <div>
              <div class="station-name">${escapeHtml(sp.nombre)}</div>
              <div class="station-owner">${escapeHtml(sp.dir || 'Sin dirección')} · ${fmtCOP(sp.precio)}/kWh</div>
            </div>
          </div>
          <div class="ssb-meta">
            <span class="sc-badge">⚡ ${(sp.pow || 0).toLocaleString('es-CO')} kW</span>
            <span class="sc-badge">🔌 ${escapeHtml(sp.puerto)}</span>
            <span class="sc-badge">🗓️ ${escapeHtml(sp.desde)}–${escapeHtml(sp.hasta)}</span>
            <span class="sc-badge ${sp.visible !== false ? 'b-ok' : 'b-off'}">${sp.visible !== false ? '● Visible en el mapa' : '○ Oculto'}</span>
            <span class="sc-badge"><span class="sc-stars">★</span> ${avg ? avg.toLocaleString('es-CO', { maximumFractionDigits: 1 }) : 'Nuevo'} (${sp.ratingCount || 0})</span>
          </div>
        </div>`;
    }
  }

  function renderRequests() {
    const ul = $('#reqList');
    ul.innerHTML = '';
    $('#reqEmpty').classList.toggle('hidden', myRequests.length > 0);
    myRequests.forEach((rq) => {
      const [cls, lab] = PILL[rq.estado] || ['p-dim', rq.estado];
      const li = document.createElement('li');
      li.className = 'book-card';
      const fechaTxt = new Date(rq.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short' });
      li.innerHTML = `
        <div class="bk-top">
          <div><div class="bk-name">${escapeHtml(rq.driverName || 'Conductor')}</div><div class="bk-sub">${escapeHtml(rq.stationName || '')}</div></div>
          <span class="bk-pill ${cls}">${lab}</span>
        </div>
        <div class="bk-meta">
          <span>🗓️ ${fechaTxt} · ${escapeHtml(rq.hora)}</span>
          <span>⚡ ~${fmtKwh(rq.kwhEst)} kWh</span>
          <span>💰 ${fmtCOP(rq.total)} aprox.</span>
        </div>
        <div class="bk-actions">
          ${rq.estado === 'pendiente' ? `<button class="btn-ok" data-acc="${rq.id}">Aceptar</button><button class="btn-ghost btn-danger" data-rej="${rq.id}">Declinar</button>` : ''}
          ${rq.estado === 'confirmada' ? `<button class="btn-ghost btn-sm" data-done="${rq.id}">Marcar completada</button>` : ''}
          ${(rq.estado === 'confirmada' || rq.estado === 'completada') && !rq.ratedByOwner ? `<button class="btn-ghost btn-sm" data-rated="${rq.id}">⭐ Calificar conductor</button>` : ''}
          ${rq.ratedByOwner ? '<span class="sc-badge b-ok">✓ Calificado</span>' : ''}
        </div>`;
      ul.appendChild(li);
    });
    $$('#reqList [data-acc]').forEach((b) => b.addEventListener('click', () => {
      VB.updateBooking(b.getAttribute('data-acc'), { estado: 'confirmada' }).then(() => toast('Reserva aceptada ✅')).catch(() => toast('Error', 'error'));
    }));
    $$('#reqList [data-rej]').forEach((b) => b.addEventListener('click', () => {
      VB.updateBooking(b.getAttribute('data-rej'), { estado: 'rechazada' }).then(() => toast('Reserva declinada')).catch(() => toast('Error', 'error'));
    }));
    $$('#reqList [data-done]').forEach((b) => b.addEventListener('click', () => {
      VB.updateBooking(b.getAttribute('data-done'), { estado: 'completada' }).then(() => toast('Carga completada 🔋')).catch(() => toast('Error', 'error'));
    }));
    $$('#reqList [data-rated]').forEach((b) => b.addEventListener('click', () => {
      const rq = myRequests.find((x) => x.id === b.getAttribute('data-rated'));
      if (rq) openRateSheet({ bookingId: rq.id, stationId: null, toName: rq.driverName || 'el conductor', tipo: 'host-driver' });
    }));
  }

  /* =========================================================
     Chat
     ========================================================= */
  async function startChatWith(sp) {
    if (!user) { needLogin(); return; }
    try {
      const chatId = await VB.openChat(sp);
      closeSheetEl('#spotSheet');
      openChatSheet({ chatId, title: sp.nombre, sub: 'con ' + (sp.ownerName || 'el anfitrión'), demo: !!sp.demo });
    } catch (e) {
      toast(e.message === 'login' ? 'Inicia sesión para chatear' : 'No se pudo abrir el chat', 'error');
    }
  }

  function renderChatList() {
    const logged = !!user;
    $('#chatAuth').classList.toggle('hidden', logged);
    const ul = $('#chatsList');
    ul.innerHTML = '';
    $('#chatsEmpty').classList.toggle('hidden', !logged || myChats.length > 0);
    if (!logged) return;
    const uidv = VB.uid();
    myChats.forEach((ch) => {
      const other = (ch.names && Object.keys(ch.names).filter((k) => k !== uidv).map((k) => ch.names[k])[0]) || 'Chat';
      const when = tsDate(ch.lastAt);
      const li = document.createElement('li');
      li.className = 'book-card';
      li.style.cursor = 'pointer';
      li.innerHTML = `
        <div class="bk-top">
          <div><div class="bk-name">💬 ${escapeHtml(ch.stationName || other)}</div>
          <div class="bk-sub">${escapeHtml(other)}${ch.lastMsg ? ' · ' + escapeHtml(ch.lastMsg) : ''}</div></div>
          <span class="bk-sub">${when.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}</span>
        </div>`;
      li.addEventListener('click', () => openChatSheet({ chatId: ch.id, title: ch.stationName || other, sub: 'con ' + other, demo: !!ch.demo }));
      ul.appendChild(li);
    });
  }

  function openChatSheet(ctx) {
    chatCtx = ctx;
    $('#chTitle').textContent = ctx.title;
    $('#chSub').textContent = ctx.sub || '';
    $('#chMsgs').innerHTML = '<div class="msg-day">Cargando…</div>';
    openSheetEl('#chatSheet');
    stopWatchers(['msgs']);
    unsubs.msgs = VB.watchMessages(ctx.chatId, (msgs) => {
      const box = $('#chMsgs');
      const uidv = VB.uid();
      let html = '';
      let lastDay = '';
      msgs.forEach((m) => {
        const d = tsDate(m.at);
        const dayKey = d.toDateString();
        if (dayKey !== lastDay) {
          lastDay = dayKey;
          html += `<div class="msg-day">${d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}</div>`;
        }
        const mine = m.from === uidv;
        html += `<div class="msg ${mine ? 'msg-out' : 'msg-in'}">${escapeHtml(m.text)}<span class="msg-time">${d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span></div>`;
      });
      if (!msgs.length) html = '<div class="msg-day">Escribe el primer mensaje 👋</div>';
      if (ctx.demo) html += '<div class="chat-demo-note">Este es un puesto de ejemplo: el anfitrión no responderá.</div>';
      box.innerHTML = html;
      box.scrollTop = box.scrollHeight;
    });
    setTimeout(() => $('#chInput').focus(), 300);
  }

  async function sendChat() {
    const txt = $('#chInput').value.trim();
    if (!txt || !chatCtx) return;
    $('#chInput').value = '';
    try { await VB.sendMessage(chatCtx.chatId, txt); }
    catch (e) { toast('No se pudo enviar', 'error'); $('#chInput').value = txt; }
  }

  /* =========================================================
     Calificaciones
     ========================================================= */
  function openRateSheet(ctx) {
    rateCtx = ctx;
    rateStars = 0;
    $('#rtTitle').textContent = ctx.tipo === 'driver-host' ? 'Califica al anfitrión' : 'Califica al conductor';
    $('#rtSub').textContent = 'Tu opinión sobre ' + ctx.toName + ' ayuda a que la red sea confiable.';
    $('#rtComment').value = '';
    $$('#rtStars .star-btn').forEach((s) => s.classList.remove('on'));
    openSheetEl('#rateSheet');
  }

  async function sendRating() {
    if (!rateCtx) return;
    if (!rateStars) { toast('Elige de 1 a 5 estrellas', 'error'); return; }
    try {
      await VB.submitRating({
        bookingId: rateCtx.bookingId || null,
        stationId: rateCtx.stationId || null,
        stars: rateStars,
        comment: $('#rtComment').value.trim().slice(0, 300),
        tipo: rateCtx.tipo
      });
      closeSheetEl('#rateSheet');
      toast('¡Gracias por calificar! ⭐');
    } catch (e) { toast('No se pudo enviar la calificación', 'error'); }
  }

  /* =========================================================
     Torre y apartamento (calculadora)
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
    $('#taClear').addEventListener('click', () => { taState.torre = null; taState.piso = null; taState.unit = null; renderTA(); });
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
    } else kwh = parseNum($('#directKwh').value);
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
    w.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: dur, iterations: Infinity, easing: 'linear' }));

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
    const s = Object.assign({ id: uid8('s'), dateISO: calc.dateISO || new Date().toISOString() }, calc);
    sessions.unshift(s);
    persistSessions();
    return s;
  }

  /* =========================================================
     Historial + recibo + CSV
     ========================================================= */
  const computeStats = () => sessions.reduce((a, s) => { a.earn += s.total || 0; a.kwh += s.kwh || 0; a.count++; return a; }, { earn: 0, kwh: 0, count: 0 });

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
      persistSessions(); renderHistory(); renderCharts(); toast('Carga eliminada');
    }));
    $$('#histList [data-share]').forEach((b) => b.addEventListener('click', () => {
      const s = sessions.find((x) => x.id === b.getAttribute('data-share'));
      if (s) shareReceipt(s);
    }));
  }

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
     Gráficas
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
    base.style.stroke = 'rgba(255,255,255,0.14)';
    base.style.strokeWidth = '1.5';
    svg.appendChild(base);
  }

  function drawBars(svg, buckets, metric) {
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
        vt.textContent = fmtCompact(v, metric);
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
    const pts = buckets.map((b, i) => ({ x: X0 + span * i + span / 2, y: Y1 - Math.max(0, (b.kwh / max)) * (Y1 - Y0), b }));
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

    drawBars(A, buckets, 'cop');
    $('#chartFootA').innerHTML = `<span>Total del período</span><b>${fmtCOP(totCop)}</b>`;
    if (chartState.group === 'day') drawArea(B, buckets, 'kwh');
    else drawBars(B, buckets, 'kwh');
    $('#chartFootB').innerHTML = `<span>${totCount} ${totCount === 1 ? 'carga' : 'cargas'} en total</span><b>${fmtKwh(totKwh)} kWh</b>`;

    const reveal = () => { A.classList.add('chart-in'); B.classList.add('chart-in'); };
    requestAnimationFrame(() => requestAnimationFrame(reveal));
    setTimeout(reveal, 120);
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
    calc.dateISO = new Date().toISOString();
    saveSession(calc);
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
    buildTAChips();
    renderTA();
    buildDiasChips();
    loadSettingsUI();
    setBattery(100);

    // Backend
    whenVB((vb) => {
      VB = vb;
      VB.onAuth((u) => {
        user = u;
        renderAuthUI();
        startWatchers();
        if (currentView === 'bookings') renderBookings();
        if (currentView === 'chats') renderChatList();
        if (currentView === 'requests') renderHostArea();
        if (u) { closeSheetEl('#loginSheet'); }
      });
      let gotSnapshot = false;
      unsubs.stations = VB.watchStations((list) => {
        gotSnapshot = true;
        stations = list;
        backendOff = false;
        ['#mapNotice', '#reqNotice'].forEach((s) => { const el = $(s); if (el) el.classList.add('hidden'); });
        if (liveMap || currentView === 'map') applyFilters();
      }, (e) => {
        backendOff = true;
        showBackendNotice('La nube de Voltio está en configuración (Firestore pendiente). El mapa mostrará puestos apenas esté lista.');
      });
      setTimeout(() => {
        if (!gotSnapshot && !stations.length) {
          showBackendNotice('Conectando con la red Voltio… Si esto persiste, la base de datos aún está en configuración.');
        }
      }, 8000);
      locateMe(true);
    });

    // Rol
    if (settings.role === 'driver' || settings.role === 'host') applyRole(settings.role, { keepView: true });
    else {
      $('#roleGate').classList.remove('hidden');
      $('#roleGate').setAttribute('aria-hidden', 'false');
      $$('.nav-btn').forEach((b) => b.classList.toggle('nav-hidden', !TABS.host.includes(b.dataset.view)));
    }
    $('#roleDriverBtn').addEventListener('click', () => { applyRole('driver'); toast('Modo conductor activado 🚗'); });
    $('#roleHostBtn').addEventListener('click', () => { applyRole('host'); toast('Modo anfitrión activado 🏠'); });
    $$('#roleSwitch .seg-btn').forEach((b) => b.addEventListener('click', () => {
      if (settings.role !== b.dataset.role) { applyRole(b.dataset.role, { keepView: true }); toast(b.dataset.role === 'driver' ? 'Modo conductor 🚗' : 'Modo anfitrión 🏠'); }
    }));

    // Navegación
    $$('.nav-btn').forEach((b) => b.addEventListener('click', () => goView(b.dataset.view)));

    // Login
    $$('.js-open-login').forEach((b) => b.addEventListener('click', openLoginSheet));
    $('#topAuthBtn').addEventListener('click', () => { if (user) { goView('settings'); } else openLoginSheet(); });
    $('#lgGoogle').addEventListener('click', async () => {
      $('#lgError').classList.add('hidden');
      try { await VB.loginGoogle(); toast('¡Bienvenido a Voltio! ⚡'); }
      catch (e) { $('#lgError').textContent = e.message; $('#lgError').classList.remove('hidden'); }
    });
    $('#lgToggle').addEventListener('click', () => {
      lgMode = lgMode === 'login' ? 'signup' : 'login';
      $('#lgNameField').classList.toggle('hidden', lgMode !== 'signup');
      $('#lgSubmit').textContent = lgMode === 'signup' ? 'Crear cuenta' : 'Entrar';
      $('#lgToggle').innerHTML = lgMode === 'signup' ? '¿Ya tienes cuenta? <b>Entrar</b>' : '¿No tienes cuenta? <b>Crear una</b>';
    });
    $('#lgSubmit').addEventListener('click', async () => {
      const email = $('#lgEmail').value.trim();
      const pass = $('#lgPass').value;
      $('#lgError').classList.add('hidden');
      if (!email || !pass) { $('#lgError').textContent = 'Escribe tu correo y contraseña.'; $('#lgError').classList.remove('hidden'); return; }
      try {
        if (lgMode === 'signup') await VB.signupEmail($('#lgName').value.trim(), email, pass);
        else await VB.loginEmail(email, pass);
        toast('¡Bienvenido a Voltio! ⚡');
      } catch (e) { $('#lgError').textContent = e.message; $('#lgError').classList.remove('hidden'); }
    });
    $('#lgPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#lgSubmit').click(); });
    $('#accLogout').addEventListener('click', async () => { await VB.logout(); toast('Sesión cerrada'); });

    // Sheets: cerrar
    $$('[data-close]').forEach((el) => el.addEventListener('click', () => {
      const k = el.getAttribute('data-close');
      if (k === 'login') closeSheetEl('#loginSheet');
      if (k === 'spot') closeSheetEl('#spotSheet');
      if (k === 'rate') closeSheetEl('#rateSheet');
      if (k === 'chat') { closeSheetEl('#chatSheet'); stopWatchers(['msgs']); chatCtx = null; }
    }));

    // Mapa
    $('#locateBtn').addEventListener('click', () => locateMe(false));
    $$('#fSort .chip').forEach((c) => c.addEventListener('click', () => {
      filters.sort = c.dataset.sort;
      $$('#fSort .chip').forEach((x) => x.classList.toggle('is-active', x === c));
      applyFilters();
    }));
    $('#fPrice').addEventListener('input', () => {
      filters.maxPrice = +$('#fPrice').value;
      $('#fPriceVal').textContent = fmtCOP(filters.maxPrice).replace(/\s?COP$/, '');
      const r = $('#fPrice');
      r.style.setProperty('--rangePct', ((r.value - r.min) / (r.max - r.min) * 100).toFixed(1) + '%');
      applyFilters();
    });
    $$('#fPow .chip').forEach((c) => c.addEventListener('click', () => {
      filters.minPow = +c.dataset.pow;
      $$('#fPow .chip').forEach((x) => x.classList.toggle('is-active', x === c));
      applyFilters();
    }));
    $$('#fPort .chip').forEach((c) => c.addEventListener('click', () => {
      filters.port = c.dataset.port;
      $$('#fPort .chip').forEach((x) => x.classList.toggle('is-active', x === c));
      applyFilters();
    }));
    $('#fNow').addEventListener('click', () => {
      filters.now = !filters.now;
      $('#fNow').classList.toggle('is-on', filters.now);
      $('#fNow').setAttribute('aria-checked', String(filters.now));
      applyFilters();
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
      applyFilters();
      toast('Filtros restablecidos');
    });

    // Mi puesto
    $('#spotSaveBtn').addEventListener('click', saveSpot);
    $('#spotEditBtn').addEventListener('click', () => { spotEditing = true; renderSpotCard(); setTimeout(() => $('#spName').focus(), 150); });
    $('#spVisible').addEventListener('click', () => {
      const sw = $('#spVisible');
      sw.classList.toggle('is-on');
      sw.setAttribute('aria-checked', String(sw.classList.contains('is-on')));
    });
    $('#spUseLoc').addEventListener('click', () => {
      if (!navigator.geolocation) { toast('Sin geolocalización disponible', 'error'); return; }
      navigator.geolocation.getCurrentPosition((pos) => {
        spLoc = { lat: +pos.coords.latitude.toFixed(5), lng: +pos.coords.longitude.toFixed(5) };
        if (pickMarker) pickMarker.setLatLng([spLoc.lat, spLoc.lng]);
        if (pickMap) pickMap.setView([spLoc.lat, spLoc.lng], 15);
        $('#spLatLng').textContent = spLoc.lat + ', ' + spLoc.lng;
        toast('Pin puesto en tu ubicación 📍');
      }, () => toast('No pudimos obtener tu ubicación', 'error'));
    });
    $('#spFotoInput').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []).slice(0, 3 - spFotos.length);
      for (const f of files) {
        const url = await compressImage(f);
        if (url) spFotos.push(url);
        else toast('Una imagen no se pudo procesar', 'error');
      }
      e.target.value = '';
      renderFotoThumbs();
    });

    // Chat
    $('#chSend').addEventListener('click', sendChat);
    $('#chInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

    // Calificar
    $$('#rtStars .star-btn').forEach((s) => s.addEventListener('click', () => {
      rateStars = +s.dataset.s;
      $$('#rtStars .star-btn').forEach((x) => x.classList.toggle('on', +x.dataset.s <= rateStars));
    }));
    $('#rtSend').addEventListener('click', sendRating);

    // Calculadora
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

    // Historial / CSV
    $('#exportBtn').addEventListener('click', exportCSV);
    $('#exportBtn2').addEventListener('click', exportCSV);
    $('#clearHistBtn').addEventListener('click', () => {
      if (!sessions.length) { toast('El historial ya está vacío'); return; }
      if (confirm('¿Borrar todo el historial de cargas? Esta acción no se puede deshacer.')) {
        sessions = []; persistSessions(); renderHistory(); renderCharts(); toast('Historial borrado');
      }
    });

    // Gráficas
    $$('#chartGroup .seg-btn').forEach((b) => b.addEventListener('click', () => {
      chartState.group = b.dataset.group;
      $$('#chartGroup .seg-btn').forEach((x) => x.classList.toggle('is-active', x === b));
      renderCharts();
    }));

    // Ajustes
    $('#setPrice').addEventListener('input', () => setPrice(parseNum($('#setPrice').value)));
    $('#setPriceRange').addEventListener('input', (e) => { if (!e.isTrusted) return; setPrice(+$('#setPriceRange').value); });
    $$('#pricePresets .chip').forEach((c) => c.addEventListener('click', () => setPrice(+c.dataset.price)));
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

    // Reset local
    $('#resetBtn').addEventListener('click', () => {
      if (confirm('¿Restablecer los datos locales? (ajustes, historial de la calculadora)')) {
        [LS_SETTINGS, LS_SESSIONS, LS_CHATSEEN].forEach((k) => localStorage.removeItem(k));
        settings = Object.assign({}, DEFAULTS);
        sessions = [];
        stationEditing = false; spotEditing = false;
        loadSettingsUI(); renderHistory(); resetForm();
        $('#roleGate').classList.remove('hidden');
        toast('Datos locales restablecidos');
      }
    });

    // Atajos PWA
    const action = new URLSearchParams(location.search).get('action');
    if (action === 'history' || action === 'charts') goView('insights');
    else if (action === 'new') goView('charge');

    updateLive();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
