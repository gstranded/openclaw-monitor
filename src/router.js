import {
  createNotFound,
  getAgentDetail,
  getDashboard,
  getLeaderboard,
  listAgents,
  listMarkdownFiles,
  previewMarkdownSave,
  readEventsForStream,
  readMarkdownFile,
  saveMarkdownFile,
} from './data.js';

const AGENT_STATUSES = new Set(['active', 'idle', 'blocked', 'offline', 'unknown']);
const LEADERBOARD_WINDOWS = new Set(['24h', '7d']);
const LEADERBOARD_SORT_FIELDS = new Set(['score', 'activity']);

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload, null, 2));
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

function sendDataResult(response, payload) {
  if (payload?.error) {
    json(response, payload.statusCode ?? 400, { error: payload.error, meta: payload.meta ?? createMeta() });
    return;
  }
  json(response, payload.statusCode ?? 200, { data: payload.data, meta: payload.meta ?? createMeta() });
}

function getActor(request, body = {}) {
  if (typeof body.actor === 'string' && body.actor.trim()) return body.actor.trim();
  const header = request.headers['x-openclaw-actor'] ?? request.headers['x-actor'] ?? request.headers['x-user'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  if (Array.isArray(header) && header.length && header[0].trim()) return header[0].trim();
  return 'unknown';
}

function writeSse(response, { event, data }) {
  if (event) response.write(`event: ${event}\n`);
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  // SSE requires each data line prefixed.
  for (const line of payload.split('\n')) {
    response.write(`data: ${line}\n`);
  }
  response.write('\n');
}

async function streamEvents(request, response) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  response.write(': connected\n\n');

  let lastAtMs = 0;
  let closed = false;

  const pollMs = Number.parseInt(process.env.OPENCLAW_SSE_POLL_MS ?? '1000', 10);

  const sendBatch = async () => {
    const batch = await readEventsForStream({ afterMs: lastAtMs });

    writeSse(response, { event: 'meta', data: batch.meta });

    for (const evt of batch.data) {
      writeSse(response, { event: 'event', data: evt });
      const atMs = new Date(evt?.at ?? 0).getTime();
      if (!Number.isNaN(atMs)) lastAtMs = Math.max(lastAtMs, atMs);
    }
  };

  await sendBatch();

  const interval = setInterval(() => {
    if (closed) return;
    sendBatch().catch((error) => {
      writeSse(response, { event: 'error', data: { message: error?.message ?? 'stream error' } });
    });
  }, Number.isFinite(pollMs) && pollMs > 200 ? pollMs : 1000);

  request.on('close', () => {
    closed = true;
    clearInterval(interval);
  });
}

export async function route(request, response, url) {
  try {
    if (request.method === 'GET' && url.pathname === '/health') {
      json(response, 200, { ok: true });
      return;
    }

    // V1 (requested) routes
    if (request.method === 'GET' && url.pathname === '/api/dashboard') {
      const payload = await getDashboard();
      json(response, 200, payload);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/events/stream') {
      await streamEvents(request, response);
      return;
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/agents/')) {
      const agentId = decodeURIComponent(url.pathname.replace('/api/agents/', ''));
      const payload = await getAgentDetail(agentId);
      if (!payload) {
        const meta = { partial: false, collectedAt: new Date().toISOString(), degradeReasons: [] };
        json(response, 404, createNotFound(agentId, meta));
        return;
      }
      json(response, 200, payload);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/markdown/files') {
      const payload = await listMarkdownFiles();
      json(response, 200, payload);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/markdown/read') {
      const fileId = url.searchParams.get('fileId');
      if (!fileId) {
        json(response, 400, createInvalidArgument("Query parameter 'fileId' is required"));
        return;
      }
      const payload = await readMarkdownFile(fileId);
      sendDataResult(response, payload);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/markdown/preview') {
      const body = await readJsonBody(request);
      if (typeof body.fileId !== 'string' || typeof body.content !== 'string') {
        json(response, 400, createInvalidArgument("'fileId' and 'content' are required string fields"));
        return;
      }
      const payload = await previewMarkdownSave(body.fileId, body.content);
      sendDataResult(response, payload);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/markdown/save') {
      const body = await readJsonBody(request);
      if (typeof body.fileId !== 'string' || typeof body.content !== 'string') {
        json(response, 400, createInvalidArgument("'fileId' and 'content' are required string fields"));
        return;
      }
      const payload = await saveMarkdownFile(body.fileId, body.content, body.expectedContent, { actor: getActor(request, body) });
      sendDataResult(response, payload);
      return;
    }

    // Back-compat aliases (existing routes)
    if (request.method === 'GET' && url.pathname === '/api/v1/agents') {
      const limit = parseInteger(url.searchParams.get('limit'), { name: 'limit', min: 1, max: 200 });
      const status = parseEnum(url.searchParams.get('status'), AGENT_STATUSES, 'status');
      if (limit.error) return json(response, 400, limit.error);
      if (status.error) return json(response, 400, status.error);
      const payload = await listAgents({
        status: status.value,
        role: url.searchParams.get('role') ?? undefined,
        limit: limit.value,
      });
      json(response, 200, payload);
      return;
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/v1/agents/')) {
      const agentId = decodeURIComponent(url.pathname.replace('/api/v1/agents/', ''));
      const payload = await getAgentDetail(agentId);
      if (!payload) {
        const meta = { partial: false, collectedAt: new Date().toISOString(), degradeReasons: [] };
        json(response, 404, createNotFound(agentId, meta));
        return;
      }
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
      const payload = await getLeaderboard({ window: window.value ?? '24h', sortBy: sortBy.value ?? 'score', limit: limit.value });
      json(response, 200, payload);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/markdown-files') {
      const payload = await listMarkdownFiles();
      json(response, 200, payload);
      return;
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/v1/markdown-files/')) {
      const fileId = decodeURIComponent(url.pathname.replace('/api/v1/markdown-files/', ''));
      const payload = await readMarkdownFile(fileId);
      sendDataResult(response, payload);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/v1/markdown-files/preview-save') {
      const body = await readJsonBody(request);
      if (typeof body.fileId !== 'string' || typeof body.content !== 'string') {
        json(response, 400, createInvalidArgument("'fileId' and 'content' are required string fields"));
        return;
      }
      const payload = await previewMarkdownSave(body.fileId, body.content);
      sendDataResult(response, payload);
      return;
    }

    if (request.method === 'PUT' && url.pathname.startsWith('/api/v1/markdown-files/')) {
      const fileId = decodeURIComponent(url.pathname.replace('/api/v1/markdown-files/', ''));
      const body = await readJsonBody(request);
      if (typeof body.content !== 'string') {
        json(response, 400, createInvalidArgument("'content' is a required string field"));
        return;
      }
      const payload = await saveMarkdownFile(fileId, body.content, body.expectedContent, { actor: getActor(request, body) });
      sendDataResult(response, payload);
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
