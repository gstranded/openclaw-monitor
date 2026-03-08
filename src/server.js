import http from 'node:http';
import { route } from './router.js';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  route(request, response, url);
});

server.listen(port, () => {
  console.log(`openclaw-monitor api listening on http://127.0.0.1:${port}`);
});
