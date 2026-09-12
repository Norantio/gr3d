import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./dist', import.meta.url));
const dataDir = process.env.DATA_DIR || '/data';
const dataFile = join(dataDir, 'creations.json');
const port = Number(process.env.PORT || 80);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

mkdirSync(dataDir, { recursive: true });
if (!existsSync(dataFile)) writeFileSync(dataFile, '[]\n');
function readCreations() { try { return JSON.parse(readFileSync(dataFile, 'utf8')); } catch { return []; } }
function writeCreations(creations) { writeFileSync(dataFile, `${JSON.stringify(creations, null, 2)}\n`); }
function sendJson(response, status, value) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); }

const server = createServer((request, response) => {
  if (request.url === '/api/creations' && request.method === 'GET') return sendJson(response, 200, readCreations());
  if (request.url === '/api/creations' && request.method === 'PUT') {
    let body = '';
    request.on('data', (chunk) => { body += chunk; if (body.length > 10_000_000) request.destroy(); });
    request.on('end', () => { try { const creations = JSON.parse(body); if (!Array.isArray(creations)) throw new Error('Expected an array'); writeCreations(creations); sendJson(response, 200, creations); } catch { sendJson(response, 400, { error: 'Invalid creations payload' }); } });
    return;
  }
  const requested = decodeURIComponent((request.url || '/').split('?')[0]);
  const relative = requested === '/' ? '/index.html' : requested;
  const file = normalize(join(root, relative));
  if (!file.startsWith(root)) return sendJson(response, 400, { error: 'Invalid path' });
  try { const contents = readFileSync(file); response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(contents); } catch { const contents = readFileSync(join(root, 'index.html')); response.writeHead(200, { 'Content-Type': mime['.html'], 'Cache-Control': 'no-store' }); response.end(contents); }
});
server.listen(port, '0.0.0.0', () => console.log(`gr3d listening on ${port}`));
