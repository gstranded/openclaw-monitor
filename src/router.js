import fs from 'node:fs/promises';
import path from 'node:path';

import {
  createNotFound,
  getAgentDetail,
  getLeaderboard,
  listAgents,
  listMarkdownFiles,
  previewMarkdownSave,
  readMarkdownFile,
  saveMarkdownFile,
} from './data.js';
import {
  renderAgentPage,
  renderDashboardPage,
  renderMarkdownEditorPage,
  renderMarkdownListPage,
} from './ui.js';

const AGENT_STATUSES = new Set(['active', 'idle', 'blocked', 'offline', 'unknown']);
const LEADERBOARD_WINDOWS = new Set(['24h', '7d']);
const LEADERBOARD_SORT_FIELDS = new Set(['score', 'throughput', 'stability']);

const staticDir = path.resolve(process.cwd(), 'src', 'public');
const staticAllowlist = new Set(['shared.js', 'dashboard.js', 'agent.js', 'markdown-list.js', 'markdown-editor.js']);

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload, null, 2));
}

function html(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(payload);
}

function javascript(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/javascript; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(payload);
}

function createMeta() {
  return {
    partial: false,
    collectedAt: new Date().toISOString(),
    degradeReasons: [],
  };
}

function createErrorEnvelope(code, message, details = undefined, meta = createMeta()) {
  return {
    error: {
      code,
      message,
      retryable: false,
      ...(details ? { details } : {}),
    },
    meta,
  };
}

function createInvalidArgument(message, details = undefined) {
  return createErrorEnvelope('INVALID_ARGUMENT', message, details);
}

function parseInteger(value, { name, min, max } = {}) {
  if (value == null || value === '') return { value: undefined };
  if (!/^-?\d+$/.test(value)) {
    return { error: createInvalidArgument(`Query parameter '${name}' must be an integer`, { parameter: name, value }) };
  }
  const parsed = Number.parseInt(value, 10);
  if (typeof min === 'number' && parsed < min) {
    return { error: createInvalidArgument(`Query parameter '${name}' must be >= ${min}`, { parameter: name, value: parsed, min }) };
  }
  if (typeof max === 'number' && parsed > max) {
    return { error: createInvalidArgument(`Query parameter '${name}' must be <= ${max}`, { parameter: name, value: parsed, max }) };
  }
  return { value: parsed };
}

function parseEnum(value, allowedValues, name) {
  if (value == null || value === '') return { value: undefined };
  if (!allowedValues.has(value)) {
    return {
      error: createInvalidArgument(`Query parameter '${name}' must be one of: ${Array.from(allowedValues).join(', ')}`, {
        parameter: name,
        value,
        allowedValues: Array.from(allowedValues),
      }),
    };
  }
  return { value };
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw createInvalidArgument('Request body must be valid JSON');
  }
}

export async function route(request, response, url) {
  try {
    if (request.method === 'GET' && url.pathname === '/health') {
      json(response, 200, { ok: true });
      return;
    }

    if (request.method === 'GET' && url.pathname.startsWith('/static/')) {
      const fileName = decodeURIComponent(url.pathname.replace('/static/', ''));
      if (!staticAllowlist.has(fileName)) {
        javascript(response, 404, `// 404: static asset '${fileName}' not found`);
        return;
      }

      const absolutePath = path.resolve(staticDir, fileName);
      if (!absolutePath.startsWith(`${staticDir}${path.sep}`)) {
        javascript(response, 403, '// 403: forbidden static asset path');
        return;
      }

      const content = await fs.readFile(absolutePath, 'utf8');
      javascript(response, 200, content);
      return;
    }

    // Minimal UI (phase-1 frontend) — pure HTML + fetch() to the read-only APIs.
    if (request.method === 'GET' && url.pathname === '/') {
      html(response, 200, renderDashboardPage());
      return;
    }

    if (request.method === 'GET' && url.pathname === '/markdown') {
      html(response, 200, renderMarkdownListPage());
      return;
    }

    if (request.method === 'GET' && url.pathname.startsWith('/markdown/')) {
      const fileId = decodeURIComponent(url.pathname.replace('/markdown/', ''));
      html(response, 200, renderMarkdownEditorPage(fileId));
      return;
    }

    if (request.method === 'GET' && url.pathname.startsWith('/agents/')) {
      const agentId = decodeURIComponent(url.pathname.replace('/agents/', ''));
      html(response, 200, renderAgentPage(agentId));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/agents') {
      const limit = parseInteger(url.searchParams.get('limit'), { name: 'limit', min: 1, max: 200 });
      const status = parseEnum(url.searchParams.get('status'), AGENT_STATUSES, 'status');
      if (limit.error) return json(response, 400, limit.error);
      if (status.error) return json(response, 400, status.error);
      json(response, 200, listAgents({
        status: status.value,
        role: url.searchParams.get('role') ?? undefined,
        limit: limit.value,
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/v1/agents/')) {
      const agentId = decodeURIComponent(url.pathname.replace('/api/v1/agents/', ''));
      const payload = getAgentDetail(agentId);
      if (!payload) return json(response, 404, createNotFound(agentId));
      json(response, 200, payload);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/leaderboard') {
      const limit = parseInteger(url.searchParams.get('limit'), { name: 'limit', min: 1, max: 100 });
      const window = parseEnum(url.searchParams.get('window'), LEADERBOARD_WINDOWS, 'window');
      const sortBy = parseEnum(url.searchParams.get('sortBy'), LEADERBOARD_SORT_FIELDS, 'sortBy');
      if (limit.error) return json(response, 400, limit.error);
      if (window.error) return json(response, 400, window.error);
      if (sortBy.error) return json(response, 400, sortBy.error);
      json(response, 200, getLeaderboard({ window: window.value ?? '24h', sortBy: sortBy.value ?? 'score', limit: limit.value }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/markdown-files') {
      json(response, 200, await listMarkdownFiles());
      return;
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/v1/markdown-files/')) {
      const fileId = decodeURIComponent(url.pathname.replace('/api/v1/markdown-files/', ''));
      const payload = await readMarkdownFile(fileId);
      json(response, payload.statusCode, payload.error ? { error: payload.error, meta: payload.meta } : { data: payload.data, meta: payload.meta });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/v1/markdown-files/preview-save') {
      const body = await readJsonBody(request);
      if (typeof body.fileId !== 'string' || typeof body.content !== 'string') {
        json(response, 400, createInvalidArgument("'fileId' and 'content' are required string fields"));
        return;
      }
      const payload = await previewMarkdownSave(body.fileId, body.content);
      json(response, payload.statusCode, payload.error ? { error: payload.error, meta: payload.meta } : { data: payload.data, meta: payload.meta });
      return;
    }

    if (request.method === 'PUT' && url.pathname.startsWith('/api/v1/markdown-files/')) {
      const fileId = decodeURIComponent(url.pathname.replace('/api/v1/markdown-files/', ''));
      const body = await readJsonBody(request);
      if (typeof body.content !== 'string') {
        json(response, 400, createInvalidArgument("'content' is a required string field"));
        return;
      }
      const payload = await saveMarkdownFile(fileId, body.content, body.expectedContent);
      json(response, payload.statusCode, payload.error ? { error: payload.error, meta: payload.meta } : { data: payload.data, meta: payload.meta });
      return;
    }

    if (!['GET', 'POST', 'PUT'].includes(request.method)) {
      json(response, 405, createInvalidArgument('Only GET, POST, and PUT are supported in this MVP'));
      return;
    }

    json(response, 404, createErrorEnvelope('NOT_FOUND', `Route '${url.pathname}' not found`));
  } catch (error) {
    if (error?.error?.code === 'INVALID_ARGUMENT') {
      json(response, 400, error);
      return;
    }
    json(response, 500, createErrorEnvelope('INTERNAL_ERROR', error?.message ?? 'Unexpected server error'));
  }
}
