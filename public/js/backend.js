/* =========================================================
   VOLTIO — Backend (Firebase Auth + Firestore, tiempo real)
   Módulo ES: expone window.VB y dispara 'vb-ready'.
   ========================================================= */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile,
  sendEmailVerification, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, onSnapshot,
  query, where, orderBy, limit, serverTimestamp, runTransaction, increment
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
let db;
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (e) {
  db = initializeFirestore(app, {});
}

const state = { user: null, profileSaved: false };

/* ---------- Auth ---------- */
function mapAuthError(e) {
  const c = (e && e.code) || '';
  const M = {
    'auth/operation-not-allowed': 'Este método de ingreso aún no está habilitado en el servidor.',
    'auth/configuration-not-found': 'La autenticación aún no está configurada en el servidor.',
    'auth/email-already-in-use': 'Ese correo ya tiene una cuenta. Prueba "Ya tengo cuenta".',
    'auth/invalid-email': 'El correo no es válido.',
    'auth/weak-password': 'La contraseña debe tener mínimo 6 caracteres.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/wrong-password': 'Contraseña incorrecta.',
    'auth/user-not-found': 'No existe una cuenta con ese correo.',
    'auth/too-many-requests': 'Demasiados intentos. Espera un momento.',
    'auth/popup-closed-by-user': 'Cerraste la ventana de Google antes de terminar.',
    'auth/popup-blocked': 'El navegador bloqueó la ventana emergente.',
    'auth/unauthorized-domain': 'Este dominio no está autorizado para ingresar.'
  };
  return M[c] || ('No se pudo completar: ' + (e && e.message ? e.message.replace('Firebase: ', '') : c));
}

async function ensureProfile(u) {
  if (!u || state.profileSaved) return;
  try {
    await setDoc(doc(db, 'users', u.uid), {
      name: u.displayName || (u.email ? u.email.split('@')[0] : 'Usuario'),
      email: u.email || '',
      photoURL: u.photoURL || '',
      providers: u.providerData.map((p) => p.providerId),
      emailVerified: !!u.emailVerified,
      updatedAt: serverTimestamp()
    }, { merge: true });
    state.profileSaved = true;
  } catch (e) { /* backend puede no estar listo aún */ }
}

const VB = {
  /* estado */
  user: () => state.user,
  uid: () => (state.user ? state.user.uid : null),
  userName: () => (state.user ? (state.user.displayName || (state.user.email || '').split('@')[0] || 'Usuario') : null),
  isGoogle: () => !!(state.user && state.user.providerData.some((p) => p.providerId === 'google.com')),

  onAuth(cb) {
    onAuthStateChanged(auth, (u) => {
      state.user = u;
      state.profileSaved = false;
      if (u) ensureProfile(u);
      cb(u);
    });
    getRedirectResult(auth).catch(() => {});
  },

  async loginGoogle() {
    const prov = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, prov);
    } catch (e) {
      if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/cancelled-popup-request')) {
        await signInWithRedirect(auth, prov);
        return;
      }
      throw new Error(mapAuthError(e));
    }
  },

  async signupEmail(name, email, pass) {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      if (name) await updateProfile(cred.user, { displayName: name });
      try { await sendEmailVerification(cred.user); } catch (e) {}
      state.user = auth.currentUser;
    } catch (e) { throw new Error(mapAuthError(e)); }
  },

  async loginEmail(email, pass) {
    try { await signInWithEmailAndPassword(auth, email, pass); }
    catch (e) { throw new Error(mapAuthError(e)); }
  },

  async logout() { await signOut(auth); },

  /* ---------- Estaciones ---------- */
  watchStations(cb, onErr) {
    const q = query(collection(db, 'stations'), where('visible', '==', true));
    return onSnapshot(q, (snap) => {
      cb(snap.docs.map((d) => Object.assign({ id: d.id }, d.data())));
    }, (e) => { if (onErr) onErr(e); });
  },

  async publishStation(data, existingId) {
    const uid = VB.uid();
    if (!uid) throw new Error('login');
    const payload = Object.assign({}, data, {
      ownerUid: uid,
      ownerName: VB.userName(),
      ownerVerified: VB.isGoogle() || !!(state.user && state.user.emailVerified),
      updatedAt: serverTimestamp()
    });
    if (existingId) {
      await updateDoc(doc(db, 'stations', existingId), payload);
      return existingId;
    }
    payload.createdAt = serverTimestamp();
    payload.ratingSum = 0;
    payload.ratingCount = 0;
    const ref = await addDoc(collection(db, 'stations'), payload);
    return ref.id;
  },

  async myStation() {
    const uid = VB.uid();
    if (!uid) return null;
    const q = query(collection(db, 'stations'), where('ownerUid', '==', uid), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return Object.assign({ id: d.id }, d.data());
  },

  async setStationVisible(id, visible) {
    await updateDoc(doc(db, 'stations', id), { visible });
  },

  /* ---------- Reservas ---------- */
  async createBooking(bk) {
    const uid = VB.uid();
    if (!uid) throw new Error('login');
    bk.driverUid = uid;
    bk.driverName = VB.userName();
    bk.createdAt = serverTimestamp();
    bk.estado = 'pendiente';
    const ref = await addDoc(collection(db, 'bookings'), bk);
    return ref.id;
  },

  watchMyBookings(cb, onErr) {
    const uid = VB.uid();
    if (!uid) return () => {};
    const q = query(collection(db, 'bookings'), where('driverUid', '==', uid));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      list.sort((a, b) => (b.createdAt && b.createdAt.seconds || 0) - (a.createdAt && a.createdAt.seconds || 0));
      cb(list);
    }, (e) => { if (onErr) onErr(e); });
  },

  watchRequests(cb, onErr) {
    const uid = VB.uid();
    if (!uid) return () => {};
    const q = query(collection(db, 'bookings'), where('ownerUid', '==', uid));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      list.sort((a, b) => (b.createdAt && b.createdAt.seconds || 0) - (a.createdAt && a.createdAt.seconds || 0));
      cb(list);
    }, (e) => { if (onErr) onErr(e); });
  },

  async updateBooking(id, patch) {
    await updateDoc(doc(db, 'bookings', id), patch);
  },

  /* ---------- Chat ---------- */
  async openChat(station) {
    const uid = VB.uid();
    if (!uid) throw new Error('login');
    const chatId = station.id + '_' + uid;
    const names = {};
    names[uid] = VB.userName();
    names[station.ownerUid] = station.ownerName || 'Anfitrión';
    await setDoc(doc(db, 'chats', chatId), {
      stationId: station.id,
      stationName: station.nombre,
      ownerUid: station.ownerUid,
      driverUid: uid,
      participantes: [station.ownerUid, uid],
      names,
      demo: !!station.demo,
      lastAt: serverTimestamp()
    }, { merge: true });
    return chatId;
  },

  watchChats(cb, onErr) {
    const uid = VB.uid();
    if (!uid) return () => {};
    const q = query(collection(db, 'chats'), where('participantes', 'array-contains', uid));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      list.sort((a, b) => (b.lastAt && b.lastAt.seconds || 0) - (a.lastAt && a.lastAt.seconds || 0));
      cb(list);
    }, (e) => { if (onErr) onErr(e); });
  },

  watchMessages(chatId, cb, onErr) {
    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('at', 'asc'), limit(300));
    return onSnapshot(q, (snap) => {
      cb(snap.docs.map((d) => Object.assign({ id: d.id }, d.data())));
    }, (e) => { if (onErr) onErr(e); });
  },

  async sendMessage(chatId, text) {
    const uid = VB.uid();
    if (!uid) throw new Error('login');
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      from: uid, fromName: VB.userName(), text, at: serverTimestamp()
    });
    await updateDoc(doc(db, 'chats', chatId), {
      lastMsg: text.slice(0, 80), lastFrom: uid, lastAt: serverTimestamp()
    });
  },

  /* ---------- Calificaciones ---------- */
  async submitRating(r) {
    const uid = VB.uid();
    if (!uid) throw new Error('login');
    r.fromUid = uid;
    r.fromName = VB.userName();
    r.at = serverTimestamp();
    await addDoc(collection(db, 'ratings'), r);
    if (r.stationId && r.tipo === 'driver-host') {
      try {
        await runTransaction(db, async (tx) => {
          const ref = doc(db, 'stations', r.stationId);
          tx.update(ref, { ratingSum: increment(r.stars), ratingCount: increment(1) });
        });
      } catch (e) {}
    }
    if (r.bookingId) {
      try {
        const patch = {};
        patch[r.tipo === 'driver-host' ? 'ratedByDriver' : 'ratedByOwner'] = true;
        await updateDoc(doc(db, 'bookings', r.bookingId), patch);
      } catch (e) {}
    }
  },

  async stationRatings(stationId) {
    try {
      const q = query(collection(db, 'ratings'), where('stationId', '==', stationId), limit(30));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => d.data()).filter((r) => r.tipo === 'driver-host');
      list.sort((a, b) => (b.at && b.at.seconds || 0) - (a.at && a.at.seconds || 0));
      return list.slice(0, 5);
    } catch (e) { return []; }
  }
};

window.VB = VB;
window.dispatchEvent(new Event('vb-ready'));
