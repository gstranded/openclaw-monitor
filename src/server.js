import http from 'node:http';
import { route } from './router.js';

export function createServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    route(request, response, url);
  });
}

export function startServer(port = Number.parseInt(process.env.PORT ?? '3000', 10)) {
  const server = createServer();
  server.listen(port, () => {
    console.log(`openclaw-monitor api listening on http://127.0.0.1:${port}`);
  });
  return server;
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}
