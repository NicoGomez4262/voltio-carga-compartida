# ⚡ Voltio — Carga Compartida

**La red de carga para vehículos eléctricos entre vecinos.**
Cualquier persona en Colombia puede ofrecer su parqueadero con cargador como punto de
carga —porque no lo usa, está de viaje o quiere un ingreso extra— y cualquier conductor
puede encontrarlo, compararlo y reservarlo.

🌐 **Demo en vivo:** https://voltio-aec23.web.app

> PWA instalable · 100% responsive (celular y PC) · Funciona offline · Sin frameworks

---

## 💡 La idea

La infraestructura pública de carga en Colombia todavía es escasa, pero hay miles de
garajes privados con cargadores (o simples tomas de 110/220 V) que pasan horas sin
usarse. **Voltio conecta esas dos puntas:**

- **🏠 Anfitriones** publican su parqueadero: precio por kWh, potencia, tipo de puerto,
  horario semanal de disponibilidad y su llave **Bre-B** para recibir el pago.
- **🚗 Conductores** ven un mapa con los puestos cercanos, filtran por precio, potencia,
  puerto o disponibilidad, comparan y **solicitan una reserva** que el anfitrión puede
  aceptar o declinar.

Además, Voltio incluye la herramienta original que dio origen al proyecto: una
**calculadora de cobro por contador** — anotas la lectura del medidor antes y después de
la carga y la app calcula los kWh y el total en COP, con recibo compartible por WhatsApp.

> **Estado actual:** el marketplace funciona en *modo demostración local* (los puestos
> del mapa son datos de ejemplo y las reservas se simulan en el dispositivo). La
> arquitectura está lista para conectar un backend real (Firebase Auth + Firestore) que
> sincronice anfitriones y conductores de verdad. Ver [Roadmap](#-roadmap).

---

## ✨ Funcionalidades

### Para conductores 🚗
- **Mapa estilizado** con tu ubicación, anillos de distancia y pines de puestos cercanos
  (encendidos si están disponibles ahora).
- **Filtros en vivo**: ordenar por cercanía/precio/potencia, precio máximo, potencia
  mínima (7/11/22 kW), tipo de puerto (Tipo 1, Tipo 2, CCS, doméstico) y "disponible ahora".
- **Ficha de cada puesto**: calificación, verificación, specs, horario y **estimador de
  costo** según los kWh que necesites.
- **Reservas**: eliges fecha y hora dentro del horario del anfitrión, envías la solicitud
  y sigues su estado (pendiente → confirmada/rechazada). Al confirmarse, ves la **llave
  Bre-B y el titular** para transferir el pago, con botón de copiar.

### Para anfitriones 🏠
- **Publica tu puesto**: nombre, dirección, precio/kWh, potencia, puerto, disponibilidad
  semanal (días + franja horaria) y datos de pago Bre-B.
- **Bandeja de solicitudes** con aceptar/declinar.
- **Calculadora de cobro por contador** (lectura antes/después) o por kWh directos, con
  tarifa de servicio y descuento opcionales, torre/apartamento del vecino y **guardado
  automático**.
- **Historial** con totales y exportación a CSV.
- **Gráficas**: ingresos (COP) y energía (kWh), por día o por vecino, con unidades y
  animaciones.

### Experiencia ⚡
- **Animación de carga cinematográfica**: tu vehículo llega con suspensión real, se
  conecta al wallbox, carga con contadores en vivo (kWh y COP) y arranca al terminar.
- **4 vehículos a elegir**: automóvil, pickup, SUV familiar o 4x4 alto — el que más se
  parezca al tuyo.
- **Estética futurista**: glassmorphism, neón sobrio, tipografías Orbitron + Exo 2 y
  5 colores de acento.
- **Extras EV** en cada recibo: autonomía estimada, CO₂ evitado y ahorro vs gasolina.
- **PWA**: instalable en Android/iOS/PC y funciona sin conexión.
- **Privacidad**: todo se guarda en tu dispositivo (localStorage). Nada se envía a servidores.

---

## 🖥️ Correr en local

Solo necesitas [Node.js](https://nodejs.org) 16+ (sin dependencias que instalar):

```bash
npm start
# → http://localhost:5173
```

Alternativas: `python -m http.server 5173 --directory public` o cualquier servidor estático.

**Probar en el celular** (misma red WiFi): abre `http://IP-DE-TU-PC:5173`.

## 🚀 Desplegar (Firebase Hosting)

```bash
npm install -g firebase-tools
firebase login
# edita .firebaserc con tu Project ID
firebase deploy
```

La configuración de `firebase.json` ya maneja el caché correctamente (HTML y assets
versionados sin caché pegajoso, imágenes con caché de 7 días).

---

## 📁 Estructura

```
├── public/                  # La app completa (esto es lo que se despliega)
│   ├── index.html           # Vistas + escenas SVG de los 4 vehículos
│   ├── css/styles.css       # Estética futurista + animaciones
│   ├── js/app.js            # Roles, mapa, reservas, cálculo, gráficas, PWA
│   ├── sw.js                # Service worker (offline)
│   ├── manifest.webmanifest
│   └── icons/
├── scripts/gen-icons.js     # Generador de íconos PNG (cero dependencias)
├── server.js                # Servidor local de desarrollo (cero dependencias)
├── firebase.json            # Hosting + política de caché
└── deploy.ps1               # Redespliegue con cuenta de servicio (Windows)
```

**Decisiones técnicas:** vanilla JS sin frameworks ni librerías (carga instantánea,
offline total, sin build), SVG + Web Animations API para las animaciones, gráficas SVG
propias, y datos en localStorage con claves versionadas.

---

## 💳 Pagos (diseño)

Hoy: el anfitrión registra su **llave Bre-B** (el sistema de pagos inmediatos de
Colombia) y el nombre del titular. El conductor los ve al confirmarse la reserva,
transfiere desde su banco y verifica el titular antes de enviar.

Siguiente paso pensado: integración **PSE / pasarela** (Wompi, PayU o similar) con
retención del pago hasta completar la carga y liberación automática al anfitrión
(split payment), eliminando la transferencia manual.

## 🗺️ Roadmap

- [ ] **Backend real**: Firebase Auth (cuentas) + Firestore (puestos y reservas en
      tiempo real) + Cloud Messaging (notificaciones de solicitudes).
- [ ] **Mapa real** (Google Maps / OpenStreetMap) con GPS y direcciones exactas.
- [ ] Pagos integrados PSE/pasarela con conciliación automática.
- [ ] Calificaciones bidireccionales y verificación de identidad.
- [ ] Fotos del parqueadero y chat anfitrión-conductor.
- [ ] Check-in con QR al llegar al puesto.
- [ ] Lectura del contador por foto (OCR).

## 🤝 Contribuir

El proyecto es abierto: issues y pull requests son bienvenidos. La app está pensada para
crecer por módulos (el marketplace, la calculadora y las gráficas son independientes).

---

Hecho con ⚡ y energía limpia en Colombia.
