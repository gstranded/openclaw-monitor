import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

process.env.NODE_ENV = 'test';
process.env.OPENCLAW_RUNTIME_DIR = path.resolve(process.cwd(), 'test/fixtures/runtime');

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openclaw-monitor-data-'));
process.env.OPENCLAW_DATA_DIR = dataDir;

const { startServer } = await import('../src/server.js');

const markdownDir = path.resolve(process.cwd(), 'fixtures/markdown');
const markdownFileId = 'fixtures/markdown/test-edit.md';
const markdownFilePath = path.resolve(process.cwd(), markdownFileId);

await fs.mkdir(markdownDir, { recursive: true });
await fs.writeFile(markdownFilePath, '# test\n\ninitial\n', 'utf8');
const originalMarkdown = await fs.readFile(markdownFilePath, 'utf8');

test.after(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
  await fs.rm(markdownFilePath, { force: true });
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

    assert.ok(Array.isArray(payload.data.events));
    assert.ok(Array.isArray(payload.data.timeline));

    const first = payload.data.events[0];
    for (const key of ['at', 'kind', 'severity', 'agentId', 'source', 'title', 'summary']) {
      assert.ok(Object.hasOwn(first, key));
    }

    const tick = payload.data.events.find((evt) => evt.kind === 'worker-tick');
    assert.ok(tick);
    assert.equal(tick.count, 3);

    // Timeline is stable and time-ascending.
    assert.equal(payload.data.timeline[0].at, '2026-03-10T00:02:00Z');
    assert.equal(payload.data.timeline.at(-1).at, '2026-03-10T00:04:00Z');
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

    assert.ok(Array.isArray(payload.data.events));
    assert.ok(Array.isArray(payload.data.timeline));

    const dispatch = payload.data.timeline.find((evt) => evt.kind === 'dispatch');
    assert.ok(dispatch);
    assert.equal(dispatch.agentId, 'buding');
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

test('GET /api/markdown/files lists markdown files within configured boundaries', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/markdown/files`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.data.some((item) => item.fileId === markdownFileId));
    assert.ok(Array.isArray(payload.meta.approvedRoots));
  });
});

test('GET /api/markdown/read returns markdown content (no docs write needed)', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/markdown/read?fileId=${encodeURIComponent(markdownFileId)}`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.data.fileId, markdownFileId);
    assert.match(payload.data.content, /initial/);
  });
});

test('POST /api/markdown/preview returns diff before save', async () => {
  await withServer(async (baseUrl) => {
    const nextContent = `${originalMarkdown}\n<!-- preview -->\n`;
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

test('POST /api/markdown/save writes backup + audit and updates file', async () => {
  await withServer(async (baseUrl) => {
    const nextContent = `${originalMarkdown}\n<!-- saved -->\n`;
    const response = await fetch(`${baseUrl}/api/markdown/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-openclaw-actor': 'test-suite' },
      body: JSON.stringify({ fileId: markdownFileId, content: nextContent, expectedContent: originalMarkdown }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.data.saved, true);
    assert.ok(payload.data.backupPath);
    assert.ok(payload.data.audit);
    assert.equal(payload.data.audit.actor, 'test-suite');

    const diskContent = await fs.readFile(markdownFilePath, 'utf8');
    assert.equal(diskContent, nextContent);

    const backupAbs = path.resolve(dataDir, payload.data.backupPath);
    const auditAbs = path.resolve(dataDir, '.audit/markdown-edits.jsonl');
    const backupContent = await fs.readFile(backupAbs, 'utf8');
    assert.equal(backupContent, originalMarkdown);

    const auditLines = (await fs.readFile(auditAbs, 'utf8')).trim().split('\n');
    const last = JSON.parse(auditLines[auditLines.length - 1]);
    assert.equal(last.fileId, markdownFileId);
    assert.equal(last.actor, 'test-suite');
  });
});

test('POST /api/markdown/save rejects forbidden paths', async () => {
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

test('GET /api/events/stream provides SSE content type and initial meta', async () => {
  await withServer(async (baseUrl) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);

    const response = await fetch(`${baseUrl}/api/events/stream`, { signal: controller.signal });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/event-stream/);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    for (let i = 0; i < 8; i += 1) {
      const chunk = await reader.read();
      text += decoder.decode(chunk.value ?? new Uint8Array(), { stream: true });
      if (text.includes('event: meta')) break;
    }
    assert.match(text, /event: meta/);

    clearTimeout(timeout);
    controller.abort();
  });
});
