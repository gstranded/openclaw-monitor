import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';

process.env.NODE_ENV = 'test';
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

test('GET /api/v1/leaderboard returns ranked entries with window metadata', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/leaderboard?window=7d&sortBy=stability&limit=1`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.data.length, 1);
    assert.equal(payload.data[0].agentId, 'buding');
    assert.equal(payload.data[0].rank, 1);
    assert.equal(payload.meta.window, '7d');
    assert.equal(payload.meta.sortBy, 'stability');
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

test('GET /api/v1/agents/:id returns detail payload for known agent', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/agents/buding`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.data.agentId, 'buding');
    assert.equal(payload.data.recentEvents.length, 1);
    assert.equal(payload.data.sourceStatus.length, 5);
    assert.equal(payload.meta.partial, true);
    assert.deepEqual(payload.meta.degradeReasons, ['github_issue_cache_reused']);
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

test('GET /api/v1/markdown-files lists allowlisted markdown files', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/markdown-files`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.data.some((item) => item.fileId === markdownFileId));
    assert.equal(payload.meta.allowlistRoot, 'docs');
  });
});

test('GET /api/v1/markdown-files/:fileId returns markdown content', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/markdown-files/${encodeURIComponent(markdownFileId)}`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.data.fileId, markdownFileId);
    assert.match(payload.data.content, /Dashboard \/ Agent 详情聚合接口响应示例/);
  });
});

test('POST /api/v1/markdown-files/preview-save returns diff before save', async () => {
  await withServer(async (baseUrl) => {
    const nextContent = `${originalMarkdown}\n\n<!-- preview -->\n`;
    const response = await fetch(`${baseUrl}/api/v1/markdown-files/preview-save`, {
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

test('PUT /api/v1/markdown-files/:fileId saves markdown with expected content guard', async () => {
  await withServer(async (baseUrl) => {
    const nextContent = `${originalMarkdown}\n\n<!-- saved by test -->\n`;
    const response = await fetch(`${baseUrl}/api/v1/markdown-files/${encodeURIComponent(markdownFileId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: nextContent, expectedContent: originalMarkdown }),
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

test('PUT /api/v1/markdown-files/:fileId rejects non-allowlisted paths', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/markdown-files/${encodeURIComponent('../TASK.md')}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'blocked' }),
    });
    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.error.code, 'FORBIDDEN_PATH');
  });
});

test('GET / serves dashboard UI html', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /Agent 状态卡片/);
    assert.match(text, /openclaw-monitor/);
  });
});

test('GET /agents/:id serves agent detail UI html', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/agents/buding`);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /Agent 详情/);
    assert.match(text, /recentEvents|最近活动/);
  });
});

test('GET /markdown serves markdown list UI html', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/markdown`);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /Markdown allowlist/);
  });
});

test('GET /markdown/:fileId serves markdown editor UI html', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/markdown/${encodeURIComponent(markdownFileId)}`);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /Markdown 编辑/);
    assert.match(text, /Preview diff/);
  });
});
