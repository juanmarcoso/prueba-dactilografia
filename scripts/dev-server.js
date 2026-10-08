const http = require('http');
const path = require('path');
const fs = require('fs');
const url = require('url');

const ROOT = path.resolve(__dirname, '..', 'frontend');
const HOST = '127.0.0.1';
const DEFAULT_PORT = 5500;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

function parsePort() {
  const argIndex = process.argv.indexOf('--port');
  if (argIndex !== -1 && process.argv[argIndex + 1]) {
    return Number(process.argv[argIndex + 1]);
  }
  if (process.env.PORT) {
    return Number(process.env.PORT);
  }
  return DEFAULT_PORT;
}

function send(res, status, body, contentType) {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-cache',
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(url.parse(req.url).pathname);
  } catch (err) {
    return send(res, 400, 'URL inválida', 'text/plain; charset=utf-8');
  }
  let filePath = path.normalize(path.join(ROOT, pathname));

  if (!filePath.startsWith(ROOT)) {
    return send(res, 403, 'Acceso denegado', 'text/plain; charset=utf-8');
  }

  if (pathname === '/' || pathname.endsWith('/')) {
    filePath = path.join(filePath, 'index.html');
  }

  fs.stat(filePath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      return send(res, 404, 'No encontrado', 'text/plain; charset=utf-8');
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    const stream = fs.createReadStream(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    stream.pipe(res);
    stream.on('error', () => res.destroy());
  });
});

const PORT = parsePort();
server.listen(PORT, HOST, () => {
  console.log(`Frontend en http://${HOST}:${PORT}/ (API esperada en http://127.0.0.1:8000)`);
});