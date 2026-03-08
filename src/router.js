import { createNotFound, getAgentDetail, getLeaderboard, listAgents } from './data.js';

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload, null, 2));
}

function parseInteger(value) {
  if (value == null || value === '') {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function route(request, response, url) {
  if (request.method !== 'GET') {
    json(response, 405, {
      error: {
        code: 'INVALID_ARGUMENT',
        message: 'Only GET is supported in this MVP',
        retryable: false,
      },
      meta: {
        partial: false,
        collectedAt: new Date().toISOString(),
        degradeReasons: [],
      },
    });
    return;
  }

  if (url.pathname === '/health') {
    json(response, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/v1/agents') {
    json(response, 200, listAgents({
      status: url.searchParams.get('status') ?? undefined,
      role: url.searchParams.get('role') ?? undefined,
      limit: parseInteger(url.searchParams.get('limit')),
    }));
    return;
  }

  if (url.pathname.startsWith('/api/v1/agents/')) {
    const agentId = decodeURIComponent(url.pathname.replace('/api/v1/agents/', ''));
    const payload = getAgentDetail(agentId);

    if (!payload) {
      json(response, 404, createNotFound(agentId));
      return;
    }

    json(response, 200, payload);
    return;
  }

  if (url.pathname === '/api/v1/leaderboard') {
    json(response, 200, getLeaderboard({
      window: url.searchParams.get('window') ?? '24h',
      sortBy: url.searchParams.get('sortBy') ?? 'score',
      limit: parseInteger(url.searchParams.get('limit')),
    }));
    return;
  }

  json(response, 404, {
    error: {
      code: 'NOT_FOUND',
      message: `Route '${url.pathname}' not found`,
      retryable: false,
    },
    meta: {
      partial: false,
      collectedAt: new Date().toISOString(),
      degradeReasons: [],
    },
  });
}
