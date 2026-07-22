/**
 * Aprovisionamiento del backend de Voltio (sin dependencias).
 * Usa la cuenta de servicio para llamar APIs de Google Cloud/Firebase:
 *   node scripts/backend-setup.js setup   -> habilita APIs, crea Firestore, registra web app, configura Auth
 *   node scripts/backend-setup.js seed    -> siembra estaciones de ejemplo (docs reales en Firestore)
 *   node scripts/backend-setup.js google  -> intenta habilitar el proveedor Google de Auth
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(process.env.USERPROFILE || process.env.HOME, 'voltio-firebase-key.json');
const key = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
const PROJECT = key.project_id;

const b64u = (x) => Buffer.from(x).toString('base64url');

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  }));
  const sig = crypto.createSign('RSA-SHA256').update(header + '.' + claim).sign(key.private_key);
  const jwt = header + '.' + claim + '.' + b64u(sig);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + jwt
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('token: ' + JSON.stringify(j));
  return j.access_token;
}

let TOKEN = null;
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  let j = null;
  try { j = await res.json(); } catch (e) { j = {}; }
  return { status: res.status, body: j };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ============================ SETUP ============================ */
async function setup() {
  console.log('Proyecto:', PROJECT);

  // 1. Habilitar APIs
  for (const svc of ['firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'firebase.googleapis.com', 'firebasehosting.googleapis.com']) {
    const r = await api('POST', `https://serviceusage.googleapis.com/v1/projects/${PROJECT}/services/${svc}:enable`);
    console.log('enable', svc, '->', r.status, r.body.error ? r.body.error.message : 'ok');
  }
  await sleep(5000);

  // 2. Crear base de datos Firestore (São Paulo — la más cercana a Colombia)
  let r = await api('POST', `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases?databaseId=(default)`,
    { type: 'FIRESTORE_NATIVE', locationId: 'southamerica-east1' });
  if (r.status === 409) console.log('firestore -> ya existía');
  else console.log('firestore ->', r.status, r.body.error ? r.body.error.message : 'creando…');
  for (let i = 0; i < 12; i++) {
    const g = await api('GET', `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)`);
    if (g.status === 200) { console.log('firestore listo:', g.body.locationId, g.body.type); break; }
    await sleep(4000);
  }

  // 3. Web app (registrar si no existe) + config
  r = await api('GET', `https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/webApps`);
  let appId = (r.body.apps || [])[0] && (r.body.apps || [])[0].appId;
  if (!appId) {
    r = await api('POST', `https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/webApps`, { displayName: 'Voltio Web' });
    console.log('webApp create ->', r.status);
    const opName = r.body.name;
    for (let i = 0; i < 12; i++) {
      await sleep(3000);
      const op = await api('GET', `https://firebase.googleapis.com/v1/${opName}`);
      if (op.body.done) { appId = op.body.response && op.body.response.appId; break; }
    }
  }
  console.log('webApp id:', appId);
  r = await api('GET', `https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/webApps/${appId}/config`);
  const cfg = r.body;
  const fileCfg = {
    apiKey: cfg.apiKey,
    authDomain: cfg.authDomain,
    projectId: cfg.projectId,
    storageBucket: cfg.storageBucket,
    messagingSenderId: cfg.messagingSenderId,
    appId: cfg.appId
  };
  const out = 'export const firebaseConfig = ' + JSON.stringify(fileCfg, null, 2) + ';\n';
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'js', 'firebase-config.js'), out);
  console.log('firebase-config.js escrito:', JSON.stringify(fileCfg.projectId), fileCfg.appId);

  // 4. Auth: correo+contraseña, anónimo y dominios autorizados
  r = await api('PATCH',
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config?updateMask=signIn.email,signIn.anonymous,authorizedDomains`,
    {
      signIn: { email: { enabled: true, passwordRequired: true }, anonymous: { enabled: true } },
      authorizedDomains: ['localhost', `${PROJECT}.firebaseapp.com`, `${PROJECT}.web.app`, 'voltio-red.web.app']
    });
  console.log('auth config ->', r.status, r.body.error ? JSON.stringify(r.body.error) : 'ok (email+anónimo+dominios)');

  // 5. Intentar habilitar Google como proveedor
  await tryGoogle();
  console.log('SETUP COMPLETO');
}

async function tryGoogle() {
  let r = await api('POST',
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/defaultSupportedIdpConfigs?idpId=google.com`,
    { enabled: true });
  if (r.status === 409) {
    r = await api('PATCH',
      `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/defaultSupportedIdpConfigs/google.com?updateMask=enabled`,
      { enabled: true });
  }
  console.log('google idp ->', r.status, r.body.error ? JSON.stringify(r.body.error.message || r.body.error) : JSON.stringify(r.body));
}

/* ============================ SEED ============================ */
const F = {
  s: (v) => ({ stringValue: String(v) }),
  n: (v) => (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }),
  b: (v) => ({ booleanValue: !!v }),
  arrN: (a) => ({ arrayValue: { values: a.map(F.n) } }),
  arrS: (a) => ({ arrayValue: { values: a.map(F.s) } }),
  ts: () => ({ timestampValue: new Date().toISOString() })
};

const SEED = [
  { id: 'demo-chapinero', nombre: 'Garaje Chapinero Alto', dir: 'Cl 60 # 4-32, Chapinero, Bogotá', lat: 4.64860, lng: -74.06280, precio: 950, pow: 7.4, puerto: 'Tipo 2', desde: '06:00', hasta: '22:00', dias: [1, 1, 1, 1, 1, 1, 1], breb: '@caro.carga', titular: 'Carolina Martínez', ownerName: 'Carolina M.', rs: 47, rc: 10, cond: 'Parqueadero cubierto y con cámaras. Timbre en la puerta — llegando escribe por el chat. Baño disponible.' },
  { id: 'demo-cedritos', nombre: 'Parqueadero Cedritos 140', dir: 'Cl 140 # 12-18, Cedritos, Bogotá', lat: 4.72500, lng: -74.04300, precio: 1100, pow: 7.4, puerto: 'Tipo 1', desde: '07:00', hasta: '20:00', dias: [0, 1, 1, 1, 1, 1, 0], breb: '@evcedritos', titular: 'Jorge Peña', ownerName: 'Jorge P.', rs: 33, rc: 7, cond: 'Entrada por el sótano 1, puesto 24. Vigilante 24h.' },
  { id: 'demo-soledad', nombre: 'La Soledad 24h', dir: 'Cra 19 # 39-41, Teusaquillo, Bogotá', lat: 4.62800, lng: -74.07700, precio: 1250, pow: 11, puerto: 'CCS', desde: '00:00', hasta: '23:59', dias: [1, 1, 1, 1, 1, 1, 1], breb: '@lasoledad.ev', titular: 'EV Soledad SAS', ownerName: 'Estación Local', rs: 92, rc: 19, cond: 'Estación semi-comercial. Carga rápida CCS. Abierto 24/7, pago contra entrega.' },
  { id: 'demo-kennedy', nombre: 'Casa Kennedy Central', dir: 'Cl 38 sur # 78-15, Kennedy, Bogotá', lat: 4.62900, lng: -74.15200, precio: 800, pow: 3.6, puerto: 'Doméstico', desde: '18:00', hasta: '23:00', dias: [1, 1, 1, 1, 1, 1, 1], breb: '@kdy.carga', titular: 'Marta López', ownerName: 'Marta L.', rs: 27, rc: 6, cond: 'Toma doméstica 220V en garaje familiar. Ideal para cargas nocturnas lentas.' },
  { id: 'demo-macarena', nombre: 'Torres del Parque', dir: 'Cra 5 # 26-57, La Macarena, Bogotá', lat: 4.61800, lng: -74.06800, precio: 1000, pow: 7.4, puerto: 'Tipo 2', desde: '08:00', hasta: '21:00', dias: [1, 1, 1, 1, 1, 1, 1], breb: '@torrespq', titular: 'Andrés Gil', ownerName: 'Andrés G.', rs: 41, rc: 9, cond: 'Parqueadero de visitantes, avisar en portería que vas al puesto de carga Voltio.' },
  { id: 'demo-chia', nombre: 'Chía — Finca El Roble', dir: 'Vereda Bojacá, Chía, Cundinamarca', lat: 4.86100, lng: -74.03300, precio: 1400, pow: 22, puerto: 'Tipo 2', desde: '09:00', hasta: '18:00', dias: [0, 0, 0, 0, 0, 1, 1], breb: '@roble.ev', titular: 'Camilo Roble', ownerName: 'Familia Roble', rs: 60, rc: 12, cond: 'Wallbox 22 kW junto al restaurante de la finca. Perfecto para plan de fin de semana.' },
  { id: 'demo-poblado', nombre: 'El Poblado EV Point', dir: 'Cra 43A # 6 sur-15, El Poblado, Medellín', lat: 6.20880, lng: -75.56790, precio: 1050, pow: 11, puerto: 'Tipo 2', desde: '06:00', hasta: '22:00', dias: [1, 1, 1, 1, 1, 1, 1], breb: '@pobladoev', titular: 'Sara Restrepo', ownerName: 'Sara R.', rs: 74, rc: 15, cond: 'Edificio con portería. Deja tu documento y sube al puesto 12. Café de cortesía ☕.' }
];

async function seed() {
  for (const s of SEED) {
    const fields = {
      ownerUid: F.s('voltio-demo'),
      ownerName: F.s(s.ownerName),
      demo: F.b(true),
      nombre: F.s(s.nombre),
      dir: F.s(s.dir),
      lat: F.n(s.lat), lng: F.n(s.lng),
      precio: F.n(s.precio), pow: F.n(s.pow),
      puerto: F.s(s.puerto),
      desde: F.s(s.desde), hasta: F.s(s.hasta),
      dias: F.arrN(s.dias),
      breb: F.s(s.breb), titular: F.s(s.titular),
      visible: F.b(true),
      fotos: { arrayValue: {} },
      condiciones: F.s(s.cond),
      ratingSum: F.n(s.rs), ratingCount: F.n(s.rc),
      createdAt: F.ts()
    };
    const r = await api('PATCH',
      `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/stations/${s.id}`,
      { fields });
    console.log('seed', s.id, '->', r.status, r.body.error ? r.body.error.message : 'ok');
  }
  console.log('SEED COMPLETO');
}

/* ============================ CHECK ============================ */
async function check() {
  const db = await api('GET', `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)`);
  console.log('Firestore  :', db.status === 200
    ? `OK (${db.body.locationId}, ${db.body.type})`
    : `FALTA (${db.status} ${db.body.error ? db.body.error.message.slice(0, 60) : ''})`);

  const cfg = await api('GET', `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`);
  if (cfg.status === 200) {
    const si = cfg.body.signIn || {};
    console.log('Auth correo:', si.email && si.email.enabled ? 'OK habilitado' : 'FALTA');
    console.log('Dominios   :', (cfg.body.authorizedDomains || []).join(', '));
  } else console.log('Auth       : FALTA (', cfg.status, ')');

  const idp = await api('GET', `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/defaultSupportedIdpConfigs`);
  const gl = ((idp.body && idp.body.defaultSupportedIdpConfigs) || []).find((c) => (c.name || '').endsWith('google.com'));
  console.log('Auth Google:', gl ? (gl.enabled ? 'OK habilitado' : 'existe pero DESHABILITADO') : 'FALTA (habilítalo en consola)');
}

/* ============================ IAM ============================ */
async function iam() {
  const r = await api('POST', `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:getIamPolicy`, {});
  if (r.status !== 200) { console.log('getIamPolicy ->', r.status, r.body.error ? r.body.error.message : ''); return; }
  const me = 'serviceAccount:' + key.client_email;
  const mine = (r.body.bindings || []).filter((b) => (b.members || []).includes(me)).map((b) => b.role);
  console.log('Cuenta de servicio:', key.client_email);
  console.log('Roles actuales    :', mine.length ? mine.join(', ') : '(ninguno)');
}

/* ============================ MAIN ============================ */
(async () => {
  TOKEN = await getToken();
  const cmd = process.argv[2] || 'setup';
  if (cmd === 'setup') await setup();
  else if (cmd === 'seed') await seed();
  else if (cmd === 'google') await tryGoogle();
  else if (cmd === 'check') await check();
  else if (cmd === 'iam') await iam();
  else console.log('comando desconocido:', cmd);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
