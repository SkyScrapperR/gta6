// Local static server for game/ (Node 22, standard library only): `node serve.ts [--port 8080]`.
// Development convenience only; refuses paths outside game/.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const argPort = process.argv.indexOf('--port');
const port = argPort > 0 ? Number(process.argv[argPort + 1]) || 8080 : 8080;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(join(root, normalize(path)));
  if (file !== root && !file.startsWith(root + sep)) return void res.writeHead(403).end();
  try {
    if (!statSync(file).isFile()) throw new Error();
  } catch {
    return void res.writeHead(404).end('not found');
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`SELARA BAY on http://localhost:${port}`));
