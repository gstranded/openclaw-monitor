import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.OPENCLAW_RUNTIME_DIR = path.resolve(process.cwd(), 'test/fixtures/runtime');

const { startServer } = await import('../src/server.js');

const docsDir = path.resolve(process.cwd(), 'docs');
const markdownFileId = 'dashboard-agent-aggregation.examples.md';
const markdownFilePath = path.join(docsDir, markdownFileId);
const originalMarkdown = await fs.readFile(markdownFilePath, 'utf8');

test.after(async () => {
  await fs.writeFile(markdownFilePath, originalMarkdown, 'utf8');
});

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

test('GET /api/dashboard returns aggregated dashboard payload', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/dashboard`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(Array.isArray(payload.data.agents));
    assert.ok(payload.data.agents.some((agent) => agent.agentId === 'buding'));
    assert.equal(typeof payload.meta.collectedAt, 'string');
    assert.ok(payload.meta.freshness);
  });
});

test('GET /api/agents/:id returns detail payload for known agent', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/agents/buding`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.data.agentId, 'buding');
    assert.ok(Array.isArray(payload.data.tasks));
    assert.ok(Array.isArray(payload.data.recentEvents));
    assert.ok(Array.isArray(payload.data.markdownFiles));
  });
});

test('GET /api/agents/:id returns 404 envelope for unknown agent', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/agents/unknown-agent`);
    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.equal(payload.error.code, 'NOT_FOUND');
    assert.equal(payload.error.details.agentId, 'unknown-agent');
  });
});

test('GET /api/markdown/files lists allowlisted markdown files', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/markdown/files`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.data.some((item) => item.fileId === markdownFileId));
    assert.equal(payload.meta.allowlistRoot, 'docs');
  });
});

test('GET /api/markdown/read returns markdown content', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/markdown/read?fileId=${encodeURIComponent(markdownFileId)}`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.data.fileId, markdownFileId);
    assert.match(payload.data.content, /Dashboard \/ Agent 详情聚合接口响应示例/);
  });
});

test('POST /api/markdown/preview returns diff before save', async () => {
  await withServer(async (baseUrl) => {
    const nextContent = `${originalMarkdown}\n\n<!-- preview -->\n`;
    const response = await fetch(`${baseUrl}/api/markdown/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: markdownFileId, content: nextContent }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.data.changed, true);
    assert.match(payload.data.diff, /\+<!-- preview -->/);
  });
});

test('POST /api/markdown/save saves markdown with expected content guard', async () => {
  await withServer(async (baseUrl) => {
    const nextContent = `${originalMarkdown}\n\n<!-- saved by test -->\n`;
    const response = await fetch(`${baseUrl}/api/markdown/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: markdownFileId, content: nextContent, expectedContent: originalMarkdown }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.data.saved, true);
    assert.equal(payload.data.changed, true);

    const diskContent = await fs.readFile(markdownFilePath, 'utf8');
    assert.equal(diskContent, nextContent);

    await fs.writeFile(markdownFilePath, originalMarkdown, 'utf8');
  });
});

test('POST /api/markdown/save rejects non-allowlisted paths', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/markdown/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: '../TASK.md', content: 'blocked' }),
    });
    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.error.code, 'FORBIDDEN_PATH');
  });
});
