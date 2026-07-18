/**
 * Servidor estático sin dependencias para desarrollo local de Voltio.
 * Sirve la carpeta /public con los MIME types correctos, soporta PWA
 * (service worker sin caché) y hace fallback a index.html.
 *
 * Uso:  node server.js   ->   http://localhost:5173
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'public');
const PORT = process.env.PORT || 5173;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

function safeJoin(base, target) {
  const targetPath = path.normalize(path.join(base, target));
  if (!targetPath.startsWith(base)) return null; // evita path traversal
  return targetPath;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    let filePath = safeJoin(ROOT, urlPath);
    if (!filePath) return send(res, 400, 'Bad request');

    fs.stat(filePath, (err, stat) => {
      if (!err && stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      fs.readFile(filePath, (readErr, data) => {
        if (readErr) {
          // Fallback SPA: sirve index.html para rutas desconocidas (sin extensión)
          if (!path.extname(urlPath)) {
            return fs.readFile(path.join(ROOT, 'index.html'), (e2, html) => {
              if (e2) return send(res, 404, 'No encontrado');
              send(res, 200, html, { 'Content-Type': MIME['.html'] });
            });
          }
          return send(res, 404, 'No encontrado');
        }
        const ext = path.extname(filePath).toLowerCase();
        const type = MIME[ext] || 'application/octet-stream';
        const headers = { 'Content-Type': type };
        // El service worker y el HTML no deben cachearse en dev
        if (/sw\.js$|index\.html$|manifest\.webmanifest$/.test(filePath)) {
          headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        }
        send(res, 200, data, headers);
      });
    });
  } catch (e) {
    send(res, 500, 'Error interno');
  }
});

server.listen(PORT, HOST, () => {
  console.log('\n  ⚡  Voltio corriendo en local');
  console.log('  ────────────────────────────');
  console.log(`  ➜  Local:    http://localhost:${PORT}`);
  console.log(`  ➜  Red:      http://<tu-ip-local>:${PORT}  (para probar en el celular)`);
  console.log('\n  Ctrl + C para detener.\n');
});
