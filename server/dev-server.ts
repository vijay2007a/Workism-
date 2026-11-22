import { createServer } from 'node:http';
import { createApp } from './app.ts';

const port = Number(process.env.PORT ?? 3001);
const app = createApp();

const server = createServer(async (req, res) => {
  const host = req.headers.host ?? `127.0.0.1:${port}`;
  const url = `http://${host}${req.url ?? '/'}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(', '));
  }

  let body: Uint8Array | undefined;
  if (req.method && !['GET', 'HEAD'].includes(req.method.toUpperCase())) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    body = Buffer.concat(chunks);
  }

  const webReq = new Request(url, {
    method: req.method,
    headers,
    body: body ? new Uint8Array(body) : undefined,
  });
  const webRes = await app.fetch(webReq);
  res.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => res.setHeader(key, value));
  const out = Buffer.from(await webRes.arrayBuffer());
  res.end(out);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`WORKISM local API listening on http://127.0.0.1:${port}`);
});
