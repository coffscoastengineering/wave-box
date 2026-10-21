// Dev static server: node tools/serve.mjs [port] [extraDir]. Serves the repo root; /scratch/* maps to extraDir.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const port = Number(process.argv[2] ?? 8765);
const extra = process.argv[3];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.pdf': 'application/pdf', '.svg': 'image/svg+xml', '.json': 'application/json' };

http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  const base = extra && url.startsWith('/scratch/') ? path.resolve(extra) : root;
  const file = path.resolve(base, '.' + (extra && url.startsWith('/scratch/') ? url.slice(8) : url));
  const rel = path.relative(base, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(data);
  });
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
