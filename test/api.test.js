import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

process.env.NODE_ENV = 'test';
const { startServer } = await import('../src/server.js');

async function withServer(run) {
  const server = startServer(0);
  await once(server, 'listening');

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('GET /api/v1/agents returns dashboard cards', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/agents?status=active&limit=1`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.data.length, 1);
    assert.equal(payload.data[0].agentId, 'buding');
    assert.equal(payload.meta.partial, false);
  });
});

test('GET /api/v1/agents rejects invalid limit', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/agents?limit=0`);
    assert.equal(response.status, 400);

    const payload = await response.json();
    assert.equal(payload.error.code, 'INVALID_ARGUMENT');
    assert.match(payload.error.message, />= 1/);
  });
});

test('GET /api/v1/leaderboard rejects unsupported sort field', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/leaderboard?sortBy=latency`);
    assert.equal(response.status, 400);

    const payload = await response.json();
    assert.equal(payload.error.code, 'INVALID_ARGUMENT');
    assert.match(payload.error.message, /sortBy/);
  });
});

test('GET /api/v1/agents/:id returns 404 envelope for unknown agent', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/agents/unknown-agent`);
    assert.equal(response.status, 404);

    const payload = await response.json();
    assert.equal(payload.error.code, 'NOT_FOUND');
    assert.equal(payload.error.details.agentId, 'unknown-agent');
  });
});
