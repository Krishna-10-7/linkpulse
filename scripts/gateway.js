// Local stand-in for the production Caddy routes, so cookies and URLs behave the same:
//   /lk/api/*  -> API service        /lk/app/*  -> dashboard (static build, or next dev on :3000)
//   /lk/*      -> redirect service
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const BASE = (env.BASE_PATH || '/lk').replace(/\/+$/, '');
const PORT = Number(env.GATEWAY_PORT || 8440);
const API = Number(env.API_PORT || 8441);
const REDIRECT = Number(env.REDIRECT_PORT || 8442);
const WEB_DEV = Number(env.WEB_DEV_PORT || 3000);
const OUT = path.join(root, 'apps/web/out');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain' };

function proxy(req, res, port, url, keepPrefix = false) {
  const headers = { ...req.headers, 'x-forwarded-for': req.socket.remoteAddress, 'x-forwarded-proto': 'http', 'x-forwarded-host': req.headers.host };
  const up = http.request({ host: '127.0.0.1', port, method: req.method, path: keepPrefix ? req.url : url, headers }, r => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on('error', () => {
    // If the upstream dies mid-response (for example a restart during a live stream),
    // headers are already sent: just close the connection instead of crashing.
    if (res.headersSent) return res.destroy();
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(`upstream :${port} is not running`);
  });
  req.pipe(up);
}

function serveStatic(res, rel) {
  let file = path.join(OUT, rel);
  if (!file.startsWith(OUT)) return false;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
  if (!fs.existsSync(file)) file = path.join(OUT, '404.html');
  if (!fs.existsSync(file)) return false;
  res.writeHead(file.endsWith('404.html') ? 404 : 200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
  return true;
}

http.createServer((req, res) => {
  const url = req.url || '/';
  if (!url.startsWith(BASE)) { res.writeHead(302, { location: `${BASE}/app/` }); return res.end(); }
  const rest = url.slice(BASE.length) || '/';
  if (rest.startsWith('/api/')) return proxy(req, res, API, rest);
  if (rest === '/app' || rest.startsWith('/app/')) {
    if (fs.existsSync(OUT)) {
      const rel = decodeURIComponent(rest.slice(4).split('?')[0]) || '/';
      if (serveStatic(res, rel)) return;
    }
    return proxy(req, res, WEB_DEV, url, true);
  }
  return proxy(req, res, REDIRECT, rest);
}).listen(PORT, () => console.log(`gateway on http://localhost:${PORT}${BASE}/`));
